import {
  formatCatalogueLabel,
  getCatalogueCoverImage,
} from '../services/catalogueService.js'
import '../styles/CatalogueCard.css'

export function CatalogueCard({
  catalogue,
  isSelected = false,
  onSelect,
  buttonLabel = 'View Catalogue',
}) {
  const cleanTitle = formatCatalogueLabel(catalogue.name || catalogue.slug)
  const cleanBadge = formatCatalogueLabel(catalogue.slug)
  const coverImage = getCatalogueCoverImage(catalogue.slug || catalogue.name)

  const hasCover = Boolean(coverImage)

  return (
    <div
      className={`catalogue-card ${hasCover ? 'catalogue-card-has-cover' : 'catalogue-card-fallback'} ${
        isSelected ? 'catalogue-card-selected' : ''
      }`}
      onClick={() => onSelect?.(catalogue.slug)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(catalogue.slug)
        }
      }}
    >
      {hasCover ? (
        <>
          <div className="catalogue-card-cover-media">
            <img
              src={coverImage}
              alt={`${cleanTitle} Poster`}
              className="catalogue-card-poster-img"
              loading="lazy"
            />
            <div className="catalogue-card-badge-floating">
              <span className="catalogue-badge">{cleanBadge}</span>
            </div>
            <div className="catalogue-card-image-gradient" />
          </div>

          <div className="catalogue-card-details">
            <div className="catalogue-card-title-row">
              <h3 className="catalogue-card-title">{cleanTitle}</h3>
              <span className="catalogue-status-check" title="Active Catalogue">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </div>

            {catalogue.description && (
              <p className="catalogue-card-desc">{catalogue.description}</p>
            )}

            <div className="catalogue-card-metrics">
              <div className="catalogue-metric-box">
                <span className="catalogue-metric-label">Total Patterns</span>
                <strong className="catalogue-metric-value">
                  {catalogue.totalPatterns ?? 0}
                </strong>
              </div>
              <div className="catalogue-metric-box">
                <span className="catalogue-metric-label">Available Stock</span>
                <strong className="catalogue-metric-value">
                  {catalogue.totalStock ?? 0}
                </strong>
              </div>
            </div>

            <div className="catalogue-card-alert-row">
              <button
                type="button"
                className={`card-alert-btn ${
                  (catalogue.outOfStock || 0) > 0 ? 'card-alert-danger' : 'card-alert-ok'
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(catalogue.slug, 'OUT_OF_STOCK')
                }}
                title="Directly open Out of Stock page"
              >
                <span>Out of Stock:</span>
                <strong>{catalogue.outOfStock ?? 0} ↗</strong>
              </button>

              <button
                type="button"
                className="card-alert-btn card-alert-warning"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(catalogue.slug, 'LOW_STOCK')
                }}
                title="Directly open Below 10 page"
              >
                <span>Below 10:</span>
                <strong>{catalogue.lowStock ?? 0} ↗</strong>
              </button>
            </div>

            <button
              type="button"
              className="catalogue-card-btn"
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(catalogue.slug)
              }}
            >
              <span>{buttonLabel}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        <div className="catalogue-card-content">
          <div className="catalogue-card-header">
            <div className="catalogue-badge">{cleanBadge}</div>
            <span className="catalogue-status-dot" title="Active Catalogue" />
          </div>

          <h3 className="catalogue-card-title">{cleanTitle} Catalogue</h3>
          {catalogue.description && (
            <p className="catalogue-card-desc">{catalogue.description}</p>
          )}

          <div className="catalogue-card-metrics">
            <div className="catalogue-metric-box">
              <span className="catalogue-metric-label">Total Patterns</span>
              <strong className="catalogue-metric-value">
                {catalogue.totalPatterns ?? 0}
              </strong>
            </div>
            <div className="catalogue-metric-box">
              <span className="catalogue-metric-label">Available Stock</span>
              <strong className="catalogue-metric-value">
                {catalogue.totalStock ?? 0}
              </strong>
            </div>
          </div>

          <div className="catalogue-card-alert-row">
            <button
              type="button"
              className={`card-alert-btn ${
                (catalogue.outOfStock || 0) > 0 ? 'card-alert-danger' : 'card-alert-ok'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(catalogue.slug, 'OUT_OF_STOCK')
              }}
              title="Directly open Out of Stock page"
            >
              <span>Out of Stock:</span>
              <strong>{catalogue.outOfStock ?? 0} ↗</strong>
            </button>

            <button
              type="button"
              className="card-alert-btn card-alert-warning"
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(catalogue.slug, 'LOW_STOCK')
              }}
              title="Directly open Below 10 page"
            >
              <span>Below 10:</span>
              <strong>{catalogue.lowStock ?? 0} ↗</strong>
            </button>
          </div>

          <button
            type="button"
            className="catalogue-card-btn"
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(catalogue.slug)
            }}
          >
            <span>{buttonLabel}</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
