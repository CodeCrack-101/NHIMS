import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../layouts/AuthLayout.jsx'
import { OtpInputGroup } from '../components/OtpInputGroup.jsx'
import { LoadingButton } from '../components/LoadingButton.jsx'
import { AlertBanner } from '../components/AlertBanner.jsx'
import { LottieIcon } from '../components/LottieIcon.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import { authService } from '../services/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import '../styles/VerifyOTP.css'

export function VerifyOTP() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const { showToast } = useToast()

  const storedChallenge = (() => {
    if (location.state?.challengeId) return location.state
    try {
      const raw = sessionStorage.getItem('crm_otp_challenge')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()

  const [challenge, setChallenge] = useState(storedChallenge)
  const [otp, setOtp] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  const expiryTimer = useCountdown(challenge?.expiresAt)
  const resendTimer = useCountdown(challenge?.resendAvailableAt)

  useEffect(() => {
    if (!challenge?.challengeId) {
      navigate('/login', { replace: true })
    }
  }, [challenge, navigate])

  if (!challenge?.challengeId) {
    return null
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (verifying) return

    setErrorMessage('')
    setSuccessMessage('')

    if (expiryTimer.isExpired) {
      setErrorMessage(
        'Your verification code has expired. Please click Resend Code to receive a new one.'
      )
      return
    }

    if (!/^\d{6}$/.test(otp)) {
      setErrorMessage('Please enter the complete 6-digit verification code.')
      return
    }

    setVerifying(true)
    try {
      const response = await authService.verifyOtp({
        challengeId: challenge.challengeId,
        otp,
      })

      sessionStorage.removeItem('crm_otp_challenge')
      const authenticatedUser = response.data?.data?.user
      setUser(authenticatedUser)
      showToast({
        type: 'success',
        title: 'Signed In',
        message: 'Welcome to NH Wallpaper Stock Management.',
      })

      navigate('/dashboard', { replace: true })
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Verification failed. Please check the code and try again.'
      setErrorMessage(msg)
      showToast('error', msg)
      setOtp('')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (resending || !resendTimer.isExpired) return

    setErrorMessage('')
    setSuccessMessage('')
    setResending(true)

    try {
      const response = await authService.resendOtp({
        challengeId: challenge.challengeId,
      })

      const updated = {
        ...challenge,
        ...response.data?.data,
      }
      setChallenge(updated)
      sessionStorage.setItem('crm_otp_challenge', JSON.stringify(updated))
      expiryTimer.resetTarget(updated.expiresAt)
      resendTimer.resetTarget(updated.resendAvailableAt)
      setOtp('')
      setSuccessMessage('A new 6-digit verification code has been sent to your email.')
      showToast('success', 'A new 6-digit verification code has been sent.')
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        'Unable to resend verification code. Please try signing in again.'
      setErrorMessage(msg)
      showToast('error', msg)
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      title="Two-Step Email Verification"
      subtitle={`Enter the 6-digit code sent to ${challenge.maskedEmail || 'your email'}`}
    >
      <AlertBanner type="success" message={successMessage} />
      <AlertBanner type="error" message={errorMessage} />

      <form onSubmit={handleVerify} noValidate className="verify-otp-form">
        <OtpInputGroup
          value={otp}
          onChange={setOtp}
          disabled={verifying || expiryTimer.isExpired}
        />

        <div className="otp-status-bar">
          {expiryTimer.isExpired ? (
            <span className="otp-expired-badge" role="status">
              Code expired. Please request a new code.
            </span>
          ) : (
            <span className="otp-timer-badge" role="status">
              Code expires in <strong>{expiryTimer.formatted}</strong>
            </span>
          )}
        </div>

        <LoadingButton
          type="submit"
          loading={verifying}
          disabled={otp.length !== 6 || expiryTimer.isExpired}
          loadingText="Verifying code..."
        >
          Verify OTP
        </LoadingButton>

        <div className="otp-actions-row">
          <button
            type="button"
            onClick={handleResend}
            disabled={!resendTimer.isExpired || resending}
            className="btn-link otp-resend-btn"
          >
            {resending ? (
              <span className="otp-resending-inline">
                <LottieIcon src="/loading.lottie" size={20} />
                <span>Sending new code...</span>
              </span>
            ) : resendTimer.isExpired ? (
              'Resend Verification Code'
            ) : (
              `Resend code in ${resendTimer.secondsLeft}s`
            )}
          </button>

          <Link
            to="/login"
            onClick={() => sessionStorage.removeItem('crm_otp_challenge')}
            className="text-link"
          >
            Back to Login
          </Link>
        </div>
      </form>
    </AuthLayout>
  )
}
