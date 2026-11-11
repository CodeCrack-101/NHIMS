import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout.jsx'
import { FormInput } from '../components/FormInput.jsx'
import { LoadingButton } from '../components/LoadingButton.jsx'
import { AlertBanner } from '../components/AlertBanner.jsx'
import { authService } from '../services/api.js'
import { useToast } from '../context/ToastContext.jsx'
import '../styles/ResetPassword.css'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [token, setToken] = useState(searchParams.get('token') || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const nextErrors = {}
    if (!email.trim()) {
      nextErrors.email = 'Email address is required'
    }
    if (!token.trim() || token.trim().length < 6) {
      nextErrors.token = 'Please enter the 6-digit reset verification code'
    }
    if (newPassword.length < 8) {
      nextErrors.newPassword = 'Password must be at least 8 characters long'
    } else if (!/[A-Z]/.test(newPassword)) {
      nextErrors.newPassword = 'Include at least one uppercase letter'
    } else if (!/[a-z]/.test(newPassword)) {
      nextErrors.newPassword = 'Include at least one lowercase letter'
    } else if (!/[0-9]/.test(newPassword)) {
      nextErrors.newPassword = 'Include at least one number'
    } else if (!/[^A-Za-z0-9]/.test(newPassword)) {
      nextErrors.newPassword = 'Include at least one special symbol'
    }

    if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return

    setServerError('')
    if (!validate()) return

    setLoading(true)
    try {
      await authService.resetPassword({
        email: email.trim().toLowerCase(),
        token: token.trim(),
        newPassword,
      })
      showToast('success', 'Password updated successfully. Please sign in.')

      navigate('/login', {
        replace: true,
        state: {
          successMessage:
            'Your password has been updated and all prior sessions were invalidated. Please sign in.',
        },
      })
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Failed to reset password. Please check your verification code.'
      setServerError(msg)
      showToast('error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Set New CRM Password"
      subtitle="Enter the 6-digit verification code sent to your email and choose a strong password."
    >
      <AlertBanner type="error" message={serverError} />

      <form onSubmit={handleSubmit} noValidate className="reset-password-form">
        <FormInput
          label="Email Address"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          autoComplete="email"
          error={errors.email}
          disabled={loading}
          required
        />

        <FormInput
          label="Reset Verification Code"
          type="text"
          name="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="6-digit code"
          autoComplete="one-time-code"
          error={errors.token}
          disabled={loading}
          required
        />

        <FormInput
          label="New Password"
          type="password"
          name="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Min 8 chars, upper, lower, number, symbol"
          autoComplete="new-password"
          error={errors.newPassword}
          disabled={loading}
          required
        />

        <FormInput
          label="Confirm New Password"
          type="password"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          disabled={loading}
          required
        />

        <LoadingButton
          type="submit"
          loading={loading}
          loadingText="Updating password..."
        >
          Reset Password
        </LoadingButton>

        <div className="reset-center-row">
          <Link to="/login" className="text-link">
            Back to Login
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
