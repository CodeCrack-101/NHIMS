import { Router } from 'express'
import { User, ROLES } from '../models/User.js'
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js'
import { hashPassword, generateSixDigitOTP, hashOTP, verifyOTPHash } from '../services/crypto.service.js'
import { sendLoginOTPEmail } from '../services/email.service.js'
import { AppError } from '../utils/AppError.js'
import { AuthenticationChallenge } from '../models/AuthenticationChallenge.js'

const router = Router()

// All routes here strictly require Admin login
router.use(requireAuth)
router.use(requireRoles(ROLES.ADMIN))

// 1. Request OTP to unlock Staff Access Panel
router.post('/request-otp', async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.user.id)
    if (!adminUser) {
      throw new AppError('Admin user not found.', 404)
    }

    const otp = generateSixDigitOTP()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    // Invalidate previous challenges
    await AuthenticationChallenge.updateMany(
      { userId: adminUser._id, purpose: 'STAFF_ACCESS_OTP', status: 'PENDING' },
      { $set: { status: 'INVALIDATED' } }
    )

    const challenge = new AuthenticationChallenge({
      userId: adminUser._id,
      purpose: 'STAFF_ACCESS_OTP',
      otpHash: 'temp',
      expiresAt,
      status: 'PENDING',
    })

    challenge.otpHash = hashOTP(otp, challenge._id.toString())
    await challenge.save()

    // Send email to admin
    await sendLoginOTPEmail({ toEmail: adminUser.email, otp })

    res.status(200).json({
      success: true,
      message: `OTP sent to ${adminUser.email}`,
      data: {
        challengeId: challenge._id.toString(),
        maskedEmail: adminUser.email.replace(/^(.{2})(.*)(@.*)$/, (_, s, m, d) => `${s}${'*'.repeat(m.length)}${d}`),
      },
    })
  } catch (err) {
    next(err)
  }
})

// 2. Verify OTP to grant temporary access token
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { challengeId, otp } = req.body
    if (!challengeId || !otp) {
      throw new AppError('Challenge ID and OTP are required.', 400)
    }

    const challenge = await AuthenticationChallenge.findById(challengeId)
    if (!challenge || challenge.purpose !== 'STAFF_ACCESS_OTP' || challenge.status !== 'PENDING') {
      throw new AppError('Invalid or expired OTP session.', 400)
    }

    if (new Date() > challenge.expiresAt) {
      challenge.status = 'EXPIRED'
      await challenge.save()
      throw new AppError('OTP has expired. Please request a new one.', 400)
    }

    const isValid = verifyOTPHash(challenge.otpHash, otp, challenge._id.toString())
    if (!isValid) {
      challenge.attempts = (challenge.attempts || 0) + 1
      await challenge.save()
      throw new AppError('Invalid OTP code.', 400)
    }

    challenge.status = 'VERIFIED'
    await challenge.save()

    res.status(200).json({
      success: true,
      message: 'Access granted successfully.',
      data: {
        verified: true,
        verifiedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    next(err)
  }
})

// 3. List Staff Users
router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find({ role: { $in: [ROLES.EMPLOYEE, ROLES.MANAGER] } })
      .select('fullName email role status lastLoginAt createdAt')
      .sort({ createdAt: -1 })
      .lean()

    res.status(200).json({
      success: true,
      data: { users },
    })
  } catch (err) {
    next(err)
  }
})

// 4. Create new staff user
router.post('/users', async (req, res, next) => {
  try {
    const { fullName, email, password, role = ROLES.EMPLOYEE } = req.body
    if (!fullName || !email || !password) {
      throw new AppError('Full name, email, and password are required.', 400)
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const existing = await User.findOne({ email: normalizedEmail })
    if (existing) {
      throw new AppError('A user with this email address already exists.', 409)
    }

    const passwordHash = await hashPassword(password)
    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: [ROLES.EMPLOYEE, ROLES.MANAGER].includes(role) ? role : ROLES.EMPLOYEE,
      status: 'active',
      emailVerified: true,
    })

    res.status(201).json({
      success: true,
      message: `Staff member ${user.fullName} created successfully.`,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// 5. Update staff user (toggle status or change password)
router.patch('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { fullName, status, password, role } = req.body

    const user = await User.findById(id)
    if (!user) {
      throw new AppError('User not found.', 404)
    }

    if (fullName) user.fullName = fullName.trim()
    if (status && ['active', 'inactive', 'locked'].includes(status)) {
      user.status = status
    }
    if (role && [ROLES.EMPLOYEE, ROLES.MANAGER].includes(role)) {
      user.role = role
    }
    if (password && password.trim().length >= 6) {
      user.passwordHash = await hashPassword(password.trim())
      user.passwordChangedAt = new Date()
    }

    await user.save()

    res.status(200).json({
      success: true,
      message: 'Staff user updated successfully.',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// 6. Delete staff user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const user = await User.findById(id)
    if (!user) {
      throw new AppError('User not found.', 404)
    }

    if (user.role === ROLES.ADMIN) {
      throw new AppError('Cannot delete admin account.', 400)
    }

    await User.findByIdAndDelete(id)

    res.status(200).json({
      success: true,
      message: `Staff user ${user.fullName} deleted successfully.`,
    })
  } catch (err) {
    next(err)
  }
})

export default router
