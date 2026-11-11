import '../styles/InventorySummary.css'

export function InventorySummary({
  summary = {},
  lowStockThreshold = 10,
  onThresholdChange,
  onViewStockStatus,
}) {
  const {
    totalPatterns = 0,
    totalStock = 0,
    outOfStock = 0,
    lowStock = 0,
  } = summary

  return (
    <div className="inventory-summary-grid">
      <div className="summary-stat-card">
        <span className="summary-stat-label">Total Patterns</span>
        <strong className="summary-stat-value">{totalPatterns}</strong>
        <span className="summary-stat-sub">Registered in catalogue</span>
      </div>

      <div className="summary-stat-card">
        <span className="summary-stat-label">Total Stock</span>
        <strong className="summary-stat-value">{totalStock}</strong>
        <span className="summary-stat-sub">Available rolls</span>
      </div>

      <div className="summary-stat-card summary-stat-danger">
        <div className="summary-stat-top-row">
          <span className="summary-stat-label">Out of Stock</span>
          {onViewStockStatus && (
            <button
              type="button"
              className="summary-view-btn summary-view-btn-danger"
              onClick={() => onViewStockStatus('OUT_OF_STOCK')}
            >
              View
            </button>
          )}
        </div>
        <strong className="summary-stat-value">{outOfStock}</strong>
        <span className="summary-stat-sub">Quantity equal to 0</span>
      </div>

      <div className="summary-stat-card summary-stat-warning">
        <div className="summary-stat-top-row">
          <span className="summary-stat-label">Low Stock</span>
          <div className="summary-top-controls">
            {onThresholdChange && (
              <label className="threshold-inline-label">
                <span>&lt;</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={lowStockThreshold}
                  onChange={(e) =>
                    onThresholdChange(Math.max(1, Number(e.target.value) || 10))
                  }
                  className="threshold-inline-input"
                  aria-label="Low stock threshold"
                />
              </label>
            )}
            {onViewStockStatus && (
              <button
                type="button"
                className="summary-view-btn summary-view-btn-warning"
                onClick={() => onViewStockStatus('LOW_STOCK')}
              >
                View
              </button>
            )}
          </div>
        </div>
        <strong className="summary-stat-value">{lowStock}</strong>
        <span className="summary-stat-sub">
          Quantity below {lowStockThreshold}
        </span>
      </div>
    </div>
  )
}
