import rateLimit from 'express-rate-limit'

const createLimiter = ({ windowMs, max, message, code }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        code,
        message,
      })
    },
  })

export const loginRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  code: 'RATE_LIMIT_LOGIN',
  message: 'Too many login attempts from this IP. Please wait 15 minutes before trying again.',
})

export const otpVerifyRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  code: 'RATE_LIMIT_OTP_VERIFY',
  message: 'Too many verification attempts. Please wait 15 minutes before trying again.',
})

export const otpResendRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  code: 'RATE_LIMIT_OTP_RESEND',
  message: 'Too many code resend requests. Please wait before requesting another code.',
})

export const passwordResetRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  code: 'RATE_LIMIT_PASSWORD_RESET',
  message: 'Too many password reset requests. Please try again later.',
})

export const generalApiRateLimiter = createLimiter({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  code: 'RATE_LIMIT_GENERAL',
  message: 'Too many requests. Please slow down.',
})
