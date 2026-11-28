import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { billingService } from '../services/billingService.js'
import { formatCatalogueLabel } from '../services/catalogueService.js'
import { SearchableSelect } from '../components/SearchableSelect.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useDownloadProgress, ProgressButton } from '../context/DownloadProgressContext.jsx'
import { downloadInvoicePdf, printInvoiceDocument } from '../utils/exportInvoicePdf.js'
import { sendInvoiceImageToWhatsApp } from '../utils/whatsappHelper.js'
import { generateCsvContent } from '../utils/exportHelpers.js'
import { TableSkeleton } from '../components/Skeleton.jsx'
import '../styles/InvoiceHistory.css'

const formatINR = (val) => {
  const n = Number(val) || 0
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function InvoiceHistory() {
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()
  const navigate = useNavigate()

  // Data states
  const [invoices, setInvoices] = useState([])
  const [catalogues, setCatalogues] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Filters state
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedCatalogue, setSelectedCatalogue] = useState('ALL')
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('ALL')
  const [selectedBiller, setSelectedBiller] = useState('ALL')
  const [billersList, setBillersList] = useState([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  // Modal preview state
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  // Edit Invoice Modal state
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [patternsByCatalogue, setPatternsByCatalogue] = useState({})
  const [editFormData, setEditFormData] = useState({
    customerName: '',
    mobileNumber: '',
    billerName: '',
    invoiceDate: '',
    paymentStatus: 'PAID',
    paymentMode: 'Cash',
    paymentTime: '',
    discountType: 'PERCENTAGE',
    discountValue: 0,
    taxRate: 0,
    items: [],
  })

  const fetchPatternsForCatalogue = useCallback(
    async (catId) => {
      if (!catId || catId === 'CUSTOM') return []
      if (patternsByCatalogue[catId]) return patternsByCatalogue[catId]
      try {
        const res = await billingService.getPatternsByCatalogue(catId)
        const patterns = res.data?.data?.patterns || []
        setPatternsByCatalogue((prev) => ({ ...prev, [catId]: patterns }))
        return patterns
      } catch {
        return []
      }
    },
    [patternsByCatalogue]
  )

  const handleOpenEditModal = (inv) => {
    if (!inv) return
    const rawD = inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(inv.createdAt || Date.now())
    const y = rawD.getFullYear()
    const m = String(rawD.getMonth() + 1).padStart(2, '0')
    const day = String(rawD.getDate()).padStart(2, '0')
    const formattedDate = `${y}-${m}-${day}`

    setEditingInvoice(inv)
    setEditFormData({
      customerName: inv.customerName || '',
      mobileNumber: inv.mobileNumber || '',
      billerName: inv.billerName || '',
      invoiceDate: formattedDate,
      paymentStatus: inv.paymentStatus || 'PAID',
      paymentMode: inv.paymentMode || 'Cash',
      paymentTime: inv.paymentTime || '',
      discountType: inv.discountType || 'PERCENTAGE',
      discountValue: inv.discountValue ?? 0,
      taxRate: inv.taxRate ?? 0,
      items: (inv.items || []).map((it) => {
        const catId = it.isCustom || !it.catalogueId || it.catalogueId === 'CUSTOM' ? 'CUSTOM' : (it.catalogueId?._id || it.catalogueId)
        if (catId && catId !== 'CUSTOM') {
          fetchPatternsForCatalogue(catId)
        }
        return {
          catalogueId: catId,
          catalogueName: it.catalogueName || '',
          catalogueSlug: it.catalogueSlug || '',
          patternNumber: it.patternNumber || '',
          imagePath: it.imagePath || '',
          quantity: it.quantity,
          rate: it.rate,
          isCustom: Boolean(it.isCustom || !it.catalogueId || it.catalogueId === 'CUSTOM'),
        }
      }),
    })
  }

  const handleSaveEditInvoice = async (e) => {
    e.preventDefault()
    if (!editingInvoice) return

    if (!editFormData.customerName.trim() || editFormData.customerName.trim().length < 2) {
      showToast('error', 'Customer name must be at least 2 characters.')
      return
    }
    const cleanPhone = editFormData.mobileNumber.trim().replace(/[\s\-+()]/g, '')
    if (!/^\d{10}$/.test(cleanPhone)) {
      showToast('error', 'Please enter a valid 10-digit mobile number.')
      return
    }
    if (!editFormData.items || editFormData.items.length === 0) {
      showToast('error', 'Invoice must contain at least one item.')
      return
    }

    setSavingEdit(true)
    try {
      const res = await billingService.updateInvoice(editingInvoice._id, {
        customerName: editFormData.customerName.trim(),
        mobileNumber: cleanPhone,
        billerName: editFormData.billerName.trim(),
        invoiceDate: editFormData.invoiceDate,
        paymentStatus: editFormData.paymentStatus,
        paymentMode: editFormData.paymentMode,
        paymentTime: editFormData.paymentTime || '',
        discountType: editFormData.discountType,
        discountValue: Number(editFormData.discountValue) || 0,
        taxRate: Number(editFormData.taxRate) || 0,
        items: editFormData.items.map((it) => ({
          catalogueId: it.isCustom || it.catalogueId === 'CUSTOM' ? 'CUSTOM' : it.catalogueId,
          catalogueName: it.catalogueName,
          catalogueSlug: it.catalogueSlug,
          patternNumber: it.patternNumber,
          imagePath: it.imagePath || '',
          quantity: Number(it.quantity),
          rate: Number(it.rate),
          isCustom: Boolean(it.isCustom || it.catalogueId === 'CUSTOM'),
        })),
      })

      showToast('success', res.data?.message || 'Invoice updated and stock adjusted successfully.')
      setEditingInvoice(null)
      fetchInvoices(true)
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to update invoice.')
    } finally {
      setSavingEdit(false)
    }
  }

  // Load catalogues list for dropdown filter
  useEffect(() => {
    billingService
      .getCatalogues()
      .then((res) => {
        setCatalogues(res.data?.data?.catalogues || [])
      })
      .catch(() => {})
  }, [])

  // Fetch invoices with applied filters
  const fetchInvoices = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const params = {
          search: search.trim(),
          startDate,
          endDate,
          catalogue: selectedCatalogue,
          billerName: selectedBiller !== 'ALL' ? selectedBiller : undefined,
          minPrice: minPrice !== '' ? minPrice : undefined,
          maxPrice: maxPrice !== '' ? maxPrice : undefined,
          limit: 200,
        }
        const res = await billingService.searchInvoices(params)
        setInvoices(res.data?.data?.invoices || [])
        if (res.data?.data?.billers) {
          setBillersList(res.data.data.billers)
        }
      } catch (err) {
        showToast('error', err.response?.data?.message || 'Failed to fetch invoices.')
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [search, startDate, endDate, selectedCatalogue, selectedBiller, minPrice, maxPrice, showToast]
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInvoices(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [fetchInvoices])

  const handleResetFilters = () => {
    setSearch('')
    setStartDate('')
    setEndDate('')
    setSelectedCatalogue('ALL')
    setSelectedPaymentStatus('ALL')
    setSelectedBiller('ALL')
    setMinPrice('')
    setMaxPrice('')
  }

  // Summary statistics
  const summaryStats = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.totalBills += 1
        acc.totalRolls += inv.totalQuantity || 0
        acc.totalAmount += inv.finalTotal || 0
        return acc
      },
      { totalBills: 0, totalRolls: 0, totalAmount: 0 }
    )
  }, [invoices])

  // Download all or filtered invoices as CSV
  const handleExportCsv = (filteredOnly = true) => {
    if (invoices.length === 0) {
      showToast('info', 'No invoices to download.')
      return
    }

    try {
      const rows = invoices.map((inv, idx) => ({
        'Sr No': idx + 1,
        'Invoice Number': inv.invoiceNumber,
        'Date': new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN'),
        'Customer Name': inv.customerName,
        'Mobile Number': inv.mobileNumber ? `="${inv.mobileNumber}"` : '',
        'Total Rolls': inv.totalQuantity,
        'Total Items': inv.totalItems,
        'Catalogues / Patterns': (inv.items || [])
          .map((it) => `${it.catalogueName || it.catalogueSlug} (${it.patternNumber}) x ${it.quantity}`)
          .join('; '),
        'Subtotal (Rs)': Number(inv.subtotal || 0).toFixed(2),
        'Discount (Rs)': Number(inv.discountAmount || 0).toFixed(2),
        'GST (Rs)': Number(inv.taxAmount || 0).toFixed(2),
        'Final Total (Rs)': Number(inv.finalTotal || 0).toFixed(2),
        'Billed By': inv.billerName || inv.createdBy?.fullName || inv.createdBy?.email || 'Admin',
      }))

      const csv = generateCsvContent(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filteredOnly
        ? `Filtered_Invoices_${new Date().toISOString().slice(0, 10)}.csv`
        : `All_Invoices_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast('success', 'Invoices CSV downloaded successfully.')
    } catch {
      showToast('error', 'Failed to export invoices CSV.')
    }
  }

  // Download Individual Invoice PDF
  const handleDownloadPdf = async (inv) => {
    const btnId = `ih-pdf-${inv._id || inv.invoiceNumber}`
    try {
      await trackDownload(btnId, async () => {
        await downloadInvoicePdf(inv)
      })
      showToast('success', `Invoice ${inv.invoiceNumber} PDF downloaded.`)
    } catch {
      showToast('error', 'Failed to generate invoice PDF.')
    }
  }

  // Send invoice as an image to WhatsApp
  const handleSendWhatsAppImage = async (inv) => {
    if (!inv) return
    try {
      const result = await sendInvoiceImageToWhatsApp(inv)
      if (result === 'shared') {
        showToast('success', `Invoice ${inv.invoiceNumber} image shared.`)
      } else if (result === 'copied') {
        showToast(
          'success',
          'Invoice image copied! WhatsApp chat opened – press Ctrl+V to paste & send.'
        )
      } else if (result === 'downloaded') {
        showToast('info', 'Invoice image downloaded. Attach it in the opened WhatsApp chat.')
      }
    } catch {
      showToast('error', 'Failed to create invoice image.')
    }
  }

  return (
    <div className="invoice-history-page">
      {/* 1. Breadcrumb */}
      <nav className="crm-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="breadcrumb-link">
          Home
        </Link>
        <span className="breadcrumb-sep">&gt;</span>
        <span className="breadcrumb-current">Invoice History</span>
      </nav>

      {/* 2. Top Header & Action Buttons */}
      <div className="invoice-history-page-topbar">
        <div>
          <h1 className="invoice-history-heading">All Invoice History</h1>
          <p className="invoice-history-subtext">
            Filter, search, view invoice details, and export all or filtered invoices
          </p>
        </div>

        <div className="invoice-history-top-actions">
          <button
            type="button"
            className="ih-btn"
            onClick={() => handleExportCsv(true)}
            disabled={invoices.length === 0}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Filtered (CSV)
          </button>

          <button
            type="button"
            className="ih-btn ih-btn-primary"
            onClick={() => navigate('/billing')}
          >
            + Create New Bill
          </button>
        </div>
      </div>

      {/* 3. Comprehensive Filter Card */}
      <div className="ih-filter-card">
        <div className="ih-filter-grid">
          {/* Search bar */}
          <div className="ih-filter-group" style={{ gridColumn: 'span 2' }}>
            <label className="ih-filter-label">Search Invoices</label>
            <input
              type="text"
              className="ih-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Invoice #, Pattern Number, Customer Name, Mobile..."
            />
          </div>

          {/* Catalogue Filter */}
          <div className="ih-filter-group">
            <label className="ih-filter-label">Catalogue</label>
            <select
              className="ih-select"
              value={selectedCatalogue}
              onChange={(e) => setSelectedCatalogue(e.target.value)}
            >
              <option value="ALL">All Catalogues</option>
              {catalogues.map((cat) => (
                <option key={cat._id || cat.slug} value={cat._id || cat.name}>
                  {formatCatalogueLabel(cat.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Biller / Employee Filter */}
          <div className="ih-filter-group">
            <label className="ih-filter-label">Billed By (Employee)</label>
            <select
              className="ih-select"
              value={selectedBiller}
              onChange={(e) => setSelectedBiller(e.target.value)}
            >
              <option value="ALL">All Employees</option>
              {billersList.map((bName) => (
                <option key={bName} value={bName}>
                  👤 {bName}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter: From */}
          <div className="ih-filter-group">
            <label className="ih-filter-label">From Date</label>
            <input
              type="date"
              className="ih-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Date Filter: To */}
          <div className="ih-filter-group">
            <label className="ih-filter-label">To Date</label>
            <input
              type="date"
              className="ih-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* Price Range Filter */}
          <div className="ih-filter-group">
            <label className="ih-filter-label">Price Range (₹)</label>
            <div className="ih-price-range">
              <input
                type="number"
                min="0"
                placeholder="Min ₹"
                className="ih-input"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <span>-</span>
              <input
                type="number"
                min="0"
                placeholder="Max ₹"
                className="ih-input"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Reset button */}
          <div className="ih-filter-buttons">
            <button
              type="button"
              className="ih-btn"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* 4. Filter Summary Metrics */}
      <div className="ih-summary-row">
        <div className="ih-stat-pill">
          Showing <strong>{invoices.length}</strong> Invoices
        </div>
        <div className="ih-stat-pill">
          Total Rolls: <strong>{summaryStats.totalRolls}</strong> Rolls
        </div>
        <div className="ih-stat-pill">
          Total Revenue: <strong>{formatINR(summaryStats.totalAmount)}</strong>
        </div>
      </div>

      {/* 5. Invoices Table */}
      <div className="ih-table-card">
        {loading ? (
          <div style={{ padding: '20px' }}>
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : invoices.length === 0 ? (
          <div className="ih-empty-state">
            <p>No invoices match your selected filters.</p>
            {(search || startDate || endDate || selectedCatalogue !== 'ALL' || minPrice || maxPrice) && (
              <button
                type="button"
                className="ih-btn"
                style={{ marginTop: '10px' }}
                onClick={handleResetFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="ih-table-wrapper">
            <table className="ih-table">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Mobile</th>
                  <th>Billed By</th>
                  <th>Catalogues &amp; Patterns</th>
                  <th>Qty</th>
                  <th>Final Amount</th>
                <th>Payment Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv._id || inv.invoiceNumber}>
                    <td>
                      <span className="ih-inv-badge">{inv.invoiceNumber}</span>
                    </td>
                    <td>
                      {new Date(inv.invoiceDate || inv.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td>
                      <strong>{inv.customerName}</strong>
                    </td>
                    <td>+91 {inv.mobileNumber}</td>
                    <td>
                      <span
                        style={{
                          background: '#f1f5f9',
                          color: '#1e293b',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: '700',
                          border: '1px solid #cbd5e1',
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        👤 {inv.billerName || inv.createdBy?.fullName || inv.createdBy?.email || 'Admin'}
                      </span>
                    </td>
                    <td>
                      <div className="ih-items-preview">
                        {(inv.items || []).slice(0, 3).map((it, idx) => (
                          <span
                            key={idx}
                            className="ih-item-tag"
                            title={`${it.catalogueName} ${it.patternNumber} (${it.quantity} rolls)`}
                          >
                            {formatCatalogueLabel(it.catalogueName || it.catalogueSlug)} #{it.patternNumber} ({it.quantity})
                          </span>
                        ))}
                        {(inv.items || []).length > 3 && (
                          <span className="ih-item-tag">+{inv.items.length - 3} more</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <strong>{inv.totalQuantity} Rolls</strong>
                    </td>
                    <td>
                      <strong style={{ color: '#0f172a' }}>{formatINR(inv.finalTotal)}</strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="ih-actions" style={{ justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="ih-action-btn"
                          onClick={() => setSelectedInvoice(inv)}
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          className="ih-action-btn"
                          style={{ color: '#2563eb', borderColor: '#bfdbfe' }}
                          onClick={() => handleOpenEditModal(inv)}
                          title="Edit Bill Details & Adjust Stock"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ih-action-btn"
                          onClick={() => printInvoiceDocument(inv)}
                        >
                          Print
                        </button>
                        <ProgressButton
                          id={`ih-pdf-${inv._id || inv.invoiceNumber}`}
                          type="button"
                          className="ih-action-btn"
                          onClick={() => handleDownloadPdf(inv)}
                          loadingText=""
                        >
                          PDF
                        </ProgressButton>
                        <button
                          type="button"
                          className="ih-action-btn"
                          style={{ color: '#15803d', borderColor: '#86efac' }}
                          onClick={() => handleSendWhatsAppImage(inv)}
                          title="Send to WhatsApp"
                        >
                          WhatsApp
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Invoice Details Modal (Matching Billing Details Page Layout) */}
      {selectedInvoice && (
        <div
          className="billing-modal-backdrop"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="billing-modal-card invoice-preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invoice-preview-top">
              <div className="invoice-preview-brand">
                <img
                  src="/Logo.png"
                  alt="NH Wallpaper"
                  className="invoice-preview-logo"
                />
                <div>
                  <h3>NH Wallpaper</h3>
                  <p>Premium Wallpaper &amp; Roll Collections – Tax / Retail Invoice</p>
                  <p className="invoice-header-contact">Mob: +91 8828251111, +91 9930317192</p>
                  <p className="invoice-header-address">
                    Rani Residency, Shop No 02, Opp Alpha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086
                  </p>
                </div>
              </div>
              <div className="invoice-preview-meta" style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', fontWeight: '700', color: '#0f172a', letterSpacing: '0.4px' }}>
                  GSTIN: 27DXLPR9950M1ZB
                </p>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                  Invoice: {selectedInvoice.invoiceNumber}
                </span>
                <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Date:{' '}
                  {new Date(
                    selectedInvoice.invoiceDate || selectedInvoice.createdAt
                  ).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Time:{' '}
                  {new Date(
                    selectedInvoice.invoiceDate || selectedInvoice.createdAt
                  ).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  })}
                </p>
              </div>
            </div>

            <div className="invoice-preview-customer">
              <div>
                <span>Customer Name:</span>{' '}
                <strong>{selectedInvoice.customerName}</strong>
              </div>
              <div>
                <span>Mobile Number:</span>{' '}
                <strong>+91 {selectedInvoice.mobileNumber}</strong>
              </div>
              <div>
                <span>Billed By:</span>{' '}
                <strong>
                  {selectedInvoice.billerName ||
                    selectedInvoice.createdBy?.fullName ||
                    selectedInvoice.createdBy?.email ||
                    'Admin'}
                </strong>
              </div>
              {selectedInvoice.paymentMode && (
                <div>
                  <span>Payment Method:</span>{' '}
                  <strong style={{ color: '#2563eb' }}>
                    {selectedInvoice.paymentMode}
                    {selectedInvoice.paymentTime ? ` (${selectedInvoice.paymentTime})` : ''}
                  </strong>
                </div>
              )}
            </div>

            <div className="billing-table-wrapper">
              <table className="invoice-history-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>#</th>
                    <th style={{ paddingLeft: '20px' }}>Catalogue</th>
                    <th>Pattern No</th>
                    <th>Quantity</th>
                    <th>Rate</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoice.items || []).map((it, idx) => (
                    <tr key={`${it.catalogueId}_${it.patternNumber}_${idx}`}>
                      <td>{idx + 1}</td>
                      <td style={{ paddingLeft: '20px' }}>
                        <strong>
                          {formatCatalogueLabel(it.catalogueName || it.catalogueSlug)}
                        </strong>
                      </td>
                      <td>
                        <strong>{it.patternNumber}</strong>
                      </td>
                      <td>{it.quantity}</td>
                      <td>{formatINR(it.rate)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <strong>{formatINR(it.subtotal)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="invoice-preview-bottom-split" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <div className="invoice-preview-totals" style={{ width: '330px' }}>
                <div className="confirm-row">
                  <span>Subtotal:</span>
                  <strong>{formatINR(selectedInvoice.subtotal)}</strong>
                </div>
                <div className="confirm-row" style={{ color: '#b91c1c' }}>
                  <span>
                    Discount
                    {selectedInvoice.discountType === 'PERCENTAGE' && selectedInvoice.discountValue > 0
                      ? ` (${selectedInvoice.discountValue}%)`
                      : ''}
                    :
                  </span>
                  <strong>- {formatINR(selectedInvoice.discountAmount || 0)}</strong>
                </div>
                {selectedInvoice.taxRate > 0 && (
                  <div className="confirm-row" style={{ color: '#0f172a' }}>
                    <span>GST ({selectedInvoice.taxRate}%):</span>
                    <strong>+ {formatINR(selectedInvoice.taxAmount || 0)}</strong>
                  </div>
                )}
                <div className="confirm-row confirm-row-final">
                  <span>Final Payable Amount:</span>
                  <strong>{formatINR(selectedInvoice.finalTotal)}</strong>
                </div>

                <div style={{ marginTop: '18px', textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: '12.5px', fontWeight: '800', color: '#0f172a' }}>For NH Wallpaper</p>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                    {selectedInvoice.billerName ||
                      selectedInvoice.createdBy?.fullName ||
                      selectedInvoice.createdBy?.email ||
                      'Admin'}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>Authorised Signatory</p>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>Terms &amp; Conditions :</p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#475569', lineHeight: '1.5', listStyleType: 'disc' }}>
                <li>Subject to Mumbai Jurisdiction.</li>
                <li>No complaint will be entertained after acceptance of the delivery.</li>
                <li>Goods once sold will not be taken back or exchanged.</li>
                <li>Our responsibility ceases after delivery of goods to the carriers.</li>
              </ul>
            </div>

            <div className="billing-modal-actions">
              <button
                type="button"
                className="billing-glass-btn"
                style={{ color: '#2563eb', borderColor: '#bfdbfe' }}
                onClick={() => {
                  const inv = selectedInvoice
                  setSelectedInvoice(null)
                  handleOpenEditModal(inv)
                }}
              >
                Edit Bill
              </button>
              <button
                type="button"
                className="billing-glass-btn"
                onClick={() => printInvoiceDocument(selectedInvoice)}
              >
                Print Invoice
              </button>
              <ProgressButton
                id={`ih-modal-pdf-${selectedInvoice._id || selectedInvoice.invoiceNumber}`}
                type="button"
                className="billing-glass-btn generate-bill-btn"
                onClick={() => handleDownloadPdf(selectedInvoice)}
                loadingText="Downloading"
              >
                Download PDF
              </ProgressButton>
              <button
                type="button"
                className="billing-glass-btn"
                style={{
                  background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)',
                  color: '#ffffff',
                  borderColor: '#15803d',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                onClick={() => handleSendWhatsAppImage(selectedInvoice)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.41 1.02 2.58.12.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.07-.1-.23-.17-.48-.29z"/>
                </svg>
                Send to WhatsApp
              </button>
              <button
                type="button"
                className="billing-glass-btn"
                onClick={() => setSelectedInvoice(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 8. Edit Invoice Modal */}
      {editingInvoice && (
        <div
          className="billing-modal-backdrop"
          onClick={() => !savingEdit && setEditingInvoice(null)}
        >
          <div
            className="billing-modal-card edit-invoice-modal"
            style={{ maxWidth: '680px', width: '95%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', flexShrink: 0 }}>
              <div>
                <h3 className="billing-modal-title" style={{ margin: 0 }}>
                  Edit Invoice: {editingInvoice.invoiceNumber}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Updating items will automatically adjust and balance stock differences.
                </p>
              </div>
              <button
                type="button"
                className="pending-drawer-close-btn"
                onClick={() => !savingEdit && setEditingInvoice(null)}
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleSaveEditInvoice}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
            >
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                  <div className="discount-type-field">
                    <label>Customer Name</label>
                    <input
                      type="text"
                      className="billing-text-input"
                      value={editFormData.customerName}
                      onChange={(e) => setEditFormData({ ...editFormData, customerName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="discount-type-field">
                    <label>Mobile Number</label>
                    <input
                      type="text"
                      className="billing-text-input"
                      value={editFormData.mobileNumber}
                      onChange={(e) => setEditFormData({ ...editFormData, mobileNumber: e.target.value })}
                      required
                    />
                  </div>
                  <div className="discount-type-field">
                    <label>Billed By</label>
                    <input
                      type="text"
                      className="billing-text-input"
                      value={editFormData.billerName}
                      onChange={(e) => setEditFormData({ ...editFormData, billerName: e.target.value })}
                    />
                  </div>
                  <div className="discount-type-field">
                    <label>Invoice Date</label>
                    <input
                      type="date"
                      className="billing-text-input"
                      value={editFormData.invoiceDate}
                      onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div className="discount-type-field">
                    <label>Payment Method</label>
                    <select
                      className="billing-select"
                      value={editFormData.paymentMode}
                      onChange={(e) => setEditFormData({ ...editFormData, paymentMode: e.target.value })}
                    >
                      <option value="Cash">Cash</option>
                      <option value="COD">COD (Cash on Delivery)</option>
                      <option value="GPay">GPay (Google Pay)</option>
                      <option value="Card">Credit / Debit Card</option>
                      <option value="UPI">UPI</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Bank Transfer (NEFT/RTGS)">Bank Transfer</option>
                    </select>
                  </div>

                  {['GPay', 'UPI', 'Card', 'Bank Transfer (NEFT/RTGS)'].includes(editFormData.paymentMode) && (
                    <div className="discount-type-field">
                      <label>Payment Time (24h)</label>
                      <input
                        type="time"
                        step="60"
                        className="billing-text-input"
                        value={editFormData.paymentTime || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, paymentTime: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="discount-type-field">
                    <label>Payment Status</label>
                    <select
                      className="billing-select"
                      value={editFormData.paymentStatus}
                      onChange={(e) => setEditFormData({ ...editFormData, paymentStatus: e.target.value })}
                    >
                      <option value="PAID">Amount Paid (Full)</option>
                      <option value="UNPAID">Amount Unpaid (Due)</option>
                    </select>
                  </div>
                  <div className="discount-type-field">
                    <label>GST Tax (%)</label>
                    <select
                      className="billing-select"
                      value={editFormData.taxRate}
                      onChange={(e) => setEditFormData({ ...editFormData, taxRate: Number(e.target.value) || 0 })}
                    >
                      <option value={0}>No GST (0%)</option>
                      <option value={18}>GST 18%</option>
                      <option value={5}>GST 5%</option>
                      <option value={12}>GST 12%</option>
                      <option value={28}>GST 28%</option>
                    </select>
                  </div>
                </div>

                {/* Items Table for Editing */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                      Bill Items:
                    </label>
                    <button
                      type="button"
                      className="billing-glass-btn"
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                      onClick={() => {
                        setEditFormData((prev) => ({
                          ...prev,
                          items: [
                            ...prev.items,
                            {
                              catalogueId: '',
                              catalogueName: '',
                              catalogueSlug: '',
                              patternNumber: '',
                              imagePath: '',
                              quantity: 1,
                              rate: 1250,
                              isCustom: false,
                            },
                          ],
                        }))
                      }}
                    >
                      + Add Item
                    </button>
                  </div>
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                    <table className="invoice-history-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ minWidth: '150px' }}>Catalogue / Item</th>
                          <th style={{ minWidth: '140px' }}>Pattern No</th>
                          <th style={{ width: '85px' }}>Qty</th>
                          <th style={{ width: '100px' }}>Rate (₹)</th>
                          <th style={{ textAlign: 'right', width: '90px' }}>Subtotal</th>
                          <th style={{ width: '40px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editFormData.items.map((it, idx) => {
                          const itemSub = (Number(it.quantity) || 0) * (Number(it.rate) || 0)
                          return (
                            <tr key={idx}>
                              <td>
                                <SearchableSelect
                                  value={it.catalogueId === 'CUSTOM' ? (it.catalogueName || '') : it.catalogueId}
                                  onChange={(val) => {
                                    const catObj = catalogues.find((c) => c._id === val)
                                    const updatedItems = [...editFormData.items]
                                    if (catObj) {
                                      updatedItems[idx] = {
                                        ...updatedItems[idx],
                                        catalogueId: catObj._id,
                                        catalogueName: catObj.name,
                                        catalogueSlug: catObj.slug,
                                        isCustom: false,
                                      }
                                      fetchPatternsForCatalogue(catObj._id)
                                    } else {
                                      updatedItems[idx] = {
                                        ...updatedItems[idx],
                                        catalogueId: 'CUSTOM',
                                        catalogueName: val || 'Custom Item',
                                        catalogueSlug: 'CUSTOM',
                                        isCustom: true,
                                      }
                                    }
                                    setEditFormData({ ...editFormData, items: updatedItems })
                                  }}
                                  allowCustomInput={true}
                                  customInputPrefix=""
                                  onCustomInput={(typedText) => {
                                    const updatedItems = [...editFormData.items]
                                    updatedItems[idx] = {
                                      ...updatedItems[idx],
                                      catalogueId: 'CUSTOM',
                                      catalogueName: typedText,
                                      catalogueSlug: 'CUSTOM',
                                      isCustom: true,
                                    }
                                    setEditFormData({ ...editFormData, items: updatedItems })
                                  }}
                                  placeholder="Select or type..."
                                  emptyText="Press Enter to use this name"
                                  options={catalogues.map((cat) => ({
                                    value: cat._id,
                                    label: formatCatalogueLabel(cat.name),
                                    searchKeywords: `${cat.name} ${cat.slug}`,
                                    badgeText: `Stock: ${cat.totalStock ?? 0}`,
                                    badgeTone: (cat.totalStock ?? 0) > 0 ? 'success' : 'danger',
                                  }))}
                                />
                              </td>
                              <td>
                                {it.isCustom || it.catalogueId === 'CUSTOM' ? (
                                  <input
                                    type="text"
                                    className="billing-text-input"
                                    style={{ width: '100%', padding: '6px 8px', fontSize: '13px' }}
                                    placeholder="Description / Code"
                                    value={it.patternNumber}
                                    onChange={(e) => {
                                      const updatedItems = [...editFormData.items]
                                      updatedItems[idx] = { ...updatedItems[idx], patternNumber: e.target.value }
                                      setEditFormData({ ...editFormData, items: updatedItems })
                                    }}
                                    required
                                  />
                                ) : (
                                  <SearchableSelect
                                    value={it.patternNumber}
                                    disabled={!it.catalogueId}
                                    onChange={(val) => {
                                      const updatedItems = [...editFormData.items]
                                      updatedItems[idx] = { ...updatedItems[idx], patternNumber: val }
                                      setEditFormData({ ...editFormData, items: updatedItems })
                                    }}
                                    placeholder={!it.catalogueId ? 'Select catalogue' : 'Select pattern...'}
                                    emptyText="No pattern found"
                                    options={(patternsByCatalogue[it.catalogueId] || []).map((pat) => ({
                                      value: pat.patternNumber,
                                      label: String(pat.patternNumber),
                                      searchKeywords: String(pat.patternNumber),
                                    }))}
                                  />
                                )}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={1}
                                  className="billing-num-input"
                                  style={{ width: '100%', padding: '6px' }}
                                  value={it.quantity}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    const updatedItems = [...editFormData.items]
                                    updatedItems[idx] = { ...updatedItems[idx], quantity: val }
                                    setEditFormData({ ...editFormData, items: updatedItems })
                                  }}
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="billing-num-input"
                                  style={{ width: '100%', padding: '6px' }}
                                  value={it.rate}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    const updatedItems = [...editFormData.items]
                                    updatedItems[idx] = { ...updatedItems[idx], rate: val }
                                    setEditFormData({ ...editFormData, items: updatedItems })
                                  }}
                                  required
                                />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>
                                {formatINR(itemSub)}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="remove-row-btn"
                                  style={{ width: '22px', height: '22px', fontSize: '11px' }}
                                  disabled={editFormData.items.length <= 1}
                                  onClick={() => {
                                    const updatedItems = editFormData.items.filter((_, i) => i !== idx)
                                    setEditFormData({ ...editFormData, items: updatedItems })
                                  }}
                                  title="Remove item"
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Discount Controls */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div className="discount-type-field">
                    <label>Discount Type</label>
                    <select
                      className="billing-select"
                      value={editFormData.discountType}
                      onChange={(e) => setEditFormData({ ...editFormData, discountType: e.target.value })}
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount (₹)</option>
                    </select>
                  </div>
                  <div className="discount-type-field">
                    <label>Discount Value</label>
                    <input
                      type="number"
                      min={0}
                      className="billing-num-input"
                      value={editFormData.discountValue}
                      onChange={(e) => setEditFormData({ ...editFormData, discountValue: e.target.value })}
                    />
                  </div>
                </div>

                {/* Live Preview of Recalculated Total */}
                {(() => {
                  let sub = 0
                  let totalQ = 0
                  editFormData.items.forEach((it) => {
                    const q = Number(it.quantity) || 0
                    const r = Number(it.rate) || 0
                    totalQ += q
                    sub += q * r
                  })
                  const discVal = Number(editFormData.discountValue) || 0
                  const discAmt = editFormData.discountType === 'PERCENTAGE' ? (sub * discVal) / 100 : discVal
                  const taxable = Math.max(0, sub - discAmt)
                  const tax = editFormData.taxRate > 0 ? (taxable * editFormData.taxRate) / 100 : 0
                  const finalAmt = taxable + tax

                  return (
                    <div className="confirm-summary-box" style={{ marginBottom: '16px' }}>
                      <div className="confirm-row">
                        <span>Total Quantity:</span>
                        <strong>{totalQ} Rolls</strong>
                      </div>
                      <div className="confirm-row">
                        <span>Subtotal:</span>
                        <strong>{formatINR(sub)}</strong>
                      </div>
                      {discAmt > 0 && (
                        <div className="confirm-row" style={{ color: '#b91c1c' }}>
                          <span>Discount:</span>
                          <strong>- {formatINR(discAmt)}</strong>
                        </div>
                      )}
                      {tax > 0 && (
                        <div className="confirm-row">
                          <span>GST ({editFormData.taxRate}%):</span>
                          <strong>+ {formatINR(tax)}</strong>
                        </div>
                      )}
                      <div className="confirm-row confirm-row-final">
                        <span>Updated Final Payable:</span>
                        <strong style={{ color: '#16a34a', fontSize: '15px' }}>{formatINR(finalAmt)}</strong>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div
                className="billing-modal-actions edit-invoice-actions"
                style={{
                  flexShrink: 0,
                  paddingTop: '12px',
                  borderTop: '1px solid #e2e8f0',
                  marginTop: 'auto',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px'
                }}
              >
                <button
                  type="button"
                  className="billing-glass-btn"
                  disabled={savingEdit}
                  onClick={() => setEditingInvoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="billing-glass-btn generate-bill-btn"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Updating Bill & Stock...' : 'Save & Adjust Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
