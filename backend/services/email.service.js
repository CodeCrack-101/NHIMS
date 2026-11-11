import { resendClient } from '../config/resend.js'
import { env } from '../config/env.js'

export const sendLoginOTPEmail = async ({ toEmail, otp }) => {
  const subject = 'Your CRM Login Verification Code'

  const text = `Hello,

A login verification request was made for your company CRM account.

Your verification code is: ${otp}

This code expires in 5 minutes.

If you did not initiate this request, please contact your administrator.

Regards,
Company CRM Security Team`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; color: #0f172a;">
      <div style="font-size: 13px; font-weight: 600; color: #2563eb; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px;">
        Enterprise CRM Security
      </div>
      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #0f172a;">
        Your CRM Login Verification Code
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
        Hello,
      </p>
      <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #334155;">
        A login verification request was made for your company CRM account.
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
          Your verification code is
        </div>
        <div style="font-size: 30px; font-weight: 700; letter-spacing: 8px; color: #0f172a; font-family: 'Courier New', monospace;">
          ${otp}
        </div>
      </div>
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">
        This code expires in <strong>5 minutes</strong>.
      </p>
      <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">
        If you did not initiate this request, please contact your administrator.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="margin: 0; font-size: 13px; color: #64748b;">
        Regards,<br />
        <strong>Company CRM Security Team</strong>
      </p>
    </div>
  `

  const { error } = await resendClient.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [toEmail],
    subject,
    text,
    html,
  })

  if (error) {
    throw new Error(`Email delivery failed: ${error.message || 'Resend API error'}`)
  }
}

export const sendPasswordResetEmail = async ({ toEmail, resetToken, resetCode }) => {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(toEmail)}`
  const subject = 'Password Reset Request – Company CRM'

  const text = `Hello,

A password reset was requested for your company CRM account.

Your 6-digit password reset verification code is: ${resetCode}

Or use the secure reset link below within 10 minutes:
${resetUrl}

This verification code and link expire in 10 minutes.

If you did not initiate this request, please ignore this email or contact your administrator.

Regards,
Company CRM Security Team`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; color: #0f172a;">
      <div style="font-size: 13px; font-weight: 600; color: #2563eb; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px;">
        Enterprise CRM Security
      </div>
      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #0f172a;">
        Password Reset Verification
      </h2>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
        Hello,
      </p>
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
        A password reset request was received for your company CRM account. Enter the verification code below on the Reset Password screen, or click the secure button:
      </p>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
        <div style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
          Reset Verification Code
        </div>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a; font-family: 'Courier New', monospace;">
          ${resetCode}
        </div>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetUrl}" style="display: inline-block; background-color: #1e293b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
          Reset CRM Password
        </a>
      </div>
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #475569;">
        This code and link expire in <strong>10 minutes</strong>.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="margin: 0; font-size: 13px; color: #64748b;">
        Regards,<br />
        <strong>Company CRM Security Team</strong>
      </p>
    </div>
  `

  const { error } = await resendClient.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [toEmail],
    subject,
    text,
    html,
  })

  if (error) {
    throw new Error(`Password reset email delivery failed: ${error.message || 'Resend API error'}`)
  }
}
