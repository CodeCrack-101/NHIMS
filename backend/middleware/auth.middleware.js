import { Session } from '../models/Session.js'
import { User, ROLE_PERMISSIONS } from '../models/User.js'
import { hashSessionToken } from '../services/crypto.service.js'
import { recordAuditLog } from '../services/audit.service.js'
import { AppError } from '../utils/AppError.js'
import { env } from '../config/env.js'

export const SESSION_COOKIE_NAME = '__crm_sid'
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000 // 8 hours enterprise shift

export const getSessionCookieOptions = () => ({
  httpOnly: true,
  secure: env.IS_PROD,
  sameSite: env.IS_PROD ? 'strict' : 'lax',
  path: '/',
  maxAge: SESSION_DURATION_MS,
})

export const requireAuth = async (req, res, next) => {
  try {
    const isSilentCheck = req.query?.silent === '1'
    const rawSessionToken = req.cookies?.[SESSION_COOKIE_NAME]
    if (!rawSessionToken) {
      if (isSilentCheck) {
        req.user = null
        return next()
      }
      return next(
        new AppError('Authentication required. Please sign in.', 401, 'UNAUTHENTICATED')
      )
    }

    const sessionIdHash = hashSessionToken(rawSessionToken)
    const session = await Session.findOne({
      sessionIdHash,
      isValid: true,
      expiresAt: { $gt: new Date() },
    })

    if (!session) {
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
      if (isSilentCheck) {
        req.user = null
        return next()
      }
      return next(
        new AppError('Your session has expired. Please sign in again.', 401, 'SESSION_EXPIRED')
      )
    }

    const user = await User.findById(session.userId)
    if (!user || user.status !== 'active' || user.isCurrentlyLocked()) {
      session.isValid = false
      await session.save()
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
      if (isSilentCheck) {
        req.user = null
        return next()
      }
      return next(
        new AppError('Account is no longer active. Please contact your administrator.', 403, 'ACCOUNT_INACTIVE')
      )
    }

    // Update rolling activity timestamp
    session.lastActiveAt = new Date()
    await session.save()

    req.user = {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      permissions: ROLE_PERMISSIONS[user.role] || [],
    }
    req.sessionRecord = session

    next()
  } catch (error) {
    next(error)
  }
}

export const requireRoles = (...allowedRoles) => {
  return async (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'))
    }
    if (!allowedRoles.includes(req.user.role)) {
      await recordAuditLog({
        userId: req.user.id,
        event: 'RBAC_ACCESS_DENIED',
        severity: 'WARN',
        req,
        metadata: {
          requiredRoles: allowedRoles,
          userRole: req.user.role,
          path: req.originalUrl,
        },
      })
      return next(
        new AppError(
          'You do not have permission to access this resource.',
          403,
          'FORBIDDEN_ROLE'
        )
      )
    }
    next()
  }
}

export const requirePermission = (permission) => {
  return async (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'))
    }
    const permissions = req.user.permissions || []
    if (!permissions.includes(permission) && !permissions.includes('system:full_access')) {
      await recordAuditLog({
        userId: req.user.id,
        event: 'PERMISSION_DENIED',
        severity: 'WARN',
        req,
        metadata: {
          requiredPermission: permission,
          userRole: req.user.role,
          path: req.originalUrl,
        },
      })
      return next(
        new AppError(
          'Insufficient permissions for this operation.',
          403,
          'FORBIDDEN_PERMISSION'
        )
      )
    }
    next()
  }
}
