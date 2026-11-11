import mongoose from 'mongoose'

const authenticationChallengeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['LOGIN_OTP', 'PASSWORD_RESET'],
      default: 'LOGIN_OTP',
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '60m' }, // Automatic cleanup 60m after expiry
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 10,
    },
    resendCount: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED', 'INVALIDATED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
)

export const AuthenticationChallenge = mongoose.model(
  'AuthenticationChallenge',
  authenticationChallengeSchema
)
