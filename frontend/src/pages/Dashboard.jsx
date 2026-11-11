import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar.jsx'
import { LottieIcon } from '../components/LottieIcon.jsx'
import { RollDetails } from './RollDetails.jsx'
import { AddProducts } from './AddProducts.jsx'
import { Billing } from './Billing.jsx'
import { Reports } from './Reports.jsx'
import { Customers } from './Customers.jsx'
import { InvoiceHistory } from './InvoiceHistory.jsx'
import { SearchRoll } from './SearchRoll.jsx'
import {
  catalogueService,
  formatCatalogueLabel,
} from '../services/catalogueService.js'
import { MetricsSkeleton, TableSkeleton } from '../components/Skeleton.jsx'
import { SalesAnalyticsChart } from '../components/SalesAnalyticsChart.jsx'
import '../styles/Dashboard.css'

export function Dashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [pageLoading, setPageLoading] = useState(true)
  const [catalogues, setCatalogues] = useState([])
  const [stockAlertModal, setStockAlertModal] = useState(null)

  const isRollDetailsRoute = location.pathname.startsWith('/roll-details')
  const isAddProductsRoute = location.pathname.startsWith('/add-products')
  const isBillingRoute = location.pathname.startsWith('/billing')
  const isInvoiceHistoryRoute = location.pathname.startsWith('/invoice-history')
  const isReportsRoute = location.pathname.startsWith('/reports')
  const isCustomersRoute = location.pathname.startsWith('/customers')
  const isSearchRollRoute = location.pathname.startsWith('/search-roll')

  const loadDashboardCatalogues = useCallback(async () => {
    try {
      const res = await catalogueService.getAllCatalogues()
      setCatalogues(res.data?.data?.catalogues || [])
    } catch {
      // Handled gracefully
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (
      !isRollDetailsRoute &&
      !isAddProductsRoute &&
      !isBillingRoute &&
      !isInvoiceHistoryRoute &&
      !isReportsRoute &&
      !isCustomersRoute &&
      !isSearchRollRoute
    ) {
      setPageLoading(true)
      loadDashboardCatalogues()
    } else {
      setPageLoading(false)
    }
  }, [
    location.pathname,
    isRollDetailsRoute,
    isAddProductsRoute,
    isBillingRoute,
    isInvoiceHistoryRoute,
    isReportsRoute,
    isCustomersRoute,
    isSearchRollRoute,
    loadDashboardCatalogues,
  ])

  // Real-time SSE sync on Dashboard Overview
  useEffect(() => {
    if (
      isRollDetailsRoute ||
      isAddProductsRoute ||
      isBillingRoute ||
      isInvoiceHistoryRoute ||
      isReportsRoute ||
      isCustomersRoute ||
      isSearchRollRoute
    )
      return

    const eventSource = new EventSource('/api/inventory/stream', {
      withCredentials: true,
    })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'INVENTORY_UPDATED') {
          loadDashboardCatalogues()
        }
      } catch {
        // Ignore heartbeats
      }
    }

    return () => {
      eventSource.close()
    }
  }, [
    isRollDetailsRoute,
    isAddProductsRoute,
    isBillingRoute,
    isInvoiceHistoryRoute,
    isReportsRoute,
    isCustomersRoute,
    isSearchRollRoute,
    loadDashboardCatalogues,
  ])

  const [dashboardCatalogueFilter, setDashboardCatalogueFilter] = useState('ALL')

  const displayedCatalogues = useMemo(() => {
    if (dashboardCatalogueFilter === 'ALL') return catalogues
    return catalogues.filter(
      (c) => c.name?.toLowerCase() === dashboardCatalogueFilter.toLowerCase()
    )
  }, [catalogues, dashboardCatalogueFilter])

  const totals = useMemo(() => {
    return displayedCatalogues.reduce(
      (acc, cat) => {
        acc.catalogues += 1
        acc.patterns += cat.totalPatterns || 0
        acc.stock += cat.totalStock || 0
        acc.outOfStock += cat.outOfStock || 0
        return acc
      },
      { catalogues: 0, patterns: 0, stock: 0, outOfStock: 0 }
    )
  }, [displayedCatalogues])

  const renderMainContent = () => {
    if (isRollDetailsRoute) {
      return <RollDetails />
    }
    if (isAddProductsRoute) {
      return <AddProducts />
    }
    if (isBillingRoute) {
      return <Billing />
    }
    if (isInvoiceHistoryRoute) {
      return <InvoiceHistory />
    }
    if (isReportsRoute) {
      return <Reports />
    }
    if (isCustomersRoute) {
      return <Customers />
    }
    if (isSearchRollRoute) {
      return <SearchRoll />
    }
    if (pageLoading) {
      return (
        <div className="dashboard-overview">
          <div className="dashboard-overview-header">
            <div>
              <h1 className="dashboard-overview-title">
                NH Wallpaper CRM – Dashboard
              </h1>
              <p className="dashboard-overview-subtitle">
                Live overview of all roll catalogues and pattern stock
              </p>
            </div>
          </div>
          <MetricsSkeleton count={4} height="150px" />
          <TableSkeleton rows={5} cols={6} />
        </div>
      )
    }
    return (
      <div className="dashboard-overview">
        <div className="dashboard-overview-header">
          <div>
            <h1 className="dashboard-overview-title">
              NH Wallpaper CRM – Dashboard
            </h1>
            <p className="dashboard-overview-subtitle">
              Live overview of all roll catalogues and pattern stock
            </p>
          </div>
          <div className="dashboard-header-badge">
            <span className="dash-pulse-dot" />
            <span>Real-time Stock Live</span>
          </div>
        </div>

        {/* 4 Professional Executive KPI Cards */}
        <div className="dashboard-kpi-grid">
          {/* Card 1: Total Catalogues */}
          <div
            className="dashboard-kpi-card"
            onClick={() => navigate('/roll-details')}
            role="button"
            tabIndex={0}
          >
            <div className="dashboard-kpi-top">
              <div className="dashboard-kpi-icon-wrap kpi-icon-blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
              <span className="dashboard-kpi-badge kpi-badge-blue">Catalogues</span>
            </div>
            <div className="dashboard-kpi-body">
              <span className="dashboard-kpi-label">TOTAL CATALOGUES</span>
              <div className="dashboard-kpi-value-row">
                <strong className="dashboard-kpi-value">
                  {String(totals.catalogues).padStart(2, '0')}
                </strong>
                <span className="dashboard-kpi-unit">Active</span>
              </div>
              <p className="dashboard-kpi-subtext">Active collections in CRM</p>
            </div>
            <button
              type="button"
              className="dashboard-kpi-btn"
              onClick={(e) => {
                e.stopPropagation()
                navigate('/roll-details')
              }}
            >
              <span>View Catalogues</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Card 2: Total Patterns */}
          <div
            className="dashboard-kpi-card"
            onClick={() => navigate('/search-roll')}
            role="button"
            tabIndex={0}
          >
            <div className="dashboard-kpi-top">
              <div className="dashboard-kpi-icon-wrap kpi-icon-purple">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <span className="dashboard-kpi-badge kpi-badge-purple">Patterns</span>
            </div>
            <div className="dashboard-kpi-body">
              <span className="dashboard-kpi-label">TOTAL PATTERNS</span>
              <div className="dashboard-kpi-value-row">
                <strong className="dashboard-kpi-value">
                  {totals.patterns.toLocaleString('en-IN')}
                </strong>
                <span className="dashboard-kpi-unit">Designs</span>
              </div>
              <p className="dashboard-kpi-subtext">Across all catalogues</p>
            </div>
            <button
              type="button"
              className="dashboard-kpi-btn"
              onClick={(e) => {
                e.stopPropagation()
                navigate('/search-roll')
              }}
            >
              <span>View Patterns</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Card 3: Total Available Rolls */}
          <div
            className="dashboard-kpi-card"
            onClick={() => navigate('/roll-details')}
            role="button"
            tabIndex={0}
          >
            <div className="dashboard-kpi-top">
              <div className="dashboard-kpi-icon-wrap kpi-icon-green">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <span className="dashboard-kpi-badge kpi-badge-green">Roll Stock</span>
            </div>
            <div className="dashboard-kpi-body">
              <span className="dashboard-kpi-label">TOTAL AVAILABLE ROLLS</span>
              <div className="dashboard-kpi-value-row">
                <strong className="dashboard-kpi-value">
                  {totals.stock.toLocaleString('en-IN')}
                </strong>
                <span className="dashboard-kpi-unit">Rolls</span>
              </div>
              <p className="dashboard-kpi-subtext">Ready for sale & billing</p>
            </div>
            <button
              type="button"
              className="dashboard-kpi-btn"
              onClick={(e) => {
                e.stopPropagation()
                navigate('/roll-details')
              }}
            >
              <span>View Stock</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Card 4: Out of Stock Patterns */}
          <div
            className="dashboard-kpi-card dashboard-kpi-danger-card"
            onClick={() => setStockAlertModal('OUT_OF_STOCK')}
            role="button"
            tabIndex={0}
          >
            <div className="dashboard-kpi-top">
              <div className="dashboard-kpi-icon-wrap kpi-icon-red">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <span className="dashboard-kpi-badge kpi-badge-red">Attention</span>
            </div>
            <div className="dashboard-kpi-body">
              <span className="dashboard-kpi-label">OUT OF STOCK PATTERNS</span>
              <div className="dashboard-kpi-value-row">
                <strong className="dashboard-kpi-value kpi-val-danger">
                  {totals.outOfStock.toLocaleString('en-IN')}
                </strong>
                <span className="dashboard-kpi-unit kpi-val-danger">Zero Stock</span>
              </div>
              <p className="dashboard-kpi-subtext">Patterns requiring restock</p>
            </div>
            <button
              type="button"
              className="dashboard-kpi-btn dashboard-kpi-btn-danger"
              onClick={(e) => {
                e.stopPropagation()
                setStockAlertModal('OUT_OF_STOCK')
              }}
            >
              <span>View Out of Stock</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Professional Sales & Roll Volume Analytics Graph with Catalogue & Custom Date Filters */}
        <SalesAnalyticsChart
          catalogues={catalogues}
          selectedCatalogue={dashboardCatalogueFilter}
          onSelectCatalogue={setDashboardCatalogueFilter}
        />

        {/* Catalogue Stock Overview Table */}
        <div className="dashboard-table-card">
          <div className="dashboard-table-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="dashboard-table-title">Catalogue Stock Breakdown</h2>
                {dashboardCatalogueFilter !== 'ALL' && (
                  <span className="dash-table-filter-tag">
                    Showing: <strong>{dashboardCatalogueFilter}</strong>
                    <button
                      type="button"
                      onClick={() => setDashboardCatalogueFilter('ALL')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#64748b',
                        fontWeight: 'bold',
                        marginLeft: '4px',
                      }}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
              <p className="dashboard-table-subtitle">
                Overview of patterns and live roll inventory across each catalogue
              </p>
            </div>
            <div className="dashboard-table-actions">
              <button
                type="button"
                className="dashboard-sub-action-btn"
                onClick={() => navigate('/search-roll')}
              >
                Search Pattern
              </button>
              <button
                type="button"
                className="dashboard-sub-action-btn dashboard-sub-action-primary"
                onClick={() => navigate('/roll-details')}
              >
                Open Roll Details
              </button>
            </div>
          </div>

          <div className="dashboard-table-wrap">
            <table className="dashboard-overview-table">
              <thead>
                <tr>
                  <th>Catalogue Name</th>
                  <th>Total Patterns</th>
                  <th>Available Rolls</th>
                  <th style={{ textAlign: 'center' }}>Out of Stock (Zero)</th>
                  <th style={{ textAlign: 'center' }}>Low Stock (Below 10)</th>
                  <th style={{ textAlign: 'center' }}>Direct Views</th>
                </tr>
              </thead>
              <tbody>
                {displayedCatalogues.map((cat) => {
                  const outOfStockCount = cat.outOfStock || 0
                  const lowStockCount = cat.lowStock || 0
                  return (
                    <tr key={cat._id || cat.slug}>
                      <td>
                        <div className="dash-cat-cell">
                          <span className="dash-cat-dot" />
                          <div>
                            <strong className="dash-cat-title">
                              {formatCatalogueLabel(cat.name)}
                            </strong>
                            <span className="dash-cat-code">{cat.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{cat.totalPatterns || 0}</strong> patterns
                      </td>
                      <td>
                        <span className="dash-rolls-badge">
                          {(cat.totalStock || 0).toLocaleString('en-IN')} Rolls
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {outOfStockCount > 0 ? (
                          <button
                            type="button"
                            className="dash-direct-pill dash-direct-danger"
                            onClick={() =>
                              navigate(
                                `/roll-details/${cat.slug.toUpperCase()}?filter=OUT_OF_STOCK`
                              )
                            }
                            title={`Directly open Out of Stock page for ${formatCatalogueLabel(cat.name)}`}
                          >
                            <span>{outOfStockCount} Out of Stock</span>
                            <span className="dash-pill-arrow">↗</span>
                          </button>
                        ) : (
                          <span className="dash-pill-neutral">0 Out of Stock</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {lowStockCount > 0 ? (
                          <button
                            type="button"
                            className="dash-direct-pill dash-direct-warning"
                            onClick={() =>
                              navigate(
                                `/roll-details/${cat.slug.toUpperCase()}?filter=LOW_STOCK`
                              )
                            }
                            title={`Directly open Below 10 page for ${formatCatalogueLabel(cat.name)}`}
                          >
                            <span>{lowStockCount} Below 10</span>
                            <span className="dash-pill-arrow">↗</span>
                          </button>
                        ) : (
                          <span className="dash-pill-neutral">0 Below 10</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="dash-row-actions-group">
                          <button
                            type="button"
                            className="dash-row-btn dash-row-btn-main"
                            onClick={() =>
                              navigate(`/roll-details/${cat.slug.toUpperCase()}`)
                            }
                            title="Open All Patterns"
                          >
                            All Rolls
                          </button>
                          <button
                            type="button"
                            className="dash-row-btn dash-row-btn-danger"
                            onClick={() =>
                              navigate(
                                `/roll-details/${cat.slug.toUpperCase()}?filter=OUT_OF_STOCK`
                              )
                            }
                            title={`Open Out of Stock patterns for ${formatCatalogueLabel(cat.name)}`}
                          >
                            Out of Stock ({outOfStockCount}) ↗
                          </button>
                          <button
                            type="button"
                            className="dash-row-btn dash-row-btn-warning"
                            onClick={() =>
                              navigate(
                                `/roll-details/${cat.slug.toUpperCase()}?filter=LOW_STOCK`
                              )
                            }
                            title={`Open Below 10 patterns for ${formatCatalogueLabel(cat.name)}`}
                          >
                            Below 10 ({lowStockCount}) ↗
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Direct Out of Stock / Below 10 Catalogue Launcher */}
        {stockAlertModal && (
          <div
            className="billing-modal-backdrop"
            onClick={() => setStockAlertModal(null)}
          >
            <div
              className="billing-modal-card"
              style={{ maxWidth: '640px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <h3 className="billing-modal-title">
                    {stockAlertModal === 'OUT_OF_STOCK'
                      ? 'Out of Stock – Select Catalogue'
                      : 'Below 10 (Low Stock) – Select Catalogue'}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Click any catalogue to directly open its{' '}
                    <strong>
                      {stockAlertModal === 'OUT_OF_STOCK' ? 'Out of Stock' : 'Below 10'}
                    </strong>{' '}
                    inventory page
                  </p>
                </div>
                <button
                  type="button"
                  className="billing-glass-btn"
                  onClick={() => setStockAlertModal(null)}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  ✕ Close
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                {catalogues.map((cat) => {
                  const oos = cat.outOfStock || 0
                  const low = cat.lowStock || 0
                  return (
                    <div
                      key={cat._id || cat.slug}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        background: '#f8fafc',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                          {formatCatalogueLabel(cat.name)}
                        </strong>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          Out of Stock:{' '}
                          <span style={{ color: oos > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                            {oos}
                          </span>{' '}
                          | Below 10:{' '}
                          <span style={{ color: low > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
                            {low}
                          </span>{' '}
                          | Total: {cat.totalPatterns || 0}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="dash-row-btn dash-row-btn-danger"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => {
                            setStockAlertModal(null)
                            navigate(
                              `/roll-details/${cat.slug.toUpperCase()}?filter=OUT_OF_STOCK`
                            )
                          }}
                        >
                          Open Out of Stock ↗
                        </button>
                        <button
                          type="button"
                          className="dash-row-btn dash-row-btn-warning"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => {
                            setStockAlertModal(null)
                            navigate(
                              `/roll-details/${cat.slug.toUpperCase()}?filter=LOW_STOCK`
                            )
                          }}
                        >
                          Open Below 10 ↗
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-content">{renderMainContent()}</main>
    </div>
  )
}
