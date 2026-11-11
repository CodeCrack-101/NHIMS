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
    const cleanDigit = rawVal.replace(/\D/g, '').slice(-1)
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
    const pasted = (e.clipboardData.getData('text') || '')
      .replace(/\D/g, '')
      .slice(0, length)
    if (!pasted) return
    onChange(pasted)
    const nextFocusIndex = Math.min(pasted.length, length - 1)
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
          maxLength={1}
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
