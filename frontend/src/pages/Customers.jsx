import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { customerService } from '../services/customerService.js'
import { billingService } from '../services/billingService.js'
import { useToast } from '../context/ToastContext.jsx'
import { useDownloadProgress, ProgressButton } from '../context/DownloadProgressContext.jsx'
import {
  exportCustomersListCsv,
  exportCustomerBillsCsv,
  generateCustomerStatementPdf,
} from '../utils/customerExportHelpers.js'
import { downloadInvoicePdf } from '../utils/exportInvoicePdf.js'
import { TableSkeleton } from '../components/Skeleton.jsx'
import '../styles/Customers.css'

export function Customers({ filterUnpaidOnly = false }) {
  const { mobileNumber: routeMobile } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()

  // Customer List Filters & State
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortOption, setSortOption] = useState('spend_desc')
  const [listDateFilter, setListDateFilter] = useState('')
  const [listStartDate, setListStartDate] = useState('')
  const [listEndDate, setListEndDate] = useState('')
  const [minSpend, setMinSpend] = useState('')
  const [maxSpend, setMaxSpend] = useState('')

  // Selected Customer Modal / Drawer State
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerBills, setCustomerBills] = useState([])
  const [modalLoading, setModalLoading] = useState(false)
  const [billStartDate, setBillStartDate] = useState('')
  const [billEndDate, setBillEndDate] = useState('')
  const [billMinPrice, setBillMinPrice] = useState('')
  const [billMaxPrice, setBillMaxPrice] = useState('')
  const [billSort, setBillSort] = useState('latest')
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState(null)

  // Load Customers Summary
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true)
      const params = {
        search,
        sort: sortOption,
        startDate: listStartDate,
        endDate: listEndDate,
        minAmount: minSpend,
        maxAmount: maxSpend,
      }
      const res = await customerService.getCustomers(params)
      setCustomers(res.data?.data?.customers || [])
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Error loading customers',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setLoading(false)
    }
  }, [search, sortOption, listStartDate, listEndDate, minSpend, maxSpend, showToast])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Fetch Bills for Modal
  const fetchCustomerBills = useCallback(
    async (mobile) => {
      if (!mobile) return
      try {
        setModalLoading(true)
        const params = {
          startDate: billStartDate,
          endDate: billEndDate,
          minAmount: billMinPrice,
          maxAmount: billMaxPrice,
          sort: billSort,
        }
        const res = await customerService.getCustomerBills(mobile, params)
        setSelectedCustomer(res.data?.data?.customer || null)
        setCustomerBills(res.data?.data?.invoices || [])
      } catch (err) {
        showToast({
          type: 'error',
          title: 'Error loading customer bills',
          message: err.response?.data?.message || err.message,
        })
      } finally {
        setModalLoading(false)
      }
    },
    [billStartDate, billEndDate, billMinPrice, billMaxPrice, billSort, showToast]
  )

  // Handle open by route or click
  useEffect(() => {
    if (routeMobile) {
      fetchCustomerBills(routeMobile)
    }
  }, [routeMobile, fetchCustomerBills])

  const handleOpenCustomer = (c) => {
    setSelectedCustomer(c)
    navigate(`/customers/${c.mobileNumber}`)
  }

  const handleCloseModal = () => {
    setSelectedCustomer(null)
    setCustomerBills([])
    setBillStartDate('')
    setBillEndDate('')
    setBillMinPrice('')
    setBillMaxPrice('')
    navigate(filterUnpaidOnly ? '/unpaid-users' : '/customers')
  }

  // Quick Date Range Handler for Main List
  const handleListDatePreset = (preset) => {
    setListDateFilter(preset)
    const now = new Date()
    let s = ''
    let e = ''
    if (preset === 'today') {
      s = now.toISOString().split('T')[0]
      e = s
    } else if (preset === 'this_month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      s = first.toISOString().split('T')[0]
      e = now.toISOString().split('T')[0]
    } else if (preset === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      s = first.toISOString().split('T')[0]
      e = last.toISOString().split('T')[0]
    } else if (preset === 'clear') {
      s = ''
      e = ''
    }
    setListStartDate(s)
    setListEndDate(e)
  }

  // Handle changing payment status inside the drawer
  const handleTogglePaymentStatus = async (invoiceId, currentStatus) => {
    const nextStatus = currentStatus === 'PAID' ? 'UNPAID' : 'PAID'
    try {
      setUpdatingInvoiceId(invoiceId)
      await billingService.updatePaymentStatus(invoiceId, nextStatus)
      showToast({
        type: 'success',
        title: 'Payment Status Updated',
        message: `Invoice marked as ${nextStatus}.`,
      })
      if (selectedCustomer?.mobileNumber) {
        await fetchCustomerBills(selectedCustomer.mobileNumber)
      }
      await fetchCustomers()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setUpdatingInvoiceId(null)
    }
  }

  // Metrics aggregation
  const displayedCustomers = useMemo(() => {
    if (!filterUnpaidOnly) return customers
    return customers.filter(
      (c) => Number(c.unpaidAmount) > 0 || Number(c.unpaidInvoicesCount) > 0
    )
  }, [customers, filterUnpaidOnly])

  const totals = useMemo(() => {
    return displayedCustomers.reduce(
      (acc, c) => {
        acc.totalSpend += Number(c.totalSpend) || 0
        acc.totalRolls += Number(c.totalQuantity) || 0
        acc.totalInvoices += Number(c.totalInvoices) || 0
        acc.totalUnpaidAmount += Number(c.unpaidAmount) || 0
        acc.totalUnpaidInvoices += Number(c.unpaidInvoicesCount) || 0
        return acc
      },
      {
        totalSpend: 0,
        totalRolls: 0,
        totalInvoices: 0,
        totalUnpaidAmount: 0,
        totalUnpaidInvoices: 0,
      }
    )
  }, [displayedCustomers])

  // Download Individual Invoice PDF
  const handleDownloadInvoicePdf = async (invoiceId) => {
    try {
      await trackDownload(`customer-inv-pdf-${invoiceId}`, async () => {
        const res = await billingService.getInvoicePdfData(invoiceId)
        const invoiceData = res.data?.data?.invoice
        if (!invoiceData) {
          throw new Error('Invoice data could not be retrieved.')
        }
        await downloadInvoicePdf(invoiceData)
      })
      showToast({
        type: 'success',
        title: 'Downloaded',
        message: 'Invoice PDF downloaded successfully.',
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Download Failed',
        message: err.message,
      })
    }
  }

  return (
    <div className="customers-page">
      {/* Page Header */}
      <div className="customers-header">
        <div className="customers-title-wrap">
          <h1>
            {filterUnpaidOnly
              ? 'Unpaid Users & Outstanding Dues'
              : 'Users & Customer Billing Directory'}
          </h1>
          <p className="customers-subtitle">
            {filterUnpaidOnly
              ? 'List of customers with pending or unpaid invoices and outstanding balance'
              : 'Directory of all customers who have purchased and billed with NH Wallpaper'}
          </p>
        </div>
        <div className="customers-header-actions">
          {filterUnpaidOnly && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('/customers')}
            >
              View All Customers
            </button>
          )}
          <ProgressButton
            id="export-all-users-csv"
            type="button"
            className="btn-primary btn-export"
            onClick={() =>
              trackDownload('export-all-users-csv', async () => {
                await new Promise((r) => setTimeout(r, 600))
                exportCustomersListCsv(displayedCustomers)
              })
            }
            disabled={displayedCustomers.length === 0}
            loadingText="Exporting"
          >
            {filterUnpaidOnly ? 'Export Unpaid Users CSV' : 'Export All Users CSV'}
          </ProgressButton>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="customers-stats-grid">
        <div className="customer-stat-card">
          <span className="customer-stat-label">
            {filterUnpaidOnly ? 'Unpaid Customers' : 'Total Unique Customers'}
          </span>
          <span
            className="customer-stat-value"
            style={{ color: filterUnpaidOnly && displayedCustomers.length > 0 ? '#dc2626' : undefined }}
          >
            {displayedCustomers.length}
          </span>
        </div>
        {filterUnpaidOnly ? (
          <>
            <div className="customer-stat-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <span className="customer-stat-label">Total Outstanding Due</span>
              <span className="customer-stat-value" style={{ color: '#dc2626' }}>
                ₹{totals.totalUnpaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="customer-stat-card">
              <span className="customer-stat-label">Pending Invoices</span>
              <span className="customer-stat-value" style={{ color: '#dc2626' }}>
                {totals.totalUnpaidInvoices}
              </span>
            </div>
            <div className="customer-stat-card">
              <span className="customer-stat-label">Total Customer Count</span>
              <span className="customer-stat-value">{customers.length}</span>
            </div>
          </>
        ) : (
          <>
            <div className="customer-stat-card">
              <span className="customer-stat-label">Total Rolls Billed</span>
              <span className="customer-stat-value">{totals.totalRolls}</span>
            </div>
            <div className="customer-stat-card">
              <span className="customer-stat-label">Total Revenue</span>
              <span className="customer-stat-value">
                Rs {totals.totalSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="customer-stat-card">
              <span className="customer-stat-label">Total Invoices Issued</span>
              <span className="customer-stat-value">{totals.totalInvoices}</span>
            </div>
          </>
        )}
      </div>

      {/* Filter and Sort Toolbar */}
      <div className="customers-filter-card">
        <div className="customers-filter-row">
          <input
            type="text"
            className="customers-search-input"
            placeholder="Search by customer name or mobile number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="customers-filter-group">
            <label>Sort By:</label>
            <select
              className="customers-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
            >
              <option value="spend_desc">Who Bought More (Highest Spend)</option>
              <option value="spend_asc">Who Bought Less (Lowest Spend)</option>
              <option value="quantity_desc">Most Rolls Purchased</option>
              <option value="quantity_asc">Least Rolls Purchased</option>
              <option value="latest">Most Recent Purchase</option>
              <option value="invoices_desc">Highest Invoice Count</option>
              <option value="name_asc">Name (A - Z)</option>
            </select>
          </div>

          <div className="customers-filter-group">
            <label>Date Filter:</label>
            <select
              className="customers-select"
              value={listDateFilter}
              onChange={(e) => handleListDatePreset(e.target.value)}
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range & Spend Filter */}
        <div className="customers-filter-row">
          <div className="customers-filter-group">
            <label>Custom Date:</label>
            <input
              type="date"
              className="customers-date-input"
              value={listStartDate}
              onChange={(e) => {
                setListStartDate(e.target.value)
                setListDateFilter('custom')
              }}
            />
            <span>to</span>
            <input
              type="date"
              className="customers-date-input"
              value={listEndDate}
              onChange={(e) => {
                setListEndDate(e.target.value)
                setListDateFilter('custom')
              }}
            />
          </div>

          <div className="customers-filter-group">
            <label>Spend Range (Rs):</label>
            <input
              type="number"
              placeholder="Min"
              className="customers-num-input"
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value)}
            />
            <span>-</span>
            <input
              type="number"
              placeholder="Max"
              className="customers-num-input"
              value={maxSpend}
              onChange={(e) => setMaxSpend(e.target.value)}
            />
          </div>

          {(search ||
            listStartDate ||
            listEndDate ||
            minSpend ||
            maxSpend ||
            sortOption !== 'spend_desc') && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch('')
                setSortOption('spend_desc')
                setListDateFilter('')
                setListStartDate('')
                setListEndDate('')
                setMinSpend('')
                setMaxSpend('')
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className="customers-table-container">
        {loading ? (
          <div style={{ padding: '8px' }}>
            <TableSkeleton rows={7} cols={7} />
          </div>
        ) : displayedCustomers.length === 0 ? (
          <div
            className="empty-state"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
            }}
          >
            {filterUnpaidOnly ? (
              <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: '#dcfce7',
                    color: '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                    fontSize: '28px',
                  }}
                >
                  ✓
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', marginBottom: '8px' }}>
                  All Clear! No Unpaid Users
                </h3>
                <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px' }}>
                  All {customers.length} registered customers currently have their invoices marked as
                  Paid. When creating a bill or in Invoice History, you can mark any invoice as &ldquo;Unpaid&rdquo; to track outstanding dues here.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => navigate('/customers')}
                  >
                    View All Users ({customers.length})
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => navigate('/billing')}
                  >
                    Go to Billing
                  </button>
                </div>
              </div>
            ) : (
              <div>No customers found matching your criteria.</div>
            )}
          </div>
        ) : (
          <table className="customers-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Mobile Number</th>
                {filterUnpaidOnly ? (
                  <>
                    <th>Pending Due</th>
                    <th>Unpaid Invoices</th>
                    <th>Total Spend</th>
                    <th>Last Purchase</th>
                  </>
                ) : (
                  <>
                    <th>Total Invoices</th>
                    <th>Total Rolls Bought</th>
                    <th>Total Spend</th>
                    <th>Last Purchase</th>
                  </>
                )}
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedCustomers.map((c) => {
                const hasUnpaid = Number(c.unpaidAmount) > 0 || Number(c.unpaidInvoicesCount) > 0
                return (
                  <tr key={c._id || c.mobileNumber} onClick={() => handleOpenCustomer(c)}>
                    <td className="customer-name-cell">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{c.customerName || 'N/A'}</span>
                        {hasUnpaid && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              fontWeight: '700',
                            }}
                          >
                            DUE
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="customer-mobile-pill">{c.mobileNumber}</span>
                    </td>
                    {filterUnpaidOnly ? (
                      <>
                        <td style={{ fontWeight: '700', color: '#dc2626' }}>
                          ₹{Number(c.unpaidAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              backgroundColor: '#fee2e2',
                              color: '#b91c1c',
                              fontWeight: '700',
                              fontSize: '12px',
                            }}
                          >
                            {c.unpaidInvoicesCount || 0} unpaid
                          </span>
                        </td>
                        <td className="customer-spend-badge">
                          Rs {Number(c.totalSpend || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          {c.lastPurchaseDate
                            ? new Date(c.lastPurchaseDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'N/A'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{c.totalInvoices} bills</td>
                        <td>{c.totalQuantity} rolls</td>
                        <td className="customer-spend-badge">
                          Rs {Number(c.totalSpend || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          {c.lastPurchaseDate
                            ? new Date(c.lastPurchaseDate).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'N/A'}
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenCustomer(c)
                        }}
                      >
                        View Bills
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Customer Bills Drawer / Modal */}
      {selectedCustomer && (
        <div className="customer-bills-modal-overlay" onClick={handleCloseModal}>
          <div
            className="customer-bills-modal-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-title">
                <h2>{selectedCustomer.customerName}</h2>
                <p>Mobile: {selectedCustomer.mobileNumber} | Customer Billing History</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseModal}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Customer Stats Ribbon */}
              <div className="customer-stats-ribbon">
                <div className="ribbon-item">
                  <span>Lifetime Invoices</span>
                  <strong>{selectedCustomer.totalInvoices || customerBills.length}</strong>
                </div>
                <div className="ribbon-item">
                  <span>Total Rolls Bought</span>
                  <strong>
                    {selectedCustomer.lifetimeQuantity ||
                      customerBills.reduce((s, b) => s + (b.totalQuantity || 0), 0)}
                  </strong>
                </div>
                <div className="ribbon-item">
                  <span>Total Purchases</span>
                  <strong style={{ color: '#0f172a' }}>
                    Rs{' '}
                    {(
                      selectedCustomer.lifetimeSpend ||
                      customerBills.reduce(
                        (s, b) => s + (Number(b.finalTotal ?? b.grandTotal) || 0),
                        0
                      )
                    ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>

              {/* Action Toolbar & Filters */}
              <div className="modal-actions-bar">
                <div className="download-group">
                  <ProgressButton
                    id="export-customer-bills-csv"
                    type="button"
                    className="btn-primary btn-export"
                    onClick={() =>
                      trackDownload('export-customer-bills-csv', async () => {
                        await new Promise((r) => setTimeout(r, 550))
                        exportCustomerBillsCsv(selectedCustomer, customerBills)
                      })
                    }
                    disabled={customerBills.length === 0}
                    loadingText="Generating"
                  >
                    Download Bills CSV
                  </ProgressButton>
                  <ProgressButton
                    id="export-customer-statement-pdf"
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      trackDownload('export-customer-statement-pdf', async () => {
                        await generateCustomerStatementPdf(selectedCustomer, customerBills)
                      })
                    }
                    disabled={customerBills.length === 0}
                    loadingText="Rendering"
                  >
                    Download Statement PDF
                  </ProgressButton>
                </div>

                <div className="customers-filter-group">
                  <label>Sort:</label>
                  <select
                    className="customers-select"
                    value={billSort}
                    onChange={(e) => setBillSort(e.target.value)}
                  >
                    <option value="latest">Latest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="qty_desc">Quantity: High to Low</option>
                  </select>
                </div>
              </div>

              {/* Drawer Filter Controls */}
              <div
                className="customers-filter-card"
                style={{ padding: '12px 16px', marginBottom: '16px' }}
              >
                <div className="customers-filter-row">
                  <div className="customers-filter-group">
                    <label>Filter Date:</label>
                    <input
                      type="date"
                      className="customers-date-input"
                      value={billStartDate}
                      onChange={(e) => setBillStartDate(e.target.value)}
                    />
                    <span>to</span>
                    <input
                      type="date"
                      className="customers-date-input"
                      value={billEndDate}
                      onChange={(e) => setBillEndDate(e.target.value)}
                    />
                  </div>

                  <div className="customers-filter-group">
                    <label>Price Range:</label>
                    <input
                      type="number"
                      placeholder="Min"
                      className="customers-num-input"
                      value={billMinPrice}
                      onChange={(e) => setBillMinPrice(e.target.value)}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      className="customers-num-input"
                      value={billMaxPrice}
                      onChange={(e) => setBillMaxPrice(e.target.value)}
                    />
                  </div>

                  {(billStartDate || billEndDate || billMinPrice || billMaxPrice) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setBillStartDate('')
                        setBillEndDate('')
                        setBillMinPrice('')
                        setBillMaxPrice('')
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Bills List Table */}
              {modalLoading ? (
                <div style={{ padding: '8px' }}>
                  <TableSkeleton rows={4} cols={6} />
                </div>
              ) : customerBills.length === 0 ? (
                <div className="empty-state">No bills found for the selected filter range.</div>
              ) : (
                <div className="customers-table-container">
                  <table className="customers-table">
                    <thead>
                      <tr>
                        <th>Invoice No</th>
                        <th>Date</th>
                        <th>Items Summary</th>
                        <th>Rolls</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Invoice PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerBills.map((b) => (
                        <tr key={b._id || b.invoiceNumber}>
                          <td style={{ fontWeight: 600 }}>{b.invoiceNumber}</td>
                          <td>
                            {b.invoiceDate
                              ? new Date(b.invoiceDate).toLocaleDateString('en-IN')
                              : 'N/A'}
                          </td>
                          <td style={{ fontSize: '13px', maxWidth: '240px' }}>
                            {(b.items || [])
                              .map(
                                (it) =>
                                  `${it.catalogueName} (${it.patternNumber}) x${it.quantity}`
                              )
                              .join(', ')}
                          </td>
                          <td>{b.totalQuantity}</td>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>
                            Rs{' '}
                            {Number(b.finalTotal ?? b.grandTotal ?? 0).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() =>
                                handleTogglePaymentStatus(b._id, b.paymentStatus || 'PAID')
                              }
                              disabled={updatingInvoiceId === b._id}
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                border: '1px solid',
                                transition: 'all 0.15s ease',
                                backgroundColor:
                                  b.paymentStatus === 'UNPAID' ? '#fee2e2' : '#dcfce7',
                                borderColor:
                                  b.paymentStatus === 'UNPAID' ? '#fca5a5' : '#86efac',
                                color:
                                  b.paymentStatus === 'UNPAID' ? '#991b1b' : '#166534',
                              }}
                              title="Click to toggle Paid/Unpaid"
                            >
                              {updatingInvoiceId === b._id
                                ? '...'
                                : b.paymentStatus === 'UNPAID'
                                ? 'UNPAID (Pending)'
                                : 'PAID'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <ProgressButton
                              id={`customer-inv-pdf-${b._id}`}
                              type="button"
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                              onClick={() => handleDownloadInvoicePdf(b._id)}
                              loadingText=""
                            >
                              Download PDF
                            </ProgressButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
