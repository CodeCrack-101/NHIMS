import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout.jsx'
import { FormInput } from '../components/FormInput.jsx'
import { LoadingButton } from '../components/LoadingButton.jsx'
import { AlertBanner } from '../components/AlertBanner.jsx'
import { authService } from '../services/api.js'
import { useToast } from '../context/ToastContext.jsx'
import '../styles/ForgotPassword.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPassword() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [serverError, setServerError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return

    setFieldError('')
    setServerError('')

    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setFieldError('Email address is required')
      return
    }
    if (!EMAIL_REGEX.test(normalized)) {
      setFieldError('Please enter a valid email address')
      return
    }

    setLoading(true)
    try {
      await authService.forgotPassword({ email: normalized })
      setSubmitted(true)
      showToast('success', 'Password reset code sent to your email.')
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Unable to process request right now. Please try again later.'
      setServerError(msg)
      showToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Reset Your Password"
      subtitle="Enter your corporate email address to receive a 10-minute verification code."
    >
      <AlertBanner type="error" message={serverError} />

      {submitted ? (
        <div className="forgot-password-form">
          <AlertBanner
            type="success"
            message="If an active account is associated with this email, a 6-digit password reset code has been sent."
          />
          <LoadingButton
            type="button"
            onClick={() =>
              navigate(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`)
            }
          >
            Enter Reset Code
          </LoadingButton>
          <div className="forgot-center-row">
            <Link to="/login" className="text-link">
              Return to Login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="forgot-password-form">
          <FormInput
            label="Registered Email Address"
            type="email"
            name="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (fieldError) setFieldError('')
            }}
            placeholder="name@company.com"
            autoComplete="email"
            error={fieldError}
            disabled={loading}
            required
            autoFocus
          />

          <LoadingButton
            type="submit"
            loading={loading}
            loadingText="Sending reset code..."
          >
            Send Reset Code
          </LoadingButton>

          <div className="forgot-center-row">
            <Link to="/login" className="text-link">
              Back to Login
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
