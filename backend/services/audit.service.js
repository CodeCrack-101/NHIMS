import { AuditLog } from '../models/AuditLog.js'

const FORBIDDEN_KEYS = new Set([
  'password',
  'newPassword',
  'passwordHash',
  'otp',
  'otpHash',
  'token',
  'sessionId',
  'sessionIdHash',
])

const sanitizeMetadata = (meta = {}) => {
  if (!meta || typeof meta !== 'object') return {}
  const clean = {}
  for (const [key, value] of Object.entries(meta)) {
    if (!FORBIDDEN_KEYS.has(key)) {
      clean[key] = value
    }
  }
  return clean
}

export const recordAuditLog = async ({
  userId = null,
  event,
  severity = 'INFO',
  req = null,
  metadata = {},
}) => {
  try {
    const ipAddress =
      req?.ip ||
      req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req?.socket?.remoteAddress ||
      ''
    const userAgent = req?.headers?.['user-agent'] || ''

    await AuditLog.create({
      userId,
      event,
      severity,
      ipAddress,
      userAgent,
      metadata: sanitizeMetadata(metadata),
    })
  } catch (err) {
    console.error('[AuditLog] Failed to persist security event:', err.message)
  }
}
