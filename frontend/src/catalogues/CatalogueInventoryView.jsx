import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { InventorySummary } from '../components/InventorySummary.jsx'
import { SearchBar } from '../components/SearchBar.jsx'
import { InventoryTable } from '../components/InventoryTable.jsx'
import { LottieIcon } from '../components/LottieIcon.jsx'
import { inventoryService } from '../services/inventoryService.js'
import { formatCatalogueLabel } from '../services/catalogueService.js'
import { useToast } from '../context/ToastContext.jsx'
import { useDownloadProgress, ProgressButton } from '../context/DownloadProgressContext.jsx'
import { IMAGE_MANIFEST } from '../assets/imageManifest.js'
import { downloadStockOrderPdf } from '../utils/exportStockPdf.js'
import { MetricsSkeleton, TableSkeleton } from '../components/Skeleton.jsx'
import '../styles/CatalogueView.css'

export function CatalogueInventoryView({
  slug,
  title,
  externalSearch = '',
  onSearchChange,
  onStatsUpdated,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const isRollDetailsPage = location.pathname.startsWith('/roll-details')
  const [catalogue, setCatalogue] = useState(null)
  const [items, setItems] = useState([])
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)

  const getFilterFromSearch = useCallback(() => {
    const params = new URLSearchParams(location.search)
    const raw = (
      params.get('filter') ||
      params.get('view') ||
      location.state?.stockFilter ||
      ''
    )
      .toUpperCase()
      .replace(/-/g, '_')

    if (
      raw === 'OUT_OF_STOCK' ||
      raw === 'OUTOFSTOCK' ||
      raw === 'ZERO' ||
      raw === 'OOS'
    ) {
      return 'OUT_OF_STOCK'
    }
    if (
      raw === 'LOW_STOCK' ||
      raw === 'LOW' ||
      raw === 'BELOW' ||
      raw === 'THRESHOLD'
    ) {
      return 'LOW_STOCK'
    }
    if (raw === 'BOTH' || raw === 'ALERTS' || raw === 'ALL_ALERTS') {
      return 'BOTH'
    }
    return null
  }, [location.search, location.state])

  const [stockFilterView, setStockFilterView] = useState(() =>
    getFilterFromSearch()
  )

  useEffect(() => {
    const urlFilter = getFilterFromSearch()
    setStockFilterView(urlFilter)
  }, [getFilterFromSearch])

  const handleStockFilterChange = (mode) => {
    setStockFilterView(mode)
    const params = new URLSearchParams(location.search)
    if (mode) {
      params.set('filter', mode)
    } else {
      params.delete('filter')
      params.delete('view')
    }
    const queryStr = params.toString() ? `?${params.toString()}` : ''
    navigate(`${location.pathname}${queryStr}`, { replace: true })
  }
  const [lowStockThreshold, setLowStockThreshold] = useState(10)
  const [internalSearch, setInternalSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [downloadingPdfType, setDownloadingPdfType] = useState(null)
  const [pendingMap, setPendingMap] = useState({})
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()

  const onStatsUpdatedRef = useRef(onStatsUpdated)
  useEffect(() => {
    onStatsUpdatedRef.current = onStatsUpdated
  }, [onStatsUpdated])

  const searchQuery =
    onSearchChange !== undefined ? externalSearch : internalSearch
  const handleSearch =
    onSearchChange !== undefined ? onSearchChange : setInternalSearch

  const fetchCatalogueInventory = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const res = await inventoryService.getInventoryByCatalogue(slug, 10)
        const data = res.data?.data
        const serverItems = data?.items || []
        const manifestList = IMAGE_MANIFEST[slug] || []

        let hasManifestDiff = serverItems.length !== manifestList.length
        let mergedItems = serverItems

        if (manifestList.length > 0) {
          const serverByPat = new Map()
          const serverBySeq = new Map()
          for (const item of serverItems) {
            serverByPat.set(String(item.patternNumber).trim(), item)
            if (item.sequenceNumber) {
              const prev = serverBySeq.get(Number(item.sequenceNumber))
              if (!prev || (item.quantity || 0) > (prev.quantity || 0)) {
                serverBySeq.set(Number(item.sequenceNumber), item)
              }
            }
          }

          mergedItems = manifestList.map((m, idx) => {
            const seq = Number(m.sequenceNumber) || idx + 1
            const targetPat = String(m.patternNumber).trim()
            const matched =
              serverByPat.get(targetPat) || serverBySeq.get(seq) || {}
            const targetImg = m.imagePath || matched.imagePath || ''

            if (
              String(matched.patternNumber || '') !== targetPat ||
              matched.imagePath !== targetImg
            ) {
              hasManifestDiff = true
            }

            return {
              ...matched,
              _id: matched._id || `${slug}_${targetPat}`,
              sequenceNumber: seq,
              patternNumber: targetPat,
              imagePath: targetImg,
              quantity: Number(matched.quantity) || 0,
            }
          })
        }

        setCatalogue(data?.catalogue || null)
        setItems(mergedItems)

        if (hasManifestDiff) {
          await inventoryService
            .seedInventory(IMAGE_MANIFEST)
            .catch(() => {})
          onStatsUpdatedRef.current?.()
        }
      } catch (err) {
        showToast(
          'error',
          err.response?.data?.message || `Failed to load ${slug} inventory.`
        )
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [slug, showToast]
  )

  const fetchLogs = useCallback(async () => {
    try {
      const res = await inventoryService.getInventoryLogs(slug, 20)
      setLogs(res.data?.data?.logs || [])
    } catch {
      // Ignore if role does not have log access
    }
  }, [slug])

  useEffect(() => {
    fetchCatalogueInventory(false)
  }, [fetchCatalogueInventory])

  useEffect(() => {
    if (showLogs) {
      fetchLogs()
    }
  }, [showLogs, fetchLogs])

  // Real-time Server-Sent Events (SSE) subscription for multi-employee sync
  const catalogueId = catalogue?._id
  useEffect(() => {
    if (!catalogueId) return

    const eventSource = new EventSource('/api/inventory/stream', {
      withCredentials: true,
    })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (
          payload.type === 'INVENTORY_UPDATED' &&
          payload.catalogueId === catalogueId
        ) {
          setItems((prevItems) =>
            prevItems.map((it) =>
              it.patternNumber === payload.patternNumber
                ? {
                    ...it,
                    quantity: payload.quantity,
                    updatedAt: payload.updatedAt,
                  }
                : it
            )
          )
          onStatsUpdatedRef.current?.()
        }
      } catch {
        // Ignore malformed SSE heartbeats
      }
    }

    return () => {
      eventSource.close()
    }
  }, [catalogueId])

  // Optimistic UI quantity update with rollback on error
  const handleQuantityChange = async (
    patternNumber,
    actionType,
    amount = 1
  ) => {
    if (pendingMap[patternNumber]) return

    const targetItem = items.find((i) => i.patternNumber === patternNumber)
    if (!targetItem) return

    const step = Math.max(1, Math.floor(Number(amount) || 1))
    const delta = actionType === 'INCREASE' ? step : -step
    const previousQuantity = targetItem.quantity
    const optimisticQuantity = previousQuantity + delta

    if (optimisticQuantity < 0) return

    setPendingMap((prev) => ({ ...prev, [patternNumber]: true }))

    // Immediate optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.patternNumber === patternNumber
          ? { ...item, quantity: optimisticQuantity }
          : item
      )
    )

    try {
      const res = await inventoryService.updatePatternQuantity(
        catalogue?._id || slug,
        patternNumber,
        actionType,
        step
      )
      const serverItem = res.data?.data?.item
      const finalQty = serverItem ? serverItem.quantity : optimisticQuantity
      if (serverItem) {
        setItems((prev) =>
          prev.map((item) =>
            item.patternNumber === patternNumber
              ? { ...item, quantity: serverItem.quantity }
              : item
          )
        )
      }
      showToast({
        type: 'success',
        title: 'Stock Updated',
        message: `Pattern ${patternNumber}: ${previousQuantity} → ${finalQty} rolls (${actionType === 'INCREASE' ? `+${step}` : `-${step}`})`,
        duration: 2400,
      })
      onStatsUpdatedRef.current?.()
      if (showLogs) fetchLogs()
    } catch (err) {
      // Rollback optimistic update on failure
      setItems((prev) =>
        prev.map((item) =>
          item.patternNumber === patternNumber
            ? { ...item, quantity: previousQuantity }
            : item
        )
      )
      showToast(
        'error',
        err.response?.data?.message ||
          `Could not update Pattern ${patternNumber}. Change rolled back.`
      )
    } finally {
      setPendingMap((prev) => {
        const next = { ...prev }
        delete next[patternNumber]
        return next
      })
    }
  }

  const handleSyncManifest = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      await inventoryService.seedInventory(IMAGE_MANIFEST)
      await fetchCatalogueInventory(true)
      onStatsUpdatedRef.current?.()
      showToast('success', `${slug} images & patterns synchronized.`)
    } catch (err) {
      showToast(
        'error',
        err.response?.data?.message || 'Failed to synchronize patterns.'
      )
    } finally {
      setSyncing(false)
    }
  }

  // Compute live summary directly from current items state
  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalPatterns += 1
        acc.totalStock += item.quantity
        if (item.quantity === 0) {
          acc.outOfStock += 1
        } else if (item.quantity < lowStockThreshold) {
          acc.lowStock += 1
        }
        return acc
      },
      { totalPatterns: 0, totalStock: 0, outOfStock: 0, lowStock: 0 }
    )
  }, [items, lowStockThreshold])

  const filteredItems = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase()
    if (!q) return items
    const shortCode = slug.toUpperCase() === 'SELFIE_POINT' ? 'sp' : slug.toLowerCase()
    return items.filter((item) => {
      const pat = String(item.patternNumber).toLowerCase()
      const fullLabel = `${slug.toLowerCase()} ${pat}`
      const compactLabel = `${slug.toLowerCase()}${pat}`
      const shortLabel = `${shortCode} ${pat}`
      const shortCompact = `${shortCode}${pat}`
      return (
        pat.includes(q) ||
        fullLabel.includes(q) ||
        compactLabel.includes(q) ||
        shortLabel.includes(q) ||
        shortCompact.includes(q)
      )
    })
  }, [items, searchQuery, slug])

  const outOfStockItems = useMemo(
    () => items.filter((item) => item.quantity === 0),
    [items]
  )

  const lowStockItems = useMemo(
    () =>
      items.filter(
        (item) => item.quantity > 0 && item.quantity < lowStockThreshold
      ),
    [items, lowStockThreshold]
  )

  const displayName = formatCatalogueLabel(catalogue?.name || slug)

  const handleDownloadPdf = async (type) => {
    if (downloadingPdfType) return
    setDownloadingPdfType(type)
    const btnId = `inventory-download-pdf-${type}`

    try {
      await trackDownload(btnId, async () => {
        if (type === 'FULL') {
          await downloadStockOrderPdf({
            catalogueSlug: displayName,
            reportTitle: `${displayName} – Complete Inventory Report (${filteredItems.length} Patterns)`,
            items: filteredItems,
            fileName: `${slug}_Full_Inventory_Report.pdf`,
          })
        } else if (type === 'OUT_OF_STOCK') {
          await downloadStockOrderPdf({
            catalogueSlug: displayName,
            reportTitle: `${displayName} – Out of Stock Patterns (Quantity = 0)`,
            items: outOfStockItems,
            fileName: `${slug}_Out_Of_Stock_Order.pdf`,
          })
        } else if (type === 'LOW_STOCK') {
          await downloadStockOrderPdf({
            catalogueSlug: displayName,
            reportTitle: `${displayName} – Low Stock Patterns (Quantity Below ${lowStockThreshold})`,
            items: lowStockItems,
            fileName: `${slug}_Low_Stock_Below_${lowStockThreshold}_Order.pdf`,
          })
        }
      })
      showToast('success', 'PDF downloaded successfully.')
    } catch {
      showToast('error', 'Failed to generate PDF.')
    } finally {
      setDownloadingPdfType(null)
    }
  }

  if (loading) {
    return (
      <div className="catalogue-view-container">
        <div style={{ marginBottom: '20px' }}>
          <div style={{ height: '24px', width: '220px', background: '#e2e8f0', borderRadius: '6px', marginBottom: '8px' }} className="skeleton-shimmer" />
          <div style={{ height: '14px', width: '320px', background: '#f1f5f9', borderRadius: '4px' }} className="skeleton-shimmer" />
        </div>
        <MetricsSkeleton count={4} height="88px" />
        <div style={{ height: '42px', width: '100%', background: '#f1f5f9', borderRadius: '8px', marginBottom: '16px' }} className="skeleton-shimmer" />
        <TableSkeleton rows={8} cols={4} />
      </div>
    )
  }

  // Dedicated Page View for Out of Stock & Low Stock
  if (stockFilterView) {
    return (
      <div className="catalogue-view-container">
        <div className="stock-status-page-header">
          <div>
            <h2 className="catalogue-view-title">
              {displayName} – Out of Stock &amp; Low Stock Report
            </h2>
            <p className="catalogue-view-subtitle">
              Out of Stock (Quantity = 0) and Low Stock (Quantity below{' '}
              {lowStockThreshold})
            </p>
          </div>

          <div className="stock-status-tabs">
            <button
              type="button"
              className={`stock-tab-btn ${
                stockFilterView === 'BOTH' ? 'active' : ''
              }`}
              onClick={() => handleStockFilterChange('BOTH')}
            >
              All Alerts ({outOfStockItems.length + lowStockItems.length})
            </button>
            <button
              type="button"
              className={`stock-tab-btn stock-tab-danger ${
                stockFilterView === 'OUT_OF_STOCK' ? 'active' : ''
              }`}
              onClick={() => handleStockFilterChange('OUT_OF_STOCK')}
            >
              Out of Stock ({outOfStockItems.length})
            </button>
            <button
              type="button"
              className={`stock-tab-btn stock-tab-warning ${
                stockFilterView === 'LOW_STOCK' ? 'active' : ''
              }`}
              onClick={() => handleStockFilterChange('LOW_STOCK')}
            >
              Below {lowStockThreshold} ({lowStockItems.length})
            </button>
            <button
              type="button"
              className="catalogue-action-btn"
              onClick={() => handleStockFilterChange(null)}
            >
              ← Back to {displayName} Inventory
            </button>
          </div>
        </div>

        {(stockFilterView === 'OUT_OF_STOCK' || stockFilterView === 'BOTH') && (
          <div className="stock-status-section">
            <div className="stock-section-banner stock-section-danger">
              <h3>Out of Stock Patterns (Quantity = 0)</h3>
              <div className="stock-banner-right">
                <span>{outOfStockItems.length} patterns</span>
                <button
                  type="button"
                  className="stock-download-pdf-btn stock-download-danger"
                  disabled={
                    outOfStockItems.length === 0 ||
                    downloadingPdfType === 'OUT_OF_STOCK'
                  }
                  onClick={() => handleDownloadPdf('OUT_OF_STOCK')}
                >
                  {downloadingPdfType === 'OUT_OF_STOCK'
                    ? 'Generating PDF...'
                    : 'Download PDF'}
                </button>
              </div>
            </div>
            <InventoryTable
              items={outOfStockItems}
              catalogueSlug={slug}
              pendingMap={pendingMap}
              onQuantityChange={handleQuantityChange}
              readOnly={isRollDetailsPage}
            />
          </div>
        )}

        {(stockFilterView === 'LOW_STOCK' || stockFilterView === 'BOTH') && (
          <div className="stock-status-section">
            <div className="stock-section-banner stock-section-warning">
              <h3>
                Low Stock Patterns (Quantity Below {lowStockThreshold})
              </h3>
              <div className="stock-banner-right">
                <span>{lowStockItems.length} patterns</span>
                <button
                  type="button"
                  className="stock-download-pdf-btn stock-download-warning"
                  disabled={
                    lowStockItems.length === 0 ||
                    downloadingPdfType === 'LOW_STOCK'
                  }
                  onClick={() => handleDownloadPdf('LOW_STOCK')}
                >
                  {downloadingPdfType === 'LOW_STOCK'
                    ? 'Generating PDF...'
                    : 'Download PDF'}
                </button>
              </div>
            </div>
            <InventoryTable
              items={lowStockItems}
              catalogueSlug={slug}
              pendingMap={pendingMap}
              onQuantityChange={handleQuantityChange}
              readOnly={isRollDetailsPage}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="catalogue-view-container">
      <div className="catalogue-view-header">
        <div>
          <h2 className="catalogue-view-title">
            {formatCatalogueLabel(title) || `${displayName} Roll Inventory`}
          </h2>
          <p className="catalogue-view-subtitle">
            Real-time stock management for {displayName} patterns
          </p>
        </div>

        <div className="catalogue-header-actions">
          <button
            type="button"
            className="catalogue-action-btn"
            onClick={handleSyncManifest}
            disabled={syncing}
          >
            {syncing ? 'Syncing Images...' : 'Sync Images'}
          </button>
          <button
            type="button"
            className="catalogue-action-btn"
            onClick={() => setShowLogs((prev) => !prev)}
          >
            {showLogs ? 'Hide Activity Logs' : 'Stock History'}
          </button>
        </div>
      </div>

      <InventorySummary
        summary={summary}
        lowStockThreshold={lowStockThreshold}
        onThresholdChange={setLowStockThreshold}
        onViewStockStatus={(mode) => handleStockFilterChange(mode)}
      />

      <div className="catalogue-toolbar-row">
        <SearchBar
          value={searchQuery}
          onChange={handleSearch}
          placeholder={`Search ${displayName} pattern number...`}
        />
        <div className="catalogue-toolbar-right">
          <span className="catalogue-count-label">
            Showing <strong>{filteredItems.length}</strong> of{' '}
            <strong>{items.length}</strong> patterns
          </span>
          <ProgressButton
            id="inventory-download-pdf-FULL"
            type="button"
            className="catalogue-download-all-btn"
            disabled={filteredItems.length === 0}
            onClick={() => handleDownloadPdf('FULL')}
            loadingText="Downloading"
          >
            {`Download ${displayName} PDF`}
          </ProgressButton>
        </div>
      </div>

      <InventoryTable
        items={filteredItems}
        catalogueSlug={slug}
        pendingMap={pendingMap}
        onQuantityChange={handleQuantityChange}
        readOnly={isRollDetailsPage}
      />

      {showLogs && (
        <div className="inventory-logs-panel">
          <h3 className="inventory-logs-title">
            Recent {displayName} Stock Modifications
          </h3>
          {logs.length === 0 ? (
            <p className="inventory-logs-empty">
              No stock modifications recorded yet for {displayName}.
            </p>
          ) : (
            <div className="inventory-logs-scroll">
              <table className="inventory-logs-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Pattern</th>
                    <th>Action</th>
                    <th>Previous → New</th>
                    <th>Updated By</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td>{new Date(log.createdAt).toLocaleString()}</td>
                      <td>
                        <strong>{log.patternNumber}</strong>
                      </td>
                      <td>
                        <span
                          className={`log-badge log-badge-${log.actionType.toLowerCase()}`}
                        >
                          {log.actionType === 'INCREASE'
                            ? `+${log.changeAmount || 1}`
                            : `-${log.changeAmount || 1}`}{' '}
                          {log.actionType}
                          {log.invoiceNumber ? ` (${log.invoiceNumber})` : ''}
                        </span>
                      </td>
                      <td>
                        {log.previousQuantity} → <strong>{log.newQuantity}</strong>
                      </td>
                      <td>{log.updatedBy?.email || 'Admin'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
