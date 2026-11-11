import { User, ROLE_PERMISSIONS } from '../models/User.js'
import { AuthenticationChallenge } from '../models/AuthenticationChallenge.js'
import { Session } from '../models/Session.js'
import {
  hashPassword,
  verifyPassword,
  generateSixDigitOTP,
  hashOTP,
  verifyOTPHash,
  generateSecureToken,
  hashSessionToken,
} from './crypto.service.js'
import { sendLoginOTPEmail, sendPasswordResetEmail } from './email.service.js'
import { recordAuditLog } from './audit.service.js'
import { AppError } from '../utils/AppError.js'
import { SESSION_DURATION_MS } from '../middleware/auth.middleware.js'

const OTP_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const RESET_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
const MAX_OTP_ATTEMPTS = 5
const MAX_OTP_RESENDS = 3
const MAX_PASSWORD_FAILURES = 5
const BASE_LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

const getClientMeta = (req) => ({
  ipAddress:
    req?.ip ||
    req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req?.socket?.remoteAddress ||
    '',
  userAgent: req?.headers?.['user-agent'] || '',
})

export const initiateLogin = async ({ email, password, req }) => {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash')

  // Always run Argon2id verification to prevent timing-based user enumeration
  const isPasswordValid = await verifyPassword(user?.passwordHash, password)

  if (!user) {
    await recordAuditLog({
      event: 'LOGIN_FAILED_UNKNOWN_USER',
      severity: 'WARN',
      req,
    })
    throw new AppError('Invalid email address or password.', 401, 'INVALID_CREDENTIALS')
  }

  if (user.status === 'inactive') {
    await recordAuditLog({
      userId: user._id,
      event: 'LOGIN_BLOCKED_INACTIVE',
      severity: 'WARN',
      req,
    })
    throw new AppError('Invalid email address or password.', 401, 'INVALID_CREDENTIALS')
  }

  if (user.isCurrentlyLocked()) {
    await recordAuditLog({
      userId: user._id,
      event: 'LOGIN_BLOCKED_LOCKED_ACCOUNT',
      severity: 'WARN',
      req,
    })
    throw new AppError(
      'Account is temporarily locked due to multiple failed sign-in attempts. Please try again later or reset your password.',
      423,
      'ACCOUNT_LOCKED'
    )
  }

  if (!isPasswordValid) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1

    if (user.failedLoginAttempts >= MAX_PASSWORD_FAILURES) {
      const multiplier = Math.max(1, user.failedLoginAttempts - MAX_PASSWORD_FAILURES + 1)
      user.lockUntil = new Date(Date.now() + BASE_LOCKOUT_MS * multiplier)
      await user.save()

      await recordAuditLog({
        userId: user._id,
        event: 'ACCOUNT_LOCKED_FAILED_PASSWORDS',
        severity: 'CRITICAL',
        req,
        metadata: { failedAttempts: user.failedLoginAttempts, lockUntil: user.lockUntil },
      })

      throw new AppError(
        'Account has been temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
        423,
        'ACCOUNT_LOCKED'
      )
    }

    await user.save()
    await recordAuditLog({
      userId: user._id,
      event: 'LOGIN_PASSWORD_FAILED',
      severity: 'WARN',
      req,
      metadata: { failedAttempts: user.failedLoginAttempts },
    })

    throw new AppError('Invalid email address or password.', 401, 'INVALID_CREDENTIALS')
  }

  // Password verified: reset failed password counter if any
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    user.failedLoginAttempts = 0
    user.lockUntil = null
    await user.save()
  }

  // Invalidate any previous pending login challenges for this user
  await AuthenticationChallenge.updateMany(
    { userId: user._id, purpose: 'LOGIN_OTP', status: 'PENDING' },
    { $set: { status: 'INVALIDATED' } }
  )

  const otp = generateSixDigitOTP()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)
  const { ipAddress, userAgent } = getClientMeta(req)

  const challenge = new AuthenticationChallenge({
    userId: user._id,
    purpose: 'LOGIN_OTP',
    otpHash: 'temp',
    expiresAt,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(),
    status: 'PENDING',
    ipAddress,
    userAgent,
  })

  // Bind HMAC to challenge._id so OTP cannot be replayed across challenges
  challenge.otpHash = hashOTP(otp, challenge._id.toString())
  await challenge.save()

  try {
    await sendLoginOTPEmail({ toEmail: user.email, otp })
  } catch (emailErr) {
    challenge.status = 'INVALIDATED'
    await challenge.save()
    await recordAuditLog({
      userId: user._id,
      event: 'OTP_EMAIL_DELIVERY_FAILED',
      severity: 'CRITICAL',
      req,
      metadata: { reason: emailErr.message },
    })
    throw new AppError(
      'Unable to send verification email at this time. Please verify your email service configuration.',
      502,
      'EMAIL_DELIVERY_FAILED'
    )
  }

  await recordAuditLog({
    userId: user._id,
    event: 'LOGIN_OTP_ISSUED',
    severity: 'INFO',
    req,
    metadata: { challengeId: challenge._id.toString(), expiresAt },
  })

  const maskedEmail = user.email.replace(
    /^(.{2})(.*)(@.*)$/,
    (_, start, middle, domain) => `${start}${'*'.repeat(Math.max(2, middle.length))}${domain}`
  )

  return {
    challengeId: challenge._id.toString(),
    maskedEmail,
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: new Date(Date.now() + OTP_RESEND_COOLDOWN_MS).toISOString(),
  }
}

