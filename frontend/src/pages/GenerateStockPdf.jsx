import { useState, useEffect } from 'react'
import {
  catalogueService,
  formatCatalogueLabel,
  getCatalogueCoverImage,
} from '../services/catalogueService.js'
import { downloadStockOrderPdf } from '../utils/exportStockPdf.js'
import { IMAGE_MANIFEST } from '../assets/imageManifest.js'
import { useToast } from '../context/ToastContext.jsx'
import { useDownloadProgress } from '../context/DownloadProgressContext.jsx'
import '../styles/GenerateStockPdf.css'

export function GenerateStockPdf() {
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()
  const [catalogues, setCatalogues] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingSlug, setDownloadingSlug] = useState(null)
  const [isBulkDownloading, setIsBulkDownloading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })

  useEffect(() => {
    loadCatalogues()
  }, [])

  const loadCatalogues = async () => {
    try {
      setLoading(true)
      const res = await catalogueService.getAllCatalogues()
      const list = res.data?.data?.catalogues || []
      setCatalogues(list)
    } catch {
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to load catalogues.',
      })
    } finally {
      setLoading(false)
    }
  }

  // Helper to fetch complete items with manifest fallback
  const fetchCatalogueFullItems = async (slug) => {
    try {
      const res = await catalogueService.getCatalogueBySlug(slug)
      const serverItems = res.data?.data?.items || []
      const manifestList = IMAGE_MANIFEST[slug] || []

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

        return manifestList.map((m, idx) => {
          const seq = Number(m.sequenceNumber) || idx + 1
          const targetPat = String(m.patternNumber).trim()
          const matched = serverByPat.get(targetPat) || serverBySeq.get(seq) || {}
          return {
            ...matched,
            sequenceNumber: seq,
            patternNumber: targetPat,
            imagePath: m.imagePath || matched.imagePath || '',
            quantity: Number(matched.quantity) || 0,
          }
        })
      }
      return serverItems
    } catch (err) {
      console.error(`Error loading items for ${slug}`, err)
      return []
    }
  }

  // Generate single catalogue PDF
  const handleGeneratePdf = async (cat, isManualDeduction = true) => {
    if (downloadingSlug || isBulkDownloading) return
    setDownloadingSlug(cat.slug)
    const displayName = formatCatalogueLabel(cat.name || cat.slug)

    try {
      const btnId = `gen-pdf-${cat.slug}`
      await trackDownload(btnId, async () => {
        const items = await fetchCatalogueFullItems(cat.slug)
        if (!items || items.length === 0) {
          throw new Error('No patterns found in this catalogue.')
        }

        await downloadStockOrderPdf({
          catalogueSlug: displayName,
          reportTitle: `${displayName} – Employee Physical Stock Check / Deduction Sheet (${items.length} Patterns)`,
          items,
          fileName: `${cat.slug}_Stock_Deduction_Sheet.pdf`,
          isManualDeductionMode: isManualDeduction,
        })
      })

      showToast({
        type: 'success',
        title: 'PDF Generated',
        message: `${displayName} deduction sheet generated successfully.`,
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Download Failed',
        message: error.message || 'Could not generate PDF sheet.',
      })
    } finally {
      setDownloadingSlug(null)
    }
  }

  // Bulk generate PDF for all catalogues
  const handleBulkGenerateAll = async () => {
    if (downloadingSlug || isBulkDownloading || catalogues.length === 0) return
    setIsBulkDownloading(true)
    setBulkProgress({ current: 0, total: catalogues.length })

    try {
      for (let i = 0; i < catalogues.length; i++) {
        const cat = catalogues[i]
        setBulkProgress({ current: i + 1, total: catalogues.length })
        const displayName = formatCatalogueLabel(cat.name || cat.slug)
        const items = await fetchCatalogueFullItems(cat.slug)

        if (items && items.length > 0) {
          await downloadStockOrderPdf({
            catalogueSlug: displayName,
            reportTitle: `${displayName} – Employee Physical Stock Check / Deduction Sheet (${items.length} Patterns)`,
            items,
            fileName: `${cat.slug}_Stock_Deduction_Sheet.pdf`,
            isManualDeductionMode: true,
          })
          // Small delay between downloads so browser doesn't block multiple files
          await new Promise((r) => setTimeout(r, 600))
        }
      }

      showToast({
        type: 'success',
        title: 'All PDFs Generated',
        message: `Successfully generated deduction sheets for all ${catalogues.length} catalogues.`,
      })
    } catch (err) {
      console.error(err)
      showToast({
        type: 'error',
        title: 'Bulk Export Error',
        message: 'An error occurred during bulk generation.',
      })
    } finally {
      setIsBulkDownloading(false)
      setBulkProgress({ current: 0, total: 0 })
    }
  }

  return (
    <div className="generate-pdf-page">
      <div className="generate-pdf-header">
        <div>
          <h1 className="generate-pdf-title">Generate Stock Deduction Sheets</h1>
          <p className="generate-pdf-subtitle">
            Download print-ready hard copy sheets with Image, Pattern No, Current Qty &amp; blank columns (Minus / Out, Final Left, Remarks) for warehouse &amp; staff manual deduction.
          </p>
        </div>

        <button
          type="button"
          className="bulk-generate-all-btn"
          disabled={loading || isBulkDownloading || downloadingSlug !== null}
          onClick={handleBulkGenerateAll}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>
            {isBulkDownloading
              ? `Generating (${bulkProgress.current}/${bulkProgress.total})...`
              : 'Download All Catalogues PDF (Bulk)'}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="pdf-grid-loading">
          <div className="loading-spinner" />
          <p>Loading catalogues...</p>
        </div>
      ) : catalogues.length === 0 ? (
        <div className="pdf-empty-state">
          <p>No catalogues available.</p>
        </div>
      ) : (
        <div className="catalogue-pdf-grid">
          {catalogues.map((cat) => {
            const displayName = formatCatalogueLabel(cat.name || cat.slug)
            const coverImage = getCatalogueCoverImage(cat.name || cat.slug)
            const isThisDownloading = downloadingSlug === cat.slug

            return (
              <div key={cat.slug} className="catalogue-pdf-card">
                <div className="card-top-preview">
                  {coverImage ? (
                    <img
                      src={coverImage}
                      alt={displayName}
                      className="card-cover-img"
                    />
                  ) : (
                    <div className="card-cover-fallback">
                      <span>{displayName.slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="card-badge-info">
                    <span className="pattern-count-badge">
                      {cat.totalPatterns || 0} Patterns
                    </span>
                    <span className="stock-count-badge">
                      {cat.totalStock || 0} Rolls in Stock
                    </span>
                  </div>
                </div>

                <div className="card-details">
                  <h3 className="card-title">{displayName}</h3>
                </div>

                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-download-deduction"
                    disabled={isThisDownloading || isBulkDownloading}
                    onClick={() => handleGeneratePdf(cat, true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                    <span>
                      {isThisDownloading ? 'Generating PDF...' : 'Deduction Sheet PDF'}
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
