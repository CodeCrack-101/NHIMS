import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { inventoryService } from '../services/inventoryService.js'
import { catalogueService, formatCatalogueLabel } from '../services/catalogueService.js'
import { PLACEHOLDER_IMAGE } from '../assets/imageManifest.js'
import { Skeleton } from '../components/Skeleton.jsx'
import { getStreamUrl } from '../utils/getStreamUrl.js'
import '../styles/SearchRoll.css'

export function SearchRoll() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [selectedCatalogue, setSelectedCatalogue] = useState('')
  const [minRoll, setMinRoll] = useState('')
  const [maxRoll, setMaxRoll] = useState('')
  const [catalogues, setCatalogues] = useState([])

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Load catalogues list for filter dropdown
  useEffect(() => {
    let mounted = true
    catalogueService
      .getAllCatalogues()
      .then((res) => {
        if (mounted) {
          setCatalogues(res.data?.data?.catalogues || [])
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const handleSearch = useCallback(async (q, cat, min, max) => {
    const trimmed = q.trim()
    const hasCat = Boolean(cat && cat !== 'ALL')
    const hasMin = min !== '' && !isNaN(Number(min))
    const hasMax = max !== '' && !isNaN(Number(max))

    if (!trimmed && !hasCat && !hasMin && !hasMax) {
      setItems([])
      setLoading(false)
      setHasSearched(false)
      return
    }

    setLoading(true)
    setHasSearched(true)
    try {
      const params = {}
      if (trimmed) params.q = trimmed
      if (hasCat) params.catalogue = cat
      if (hasMin) params.minRoll = Number(min)
      if (hasMax) params.maxRoll = Number(max)

      const res = await inventoryService.searchRolls(params)
      setItems(res.data?.data?.items || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(query, selectedCatalogue, minRoll, maxRoll)
    }, 280)
    return () => clearTimeout(timer)
  }, [query, selectedCatalogue, minRoll, maxRoll, handleSearch])

  const handleResetFilters = () => {
    setQuery('')
    setSelectedCatalogue('')
    setMinRoll('')
    setMaxRoll('')
  }

  const hasActiveFilters = Boolean(
    query.trim() || selectedCatalogue || minRoll !== '' || maxRoll !== ''
  )

  // Real-time Server-Sent Events (SSE) subscription: keep search results synced instantly on any billing deduction
  useEffect(() => {
    const eventSource = new EventSource(getStreamUrl('/inventory/stream'), {
      withCredentials: true,
    })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'INVENTORY_UPDATED') {
          setItems((prevItems) =>
            prevItems.map((item) => {
              const matchesPattern =
                String(item.patternNumber).trim().toUpperCase() ===
                String(payload.patternNumber).trim().toUpperCase()
              const matchesCatalogue =
                !payload.catalogueId ||
                String(item.catalogue?._id || item.catalogueId) === String(payload.catalogueId)

              if (matchesPattern && matchesCatalogue) {
                return {
                  ...item,
                  quantity: payload.quantity,
                  updatedAt: payload.updatedAt,
                }
              }
              return item
            })
          )
        }
      } catch {
        // Ignore heartbeats
      }
    }

    return () => {
      eventSource.close()
    }
  }, [])

  const getStockBadge = (qty) => {
    if (qty === 0) {
      return <span className="roll-card-badge badge-out-of-stock">Out of Stock</span>
    }
    if (qty < 10) {
      return <span className="roll-card-badge badge-low-stock">Low Stock ({qty})</span>
    }
    return <span className="roll-card-badge badge-in-stock">In Stock ({qty})</span>
  }

  return (
    <div className="search-roll-page">
      {/* 1. Breadcrumb */}
      <nav className="crm-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="breadcrumb-link">
          Home
        </Link>
        <span className="breadcrumb-sep">&gt;</span>
        <span className="breadcrumb-current">Search Roll</span>
      </nav>

      {/* 2. Top Header */}
      <div className="search-roll-topbar">
        <div>
          <h1 className="search-roll-heading">Search Roll Details</h1>
          <p className="search-roll-subtext">
            Enter any pattern number or code to instantly check stock, catalogue, and roll details
          </p>
        </div>
      </div>

      {/* 3. Search Bar & Filters Card */}
      <div className="search-roll-box-card">
        <div className="search-roll-input-wrap">
          <svg
            className="search-roll-icon"
            width="20"
            height="20"
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
            className="search-roll-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type any pattern number (e.g. 101, EW-05, SH-12, SP-20)..."
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="search-roll-clear-btn"
              onClick={() => setQuery('')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Row: Catalogue & Min to Max Roll */}
        <div className="search-roll-filter-row">
          <div className="search-roll-filter-group catalogue-group">
            <label className="search-roll-filter-label" htmlFor="catalogue-filter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Filter Catalogue
            </label>
            <select
              id="catalogue-filter"
              className="search-roll-select"
              value={selectedCatalogue}
              onChange={(e) => setSelectedCatalogue(e.target.value)}
            >
              <option value="">All Catalogues</option>
              {catalogues.map((cat) => (
                <option key={cat._id || cat.slug} value={cat.slug || cat._id}>
                  {formatCatalogueLabel(cat.name || cat.slug)}
                </option>
              ))}
            </select>
          </div>

          <div className="search-roll-filter-group range-group">
            <label className="search-roll-filter-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              Roll Quantity Range
            </label>
            <div className="search-roll-range-inputs">
              <input
                type="number"
                min="0"
                className="search-roll-num-input"
                placeholder="Min Rolls"
                value={minRoll}
                onChange={(e) => setMinRoll(e.target.value)}
              />
              <span className="search-roll-range-sep">to</span>
              <input
                type="number"
                min="0"
                className="search-roll-num-input"
                placeholder="Max Rolls"
                value={maxRoll}
                onChange={(e) => setMaxRoll(e.target.value)}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="search-roll-reset-btn"
              onClick={handleResetFilters}
              title="Reset all filters"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* 4. Results Section */}
      {loading ? (
        <div className="search-roll-results-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="roll-card" style={{ padding: '16px' }}>
              <Skeleton width="100%" height="180px" borderRadius="8px" style={{ marginBottom: '12px' }} />
              <Skeleton width="40%" height="14px" style={{ marginBottom: '8px' }} />
              <Skeleton width="60%" height="20px" style={{ marginBottom: '12px' }} />
              <Skeleton width="100%" height="36px" borderRadius="6px" />
            </div>
          ))}
        </div>
      ) : hasSearched && items.length === 0 ? (
        <div className="search-roll-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p>
            No rolls found matching your search &amp; filter criteria.
          </p>
          <span style={{ fontSize: '12.5px', color: '#94a3b8' }}>
            Try widening your min/max roll range or selecting &ldquo;All Catalogues&rdquo;.
          </span>
        </div>
      ) : (
        <>
          {hasSearched && (
            <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#64748b' }}>
              Found <strong>{items.length}</strong> matching roll patterns
            </p>
          )}

          <div className="search-roll-results-grid">
            {items.map((roll) => {
              const catSlug = roll.catalogueSlug || roll.catalogue?.slug || ''
              return (
                <div key={roll._id} className="roll-card">
                  <div className="roll-card-img-wrap">
                    <img
                      src={roll.imagePath || PLACEHOLDER_IMAGE}
                      alt={roll.patternNumber}
                      className="roll-card-img"
                      onError={(e) => {
                        e.target.onerror = null
                        e.target.src = PLACEHOLDER_IMAGE
                      }}
                    />
                    {getStockBadge(roll.quantity)}
                  </div>

                  <div className="roll-card-body">
                    <span className="roll-card-cat">
                      CATALOGUE: {formatCatalogueLabel(roll.catalogueName || catSlug).toUpperCase()}
                    </span>
                    <h3 className="roll-card-pattern">Pattern No: {roll.patternNumber}</h3>

                    <div className="roll-card-meta-row">
                      <span>Available Stock:</span>
                      <strong className="roll-card-qty">{roll.quantity} Rolls</strong>
                    </div>

                    <div className="roll-card-meta-row">
                      <span>Standard Rate:</span>
                      <strong>₹1250.00</strong>
                    </div>
                  </div>

                  <div className="roll-card-footer">
                    <button
                      type="button"
                      className="roll-view-pill-btn"
                      onClick={() => navigate(`/roll-details/${catSlug.toUpperCase()}`)}
                    >
                      Open in {formatCatalogueLabel(roll.catalogueName || catSlug)}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