export const verifyLoginOTP = async ({ challengeId, otp, req, existingSessionToken }) => {
  const challenge = await AuthenticationChallenge.findById(challengeId).select('+otpHash')

  if (!challenge || challenge.purpose !== 'LOGIN_OTP') {
    await recordAuditLog({
      event: 'OTP_VERIFY_INVALID_CHALLENGE',
      severity: 'WARN',
      req,
      metadata: { challengeId },
    })
    throw new AppError('Invalid or expired verification session.', 400, 'CHALLENGE_INVALID')
  }

  if (challenge.status !== 'PENDING') {
    await recordAuditLog({
      userId: challenge.userId,
      event: 'OTP_VERIFY_NON_PENDING_CHALLENGE',
      severity: 'WARN',
      req,
      metadata: { challengeId, challengeStatus: challenge.status },
    })
    throw new AppError(
      'This verification code has already been used or invalidated. Please sign in again.',
      400,
      'CHALLENGE_CLOSED'
    )
  }

  if (challenge.expiresAt <= new Date()) {
    challenge.status = 'EXPIRED'
    await challenge.save()
    await recordAuditLog({
      userId: challenge.userId,
      event: 'OTP_VERIFY_EXPIRED',
      severity: 'WARN',
      req,
      metadata: { challengeId },
    })
    throw new AppError(
      'Your verification code has expired. Please request a new code or sign in again.',
      400,
      'OTP_EXPIRED'
    )
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    challenge.status = 'LOCKED'
    await challenge.save()
    throw new AppError(
      'Maximum verification attempts exceeded. Please sign in again.',
      429,
      'OTP_MAX_ATTEMPTS'
    )
  }

  const isOtpValid = verifyOTPHash(challenge.otpHash, otp, challenge._id.toString())

  if (!isOtpValid) {
    challenge.attempts += 1
    const remainingAttempts = Math.max(0, MAX_OTP_ATTEMPTS - challenge.attempts)
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      challenge.status = 'LOCKED'
    }
    await challenge.save()

    await recordAuditLog({
      userId: challenge.userId,
      event: 'OTP_VERIFY_FAILED',
      severity: challenge.status === 'LOCKED' ? 'CRITICAL' : 'WARN',
      req,
      metadata: { challengeId, attempts: challenge.attempts, remainingAttempts },
    })

    if (challenge.status === 'LOCKED') {
      throw new AppError(
        'Maximum incorrect OTP attempts reached. For your security, please sign in again.',
        429,
        'OTP_MAX_ATTEMPTS'
      )
    }

    throw new AppError(
      `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`,
      401,
      'OTP_INVALID'
    )
  }

  // Mark challenge single-use verified immediately
  challenge.status = 'VERIFIED'
  challenge.attempts += 1
  await challenge.save()

  const user = await User.findById(challenge.userId)
  if (!user || user.status !== 'active' || user.isCurrentlyLocked()) {
    throw new AppError('Account is unavailable.', 403, 'ACCOUNT_UNAVAILABLE')
  }

  user.emailVerified = true
  user.lastLoginAt = new Date()
  user.failedLoginAttempts = 0
  user.lockUntil = null
  await user.save()

  // Session regeneration: invalidate any previous session cookie from this client
  if (existingSessionToken) {
    const oldHash = hashSessionToken(existingSessionToken)
    await Session.updateOne({ sessionIdHash: oldHash }, { $set: { isValid: false } })
  }

  const newSessionToken = generateSecureToken(32)
  const sessionIdHash = hashSessionToken(newSessionToken)
  const { ipAddress, userAgent } = getClientMeta(req)

  await Session.create({
    sessionIdHash,
    userId: user._id,
    role: user.role,
    ipAddress,
    userAgent,
    isValid: true,
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  })

  await recordAuditLog({
    userId: user._id,
    event: 'LOGIN_SUCCESS',
    severity: 'INFO',
    req,
    metadata: { role: user.role },
  })

  return {
    sessionToken: newSessionToken,
    user: {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      permissions: ROLE_PERMISSIONS[user.role] || [],
    },
  }
}

