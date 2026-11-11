import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import '../styles/CustomSelect.css'

export function CustomSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select option...',
  disabled = false,
  isSearchable = false,
  emptyText = 'No options found',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef(null)

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const filteredOptions = useMemo(() => {
    if (!isSearchable || !query.trim()) return options
    const q = query.trim().toLowerCase()
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        String(opt.searchKeywords || '').toLowerCase().includes(q)
    )
  }, [options, query, isSearchable])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (opt) => {
    if (opt.disabled) return
    onChange(opt.value)
    setOpen(false)
  }

  return (
    <div
      ref={wrapperRef}
      className={`custom-pill-select-wrapper ${disabled ? 'disabled' : ''}`}
    >
      <div
        className={`custom-pill-select-trigger ${open ? 'open' : ''}`}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev)
        }}
      >
        <span
          className={`custom-pill-select-label ${
            !selectedOption ? 'placeholder' : ''
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`custom-pill-select-arrow ${open ? 'rotated' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div className="custom-pill-select-dropdown">
          {isSearchable && (
            <div className="custom-pill-search-box">
              <input
                type="text"
                value={query}
                autoFocus
                placeholder="Type to search..."
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="custom-pill-search-input"
              />
            </div>
          )}
          <div className="custom-pill-options-list">
            {filteredOptions.length === 0 ? (
              <div className="custom-pill-empty">{emptyText}</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value)
                return (
                  <div
                    key={opt.value}
                    className={`custom-pill-option-item ${
                      isSelected ? 'selected' : ''
                    } ${opt.disabled ? 'disabled' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelect(opt)
                    }}
                  >
                    <span>{opt.label}</span>
                    {opt.badgeText && (
                      <span className={`custom-pill-opt-badge ${opt.badgeTone || ''}`}>
                        {opt.badgeText}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
