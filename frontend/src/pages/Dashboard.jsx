import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar.jsx'
import { LottieIcon } from '../components/LottieIcon.jsx'
import { RollDetails } from './RollDetails.jsx'
import { AddProducts } from './AddProducts.jsx'
import { Billing } from './Billing.jsx'
import { GstBilling } from './GstBilling.jsx'
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
import { getStreamUrl } from '../utils/getStreamUrl.js'
import '../styles/Dashboard.css'

export function Dashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [pageLoading, setPageLoading] = useState(true)
  const [catalogues, setCatalogues] = useState([])
  const [stockAlertModal, setStockAlertModal] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isRollDetailsRoute = location.pathname.startsWith('/roll-details')
  const isAddProductsRoute = location.pathname.startsWith('/add-products')
  const isBillingRoute = location.pathname === '/billing'
  const isGstBillingRoute = location.pathname.startsWith('/gst-billing')
  const isInvoiceHistoryRoute = location.pathname.startsWith('/invoice-history')
  const isReportsRoute = location.pathname.startsWith('/reports')
  const isCustomersRoute = location.pathname.startsWith('/customers')
  const isUnpaidUsersRoute = location.pathname.startsWith('/unpaid-users')
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
      !isGstBillingRoute &&
      !isInvoiceHistoryRoute &&
      !isReportsRoute &&
      !isCustomersRoute &&
      !isUnpaidUsersRoute &&
      !isSearchRollRoute
    ) {
      loadDashboardCatalogues()
    } else {
      setPageLoading(false)
    }
  }, [
    isRollDetailsRoute,
    isAddProductsRoute,
    isBillingRoute,
    isGstBillingRoute,
    isInvoiceHistoryRoute,
    isReportsRoute,
    isCustomersRoute,
    isUnpaidUsersRoute,
    isSearchRollRoute,
    loadDashboardCatalogues,
  ])

  // Live real-time updates via Server-Sent Events (SSE)
  useEffect(() => {
    if (
      isRollDetailsRoute ||
      isAddProductsRoute ||
      isBillingRoute ||
      isGstBillingRoute ||
      isInvoiceHistoryRoute ||
      isReportsRoute ||
      isCustomersRoute ||
      isSearchRollRoute
    ) {
      return
    }

    const eventSource = new EventSource(getStreamUrl('/inventory/stream'), {
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
    isGstBillingRoute,
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
    if (isGstBillingRoute) {
      return <GstBilling />
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
    if (isUnpaidUsersRoute) {
      return <Customers filterUnpaidOnly={true} />
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
        {/* Header Bar with Action & Filter */}
        <div className="dashboard-overview-header">
          <div>
            <h1 className="dashboard-overview-title">
              NH Wallpaper CRM – Dashboard
            </h1>
            <p className="dashboard-overview-subtitle">
              Live overview of all roll catalogues and pattern stock
            </p>
          </div>
          <div className="dashboard-actions">
            <button
              type="button"
              className="dashboard-primary-btn"
              onClick={() => navigate('/billing')}
            >
              + Create New Bill
            </button>
            <button
              type="button"
              className="dashboard-secondary-btn"
              onClick={() => navigate('/add-products')}
            >
              Manage Catalogues
            </button>
          </div>
        </div>

        {/* Global Stock KPI Cards */}
        <div className="dashboard-metrics-grid">
          <div className="dashboard-metric-card">
            <div className="metric-header">
              <span className="metric-title">Catalogues</span>
              <div className="metric-icon blue">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
            </div>
            <div className="metric-value">{totals.catalogues}</div>
            <div className="metric-caption">Active Catalogue Series</div>
          </div>

          <div className="dashboard-metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Patterns</span>
              <div className="metric-icon purple">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </div>
            </div>
            <div className="metric-value">{totals.patterns}</div>
            <div className="metric-caption">Unique Design Skus</div>
          </div>

          <div className="dashboard-metric-card">
            <div className="metric-header">
              <span className="metric-title">Total Rolls in Stock</span>
              <div className="metric-icon green">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
            </div>
            <div className="metric-value">{totals.stock}</div>
            <div className="metric-caption">Physical Rolls Available</div>
          </div>

          <div className="dashboard-metric-card">
            <div className="metric-header">
              <span className="metric-title">Out of Stock Alerts</span>
              <div
                className={`metric-icon ${totals.outOfStock > 0 ? 'red' : 'green'}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>
            <div
              className={`metric-value ${totals.outOfStock > 0 ? 'text-red' : ''}`}
            >
              {totals.outOfStock}
            </div>
            <div className="metric-caption">
              {totals.outOfStock > 0
                ? 'Patterns need urgent restock'
                : 'All patterns in healthy stock'}
            </div>
          </div>
        </div>

        {/* Live Monthly Sales & Revenue Analytics Chart */}
        <SalesAnalyticsChart />

        {/* Catalogue Breakdown Table */}
        <div className="dashboard-table-card">
          <div className="table-card-header">
            <div>
              <h2 className="table-card-title">Catalogue Stock Breakdown</h2>
              <p className="table-card-subtitle">
                Quick inventory breakdown across individual catalogue binders
              </p>
            </div>
            <div className="table-actions-row">
              <select
                className="dashboard-filter-select"
                value={dashboardCatalogueFilter}
                onChange={(e) => setDashboardCatalogueFilter(e.target.value)}
              >
                <option value="ALL">All Catalogues ({catalogues.length})</option>
                {catalogues.map((cat) => (
                  <option key={cat.slug} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Catalogue Name</th>
                  <th>Total Patterns</th>
                  <th>Current Stock</th>
                  <th>Out of Stock</th>
                  <th>Stock Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedCatalogues.map((cat) => {
                  const outOfStockCount = cat.outOfStock || 0
                  const isHealthy = outOfStockCount === 0

                  return (
                    <tr
                      key={cat.slug}
                      className="dashboard-table-row"
                      onClick={() => navigate(`/roll-details/${cat.slug}`)}
                    >
                      <td className="catalogue-name-cell">
                        <div className="catalogue-name-wrap">
                          <span className="catalogue-initial">
                            {cat.name.charAt(0)}
                          </span>
                          <div>
                            <span className="catalogue-title-text">{cat.name}</span>
                            <span className="catalogue-slug-text">
                              /{cat.slug}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="pattern-count-badge">
                          {cat.totalPatterns || 0} patterns
                        </span>
                      </td>
                      <td>
                        <span className="stock-count-number">
                          {cat.totalStock || 0} rolls
                        </span>
                      </td>
                      <td>
                        {outOfStockCount > 0 ? (
                          <button
                            type="button"
                            className="stock-alert-pill"
                            onClick={(e) => {
                              e.stopPropagation()
                              setStockAlertModal(cat)
                            }}
                          >
                            ⚠️ {outOfStockCount} out of stock
                          </button>
                        ) : (
                          <span className="stock-ok-text">0</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${isHealthy ? 'status-in-stock' : 'status-low-stock'}`}
                        >
                          <span className="status-dot"></span>
                          {isHealthy ? 'Fully Stocked' : 'Action Required'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="view-catalogue-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/roll-details/${cat.slug}`)
                          }}
                        >
                          View Rolls →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <main className="dashboard-main-content">
        <header className="dashboard-topbar">
          <button
            type="button"
            className="mobile-menu-trigger"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Navigation Menu"
          >
            ☰
          </button>
          <div className="topbar-branding">
            <span className="topbar-title">NH Wallpaper CRM</span>
            <span className="topbar-chip">Wholesale Suite</span>
          </div>
        </header>

        <section className="dashboard-content-area">
          {renderMainContent()}
        </section>
      </main>

      {/* Out of stock details modal */}
      {stockAlertModal && (
        <div
          className="stock-alert-modal-backdrop"
          onClick={() => setStockAlertModal(null)}
        >
          <div
            className="stock-alert-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                Stock Alert: {stockAlertModal.name}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setStockAlertModal(null)}
              >
                ✕
              </button>
            </div>
            <p className="modal-description">
              The following patterns currently have 0 rolls available in stock:
            </p>
            <div className="modal-patterns-list">
              {(stockAlertModal.outOfStockPatterns || []).map((pat) => (
                <div key={pat.patternNumber} className="out-of-stock-card">
                  <span className="pattern-badge">{pat.patternNumber}</span>
                  <span className="zero-stock-badge">0 rolls left</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="dashboard-primary-btn"
                onClick={() => {
                  const targetSlug = stockAlertModal.slug
                  setStockAlertModal(null)
                  navigate(`/roll-details/${targetSlug}`)
                }}
              >
                Open Catalogue to Restock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
