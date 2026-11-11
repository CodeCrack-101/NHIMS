import { z } from 'zod'
import { AppError } from '../utils/AppError.js'

const emailSchema = z
  .string({ required_error: 'Email address is required' })
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address')
  .max(120, 'Email address is too long')

const strongPasswordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter')
  .regex(/[0-9]/, 'Password must include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character')

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128, 'Invalid password length'),
})

export const verifyOtpSchema = z.object({
  challengeId: z
    .string({ required_error: 'Verification challenge ID is required' })
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid verification session identifier'),
  otp: z
    .string({ required_error: 'Verification code is required' })
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be a 6-digit number'),
})

export const resendOtpSchema = z.object({
  challengeId: z
    .string({ required_error: 'Verification challenge ID is required' })
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid verification session identifier'),
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  email: emailSchema,
  token: z
    .string({ required_error: 'Reset code or token is required' })
    .trim()
    .min(6, 'Invalid reset token or verification code')
    .max(128, 'Invalid reset token'),
  newPassword: strongPasswordSchema,
})

export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return next(
      new AppError(
        firstIssue?.message || 'Invalid request data',
        400,
        'VALIDATION_ERROR'
      )
    )
  }
  req.body = result.data
  next()
}
