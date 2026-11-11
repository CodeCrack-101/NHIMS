import { useState, useEffect } from 'react'
import '../styles/QuantityControl.css'

export function QuantityControl({
  quantity = 0,
  onDecrease,
  onIncrease,
  onSetQuantity,
  disabled = false,
}) {
  const [inputValue, setInputValue] = useState(String(quantity))

  useEffect(() => {
    setInputValue(String(quantity))
  }, [quantity])

  const commitDirectQuantity = () => {
    const trimmed = String(inputValue).trim()
    if (trimmed === '') {
      setInputValue(String(quantity))
      return
    }
    const parsed = Math.floor(Number(trimmed))
    if (Number.isNaN(parsed) || parsed < 0) {
      setInputValue(String(quantity))
      return
    }
    if (parsed !== quantity && onSetQuantity) {
      onSetQuantity(parsed)
    } else {
      setInputValue(String(parsed))
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setInputValue(String(quantity))
      e.currentTarget.blur()
    }
  }

  return (
    <div className="quantity-control-group">
      <button
        type="button"
        className="qty-btn qty-btn-minus"
        onClick={onDecrease}
        disabled={disabled || quantity <= 0}
        aria-label="Decrease quantity by 1"
        title="Decrease quantity (-1)"
      >
        −
      </button>
      <button
        type="button"
        className="qty-btn qty-btn-plus"
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Increase quantity by 1"
        title="Increase quantity (+1)"
      >
        +
      </button>
      <input
        type="number"
        min="0"
        className="qty-direct-input"
        value={inputValue}
        disabled={disabled}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={commitDirectQuantity}
        onKeyDown={handleKeyDown}
        aria-label="Direct quantity input"
        title="Type quantity and press Enter or click outside to update"
      />
    </div>
  )
}
