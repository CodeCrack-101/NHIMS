import { Router } from 'express'
import {
  loginController,
  verifyOtpController,
  resendOtpController,
  logoutController,
  getMeController,
  forgotPasswordController,
  resetPasswordController,
  getAuditLogsController,
} from '../controllers/auth.controller.js'
import {
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validateBody,
} from '../validators/auth.validator.js'
import {
  loginRateLimiter,
  otpVerifyRateLimiter,
  otpResendRateLimiter,
  passwordResetRateLimiter,
} from '../middleware/rateLimit.middleware.js'
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js'
import { issueCsrfToken, csrfProtection } from '../middleware/csrf.middleware.js'
import { ROLES } from '../models/User.js'

const router = Router()

// Issue CSRF token for cookie-authenticated client requests
router.get('/csrf-token', issueCsrfToken)

// Primary authentication endpoints
router.post(
  '/login',
  loginRateLimiter,
  csrfProtection,
  validateBody(loginSchema),
  loginController
)

router.post(
  '/verify-otp',
  otpVerifyRateLimiter,
  csrfProtection,
  validateBody(verifyOtpSchema),
  verifyOtpController
)

router.post(
  '/resend-otp',
  otpResendRateLimiter,
  csrfProtection,
  validateBody(resendOtpSchema),
  resendOtpController
)

router.post('/logout', csrfProtection, logoutController)

router.get('/me', requireAuth, getMeController)

// Password recovery endpoints
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  csrfProtection,
  validateBody(forgotPasswordSchema),
  forgotPasswordController
)

router.post(
  '/reset-password',
  passwordResetRateLimiter,
  csrfProtection,
  validateBody(resetPasswordSchema),
  resetPasswordController
)

// Admin-only RBAC verification endpoint (view recent security audit logs)
router.get(
  '/audit-logs',
  requireAuth,
  requireRoles(ROLES.ADMIN),
  getAuditLogsController
)

export default router
