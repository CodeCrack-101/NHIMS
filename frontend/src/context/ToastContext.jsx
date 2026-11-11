import { createContext, useContext, useState, useCallback, useRef } from 'react'
import '../styles/Toast.css'

const ToastContext = createContext(null)

let toastCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  const removeToast = useCallback((id) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (typeOrOptions, messageArg, durationArg = 3200) => {
      const id = ++toastCounter
      let type = 'info'
      let title = ''
      let message = ''
      let duration = durationArg

      if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
        type = typeOrOptions.type || 'info'
        title = typeOrOptions.title || ''
        message = typeOrOptions.message || ''
        duration = typeOrOptions.duration ?? 3200
      } else {
        type = typeOrOptions || 'info'
        message = messageArg || ''
      }

      if (!title) {
        if (type === 'success') title = 'Success'
        else if (type === 'error') title = 'Error'
        else if (type === 'warning') title = 'Warning'
        else title = 'Notification'
      }

      setToasts((prev) => {
        const next = [...prev, { id, type, title, message, duration }]
        return next.slice(-4) // Keep max 4 visible at once
      })

      const timer = setTimeout(() => {
        removeToast(id)
      }, duration)
      timersRef.current.set(id, timer)

      return id
    },
    [removeToast]
  )

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="crm-toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`crm-toast-card crm-toast-${t.type}`}
            role="status"
          >
            <div className={`crm-toast-icon crm-toast-icon-${t.type}`}>
              {t.type === 'success' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {t.type === 'error' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )}
              {t.type === 'warning' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
              {t.type === 'info' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              )}
            </div>

            <div className="crm-toast-body">
              <div className="crm-toast-title">{t.title}</div>
              <div className="crm-toast-msg">{t.message}</div>
            </div>

            <button
              type="button"
              className="crm-toast-close"
              onClick={() => removeToast(t.id)}
              aria-label="Close notification"
            >
              ✕
            </button>

            <div
              className={`crm-toast-progress crm-toast-progress-${t.type}`}
              style={{ animationDuration: `${t.duration}ms` }}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
