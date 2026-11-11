import {
  initiateLogin,
  verifyLoginOTP,
  resendLoginOTP,
  requestPasswordReset,
  completePasswordReset,
  terminateSession,
} from '../services/auth.service.js'
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
} from '../middleware/auth.middleware.js'
import { AuditLog } from '../models/AuditLog.js'

export const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const challengeData = await initiateLogin({ email, password, req })

    return res.status(200).json({
      success: true,
      message: 'Verification code sent to your registered email address.',
      data: challengeData,
    })
  } catch (error) {
    next(error)
  }
}

export const verifyOtpController = async (req, res, next) => {
  try {
    const { challengeId, otp } = req.body
    const existingSessionToken = req.cookies?.[SESSION_COOKIE_NAME]

    const { sessionToken, user } = await verifyLoginOTP({
      challengeId,
      otp,
      req,
      existingSessionToken,
    })

    res.cookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions())

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: { user },
    })
  } catch (error) {
    next(error)
  }
}

export const resendOtpController = async (req, res, next) => {
  try {
    const { challengeId } = req.body
    const data = await resendLoginOTP({ challengeId, req })

    return res.status(200).json({
      success: true,
      message: 'A new verification code has been sent to your email.',
      data,
    })
  } catch (error) {
    next(error)
  }
}

export const logoutController = async (req, res, next) => {
  try {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME]
    await terminateSession({ sessionToken, req })

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })

    return res.status(200).json({
      success: true,
      message: 'You have been signed out securely.',
    })
  } catch (error) {
    next(error)
  }
}

export const getMeController = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        user: req.user,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const forgotPasswordController = async (req, res, next) => {
  try {
    const { email } = req.body
    await requestPasswordReset({ email, req })

    return res.status(200).json({
      success: true,
      message:
        'If an active account is associated with this email address, a password reset code has been sent.',
    })
  } catch (error) {
    next(error)
  }
}

export const resetPasswordController = async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body
    await completePasswordReset({ email, token, newPassword, req })

    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })

    return res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully. Please sign in with your new password.',
    })
  } catch (error) {
    next(error)
  }
}

export const getAuditLogsController = async (_req, res, next) => {
  try {
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(25)
      .populate('userId', 'fullName email role')
      .lean()

    return res.status(200).json({
      success: true,
      data: { logs },
    })
  } catch (error) {
    next(error)
  }
}
