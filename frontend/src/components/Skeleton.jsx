import '../styles/Skeleton.css'

export function Skeleton({
  width = '100%',
  height = '16px',
  borderRadius = '6px',
  className = '',
  style = {},
}) {
  return (
    <div
      className={`skeleton-shimmer skeleton-box ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  )
}

/**
 * Catalogue Cards Skeleton (Matching Image 1)
 */
export function CatalogueGridSkeleton({ count = 5 }) {
  return (
    <div className="catalogue-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-catalogue-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skeleton width="70px" height="24px" borderRadius="999px" />
            <Skeleton width="10px" height="10px" borderRadius="50%" />
          </div>
          <div>
            <Skeleton width="65%" height="20px" style={{ marginBottom: '6px' }} />
            <Skeleton width="85%" height="13px" />
          </div>
          <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <Skeleton width="60px" height="11px" style={{ marginBottom: '6px' }} />
              <Skeleton width="40px" height="20px" />
            </div>
            <div>
              <Skeleton width="70px" height="11px" style={{ marginBottom: '6px' }} />
              <Skeleton width="45px" height="20px" />
            </div>
          </div>
          <Skeleton width="100%" height="38px" borderRadius="999px" />
        </div>
      ))}
    </div>
  )
}

/**
 * Summary Metric Cards Skeleton (Matching Images 2, 4, 5)
 */
export function MetricsSkeleton({ count = 4, height = '90px' }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
        gap: '14px',
        marginBottom: '20px',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card" style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Skeleton width="55%" height="12px" style={{ marginBottom: '8px' }} />
          <Skeleton width="40%" height="26px" />
        </div>
      ))}
    </div>
  )
}

/**
 * Table Rows Skeleton (Matching Table layouts in RollDetails, Billing History, Customers)
 */
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div style={{ width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '20px' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} width={`${100 / cols}%`} height="14px" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            borderBottom: r === rows - 1 ? 'none' : '1px solid #f1f5f9',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              width={c === 0 && cols > 4 ? '44px' : `${85 / cols}%`}
              height={c === 0 && cols > 4 ? '44px' : '16px'}
              borderRadius={c === 0 && cols > 4 ? '8px' : '6px'}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Form / Card Skeleton (for Billing creation form, Add Product form)
 */
export function FormSkeleton() {
  return (
    <div className="skeleton-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div>
          <Skeleton width="120px" height="14px" style={{ marginBottom: '8px' }} />
          <Skeleton width="100%" height="42px" borderRadius="8px" />
        </div>
        <div>
          <Skeleton width="120px" height="14px" style={{ marginBottom: '8px' }} />
          <Skeleton width="100%" height="42px" borderRadius="8px" />
        </div>
      </div>
      <div>
        <Skeleton width="100%" height="46px" borderRadius="8px" style={{ marginBottom: '12px' }} />
        <Skeleton width="100%" height="56px" borderRadius="8px" style={{ marginBottom: '8px' }} />
        <Skeleton width="100%" height="56px" borderRadius="8px" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
        <Skeleton width="120px" height="40px" borderRadius="8px" />
        <Skeleton width="160px" height="40px" borderRadius="8px" />
      </div>
    </div>
  )
}
