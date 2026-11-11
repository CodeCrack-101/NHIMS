import '../styles/SearchBar.css'

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search by pattern number (e.g. 1.1, 15.1)...',
}) {
  return (
    <div className="inventory-search-bar">
      <svg
        className="inventory-search-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="inventory-search-input"
        aria-label="Search patterns"
      />
      {value && (
        <button
          type="button"
          className="inventory-search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  )
}
