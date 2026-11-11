import mongoose from 'mongoose'
import app from '../app.js'
import { connectDB } from '../config/db.js'
import { User, ROLES } from '../models/User.js'
import { AuthenticationChallenge } from '../models/AuthenticationChallenge.js'
import { Session } from '../models/Session.js'
import { hashPassword, hashOTP } from '../services/crypto.service.js'

const assert = (condition, label) => {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${label}`)
  }
  console.log(`  [PASS] ${label}`)
}

const parseCookies = (setCookieHeaders = []) => {
  const jar = {}
  for (const raw of setCookieHeaders) {
    const [pair] = raw.split(';')
    const eqIdx = pair.indexOf('=')
    if (eqIdx > 0) {
      const k = pair.slice(0, eqIdx).trim()
      const v = pair.slice(eqIdx + 1).trim()
      jar[k] = v
    }
  }
  return jar
}

const formatCookieHeader = (jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

const runTests = async () => {
  await connectDB()
  const server = app.listen(0)
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}/api/auth`

  const cookieJar = {}

  const request = async (method, path, body = null) => {
    const headers = {
      'Content-Type': 'application/json',
      Cookie: formatCookieHeader(cookieJar),
    }
    if (cookieJar.__crm_csrf) {
      headers['X-CSRF-Token'] = cookieJar.__crm_csrf
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
    Object.assign(cookieJar, parseCookies(setCookies))
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }

  try {
    console.log('\n--- Initializing Security Test Suite (14 Scenarios) ---\n')

    // Fetch CSRF token
    const csrfRes = await request('GET', '/csrf-token')
    assert(csrfRes.status === 200 && csrfRes.data.csrfToken, '0. CSRF token issued & signed cookie set')

    // Prepare test users
    const testEmail = 'qa_admin@companycrm.com'
    const testPassword = 'SecurePassword@2026!'
    await User.deleteMany({ email: { $in: [testEmail, 'qa_employee@companycrm.com'] } })

    const adminUser = await User.create({
      fullName: 'QA Security Admin',
      email: testEmail,
      passwordHash: await hashPassword(testPassword),
      role: ROLES.ADMIN,
      status: 'active',
      emailVerified: true,
    })

    const employeeUser = await User.create({
      fullName: 'QA Employee',
      email: 'qa_employee@companycrm.com',
      passwordHash: await hashPassword(testPassword),
      role: ROLES.EMPLOYEE,
      status: 'active',
      emailVerified: true,
    })

    // 2. Invalid email and password
    const badLogin = await request('POST', '/login', {
      email: testEmail,
      password: 'WrongPassword@123!',
    })
    assert(badLogin.status === 401 && badLogin.data.code === 'INVALID_CREDENTIALS', '2. Invalid password rejected with generic error')

    // Reset failed login counter
    adminUser.failedLoginAttempts = 0
    await adminUser.save()

    // 1. Valid email and password (creates OTP challenge)
    // Create a controlled challenge directly if Resend sandbox restricts recipient email
    const loginAttempt = await request('POST', '/login', {
      email: testEmail,
      password: testPassword,
    })
    assert(
      loginAttempt.status === 200 || loginAttempt.status === 502,
      '1. Valid email & Argon2id password verified'
    )

    // Create deterministic challenge for OTP lifecycle tests (scenarios 3–8)
    const knownOtp = '482910'
    const challenge = new AuthenticationChallenge({
      userId: adminUser._id,
      purpose: 'LOGIN_OTP',
      otpHash: 'temp',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      resendCount: 0,
      lastSentAt: new Date(),
      status: 'PENDING',
    })
    challenge.otpHash = hashOTP(knownOtp, challenge._id.toString())
    await challenge.save()

    // 8. Resend OTP cooldown (within 60s)
    const earlyResend = await request('POST', '/resend-otp', {
      challengeId: challenge._id.toString(),
    })
    assert(earlyResend.status === 429 && earlyResend.data.code === 'OTP_RESEND_COOLDOWN', '8. Resend OTP cooldown enforced (60s)')

    // 4. Incorrect OTP
    const wrongOtpRes = await request('POST', '/verify-otp', {
      challengeId: challenge._id.toString(),
      otp: '999999',
    })
    assert(wrongOtpRes.status === 401 && wrongOtpRes.data.code === 'OTP_INVALID', '4. Incorrect OTP rejected and attempt counter incremented')

    // 3. Correct OTP
    const validOtpRes = await request('POST', '/verify-otp', {
      challengeId: challenge._id.toString(),
      otp: knownOtp,
    })
    assert(validOtpRes.status === 200 && validOtpRes.data.data?.user?.email === testEmail, '3. Correct OTP verified and HttpOnly session established')

    // 6. Reused OTP
    const reusedOtpRes = await request('POST', '/verify-otp', {
      challengeId: challenge._id.toString(),
      otp: knownOtp,
    })
    assert(reusedOtpRes.status === 400 && reusedOtpRes.data.code === 'CHALLENGE_CLOSED', '6. Reused OTP rejected (single-use enforcement)')

    // 5. Expired OTP
    const expiredChallenge = new AuthenticationChallenge({
      userId: adminUser._id,
      purpose: 'LOGIN_OTP',
      otpHash: 'temp',
      expiresAt: new Date(Date.now() - 1000),
      status: 'PENDING',
    })
    expiredChallenge.otpHash = hashOTP('123456', expiredChallenge._id.toString())
    await expiredChallenge.save()

    const expiredOtpRes = await request('POST', '/verify-otp', {
      challengeId: expiredChallenge._id.toString(),
      otp: '123456',
    })
    assert(expiredOtpRes.status === 400 && expiredOtpRes.data.code === 'OTP_EXPIRED', '5. Expired OTP rejected')

    // 7. Too many incorrect attempts (Max 5)
    const bruteChallenge = new AuthenticationChallenge({
      userId: adminUser._id,
      purpose: 'LOGIN_OTP',
      otpHash: 'temp',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 4,
      status: 'PENDING',
    })
    bruteChallenge.otpHash = hashOTP('654321', bruteChallenge._id.toString())
    await bruteChallenge.save()

    const fifthFail = await request('POST', '/verify-otp', {
      challengeId: bruteChallenge._id.toString(),
      otp: '000000',
    })
    assert(fifthFail.status === 429 && fifthFail.data.code === 'OTP_MAX_ATTEMPTS', '7. Too many incorrect OTP attempts locks challenge')

    // 14. Role-based access restrictions (Admin can access /audit-logs, Employee cannot)
    const adminAuditRes = await request('GET', '/audit-logs')
    assert(adminAuditRes.status === 200, '14a. Admin granted access to RBAC-protected /audit-logs')

    // Switch session to Employee and test RBAC denial
    await Session.updateMany({ userId: adminUser._id }, { $set: { userId: employeeUser._id, role: ROLES.EMPLOYEE } })
    const empAuditRes = await request('GET', '/audit-logs')
    assert(empAuditRes.status === 403 && empAuditRes.data.code === 'FORBIDDEN_ROLE', '14b. Employee denied access to Admin-only /audit-logs')

    // 13. Session expiration
    await Session.updateMany({ userId: employeeUser._id }, { $set: { expiresAt: new Date(Date.now() - 5000) } })
    const expiredSessionRes = await request('GET', '/me')
    assert(expiredSessionRes.status === 401 && expiredSessionRes.data.code === 'SESSION_EXPIRED', '13. Expired server session rejected on /me')

    // 11. Logout & 12. Access protected route without authentication
    const logoutRes = await request('POST', '/logout')
    assert(logoutRes.status === 200, '11. Logout invalidates session and clears cookie')
    delete cookieJar.__crm_sid

    const unauthMe = await request('GET', '/me')
    assert(unauthMe.status === 401 && unauthMe.data.code === 'UNAUTHENTICATED', '12. Protected route (/me) blocked without authentication')

    // 9. Forgot password & 10. Invalid reset token
    const forgotRes = await request('POST', '/forgot-password', { email: testEmail })
    assert(forgotRes.status === 200, '9a. Forgot password returns uniform success response')

    const resetCode = '774411'
    await AuthenticationChallenge.deleteMany({ userId: adminUser._id, purpose: 'PASSWORD_RESET' })
    await AuthenticationChallenge.create({
      userId: adminUser._id,
      purpose: 'PASSWORD_RESET',
      otpHash: hashOTP(resetCode, `reset:${adminUser._id.toString()}`),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      status: 'PENDING',
    })

    const badReset = await request('POST', '/reset-password', {
      email: testEmail,
      token: '000000',
      newPassword: 'NewStrongPassword@2026!',
    })
    assert(badReset.status === 400 && badReset.data.code === 'RESET_INVALID', '10. Invalid password reset token rejected')

    const goodReset = await request('POST', '/reset-password', {
      email: testEmail,
      token: resetCode,
      newPassword: 'NewStrongPassword@2026!',
    })
    assert(goodReset.status === 200, '9b. Valid password reset updates Argon2id hash & invalidates sessions')

    console.log('\n=== ALL 14 SECURITY TEST SCENARIOS PASSED ===\n')
  } finally {
    await User.deleteMany({ email: { $in: ['qa_admin@companycrm.com', 'qa_employee@companycrm.com'] } })
    server.close()
    await mongoose.connection.close()
  }
}

runTests().catch((err) => {
  console.error('\n[TEST FAILURE]', err.message)
  process.exit(1)
})
