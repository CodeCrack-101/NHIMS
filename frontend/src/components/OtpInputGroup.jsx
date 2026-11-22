import { useRef } from 'react'
import '../styles/OtpInputGroup.css'

export function OtpInputGroup({ value = '', onChange, disabled = false, length = 6 }) {
  const inputsRef = useRef([])
  const digits = Array.from({ length }, (_, idx) => value[idx] || '')

  const focusInput = (index) => {
    const target = inputsRef.current[index]
    if (target) {
      target.focus()
      target.select()
    }
  }

  const handleDigitChange = (index, rawVal) => {
    const cleanDigits = rawVal.replace(/\D/g, '')

    // Handle mobile keyboard autofill or paste where entire code or multiple digits land in onChange
    if (cleanDigits.length > 1) {
      const nextDigits = [...digits]
      for (let i = 0; i < cleanDigits.length && index + i < length; i++) {
        nextDigits[index + i] = cleanDigits[i]
      }
      const joined = nextDigits.join('')
      onChange(joined)
      const nextFocusIndex = Math.min(index + cleanDigits.length, length - 1)
      focusInput(nextFocusIndex)
      return
    }

    const cleanDigit = cleanDigits.slice(-1)
    const nextDigits = [...digits]
    nextDigits[index] = cleanDigit
    const joined = nextDigits.join('')
    onChange(joined)

    if (cleanDigit && index < length - 1) {
      focusInput(index + 1)
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const nextDigits = [...digits]
        nextDigits[index] = ''
        onChange(nextDigits.join(''))
      } else if (index > 0) {
        const nextDigits = [...digits]
        nextDigits[index - 1] = ''
        onChange(nextDigits.join(''))
        focusInput(index - 1)
      }
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focusInput(index - 1)
      e.preventDefault()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      focusInput(index + 1)
      e.preventDefault()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = (e.clipboardData?.getData('text') || '')
      .replace(/\D/g, '')
    if (!pasted) return

    // If pasted starts from current focused box or whole input
    const nextDigits = [...digits]
    // Find first empty or focus target, or fill from index 0 if full paste
    const startIndex = pasted.length >= length ? 0 : digits.findIndex((d) => !d) === -1 ? 0 : Math.max(0, digits.findIndex((d) => !d))
    for (let i = 0; i < pasted.length && startIndex + i < length; i++) {
      nextDigits[startIndex + i] = pasted[i]
    }
    const joined = nextDigits.join('')
    onChange(joined)
    const nextFocusIndex = Math.min(startIndex + pasted.length, length - 1)
    focusInput(nextFocusIndex)
  }

  return (
    <div className="otp-input-group" role="group" aria-label="6-digit verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          value={digit}
          disabled={disabled}
          autoFocus={index === 0}
          aria-label={`Digit ${index + 1} of ${length}`}
          onChange={(e) => handleDigitChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="otp-digit-input"
        />
      ))}
    </div>
  )
}