export const resendLoginOTP = async ({ challengeId, req }) => {
  const challenge = await AuthenticationChallenge.findById(challengeId)

  if (!challenge || challenge.purpose !== 'LOGIN_OTP') {
    throw new AppError('Invalid verification session.', 400, 'CHALLENGE_INVALID')
  }

  if (challenge.status !== 'PENDING') {
    throw new AppError(
      'This verification session is no longer active. Please sign in again.',
      400,
      'CHALLENGE_CLOSED'
    )
  }

  if (challenge.resendCount >= MAX_OTP_RESENDS) {
    challenge.status = 'LOCKED'
    await challenge.save()
    throw new AppError(
      'Maximum resend limit reached for this session. Please sign in again.',
      429,
      'OTP_RESEND_LIMIT'
    )
  }

  const elapsedMs = Date.now() - new Date(challenge.lastSentAt).getTime()
  if (elapsedMs < OTP_RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000)
    throw new AppError(
      `Please wait ${waitSeconds} seconds before requesting a new verification code.`,
      429,
      'OTP_RESEND_COOLDOWN'
    )
  }

  const user = await User.findById(challenge.userId)
  if (!user || user.status !== 'active') {
    throw new AppError('Unable to resend code.', 400, 'USER_UNAVAILABLE')
  }

  const newOtp = generateSixDigitOTP()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS)

  challenge.otpHash = hashOTP(newOtp, challenge._id.toString())
  challenge.expiresAt = expiresAt
  challenge.attempts = 0
  challenge.resendCount += 1
  challenge.lastSentAt = new Date()
  await challenge.save()

  await sendLoginOTPEmail({ toEmail: user.email, otp: newOtp })

  await recordAuditLog({
    userId: user._id,
    event: 'LOGIN_OTP_RESENT',
    severity: 'INFO',
    req,
    metadata: { challengeId: challenge._id.toString(), resendCount: challenge.resendCount },
  })

  return {
    challengeId: challenge._id.toString(),
    expiresAt: expiresAt.toISOString(),
    resendAvailableAt: new Date(Date.now() + OTP_RESEND_COOLDOWN_MS).toISOString(),
    remainingResends: MAX_OTP_RESENDS - challenge.resendCount,
  }
}

