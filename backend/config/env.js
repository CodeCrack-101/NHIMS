import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Always load backend/.env regardless of working directory
dotenv.config({ path: path.resolve(__dirname, '../.env') })
// Also load root .env as fallback if present
dotenv.config()

const getEnv = (key, fallback = undefined) => {
  const raw = process.env[key]
  if (raw !== undefined && raw.trim() !== '') {
    return raw.trim()
  }
  if (fallback !== undefined) {
    return fallback
  }
  throw new Error(`Missing required environment variable: ${key}`)
}

export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: Number(getEnv('PORT', '5000')),
  MONGO_URI: process.env.MONGO_DATABASE?.trim() || getEnv('MONGO_URI'),
  CLIENT_URL: getEnv('CLIENT_URL', 'http://localhost:5173'),
  RESEND_API_KEY: getEnv('RESEND_API_KEY'),
  RESEND_FROM_EMAIL: getEnv('RESEND_FROM_EMAIL', 'onboarding@resend.dev'),
  SESSION_SECRET: getEnv('SESSION_SECRET'),
  OTP_HMAC_SECRET: getEnv('OTP_HMAC_SECRET'),
  CSRF_SECRET: getEnv('CSRF_SECRET'),
  IS_PROD: getEnv('NODE_ENV', 'development') === 'production',
}
