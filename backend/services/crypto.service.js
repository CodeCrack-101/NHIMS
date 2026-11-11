import crypto from 'crypto'
import argon2 from 'argon2'
import { env } from '../config/env.js'

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
}

// Pre-computed dummy hash for constant-time user enumeration protection
let dummyHashPromise = null
const getDummyHash = () => {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('DummyPassword_ConstantTimeDefense!2026', ARGON2_OPTIONS)
  }
  return dummyHashPromise
}

export const hashPassword = async (plainPassword) => {
  return argon2.hash(plainPassword, ARGON2_OPTIONS)
}

export const verifyPassword = async (passwordHash, plainPassword) => {
  try {
    if (!passwordHash) {
      const dummy = await getDummyHash()
      await argon2.verify(dummy, plainPassword)
      return false
    }
    return await argon2.verify(passwordHash, plainPassword)
  } catch {
    return false
  }
}

export const generateSixDigitOTP = () => {
  const code = crypto.randomInt(100000, 1000000)
  return String(code)
}

export const hashOTP = (otp, contextId = '') => {
  return crypto
    .createHmac('sha256', env.OTP_HMAC_SECRET)
    .update(`${contextId}:${String(otp).trim()}`)
    .digest('hex')
}

export const verifyOTPHash = (expectedHashHex, candidateOtp, contextId = '') => {
  const candidateHashHex = hashOTP(candidateOtp, contextId)
  const expectedBuf = Buffer.from(expectedHashHex, 'hex')
  const candidateBuf = Buffer.from(candidateHashHex, 'hex')
  if (expectedBuf.length !== candidateBuf.length) {
    return false
  }
  return crypto.timingSafeEqual(expectedBuf, candidateBuf)
}

export const generateSecureToken = (byteLength = 32) => {
  return crypto.randomBytes(byteLength).toString('hex')
}

export const hashSessionToken = (token) => {
  return crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(String(token))
    .digest('hex')
}
