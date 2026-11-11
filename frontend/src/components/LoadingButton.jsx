import { LottieIcon } from './LottieIcon.jsx'
import '../styles/LoadingButton.css'

export function LoadingButton({
  type = 'submit',
  loading = false,
  disabled = false,
  loadingText = 'Processing...',
  children,
  onClick,
  variant = 'primary',
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={`btn btn-${variant}`}
      aria-busy={loading}
    >
      {loading ? (
        <span className="btn-loading-content">
          <LottieIcon src="/loading.lottie" size={26} />
          <span>{loadingText}</span>
        </span>
      ) : (
        children
      )}
    </button>
  )
}
