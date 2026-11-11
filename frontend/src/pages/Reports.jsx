import { useState, useEffect, useCallback, useMemo } from 'react'
import { reportsService } from '../services/reportsService.js'
import { billingService } from '../services/billingService.js'
import { useToast } from '../context/ToastContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useDownloadProgress, ProgressButton } from '../context/DownloadProgressContext.jsx'
import {
  generateReportsPdf,
  generateMultiSheetExcelXml,
  buildQuarterlyZipPackage,
} from '../utils/exportHelpers.js'
import { CustomSelect } from '../components/CustomSelect.jsx'
import { MetricsSkeleton, TableSkeleton } from '../components/Skeleton.jsx'
import '../styles/Reports.css'

export function Reports() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()

  // Navigation tab states
  const [activeTab, setActiveTab] = useState('sales_overview') // sales_overview, invoices, catalogues, patterns, dates, quarterly_archive, archive_history

  // Filter States
  const [filterType, setFilterType] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [selectedCatalogue, setSelectedCatalogue] = useState('ALL')
  const [selectedPattern, setSelectedPattern] = useState('ALL')

  // Dynamic dropdowns
  const [catalogues, setCatalogues] = useState([])
  const [patterns, setPatterns] = useState([])

  // Data states
  const [loading, setLoading] = useState(true)
  const [reportData, setReportData] = useState({
    summary: {
      totalBills: 0,
      totalRollsSold: 0,
      totalSales: 0,
      totalDiscount: 0,
      avgBillValue: 0,
    },
    catalogueBreakdown: [],
    patternBreakdown: [],
    dailySales: [],
  })

  // Invoices table state
  const [invoices, setInvoices] = useState([])
  const [invoicePagination, setInvoicePagination] = useState({
    page: 1,
    totalPages: 1,
    totalCount: 0,
  })

  // Archive Management states
  const [archiveStartDate, setArchiveStartDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  })
  const [archiveEndDate, setArchiveEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [archivingLoading, setArchivingLoading] = useState(false)
  const [currentArchivePackage, setCurrentArchivePackage] = useState(null)
  const [verifiedArchive, setVerifiedArchive] = useState(null)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [cleaningActive, setCleaningActive] = useState(false)

  // Archive History states
  const [archiveHistory, setArchiveHistory] = useState([])
  const [historicalSearch, setHistoricalSearch] = useState({
    invoiceNumber: '',
    mobileNumber: '',
    catalogue: 'ALL',
    patternNumber: 'ALL',
  })
  const [historicalInvoices, setHistoricalInvoices] = useState([])
  const [selectedArchivedInvoice, setSelectedArchivedInvoice] = useState(null)

  // Load catalogues for dropdown
  useEffect(() => {
    billingService
      .getCatalogues()
      .then((res) => {
        setCatalogues(res.data?.data?.catalogues || [])
      })
      .catch(() => {})
  }, [])

  // Load dependent patterns
  useEffect(() => {
    if (selectedCatalogue === 'ALL') {
      setPatterns([])
      setSelectedPattern('ALL')
      return
    }
    const cat = catalogues.find((c) => c.name === selectedCatalogue)
    if (cat?._id) {
      billingService
        .getPatternsByCatalogue(cat._id)
        .then((res) => {
          setPatterns(res.data?.data?.patterns || [])
        })
        .catch(() => {
          setPatterns([])
        })
    }
  }, [selectedCatalogue, catalogues])

  // Fetch Report Analytics Overview
  const fetchOverviewReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reportsService.getOverview({
        filterType,
        customStart: filterType === 'custom' ? customStart : undefined,
        customEnd: filterType === 'custom' ? customEnd : undefined,
        catalogue: selectedCatalogue,
        patternNumber: selectedPattern,
      })
      if (res.data?.success) {
        setReportData(res.data.data)
      }
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Error Fetching Reports',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setLoading(false)
    }
  }, [
    filterType,
    customStart,
    customEnd,
    selectedCatalogue,
    selectedPattern,
    showToast,
  ])

  // Fetch Invoices Table
  const fetchInvoicesTable = useCallback(
    async (page = 1) => {
      try {
        const res = await reportsService.getInvoices({
          filterType,
          customStart: filterType === 'custom' ? customStart : undefined,
          customEnd: filterType === 'custom' ? customEnd : undefined,
          catalogue: selectedCatalogue,
          patternNumber: selectedPattern,
          page,
          limit: 15,
        })
        if (res.data?.success) {
          setInvoices(res.data.data.invoices)
          setInvoicePagination({
            page: res.data.data.page,
            totalPages: res.data.data.totalPages,
            totalCount: res.data.data.totalCount,
          })
        }
      } catch {
        // Silently handle
      }
    },
    [filterType, customStart, customEnd, selectedCatalogue, selectedPattern]
  )

  // Fetch Archive History
  const fetchArchiveHistory = useCallback(async () => {
    try {
      const res = await reportsService.getArchiveHistory()
      if (res.data?.success) {
        setArchiveHistory(res.data.data || [])
      }
    } catch {
      // Handled
    }
  }, [])

  useEffect(() => {
    fetchOverviewReport()
    fetchInvoicesTable(1)
    if (activeTab === 'archive_history') {
      fetchArchiveHistory()
    }
  }, [fetchOverviewReport, fetchInvoicesTable, activeTab, fetchArchiveHistory])

  // Handle Export Excel
  const handleExportExcel = async () => {
    try {
      await trackDownload('reports-export-excel', async () => {
        await new Promise((r) => setTimeout(r, 600))
        const xml = generateMultiSheetExcelXml({
          invoices,
          flatItems: invoices.flatMap((inv) =>
            inv.items.map((it) => ({
              invoiceNumber: inv.invoiceNumber,
              customerName: inv.customerName,
              ...it,
            }))
          ),
          catalogueSummary: reportData.catalogueBreakdown.map((c) => ({
            catalogueName: c._id,
            rollsCount: c.rollsCount,
            revenue: c.revenue,
          })),
          patternSummary: reportData.patternBreakdown,
          dailySales: reportData.dailySales,
          summary: reportData.summary,
        })

        const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `NH_Report_${filterType}_${Date.now()}.xls`
        a.click()
        URL.revokeObjectURL(url)
      })

      showToast({
        type: 'success',
        title: 'Excel Downloaded',
        message: 'Report exported with 8 comprehensive worksheets.',
      })
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Export Failed',
        message: err.message,
      })
    }
  }

  // Handle Export PDF
  const handleExportPdf = async () => {
    try {
      await trackDownload('reports-export-pdf', async () => {
        await new Promise((r) => setTimeout(r, 550))
        const doc = generateReportsPdf({
          filters: {
            filterType,
            catalogue: selectedCatalogue,
            patternNumber: selectedPattern,
          },
          summary: reportData.summary,
          invoices,
        })
        doc.save(`NH_Report_${filterType}_${Date.now()}.pdf`)
      })
      showToast({
        type: 'success',
        title: 'PDF Exported',
        message: 'PDF generated with summary statistics and breakdown.',
      })
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Export Failed',
        message: err.message,
      })
    }
  }

  // STEP 1: EXPORT & DOWNLOAD 3-MONTH DATA
  const handleExportQuarterlyArchive = async () => {
    setArchivingLoading(true)
    try {
      const res = await reportsService.prepareQuarterlyArchive({
        startDate: archiveStartDate,
        endDate: archiveEndDate,
        quarterLabel: `Quarter (${archiveStartDate} to ${archiveEndDate})`,
      })

      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Preparation failed')
      }

      const pkg = res.data.data
      setCurrentArchivePackage(pkg)

      // Build complete ZIP
      const zippedU8 = buildQuarterlyZipPackage({
        archiveId: pkg.archiveId,
        manifest: pkg.manifest,
        invoices: pkg.invoices,
        flatItems: pkg.flatItems,
        catalogueSummary: pkg.catalogueSummary,
        patternSummary: pkg.patternSummary,
        dailySales: reportData.dailySales,
        summary: {
          totalBills: pkg.manifest.invoiceCount,
          totalRollsSold: pkg.manifest.totalQuantity,
          totalSales: pkg.manifest.totalSales,
        },
      })

      // Trigger direct Windows download of ZIP
      const blob = new Blob([zippedU8], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pkg.archiveId}_DATA_PACKAGE.zip`
      a.click()
      URL.revokeObjectURL(url)

      showToast({
        type: 'success',
        title: 'Archive Exported & Downloaded',
        message: `Saved ${pkg.invoices.length} invoices to your computer. Now proceed to verify.`,
      })
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Archive Export Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setArchivingLoading(false)
    }
  }

  // STEP 2: VERIFY ARCHIVE INTEGRITY
  const handleVerifyArchive = async () => {
    if (!currentArchivePackage) {
      showToast({
        type: 'warning',
        title: 'Export Required',
        message: 'Please export the archive first before verifying.',
      })
      return
    }

    try {
      const res = await reportsService.verifyArchive({
        archiveId: currentArchivePackage.archiveId,
        manifest: currentArchivePackage.manifest,
      })

      if (res.data?.success) {
        setVerifiedArchive(res.data.data.archive)
        showToast({
          type: 'success',
          title: 'Verification Succeeded',
          message:
            'Financial totals, invoice counts, and SHA-256 checksums verified perfectly!',
        })
      }
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Verification Failed',
        message: err.response?.data?.message || err.message,
      })
    }
  }

  // STEP 3: MANUAL CLEANUP CONFIRMATION
  const handlePerformCleanup = async () => {
    const requiredConsent =
      'I have safely downloaded and verified this quarterly archive. I understand that eligible detailed invoice records will be removed from the active database.'

    if (confirmationInput.trim() !== requiredConsent) {
      showToast({
        type: 'danger',
        title: 'Consent Mismatch',
        message: 'Please paste the exact required confirmation phrase.',
      })
      return
    }

    if (!verifiedArchive) {
      showToast({
        type: 'warning',
        title: 'Verification Required',
        message: 'You must verify the archive before performing cleanup.',
      })
      return
    }

    setCleaningActive(true)
    try {
      const res = await reportsService.cleanupActiveDatabase({
        archiveId: verifiedArchive.archiveId,
        adminConfirmation: confirmationInput.trim(),
      })

      if (res.data?.success) {
        showToast({
          type: 'success',
          title: 'Cleanup Completed Safely',
          message: res.data.data.message,
        })
        setVerifiedArchive(null)
        setCurrentArchivePackage(null)
        setConfirmationInput('')
        fetchOverviewReport()
        fetchInvoicesTable(1)
        fetchArchiveHistory()
      }
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Cleanup Blocked',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setCleaningActive(false)
    }
  }

  // Historical Archive Search
  const handleHistoricalSearch = async () => {
    try {
      const res = await reportsService.searchArchivedInvoices({
        ...historicalSearch,
        catalogue:
          historicalSearch.catalogue === 'ALL'
            ? undefined
            : historicalSearch.catalogue,
        patternNumber:
          historicalSearch.patternNumber === 'ALL'
            ? undefined
            : historicalSearch.patternNumber,
      })
      if (res.data?.success) {
        setHistoricalInvoices(res.data.data.records || [])
      }
    } catch {
      // Ignore
    }
  }

  // Restore Archive
  const handleRestoreArchive = async (archiveId) => {
    if (
      !window.confirm(
        `Are you sure you want to restore all invoices from Archive ${archiveId} back to active billing?`
      )
    ) {
      return
    }
    try {
      const res = await reportsService.restoreArchive({ archiveId })
      if (res.data?.success) {
        showToast({
          type: 'success',
          title: 'Archive Restored',
          message: res.data.data.message,
        })
        fetchArchiveHistory()
        fetchOverviewReport()
      }
    } catch (err) {
      showToast({
        type: 'danger',
        title: 'Restore Failed',
        message: err.response?.data?.message || err.message,
      })
    }
  }

  return (
    <div className="reports-container">
      {/* Module Header */}
      <div className="reports-header">
        <div>
          <h1 className="reports-title">Reports & Quarterly Archiving</h1>
          <p className="reports-subtitle">
            Real-time sales intelligence, pattern performance & business audit records
          </p>
        </div>

        {/* Action Buttons */}
        <div className="reports-export-actions">
          <ProgressButton
            id="reports-export-excel"
            type="button"
            className="reports-glass-btn"
            onClick={handleExportExcel}
            loadingText="Generating"
          >
            Download Excel
          </ProgressButton>
          <ProgressButton
            id="reports-export-pdf"
            type="button"
            className="reports-glass-btn reports-glass-btn-primary"
            onClick={handleExportPdf}
            loadingText="Rendering"
          >
            Download PDF
          </ProgressButton>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="reports-nav-tabs">
        {[
          { id: 'sales_overview', label: '1. Sales Overview' },
          { id: 'invoices', label: '2. Invoice Reports' },
          { id: 'catalogues', label: '3. Catalogue-wise' },
          { id: 'patterns', label: '4. Pattern-wise' },
          { id: 'dates', label: '5. Date-wise' },
          { id: 'quarterly_archive', label: '6. Quarterly Archive' },
          { id: 'archive_history', label: '7. Archive History' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`reports-tab-pill ${
              activeTab === tab.id ? 'active' : ''
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* FILTER BAR - Always active for reporting sections */}
      {activeTab !== 'quarterly_archive' && activeTab !== 'archive_history' && (
        <div className="reports-filter-bar">
          <div className="reports-filter-group">
            <label className="reports-filter-label">DATE FILTER</label>
            <CustomSelect
              value={filterType}
              onChange={(val) => setFilterType(val)}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'yesterday', label: 'Yesterday' },
                { value: 'this_week', label: 'This Week' },
                { value: 'this_month', label: 'This Month' },
                { value: 'last_month', label: 'Last Month' },
                { value: 'last_3_months', label: 'Last 3 Months' },
                { value: 'custom', label: 'Custom Date Range' },
              ]}
              placeholder="Select date filter..."
            />
          </div>

          {filterType === 'custom' && (
            <>
              <div className="reports-filter-group">
                <label className="reports-filter-label">START DATE</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="reports-input"
                />
              </div>
              <div className="reports-filter-group">
                <label className="reports-filter-label">END DATE</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="reports-input"
                />
              </div>
            </>
          )}

          <div className="reports-filter-group">
            <label className="reports-filter-label">CATALOGUE</label>
            <CustomSelect
              value={selectedCatalogue}
              onChange={(val) => setSelectedCatalogue(val)}
              isSearchable={true}
              options={[
                { value: 'ALL', label: 'All Catalogues' },
                ...catalogues.map((c) => ({
                  value: c.name,
                  label: c.name,
                  badgeText: c.totalStock !== undefined ? `Stock: ${c.totalStock}` : undefined,
                  badgeTone: (c.totalStock ?? 0) > 0 ? 'success' : 'danger',
                })),
              ]}
              placeholder="Type or select catalogue..."
            />
          </div>

          <div className="reports-filter-group">
            <label className="reports-filter-label">PATTERN NO</label>
            <CustomSelect
              value={selectedPattern}
              onChange={(val) => setSelectedPattern(val)}
              isSearchable={true}
              disabled={selectedCatalogue === 'ALL'}
              options={[
                { value: 'ALL', label: 'All Patterns' },
                ...patterns.map((p) => ({
                  value: p.patternNumber,
                  label: p.patternNumber,
                  badgeText: p.quantity !== undefined ? `Qty: ${p.quantity}` : undefined,
                  badgeTone: (p.quantity ?? 0) > 0 ? 'success' : 'danger',
                })),
              ]}
              placeholder={
                selectedCatalogue === 'ALL'
                  ? 'Select catalogue first'
                  : 'Type or select pattern...'
              }
            />
          </div>
        </div>
      )}

      {/* KPI METRICS OVERVIEW */}
      {activeTab !== 'quarterly_archive' && activeTab !== 'archive_history' && (
        loading ? (
          <MetricsSkeleton count={5} height="85px" />
        ) : (
          <div className="reports-kpi-grid">
            <div className="reports-kpi-card">
              <span className="reports-kpi-label">TOTAL BILLS</span>
              <strong className="reports-kpi-value">
                {reportData.summary.totalBills}
              </strong>
            </div>
            <div className="reports-kpi-card">
              <span className="reports-kpi-label">TOTAL ROLLS SOLD</span>
              <strong className="reports-kpi-value">
                {reportData.summary.totalRollsSold}
              </strong>
            </div>
            <div className="reports-kpi-card">
              <span className="reports-kpi-label">TOTAL SALES (INR)</span>
              <strong className="reports-kpi-value">
                ₹{reportData.summary.totalSales.toLocaleString('en-IN')}
              </strong>
            </div>
            <div className="reports-kpi-card">
              <span className="reports-kpi-label">TOTAL DISCOUNTS</span>
              <strong className="reports-kpi-value">
                ₹{reportData.summary.totalDiscount.toLocaleString('en-IN')}
              </strong>
            </div>
            <div className="reports-kpi-card">
              <span className="reports-kpi-label">AVERAGE BILL VALUE</span>
              <strong className="reports-kpi-value">
                ₹{reportData.summary.avgBillValue.toLocaleString('en-IN')}
              </strong>
            </div>
          </div>
        )
      )}

      {/* TAB CONTENT 1: SALES OVERVIEW */}
      {activeTab === 'sales_overview' && (
        loading ? (
          <div className="reports-section-card">
            <h2 className="reports-section-heading">Sales Performance Overview</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <TableSkeleton rows={4} cols={3} />
              <TableSkeleton rows={4} cols={4} />
            </div>
          </div>
        ) : (
        <div className="reports-section-card">
          <h2 className="reports-section-heading">Sales Performance Overview</h2>
          <div className="reports-overview-split">
            {/* Catalogue summary cards */}
            <div className="reports-split-col">
              <h3>Catalogue-wise Share</h3>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Catalogue</th>
                    <th>Rolls Sold</th>
                    <th>Revenue (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.catalogueBreakdown.map((cat) => (
                    <tr key={cat._id}>
                      <td><strong>{cat._id}</strong></td>
                      <td>{cat.rollsCount}</td>
                      <td>₹{cat.revenue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {reportData.catalogueBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center">No sales records found for this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pattern breakdown */}
            <div className="reports-split-col">
              <h3>Top Selling Patterns</h3>
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Catalogue</th>
                    <th>Pattern No</th>
                    <th>Rolls Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.patternBreakdown.slice(0, 8).map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.catalogue}</td>
                      <td><strong>{p.patternNumber}</strong></td>
                      <td>{p.rollsCount}</td>
                      <td>₹{p.revenue.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {reportData.patternBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center">No pattern sales found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      )}

      {/* TAB CONTENT 2: INVOICE REPORTS */}
      {activeTab === 'invoices' && (
        <div className="reports-section-card">
          <h2 className="reports-section-heading">Detailed Invoices Statement</h2>
          <table className="reports-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Mobile</th>
                <th>Rolls</th>
                <th>Subtotal</th>
                <th>Discount</th>
                <th>Final Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td><strong>{inv.invoiceNumber}</strong></td>
                  <td>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                  <td>{inv.customerName}</td>
                  <td>{inv.mobileNumber}</td>
                  <td>{inv.totalQuantity}</td>
                  <td>₹{inv.subtotal}</td>
                  <td>₹{inv.discountAmount}</td>
                  <td><strong>₹{inv.finalTotal}</strong></td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center">No invoices match selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="reports-pagination">
            <button
              disabled={invoicePagination.page <= 1}
              onClick={() => fetchInvoicesTable(invoicePagination.page - 1)}
              className="reports-glass-btn reports-glass-btn-sm"
            >
              Previous
            </button>
            <span>Page {invoicePagination.page} of {invoicePagination.totalPages || 1}</span>
            <button
              disabled={invoicePagination.page >= invoicePagination.totalPages}
              onClick={() => fetchInvoicesTable(invoicePagination.page + 1)}
              className="reports-glass-btn reports-glass-btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: CATALOGUE-WISE REPORTS */}
      {activeTab === 'catalogues' && (
        <div className="reports-section-card">
          <h2 className="reports-section-heading">Catalogue Performance Analytics</h2>
          <table className="reports-table">
            <thead>
              <tr>
                <th>Catalogue Name</th>
                <th>Total Rolls Sold</th>
                <th>Revenue Generated</th>
                <th>Contribution %</th>
              </tr>
            </thead>
            <tbody>
              {reportData.catalogueBreakdown.map((cat) => {
                const totalRev = reportData.summary.totalSales || 1
                const pct = ((cat.revenue / totalRev) * 100).toFixed(1)
                return (
                  <tr key={cat._id}>
                    <td><strong>{cat._id}</strong></td>
                    <td>{cat.rollsCount} rolls</td>
                    <td>₹{cat.revenue.toLocaleString('en-IN')}</td>
                    <td>{pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT 4: PATTERN-WISE REPORTS */}
      {activeTab === 'patterns' && (
        <div className="reports-section-card">
          <h2 className="reports-section-heading">Pattern-wise Volume & Revenue</h2>
          <table className="reports-table">
            <thead>
              <tr>
                <th>Catalogue</th>
                <th>Pattern Number</th>
                <th>Total Quantity Sold</th>
                <th>Subtotal (INR)</th>
              </tr>
            </thead>
            <tbody>
              {reportData.patternBreakdown.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.catalogue}</td>
                  <td><strong>{p.patternNumber}</strong></td>
                  <td>{p.rollsCount} rolls</td>
                  <td>₹{p.revenue.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT 5: DATE-WISE REPORTS */}
      {activeTab === 'dates' && (
        <div className="reports-section-card">
          <h2 className="reports-section-heading">Daily Sales Breakdown</h2>
          <table className="reports-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rolls Sold</th>
                <th>Total Revenue (INR)</th>
              </tr>
            </thead>
            <tbody>
              {reportData.dailySales.map((d, idx) => (
                <tr key={idx}>
                  <td><strong>{d.date}</strong></td>
                  <td>{d.rollsSold} rolls</td>
                  <td>₹{d.totalSales.toLocaleString('en-IN')}</td>
                </tr>
              ))}
              {reportData.dailySales.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center">No daily sales for selected date range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB CONTENT 6: MANUAL QUARTERLY ARCHIVE MANAGEMENT */}
      {activeTab === 'quarterly_archive' && (
        <div className="reports-section-card archive-flow-card">
          <div className="archive-flow-header">
            <h2 className="reports-section-heading">Manual Quarterly Archive & Active Database Cleanup</h2>
            <p className="archive-notice">
              This process is strictly manual and administrator-controlled. No scheduled or automated deletions ever take place.
            </p>
          </div>

          {/* STEP 1 */}
          <div className="archive-step-box">
            <div className="step-badge">STEP 1</div>
            <div className="step-content">
              <h3>Export & Download 3-Month Data</h3>
              <p>Select the quarter date range to compile complete Excel, PDF, JSON, and ZIP packages.</p>
              <div className="archive-date-inputs">
                <div>
                  <label>Start Date:</label>
                  <input
                    type="date"
                    value={archiveStartDate}
                    onChange={(e) => setArchiveStartDate(e.target.value)}
                    className="reports-input"
                  />
                </div>
                <div>
                  <label>End Date:</label>
                  <input
                    type="date"
                    value={archiveEndDate}
                    onChange={(e) => setArchiveEndDate(e.target.value)}
                    className="reports-input"
                  />
                </div>
                <button
                  type="button"
                  className="reports-glass-btn reports-glass-btn-primary"
                  onClick={handleExportQuarterlyArchive}
                  disabled={archivingLoading}
                >
                  {archivingLoading ? 'Generating & Downloading...' : 'EXPORT & DOWNLOAD 3-MONTH DATA'}
                </button>
              </div>

              {currentArchivePackage && (
                <div className="archive-summary-box">
                  <h4>Archive Package Generated: {currentArchivePackage.archiveId}</h4>
                  <ul>
                    <li>Invoices Compiled: <strong>{currentArchivePackage.manifest.invoiceCount}</strong></li>
                    <li>Total Rolls Quantity: <strong>{currentArchivePackage.manifest.totalQuantity}</strong></li>
                    <li>Total Financial Revenue: <strong>₹{currentArchivePackage.manifest.totalSales}</strong></li>
                    <li>SHA-256 Manifest Hash: <code>{currentArchivePackage.manifest.manifestChecksum}</code></li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* STEP 2 */}
          <div className={`archive-step-box ${!currentArchivePackage ? 'disabled' : ''}`}>
            <div className="step-badge">STEP 2</div>
            <div className="step-content">
              <h3>Verify Archive Integrity</h3>
              <p>Verify that downloaded data, record counts, and financial totals match audit logs before any cleanup is allowed.</p>
              <button
                type="button"
                className="reports-glass-btn"
                disabled={!currentArchivePackage}
                onClick={handleVerifyArchive}
              >
                Verify Downloaded Archive Integrity
              </button>

              {verifiedArchive && (
                <div className="verification-success-alert">
                  ✓ Archive Verified! Status: <strong>{verifiedArchive.status}</strong>. Manifest matched.
                </div>
              )}
            </div>
          </div>

          {/* STEP 3 */}
          <div className={`archive-step-box step-danger ${!verifiedArchive ? 'disabled' : ''}`}>
            <div className="step-badge">STEP 3</div>
            <div className="step-content">
              <h3>Manual Cleanup Confirmation</h3>
              <p>
                To clean detailed records from active view, paste the exact confirmation phrase below.
                (Note: Lightweight metadata and invoice numbering will remain intact).
              </p>
              <blockquote className="required-consent-quote">
                I have safely downloaded and verified this quarterly archive. I understand that eligible detailed invoice records will be removed from the active database.
              </blockquote>

              <textarea
                rows={2}
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="Paste the exact confirmation phrase here..."
                className="consent-textarea"
                disabled={!verifiedArchive}
              />

              <button
                type="button"
                className="reports-glass-btn reports-glass-btn-danger"
                onClick={handlePerformCleanup}
                disabled={!verifiedArchive || cleaningActive}
              >
                {cleaningActive ? 'Executing Safe Cleanup...' : 'CONFIRM & CLEAN ACTIVE DATABASE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 7: ARCHIVE HISTORY & RESTORE */}
      {activeTab === 'archive_history' && (
        <div className="reports-section-card">
          <h2 className="reports-section-heading">Historical Archive Registry & Search</h2>
          <table className="reports-table">
            <thead>
              <tr>
                <th>Archive ID</th>
                <th>Quarter Label</th>
                <th>Period</th>
                <th>Invoices</th>
                <th>Total Revenue</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {archiveHistory.map((item) => (
                <tr key={item._id}>
                  <td><code>{item.archiveId}</code></td>
                  <td><strong>{item.quarterLabel}</strong></td>
                  <td>
                    {new Date(item.startDate).toLocaleDateString()} to{' '}
                    {new Date(item.endDate).toLocaleDateString()}
                  </td>
                  <td>{item.invoiceCount}</td>
                  <td>₹{item.totalSales.toLocaleString('en-IN')}</td>
                  <td>
                    <span className={`status-pill status-${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="reports-glass-btn reports-glass-btn-sm"
                      onClick={() => handleRestoreArchive(item.archiveId)}
                    >
                      Restore Archive
                    </button>
                  </td>
                </tr>
              ))}
              {archiveHistory.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center">No quarterly archives registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
