import crypto from 'crypto'
import { env } from '../config/env.js'
import { AppError } from '../utils/AppError.js'

export const CSRF_COOKIE_NAME = '__crm_csrf'

const signCsrfToken = (rawToken) => {
  const signature = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(rawToken)
    .digest('hex')
  return `${rawToken}.${signature}`
}

const verifySignedCsrfToken = (signedToken) => {
  if (!signedToken || typeof signedToken !== 'string') return false
  const parts = signedToken.split('.')
  if (parts.length !== 2) return false
  const [rawToken, signature] = parts
  if (!rawToken || !signature) return false

  const expectedSig = crypto
    .createHmac('sha256', env.CSRF_SECRET)
    .update(rawToken)
    .digest('hex')

  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expectedSig, 'hex')
  if (sigBuf.length !== expBuf.length) return false
  return crypto.timingSafeEqual(sigBuf, expBuf)
}

export const issueCsrfToken = (_req, res) => {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const signedToken = signCsrfToken(rawToken)

  res.cookie(CSRF_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: env.IS_PROD,
    sameSite: env.IS_PROD ? 'strict' : 'lax',
    path: '/',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
  })

  return res.status(200).json({
    success: true,
    csrfToken: signedToken,
  })
}

export const csrfProtection = (req, _res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS']
  if (safeMethods.includes(req.method)) {
    return next()
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME]
  const headerToken = req.headers['x-csrf-token']

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(
      new AppError(
        'Security token missing or expired. Please refresh the page and try again.',
        403,
        'CSRF_INVALID'
      )
    )
  }

  if (!verifySignedCsrfToken(cookieToken)) {
    return next(
      new AppError(
        'Invalid security token signature. Please refresh the page.',
        403,
        'CSRF_INVALID'
      )
    )
  }

  next()
}
