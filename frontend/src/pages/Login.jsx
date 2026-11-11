import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout.jsx'
import { FormInput } from '../components/FormInput.jsx'
import { LoadingButton } from '../components/LoadingButton.jsx'
import { AlertBanner } from '../components/AlertBanner.jsx'
import { authService } from '../services/api.js'
import { useToast } from '../context/ToastContext.jsx'
import '../styles/Login.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [successMessage, setSuccessMessage] = useState(
    location.state?.successMessage || ''
  )
  const [submitting, setSubmitting] = useState(false)

  const validateForm = () => {
    const errors = {}
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      errors.email = 'Email address is required'
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.email = 'Please enter a valid company email address'
    }

    if (!password) {
      errors.password = 'Password is required'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return

    setServerError('')
    setSuccessMessage('')

    if (!validateForm()) return

    setSubmitting(true)
    try {
      const response = await authService.login({
        email: email.trim().toLowerCase(),
        password,
      })

      const challengeData = response.data?.data
      sessionStorage.setItem('crm_otp_challenge', JSON.stringify(challengeData))
      showToast({
        type: 'info',
        title: 'OTP Sent',
        message: `Verification code sent to ${challengeData?.maskedEmail || 'your email'}.`,
      })

      navigate('/verify-otp', {
        replace: true,
        state: challengeData,
      })
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Unable to sign in right now. Please check your connection and try again.'
      setServerError(msg)
      showToast('error', msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Sign In Nh Wallpaper IMS"
      subtitle="Enter your corporate credentials to receive a one-time verification code."
    >
      <AlertBanner type="success" message={successMessage} />
      <AlertBanner type="error" message={serverError} />

      <form onSubmit={handleSubmit} noValidate className="login-form">
        <FormInput
          label="Email Address"
          type="email"
          name="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }))
          }}
          placeholder="name@company.com"
          autoComplete="username"
          error={fieldErrors.email}
          disabled={submitting}
          required
          autoFocus
        />

        <FormInput
          label="Password"
          type="password"
          name="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }))
          }}
          placeholder="Enter your password"
          autoComplete="current-password"
          error={fieldErrors.password}
          disabled={submitting}
          required
        />

        <div className="login-aux-row">
          <Link to="/forgot-password" className="text-link">
            Forgot Password?
          </Link>
        </div>

        <LoadingButton
          type="submit"
          loading={submitting}
          loadingText="Verifying credentials..."
        >
          Login
        </LoadingButton>
      </form>
    </AuthLayout>
  )
}