export const requestPasswordReset = async ({ email, req }) => {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await User.findOne({ email: normalizedEmail })

  if (!user || user.status === 'inactive') {
    await recordAuditLog({
      event: 'PASSWORD_RESET_UNKNOWN_OR_INACTIVE_EMAIL',
      severity: 'INFO',
      req,
    })
    // Uniform response to prevent email enumeration
    return
  }

  // Invalidate any prior pending reset challenges for this user
  await AuthenticationChallenge.updateMany(
    { userId: user._id, purpose: 'PASSWORD_RESET', status: 'PENDING' },
    { $set: { status: 'INVALIDATED' } }
  )

  const resetCode = generateSixDigitOTP()
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MS)
  const { ipAddress, userAgent } = getClientMeta(req)

  await AuthenticationChallenge.create({
    userId: user._id,
    purpose: 'PASSWORD_RESET',
    otpHash: hashOTP(resetCode, `reset:${user._id.toString()}`),
    expiresAt,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(),
    status: 'PENDING',
    ipAddress,
    userAgent,
  })

  try {
    await sendPasswordResetEmail({
      toEmail: user.email,
      resetToken: resetCode,
      resetCode,
    })
  } catch (err) {
    await recordAuditLog({
      userId: user._id,
      event: 'PASSWORD_RESET_EMAIL_FAILED',
      severity: 'CRITICAL',
      req,
      metadata: { reason: err.message },
    })
  }

  await recordAuditLog({
    userId: user._id,
    event: 'PASSWORD_RESET_REQUESTED',
    severity: 'INFO',
    req,
  })
}

export const completePasswordReset = async ({ email, token, newPassword, req }) => {
  const normalizedEmail = email.trim().toLowerCase()
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash')

  if (!user) {
    throw new AppError('Invalid or expired password reset code.', 400, 'RESET_INVALID')
  }

  const challenge = await AuthenticationChallenge.findOne({
    userId: user._id,
    purpose: 'PASSWORD_RESET',
    status: 'PENDING',
  })
    .sort({ createdAt: -1 })
    .select('+otpHash')

  if (!challenge) {
    throw new AppError('Invalid or expired password reset code.', 400, 'RESET_INVALID')
  }

  if (challenge.expiresAt <= new Date()) {
    challenge.status = 'EXPIRED'
    await challenge.save()
    throw new AppError(
      'Your password reset code has expired. Please request a new one.',
      400,
      'RESET_EXPIRED'
    )
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    challenge.status = 'LOCKED'
    await challenge.save()
    throw new AppError(
      'Maximum reset verification attempts exceeded. Please request a new reset code.',
      429,
      'RESET_MAX_ATTEMPTS'
    )
  }

  const isValidToken = verifyOTPHash(
    challenge.otpHash,
    token.trim(),
    `reset:${user._id.toString()}`
  )

  if (!isValidToken) {
    challenge.attempts += 1
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      challenge.status = 'LOCKED'
    }
    await challenge.save()

    await recordAuditLog({
      userId: user._id,
      event: 'PASSWORD_RESET_INVALID_TOKEN',
      severity: 'WARN',
      req,
      metadata: { attempts: challenge.attempts },
    })

    throw new AppError('Invalid or expired password reset code.', 400, 'RESET_INVALID')
  }

  challenge.status = 'VERIFIED'
  await challenge.save()

  user.passwordHash = await hashPassword(newPassword)
  user.passwordChangedAt = new Date()
  user.failedLoginAttempts = 0
  user.lockUntil = null
  if (user.status === 'locked') {
    user.status = 'active'
  }
  await user.save()

  // Invalidate all active sessions for this user across all devices
  await Session.updateMany({ userId: user._id, isValid: true }, { $set: { isValid: false } })

  await recordAuditLog({
    userId: user._id,
    event: 'PASSWORD_RESET_COMPLETED',
    severity: 'INFO',
    req,
  })
}

export const terminateSession = async ({ sessionToken, req }) => {
  if (!sessionToken) return
  const sessionIdHash = hashSessionToken(sessionToken)
  const session = await Session.findOneAndUpdate(
    { sessionIdHash, isValid: true },
    { $set: { isValid: false } }
  )

  if (session) {
    await recordAuditLog({
      userId: session.userId,
      event: 'LOGOUT_SUCCESS',
      severity: 'INFO',
      req,
    })
  }
}
