import { useState } from 'react'
import { QuantityControl } from './QuantityControl.jsx'
import { PLACEHOLDER_IMAGE } from '../assets/imageManifest.js'
import '../styles/InventoryTable.css'

const INITIAL_VISIBLE_COUNT = 5

// Automatically request compact 160x160 auto-WebP/AVIF thumbnail for Cloudinary URLs to save bandwidth
const getThumbnailUrl = (url) => {
  if (!url) return PLACEHOLDER_IMAGE
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')){
    return url.replace(
      /c_limit,f_auto,q_auto,w_\d+/,
      'c_fill,f_auto,h_160,q_auto,w_160'
    )
  }
  return url
}

const getStockLevelInfo = (quantity) => {
  const q = Number(quantity) || 0
  if (q === 0) {
    return {
      label: 'Out of Stock',
      percent: 0,
      className: 'stock-meter-zero',
    }
  }
  if (q < 10) {
    // Low: 15% - 30% fill
    const percent = Math.min(30, Math.max(15, Math.round((q / 10) * 30)))
    return {
      label: 'Low Stock',
      percent,
      className: 'stock-meter-low',
    }
  }
  if (q < 50) {
    // Medium / Half-filled: 35% - 70% fill
    const percent = Math.min(70, Math.max(35, Math.round(35 + ((q - 10) / 40) * 35)))
    return {
      label: 'In Stock',
      percent,
      className: 'stock-meter-medium',
    }
  }
  // High / Full-filled: 75% - 100% fill
  const percent = Math.min(100, Math.max(75, Math.round(75 + ((q - 50) / 50) * 25)))
  return {
    label: 'High Stock',
    percent,
    className: 'stock-meter-high',
  }
}

const getPatternPrefix = (slug = '') => {
  const normalized = String(slug).trim().toUpperCase().replace(/_/g, ' ')
  if (normalized === 'SELFIE POINT' || normalized === 'SP') {
    return 'SP'
  }
  if (normalized === 'EW') {
    return 'EW'
  }
  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function InventoryTable({
  items = [],
  catalogueSlug = '',
  pendingMap = {},
  onQuantityChange,
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(false)
  const [previewItem, setPreviewItem] = useState(null)

  const displayedItems = expanded
    ? items
    : items.slice(0, INITIAL_VISIBLE_COUNT)

  const hasMoreThanInitial = items.length > INITIAL_VISIBLE_COUNT

  if (items.length === 0) {
    return (
      <div className="inventory-empty-state">
        <p>No pattern records match your current search.</p>
      </div>
    )
  }

  return (
    <div className="inventory-table-card">
      <div className="inventory-table-scroll">
        <table className="inventory-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Pattern Number</th>
              <th>Quantity</th>
              <th>{readOnly ? 'Status' : 'Action'}</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.map((item) => {
              const isUpdating = Boolean(pendingMap[item.patternNumber])
              const stockLevel = getStockLevelInfo(item.quantity)
              return (
                <tr key={item._id || item.patternNumber}>
                  <td className="col-image">
                    <div
                      className="pattern-thumb-box"
                      onClick={() => setPreviewItem(item)}
                      title="Click to enlarge image"
                    >
                      <img
                        src={getThumbnailUrl(item.imagePath)}
                        alt={`${catalogueSlug} Pattern ${item.patternNumber}`}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.onerror = null
                          e.currentTarget.src = PLACEHOLDER_IMAGE
                        }}
                        className="pattern-thumb-img"
                      />
                    </div>
                  </td>
                  <td className="col-pattern">
                    <span className="pattern-number-badge">
                      {item.patternNumber}
                    </span>
                  </td>
                  <td className="col-quantity">
                    <span
                      className={`quantity-pill ${
                        item.quantity === 0 ? 'quantity-pill-zero' : ''
                      }`}
                    >
                      {item.quantity}
                    </span>
                  </td>
                  <td className="col-action">
                    {readOnly ? (
                      <div className={`stock-progress-capsule ${stockLevel.className}`}>
                        <div
                          className="stock-progress-track"
                        >
                          <span
                            className="stock-progress-bar"
                            style={{ width: `${stockLevel.percent}%` }}
                          />
                        </div>
                        <span className="stock-progress-text">
                          {stockLevel.label}
                        </span>
                      </div>
                    ) : (
                      <QuantityControl
                        quantity={item.quantity}
                        disabled={isUpdating}
                        onDecrease={() =>
                          onQuantityChange(item.patternNumber, 'DECREASE', 1)
                        }
                        onIncrease={() =>
                          onQuantityChange(item.patternNumber, 'INCREASE', 1)
                        }
                        onSetQuantity={(targetQuantity) => {
                          const diff = targetQuantity - item.quantity
                          if (diff > 0) {
                            onQuantityChange(item.patternNumber, 'INCREASE', diff)
                          } else if (diff < 0) {
                            onQuantityChange(
                              item.patternNumber,
                              'DECREASE',
                              Math.abs(diff)
                            )
                          }
                        }}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasMoreThanInitial && (
        <div className="inventory-table-footer">
          <button
            type="button"
            className="view-more-btn"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded
              ? 'View Less'
              : `View More (${items.length - INITIAL_VISIBLE_COUNT} more patterns)`}
          </button>
        </div>
      )}
      {previewItem && (
        <div
          className="image-lightbox-backdrop"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="image-lightbox-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="image-lightbox-header">
              <strong>
                Pattern {previewItem.patternNumber} (Qty:{' '}
                {previewItem.quantity})
              </strong>
              <button
                type="button"
                className="image-lightbox-close"
                onClick={() => setPreviewItem(null)}
              >
                ✕
              </button>
            </div>
            <img
              src={previewItem.imagePath || PLACEHOLDER_IMAGE}
              alt={`Pattern ${previewItem.patternNumber}`}
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = PLACEHOLDER_IMAGE
              }}
              className="image-lightbox-img"
            />
          </div>
        </div>
      )}
    </div>
  )
}
