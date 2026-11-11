import { sendLoginOTPEmail } from '../services/email.service.js'

try {
  await sendLoginOTPEmail({ toEmail: 'nhstock443@gmail.com', otp: '482910' })
  console.log('[Resend] SUCCESS: OTP email delivered to nhstock443@gmail.com')
} catch (err) {
  console.error('[Resend] ERROR:', err.message)
  process.exit(1)
}
