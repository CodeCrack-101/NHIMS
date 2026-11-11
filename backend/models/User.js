import mongoose from 'mongoose'

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
}

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    'system:full_access',
    'employees:create',
    'employees:manage',
    'roles:manage',
    'reports:all',
    'audit_logs:view',
    'crm:manage',
    'crm:view_assigned',
  ],
  [ROLES.MANAGER]: [
    'reports:authorized',
    'employees:view_assigned',
    'crm:manage',
    'crm:view_assigned',
  ],
  [ROLES.EMPLOYEE]: [
    'crm:authorized',
    'crm:view_assigned',
  ],
}

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.EMPLOYEE,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'locked'],
      default: 'active',
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

userSchema.methods.isCurrentlyLocked = function () {
  if (this.status === 'locked' && (!this.lockUntil || this.lockUntil > new Date())) {
    return true
  }
  return Boolean(this.lockUntil && this.lockUntil > new Date())
}

export const User = mongoose.model('User', userSchema)
