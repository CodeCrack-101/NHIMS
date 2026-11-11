import '../styles/AlertBanner.css'

export function AlertBanner({ type = 'error', message }) {
  if (!message) return null

  return (
    <div
      className={`alert-banner alert-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <span className="alert-indicator" aria-hidden="true">
        {type === 'error' ? '!' : '✓'}
      </span>
      <span className="alert-text">{message}</span>
    </div>
  )
}
