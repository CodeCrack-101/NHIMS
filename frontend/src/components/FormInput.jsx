import { useState, useId } from 'react'
import '../styles/FormInput.css'

export function FormInput({
  label,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
  disabled = false,
  required = false,
  autoFocus = false,
}) {
  const inputId = useId()
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className="form-field">
      <label htmlFor={inputId} className="form-label">
        {label}
      </label>
      <div className={`input-wrapper ${error ? 'input-wrapper-error' : ''}`}>
        <input
          id={inputId}
          name={name}
          type={effectiveType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="form-input"
        />
        {isPassword && (
          <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabIndex={0}
          >
            {showPassword ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
