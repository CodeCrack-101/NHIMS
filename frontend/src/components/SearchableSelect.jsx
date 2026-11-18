import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import '../styles/Billing.css'

export function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Type or select...',
  disabled = false,
  hasError = false,
  emptyText = 'No matching options',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const wrapperRef = useRef(null)

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  )

  // Keep input text synced with selected option when not actively typing
  useEffect(() => {
    if (!isTyping) {
      setQuery(selectedOption ? selectedOption.label : '')
    }
  }, [selectedOption, isTyping])

  const filteredOptions = useMemo(() => {
    if (!isTyping) return options
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        String(opt.searchKeywords || '')
          .toLowerCase()
          .includes(q)
    )
  }, [options, query, isTyping])

  const commitTypedQueryIfNeeded = useCallback(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setIsTyping(false)
      setQuery(selectedOption ? selectedOption.label : '')
      return
    }
    const exactMatch = options.find(
      (o) =>
        !o.disabled &&
        (o.label.toLowerCase() === q || String(o.value).toLowerCase() === q)
    )
    if (exactMatch) {
      setIsTyping(false)
      setQuery(exactMatch.label)
      if (String(exactMatch.value) !== String(value)) {
        onChange(exactMatch.value)
      }
      return
    }
    const firstMatch = filteredOptions.find((o) => !o.disabled)
    if (firstMatch && isTyping) {
      setIsTyping(false)
      setQuery(firstMatch.label)
      if (String(firstMatch.value) !== String(value)) {
        onChange(firstMatch.value)
      }
    } else {
      setIsTyping(false)
      setQuery(selectedOption ? selectedOption.label : '')
    }
  }, [query, options, filteredOptions, selectedOption, isTyping, value, onChange])

  // Close dropdown on outside click and commit typed match
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        if (open) {
          commitTypedQueryIfNeeded()
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, commitTypedQueryIfNeeded])

  const handleSelectOption = (opt) => {
    if (opt.disabled) return
    setIsTyping(false)
    setQuery(opt.label)
    setOpen(false)
    onChange(opt.value)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const firstAvailable = filteredOptions.find((o) => !o.disabled)
      if (firstAvailable) {
        handleSelectOption(firstAvailable)
      }
    } else if (e.key === 'Escape') {
      setIsTyping(false)
      setOpen(false)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={`billing-combo ${disabled ? 'combo-disabled' : ''}`}
    >
      <div
        className={`billing-combo-control ${open ? 'combo-open' : ''} ${
          hasError ? 'input-err' : ''
        }`}
      >
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={(e) => {
            if (!disabled) {
              setOpen(true)
              setIsTyping(false)
              e.target.select()
            }
          }}
          onChange={(e) => {
            const val = e.target.value
            setQuery(val)
            setIsTyping(true)
            if (!open) setOpen(true)

            // Auto-select immediately if exact match typed
            const clean = val.trim().toLowerCase()
            if (clean) {
              const exact = options.find(
                (o) =>
                  !o.disabled &&
                  (o.label.toLowerCase() === clean ||
                    String(o.value).toLowerCase() === clean)
              )
              if (exact && String(exact.value) !== String(value)) {
                onChange(exact.value)
              }
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              if (
                wrapperRef.current &&
                !wrapperRef.current.contains(document.activeElement)
              ) {
                commitTypedQueryIfNeeded()
                setOpen(false)
              }
            }, 120)
          }}
          onKeyDown={handleKeyDown}
          className="billing-combo-input"
        />
        {value && !disabled && (
          <button
            type="button"
            className="billing-combo-clear"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              setIsTyping(false)
              setQuery('')
              onChange('')
              setOpen(true)
            }}
            title="Clear selection"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          className="billing-combo-arrow"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsTyping(false)
              setOpen((prev) => !prev)
            }
          }}
          aria-label="Toggle options"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && !disabled && (
        <ul className="billing-combo-menu" role="listbox">
          {filteredOptions.length === 0 ? (
            <li className="billing-combo-empty">{emptyText}</li>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value)
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`billing-combo-item ${
                    isSelected ? 'combo-item-selected' : ''
                  } ${opt.disabled ? 'combo-item-disabled' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectOption(opt)
                  }}
                >
                  <span className="combo-item-main">{opt.label}</span>
                  {opt.badgeText && (
                    <span
                      className={`combo-item-badge combo-badge-${
                        opt.badgeTone || 'neutral'
                      }`}
                    >
                      {opt.badgeText}
                    </span>
                  )}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
