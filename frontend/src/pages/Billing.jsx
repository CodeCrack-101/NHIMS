import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { billingService } from '../services/billingService.js'
import { formatCatalogueLabel } from '../services/catalogueService.js'
import { useToast } from '../context/ToastContext.jsx'
import { useDownloadProgress, ProgressButton } from '../context/DownloadProgressContext.jsx'
import { LottieIcon } from '../components/LottieIcon.jsx'
import {
  downloadInvoicePdf,
  printInvoiceDocument,
} from '../utils/exportInvoicePdf.js'
import { sendInvoiceImageToWhatsApp } from '../utils/whatsappHelper.js'
import { TableSkeleton, FormSkeleton } from '../components/Skeleton.jsx'
import '../styles/Billing.css'

let rowIdSeq = 1
const createEmptyBillingRow = () => ({
  rowId: `row_${Date.now()}_${rowIdSeq++}`,
  catalogueId: '',
  catalogueName: '',
  catalogueSlug: '',
  patternId: '',
  patternNumber: '',
  availableStock: 0,
  quantity: 1,
  rate: 1250,
  imagePath: '',
})

const round2 = (num) => {
  const n = Number(num)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const formatINR = (val) => {
  const n = Number(val) || 0
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Type or select...',
  disabled = false,
  hasError = false,
  emptyText = 'No matching options',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const wrapperRef = useRef(null)

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  )

  // Keep input text synced with selected option when not actively typing
  useEffect(() => {
    if (!isTyping) {
      setQuery(selectedOption ? selectedOption.label : '')
    }
  }, [selectedOption, isTyping])

  const filteredOptions = useMemo(() => {
    if (!isTyping) return options
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        String(opt.searchKeywords || '')
          .toLowerCase()
          .includes(q)
    )
  }, [options, query, isTyping])

  const commitTypedQueryIfNeeded = useCallback(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setIsTyping(false)
      setQuery(selectedOption ? selectedOption.label : '')
      return
    }
    const exactMatch = options.find(
      (o) =>
        !o.disabled &&
        (o.label.toLowerCase() === q || String(o.value).toLowerCase() === q)
    )
    if (exactMatch) {
      setIsTyping(false)
      setQuery(exactMatch.label)
      if (String(exactMatch.value) !== String(value)) {
        onChange(exactMatch.value)
      }
      return
    }
    const firstMatch = filteredOptions.find((o) => !o.disabled)
    if (firstMatch && isTyping) {
      setIsTyping(false)
      setQuery(firstMatch.label)
      if (String(firstMatch.value) !== String(value)) {
        onChange(firstMatch.value)
      }
    } else {
      setIsTyping(false)
      setQuery(selectedOption ? selectedOption.label : '')
    }
  }, [query, options, filteredOptions, selectedOption, isTyping, value, onChange])

  // Close dropdown on outside click and commit typed match
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        if (open) {
          commitTypedQueryIfNeeded()
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, commitTypedQueryIfNeeded])

  const handleSelectOption = (opt) => {
    if (opt.disabled) return
    setIsTyping(false)
    setQuery(opt.label)
    setOpen(false)
    onChange(opt.value)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const firstAvailable = filteredOptions.find((o) => !o.disabled)
      if (firstAvailable) {
        handleSelectOption(firstAvailable)
      }
    } else if (e.key === 'Escape') {
      setIsTyping(false)
      setOpen(false)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={`billing-combo ${disabled ? 'combo-disabled' : ''}`}
    >
      <div
        className={`billing-combo-control ${open ? 'combo-open' : ''} ${
          hasError ? 'input-err' : ''
        }`}
      >
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={(e) => {
            if (!disabled) {
              setOpen(true)
              setIsTyping(false)
              e.target.select()
            }
          }}
          onChange={(e) => {
            const val = e.target.value
            setQuery(val)
            setIsTyping(true)
            if (!open) setOpen(true)

            // Auto-select immediately if exact match typed
            const clean = val.trim().toLowerCase()
            if (clean) {
              const exact = options.find(
                (o) =>
                  !o.disabled &&
                  (o.label.toLowerCase() === clean ||
                    String(o.value).toLowerCase() === clean)
              )
              if (exact && String(exact.value) !== String(value)) {
                onChange(exact.value)
              }
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              if (
                wrapperRef.current &&
                !wrapperRef.current.contains(document.activeElement)
              ) {
                commitTypedQueryIfNeeded()
                setOpen(false)
              }
            }, 120)
          }}
          onKeyDown={handleKeyDown}
          className="billing-combo-input"
        />
        {value && !disabled && (
          <button
            type="button"
            className="billing-combo-clear"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              setIsTyping(false)
              setQuery('')
              onChange('')
              setOpen(true)
            }}
            title="Clear selection"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          className="billing-combo-arrow"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsTyping(false)
              setOpen((prev) => !prev)
            }
          }}
          aria-label="Toggle options"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && !disabled && (
        <ul className="billing-combo-menu" role="listbox">
          {filteredOptions.length === 0 ? (
            <li className="billing-combo-empty">{emptyText}</li>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value)
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`billing-combo-item ${
                    isSelected ? 'combo-item-selected' : ''
                  } ${opt.disabled ? 'combo-item-disabled' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectOption(opt)
                  }}
                >
                  <span className="combo-item-main">{opt.label}</span>
                  {opt.badgeText && (
                    <span
                      className={`combo-item-badge combo-badge-${
                        opt.badgeTone || 'neutral'
                      }`}
                    >
                      {opt.badgeText}
                    </span>
                  )}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}

export function Billing() {
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()

  // Catalogues & per-catalogue pattern cache
  const [catalogues, setCatalogues] = useState([])
  const [patternsByCatalogue, setPatternsByCatalogue] = useState({})
  const [loadingPatternsMap, setLoadingPatternsMap] = useState({})
  const [initialLoading, setInitialLoading] = useState(true)

  // Invoice header metadata
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('NH-INV-AUTO')
  const [invoiceDateStr] = useState(() =>
    new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  )

  // Customer info
  const [customerName, setCustomerName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [customerErrors, setCustomerErrors] = useState({})

  // Billing rows
  const [rows, setRows] = useState(() => [createEmptyBillingRow()])
  const [rowErrors, setRowErrors] = useState({})

  // Discount state
  const [discountType, setDiscountType] = useState('PERCENTAGE') // 'PERCENTAGE' | 'FIXED'
  const [discountValue, setDiscountValue] = useState('')

  // GST State (Default 0, optional 18% or custom)
  const [taxRate, setTaxRate] = useState(0)

  // Submission & confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [submittingBill, setSubmittingBill] = useState(false)
  const idempotencyKeyRef = useRef(`idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`)

  // Invoice History & Search state
  const [invoices, setInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(true)
  const [historySearch, setHistorySearch] = useState('')
  const [historyDate, setHistoryDate] = useState('')
  const [selectedInvoiceModal, setSelectedInvoiceModal] = useState(null)
  const [downloadingPdfId, setDownloadingPdfId] = useState(null)

  const loadBillingCatalogues = useCallback(async (silent = false) => {
    if (!silent) setInitialLoading(true)
    try {
      const res = await billingService.getCatalogues()
      const data = res.data?.data
      setCatalogues(data?.catalogues || [])
      if (data?.nextInvoiceNumber) {
        setNextInvoiceNumber(data.nextInvoiceNumber)
      }
    } catch (err) {
      showToast(
        'error',
        err.response?.data?.message || 'Failed to load billing catalogues.'
      )
    } finally {
      if (!silent) setInitialLoading(false)
    }
  }, [showToast])

  const fetchPatternsForCatalogue = useCallback(
    async (catalogueId, forceRefresh = false) => {
      if (!catalogueId) return []
      if (!forceRefresh && patternsByCatalogue[catalogueId]) {
        return patternsByCatalogue[catalogueId]
      }

      setLoadingPatternsMap((prev) => ({ ...prev, [catalogueId]: true }))
      try {
        const res = await billingService.getPatternsByCatalogue(catalogueId)
        const list = res.data?.data?.patterns || []
        setPatternsByCatalogue((prev) => ({
          ...prev,
          [catalogueId]: list,
        }))
        return list
      } catch (err) {
        showToast(
          'error',
          err.response?.data?.message || 'Unable to load patterns for catalogue.'
        )
        return []
      } finally {
        setLoadingPatternsMap((prev) => ({ ...prev, [catalogueId]: false }))
      }
    },
    [patternsByCatalogue, showToast]
  )

  const loadInvoiceHistory = useCallback(
    async (searchVal = historySearch, dateVal = historyDate, silent = false) => {
      if (!silent) setLoadingInvoices(true)
      try {
        const res = await billingService.searchInvoices({
          q: searchVal.trim(),
          date: dateVal,
        })
        const data = res.data?.data
        setInvoices(data?.invoices || [])
        if (data?.nextInvoicePreview) {
          setNextInvoiceNumber(data.nextInvoicePreview)
        }
      } catch {
        // Handled silently
      } finally {
        if (!silent) setLoadingInvoices(false)
      }
    },
    [historySearch, historyDate]
  )

  useEffect(() => {
    loadBillingCatalogues(false)
    loadInvoiceHistory('', '', false)
  }, [loadBillingCatalogues, loadInvoiceHistory])

  // Debounced search/date filter for Invoice History
  useEffect(() => {
    const timer = setTimeout(() => {
      loadInvoiceHistory(historySearch, historyDate, true)
    }, 220)
    return () => clearTimeout(timer)
  }, [historySearch, historyDate, loadInvoiceHistory])

  // Real-Time Server-Sent Events (SSE) subscription to keep stock quantities synchronized
  useEffect(() => {
    const eventSource = new EventSource('/api/inventory/stream', {
      withCredentials: true,
    })

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'INVENTORY_UPDATED') {
          const { catalogueId, patternNumber, quantity } = payload

          // Update cached patterns list
          setPatternsByCatalogue((prev) => {
            if (!prev[catalogueId]) return prev
            return {
              ...prev,
              [catalogueId]: prev[catalogueId].map((p) =>
                p.patternNumber === patternNumber
                  ? { ...p, quantity, isAvailable: quantity > 0 }
                  : p
              ),
            }
          })

          // Update any active billing row referencing this pattern
          setRows((prevRows) =>
            prevRows.map((r) =>
              r.catalogueId === catalogueId && r.patternNumber === patternNumber
                ? { ...r, availableStock: quantity }
                : r
            )
          )

          loadBillingCatalogues(true)
        }
      } catch {
        // Ignore heartbeats
      }
    }

    return () => {
      eventSource.close()
    }
  }, [loadBillingCatalogues])

  // Handle Catalogue Selection in a Row
  const handleCatalogueChange = async (rowId, selectedCatId) => {
    const catObj = catalogues.find((c) => c._id === selectedCatId)
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              catalogueId: selectedCatId,
              catalogueName: catObj?.name || '',
              catalogueSlug: catObj?.slug || '',
              patternId: '',
              patternNumber: '',
              availableStock: 0,
              quantity: 1,
              rate: catObj?.defaultRate ?? 500,
              imagePath: '',
            }
          : r
      )
    )
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })

    if (selectedCatId) {
      await fetchPatternsForCatalogue(selectedCatId)
    }
  }

  // Handle Pattern Selection in a Row (with duplicate consolidation)
  const handlePatternChange = async (rowId, selectedPatNumber) => {
    const targetRow = rows.find((r) => r.rowId === rowId)
    if (!targetRow || !targetRow.catalogueId) return

    const cataloguePatterns =
      patternsByCatalogue[targetRow.catalogueId] || []
    const patObj = cataloguePatterns.find(
      (p) => p.patternNumber === selectedPatNumber
    )

    if (!patObj) {
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId
            ? {
                ...r,
                patternId: '',
                patternNumber: '',
                availableStock: 0,
                quantity: 1,
              }
            : r
        )
      )
      return
    }

    if (patObj.quantity <= 0) {
      showToast(
        'error',
        `Pattern ${patObj.patternNumber} is currently Out of Stock (0 rolls).`
      )
      return
    }

    // Check if another row already has this exact Catalogue + Pattern selected
    const duplicateRow = rows.find(
      (r) =>
        r.rowId !== rowId &&
        r.catalogueId === targetRow.catalogueId &&
        r.patternNumber === selectedPatNumber
    )

    if (duplicateRow) {
      const combinedQty = Math.min(
        patObj.quantity,
        (Number(duplicateRow.quantity) || 1) + (Number(targetRow.quantity) || 1)
      )
      setRows((prev) =>
        prev
          .map((r) =>
            r.rowId === duplicateRow.rowId
              ? {
                  ...r,
                  quantity: combinedQty,
                  availableStock: patObj.quantity,
                }
              : r
          )
          .filter((r) => r.rowId !== rowId)
      )
      showToast({
        type: 'info',
        title: 'Pattern Consolidated',
        message: `Pattern ${selectedPatNumber} was already in the bill. Quantities combined (${combinedQty} rolls).`,
      })
      return
    }

    // Immediately update row state synchronously so UI and validation never lag
    const initialQty = patObj.quantity
    const initialRate = patObj.rate ?? 500

    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              patternId: patObj._id,
              patternNumber: String(patObj.patternNumber),
              availableStock: initialQty,
              quantity: Math.min(Number(r.quantity) || 1, Math.max(1, initialQty)),
              rate: Number(r.rate) > 0 ? r.rate : initialRate,
              imagePath: patObj.imagePath || '',
            }
          : r
      )
    )

    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })

    // Refresh live stock in background
    try {
      const stockRes = await billingService.getPatternStock(patObj._id)
      const fresh = stockRes.data?.data?.pattern
      if (fresh) {
        setRows((prev) =>
          prev.map((r) =>
            r.rowId === rowId && r.patternNumber === String(patObj.patternNumber)
              ? {
                  ...r,
                  availableStock: fresh.quantity,
                }
              : r
          )
        )
      }
    } catch {
      // Ignore background refresh error
    }
  }

  // Handle Quantity Change in a Row
  const handleQuantityInput = (rowId, rawVal) => {
    const cleaned = rawVal === '' ? '' : Math.floor(Number(rawVal))
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r
        return {
          ...r,
          quantity: cleaned,
        }
      })
    )
  }

  // Handle Rate Change in a Row
  const handleRateInput = (rowId, rawVal) => {
    const cleaned = rawVal === '' ? '' : Number(rawVal)
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, rate: cleaned } : r))
    )
  }

  // Add More Row
  const handleAddRow = () => {
    setRows((prev) => [...prev, createEmptyBillingRow()])
  }

  // Remove Row
  const handleRemoveRow = (rowId) => {
    if (rows.length <= 1) {
      setRows([createEmptyBillingRow()])
      setRowErrors({})
      return
    }
    setRows((prev) => prev.filter((r) => r.rowId !== rowId))
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[rowId]
      return next
    })
  }

  // Reset Form
  const handleResetForm = () => {
    setCustomerName('')
    setMobileNumber('')
    setCustomerErrors({})
    setRows([createEmptyBillingRow()])
    setRowErrors({})
    setDiscountType('PERCENTAGE')
    setDiscountValue('')
    setTaxRate(0)
    idempotencyKeyRef.current = `idem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  // Live Calculations (Decimal-Safe)
  const calculations = useMemo(() => {
    let totalItems = 0
    let totalQuantity = 0
    let subtotal = 0

    rows.forEach((r) => {
      const q = Number(r.quantity) || 0
      const rate = Number(r.rate) || 0
      if (r.catalogueId && r.patternNumber && q > 0 && rate > 0) {
        totalItems += 1
        totalQuantity += q
        subtotal = round2(subtotal + round2(q * rate))
      }
    })

    const numericDiscountVal = Math.max(0, Number(discountValue) || 0)
    let discountAmount = 0

    if (discountType === 'PERCENTAGE') {
      const cappedPct = Math.min(100, numericDiscountVal)
      discountAmount = round2((subtotal * cappedPct) / 100)
    } else {
      discountAmount = round2(numericDiscountVal)
    }

    const isDiscountExcessive =
      (discountType === 'PERCENTAGE' && numericDiscountVal > 100) ||
      discountAmount > subtotal

    const effectiveDiscount = Math.min(subtotal, discountAmount)
    const taxableSubtotal = round2(Math.max(0, subtotal - effectiveDiscount))
    const numericTaxRate = Math.max(0, Number(taxRate) || 0)
    const taxAmount = numericTaxRate > 0 ? round2((taxableSubtotal * numericTaxRate) / 100) : 0
    const finalTotal = round2(taxableSubtotal + taxAmount)

    return {
      totalItems,
      totalQuantity,
      subtotal,
      discountAmount: effectiveDiscount,
      taxRate: numericTaxRate,
      taxAmount,
      finalTotal,
      isDiscountExcessive,
    }
  }, [rows, discountType, discountValue, taxRate])

  // Validate Entire Bill Form before opening confirmation modal
  const validateBillingForm = () => {
    const cErrors = {}
    const rErrors = {}

    const trimmedName = customerName.trim()
    if (!trimmedName || trimmedName.length < 2) {
      cErrors.customerName = 'Customer name is required (min 2 characters)'
    }

    const cleanPhone = mobileNumber.trim().replace(/[\s\-+()]/g, '')
    const normalizedPhone =
      cleanPhone.length === 12 && cleanPhone.startsWith('91')
        ? cleanPhone.slice(2)
        : cleanPhone
    if (!/^\d{10}$/.test(normalizedPhone)) {
      cErrors.mobileNumber = 'Enter a valid 10-digit mobile number'
    }

    rows.forEach((r) => {
      const err = {}
      if (!r.catalogueId) {
        err.catalogue = 'Select a catalogue'
      }
      if (!r.patternNumber) {
        err.pattern = 'Select a pattern'
      }
      const q = Number(r.quantity)
      if (!Number.isInteger(q) || q <= 0) {
        err.quantity = 'Enter valid qty (> 0)'
      } else if (r.patternNumber && q > r.availableStock) {
        err.quantity = `Max available is ${r.availableStock} rolls`
      }

      const rate = Number(r.rate)
      if (!Number.isFinite(rate) || rate <= 0) {
        err.rate = 'Rate must be > ₹0'
      }

      if (Object.keys(err).length > 0) {
        rErrors[r.rowId] = err
      }
    })

    setCustomerErrors(cErrors)
    setRowErrors(rErrors)

    if (calculations.isDiscountExcessive) {
      showToast('error', 'Discount cannot exceed the bill subtotal.')
      return false
    }

    if (
      Object.keys(cErrors).length > 0 ||
      Object.keys(rErrors).length > 0
    ) {
      showToast(
        'error',
        'Please fix the highlighted fields before generating the bill.'
      )
      return false
    }

    return true
  }

  const handleInitiateGenerateBill = (e) => {
    e.preventDefault()
    if (validateBillingForm()) {
      setShowConfirmModal(true)
    }
  }

  const handleConfirmGenerateBill = async () => {
    if (submittingBill) return
    setSubmittingBill(true)

    try {
      const payload = {
        customerName: customerName.trim(),
        mobileNumber: mobileNumber.trim(),
        items: rows.map((r) => ({
          catalogueId: r.catalogueId,
          patternNumber: r.patternNumber,
          quantity: Number(r.quantity),
          rate: Number(r.rate),
        })),
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRate: Number(taxRate) || 0,
        idempotencyKey: idempotencyKeyRef.current,
      }

      const res = await billingService.createBill(
        payload,
        idempotencyKeyRef.current
      )
      const createdInvoice = res.data?.data?.invoice
      const nextNo = res.data?.data?.nextInvoiceNumber

      setShowConfirmModal(false)
      showToast({
        type: 'success',
        title: 'Invoice Generated',
        message: `${createdInvoice?.invoiceNumber} created & ${createdInvoice?.totalQuantity} rolls deducted from inventory!`,
        duration: 4200,
      })

      // Refresh cached patterns for affected catalogues
      const usedCatalogueIds = [
        ...new Set(rows.map((r) => r.catalogueId).filter(Boolean)),
      ]
      await Promise.all(
        usedCatalogueIds.map((catId) => fetchPatternsForCatalogue(catId, true))
      )

      handleResetForm()
      if (nextNo) setNextInvoiceNumber(nextNo)
      await loadBillingCatalogues(true)
      await loadInvoiceHistory(historySearch, historyDate, true)

      if (createdInvoice) {
        setSelectedInvoiceModal(createdInvoice)
      }
    } catch (err) {
      setShowConfirmModal(false)
      showToast(
        'error',
        err.response?.data?.message ||
          'Failed to generate invoice. Inventory was not modified.'
      )
    } finally {
      setSubmittingBill(false)
    }
  }

  const handleDownloadInvoicePdf = async (inv) => {
    if (!inv || downloadingPdfId) return
    const btnId = `billing-inv-pdf-${inv._id || inv.invoiceNumber}`
    setDownloadingPdfId(inv._id || inv.invoiceNumber)
    try {
      await trackDownload(btnId, async () => {
        await downloadInvoicePdf(inv)
      })
      showToast('success', `Downloaded ${inv.invoiceNumber}.pdf`)
    } catch {
      showToast('error', 'Failed to download PDF.')
    } finally {
      setDownloadingPdfId(null)
    }
  }

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
        showToast(
          'info',
          'Invoice image downloaded. Attach it in the opened WhatsApp chat.'
        )
      }
    } catch {
      showToast('error', 'Failed to create invoice image.')
    }
  }

  return (
    <div className="billing-page">
      {/* 1. Breadcrumb */}
      <nav className="crm-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="breadcrumb-link">
          Home
        </Link>
        <span className="breadcrumb-sep">&gt;</span>
        <span className="breadcrumb-current">Billing</span>
      </nav>

      {/* 2. Top Header with Auto Invoice Number & Date */}
      <div className="billing-topbar">
        <div>
          <h1 className="billing-heading">Create New Bill</h1>
          <p className="billing-subtext">
            Generate customer invoices with automatic real-time inventory stock deduction
          </p>
        </div>

        <div className="billing-meta-pills">
          <div className="billing-meta-pill">
            <span className="billing-meta-label">INVOICE NO:</span>
            <strong className="billing-meta-value">{nextInvoiceNumber}</strong>
          </div>
          <div className="billing-meta-pill">
            <span className="billing-meta-label">DATE:</span>
            <strong className="billing-meta-value">{invoiceDateStr}</strong>
          </div>
        </div>
      </div>

      {/* 3. Main Billing Form Card (Following Sketch Layout) */}
      {initialLoading ? (
        <FormSkeleton />
      ) : (
      <form
        className="billing-main-card"
        onSubmit={handleInitiateGenerateBill}
        noValidate
      >
        {/* TOP: Customer Name | Mobile Number */}
        <div className="billing-customer-grid">
          <div className="billing-field">
            <label htmlFor="billing-customer-name">
              Customer Name <span className="req-star">*</span>
            </label>
            <input
              id="billing-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                if (customerErrors.customerName) {
                  setCustomerErrors((p) => ({ ...p, customerName: '' }))
                }
              }}
              placeholder="Enter customer or firm name"
              className={customerErrors.customerName ? 'input-err' : ''}
            />
            {customerErrors.customerName && (
              <span className="field-err-msg">
                {customerErrors.customerName}
              </span>
            )}
          </div>

          <div className="billing-field">
            <label htmlFor="billing-mobile-number">
              Mobile Number <span className="req-star">*</span>
            </label>
            <input
              id="billing-mobile-number"
              type="tel"
              maxLength={10}
              value={mobileNumber}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10)
                setMobileNumber(digitsOnly)
                if (customerErrors.mobileNumber) {
                  setCustomerErrors((p) => ({ ...p, mobileNumber: '' }))
                }
              }}
              placeholder="10-digit mobile number"
              className={customerErrors.mobileNumber ? 'input-err' : ''}
            />
            {customerErrors.mobileNumber && (
              <span className="field-err-msg">
                {customerErrors.mobileNumber}
              </span>
            )}
          </div>
        </div>

        {/* MIDDLE: Product / Roll Selection Table */}
        <div className="billing-table-wrapper">
          <table className="billing-items-table">
            <thead>
              <tr>
                <th style={{ width: '48px' }}>#</th>
                <th style={{ minWidth: '190px' }}>Catalogue</th>
                <th style={{ minWidth: '210px' }}>Pattern Number</th>
                <th style={{ minWidth: '175px' }}>Quantity</th>
                <th style={{ minWidth: '140px' }}>Rate (₹)</th>
                <th style={{ minWidth: '140px' }}>Subtotal</th>
                <th style={{ width: '64px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const catPatterns =
                  patternsByCatalogue[row.catalogueId] || []
                const isLoadingPatterns = Boolean(
                  loadingPatternsMap[row.catalogueId]
                )
                const rErr = rowErrors[row.rowId] || {}
                const rowQty = Number(row.quantity) || 0
                const rowRate = Number(row.rate) || 0
                const rowSubtotal =
                  rowQty > 0 && rowRate > 0 ? round2(rowQty * rowRate) : 0
                const exceedsStock =
                  Boolean(row.patternNumber) && rowQty > row.availableStock

                return (
                  <tr key={row.rowId} className="billing-item-row">
                    <td className="row-index-cell">{index + 1}</td>

                    {/* 1. Catalogue Searchable Select (Type or Select) */}
                    <td>
                      <SearchableSelect
                        value={row.catalogueId}
                        onChange={(val) =>
                          handleCatalogueChange(row.rowId, val)
                        }
                        placeholder="Type or select catalogue..."
                        hasError={Boolean(rErr.catalogue)}
                        emptyText="No matching catalogue"
                        options={catalogues.map((cat) => ({
                          value: cat._id,
                          label: formatCatalogueLabel(cat.name),
                          searchKeywords: `${cat.name} ${cat.slug}`,
                          badgeText: `Stock: ${cat.totalStock ?? 0}`,
                          badgeTone:
                            (cat.totalStock ?? 0) > 0 ? 'success' : 'danger',
                        }))}
                      />
                      {rErr.catalogue && (
                        <span className="cell-err-text">{rErr.catalogue}</span>
                      )}
                    </td>

                    {/* 2. Pattern Number Searchable Select (Type or Select) */}
                    <td>
                      <SearchableSelect
                        value={row.patternNumber}
                        disabled={!row.catalogueId || isLoadingPatterns}
                        onChange={(val) =>
                          handlePatternChange(row.rowId, val)
                        }
                        placeholder={
                          !row.catalogueId
                            ? 'Select catalogue first'
                            : isLoadingPatterns
                            ? 'Loading patterns...'
                            : 'Type or select pattern...'
                        }
                        hasError={Boolean(rErr.pattern)}
                        emptyText="No pattern found"
                        options={catPatterns.map((pat) => {
                          const outOfStock = pat.quantity <= 0
                          return {
                            value: pat.patternNumber,
                            label: String(pat.patternNumber),
                            searchKeywords: String(pat.patternNumber),
                            disabled: outOfStock,
                            badgeText: outOfStock
                              ? 'Out of Stock (0)'
                              : `Avail: ${pat.quantity}`,
                            badgeTone: outOfStock
                              ? 'danger'
                              : pat.quantity < 10
                              ? 'warning'
                              : 'success',
                          }
                        })}
                      />
                      {rErr.pattern && (
                        <span className="cell-err-text">{rErr.pattern}</span>
                      )}
                    </td>

                    {/* 3. Quantity Input + Available Stock Pill */}
                    <td>
                      <div className="qty-cell-stack">
                        <div className="qty-input-with-stock">
                          <input
                            type="number"
                            min={1}
                            max={row.availableStock || 9999}
                            value={row.quantity}
                            placeholder="Qty"
                            onChange={(e) =>
                              handleQuantityInput(row.rowId, e.target.value)
                            }
                            className={`billing-num-input ${
                              rErr.quantity || exceedsStock ? 'input-err' : ''
                            }`}
                          />
                          {row.patternNumber && (
                            <span
                              className={`avail-stock-tag ${
                                row.availableStock < 10
                                  ? 'avail-low'
                                  : 'avail-ok'
                              }`}
                            >
                              Avail: {row.availableStock}
                            </span>
                          )}
                        </div>
                        {(exceedsStock || rErr.quantity) && (
                          <span className="cell-err-text">
                            {exceedsStock
                              ? `Exceeds stock (${row.availableStock} available)`
                              : rErr.quantity}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. Rate Input */}
                    <td>
                      <div className="rate-input-wrap">
                        <span className="currency-prefix">₹</span>
                        <input
                          type="number"
                          min={1}
                          step="0.01"
                          value={row.rate}
                          placeholder="1250"
                          onChange={(e) =>
                            handleRateInput(row.rowId, e.target.value)
                          }
                          className={`billing-num-input rate-input ${
                            rErr.rate ? 'input-err' : ''
                          }`}
                        />
                      </div>
                      {rErr.rate && (
                        <span className="cell-err-text">{rErr.rate}</span>
                      )}
                    </td>

                    {/* 5. Row Subtotal */}
                    <td className="subtotal-cell">
                      <strong>{formatINR(rowSubtotal)}</strong>
                    </td>

                    {/* 6. Remove Row */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="remove-row-btn"
                        onClick={() => handleRemoveRow(row.rowId)}
                        disabled={rows.length <= 1}
                        title={rows.length <= 1 ? 'At least one item is required' : 'Remove row'}
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

        {/* BELOW TABLE: Add More Button */}
        <div className="billing-add-more-row">
          <button
            type="button"
            className="billing-glass-btn add-more-btn"
            onClick={handleAddRow}
          >
            + Add More
          </button>
        </div>

        {/* BOTTOM: Discount Controls & Live Summary */}
        <div className="billing-bottom-grid">
          <div className="billing-discount-box">
            <h3 className="discount-box-title">Discount Configuration</h3>
            <div className="discount-controls-row">
              <div className="discount-type-field">
                <label>Discount Type</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                  className="billing-select"
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FIXED">Fixed Amount (₹)</option>
                </select>
              </div>

              <div className="discount-val-field">
                <label>
                  {discountType === 'PERCENTAGE'
                    ? 'Discount (%)'
                    : 'Discount Amount (₹)'}
                </label>
                <input
                  type="number"
                  min={0}
                  max={
                    discountType === 'PERCENTAGE'
                      ? 100
                      : calculations.subtotal || 999999
                  }
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'PERCENTAGE' ? '0%' : '₹0.00'}
                  className={`billing-num-input ${
                    calculations.isDiscountExcessive ? 'input-err' : ''
                  }`}
                />
              </div>
            </div>
            {calculations.isDiscountExcessive && (
              <p className="field-err-msg">
                Discount cannot exceed 100% or the bill subtotal.
              </p>
            )}

            {/* GST (Tax) Selection - By default 0% */}
            <div className="gst-configuration-row" style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
              <div className="discount-type-field" style={{ maxWidth: '220px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Applicable GST Tax</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>(Default: 0%)</span>
                </label>
                <select
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                  className="billing-select"
                >
                  <option value={0}>No GST (0%)</option>
                  <option value={18}>GST 18%</option>
                  <option value={5}>GST 5%</option>
                  <option value={12}>GST 12%</option>
                  <option value={28}>GST 28%</option>
                </select>
              </div>
            </div>
          </div>

          <div className="billing-summary-card">
            <div className="summary-line">
              <span>Total Items (Patterns):</span>
              <strong>{calculations.totalItems}</strong>
            </div>
            <div className="summary-line">
              <span>Total Quantity (Rolls):</span>
              <strong>{calculations.totalQuantity} Rolls</strong>
            </div>
            <div className="summary-line">
              <span>Subtotal:</span>
              <strong>{formatINR(calculations.subtotal)}</strong>
            </div>
            <div className="summary-line summary-discount-line">
              <span>
                Discount
                {discountType === 'PERCENTAGE' && Number(discountValue) > 0
                  ? ` (${discountValue}%)`
                  : ''}
                :
              </span>
              <strong>- {formatINR(calculations.discountAmount)}</strong>
            </div>

            {calculations.taxRate > 0 && (
              <div className="summary-line" style={{ color: '#0f172a' }}>
                <span>GST ({calculations.taxRate}%):</span>
                <strong>+ {formatINR(calculations.taxAmount)}</strong>
              </div>
            )}

            <div className="summary-line summary-final-line">
              <span>Final Payable Amount:</span>
              <strong className="final-payable-amount">
                {formatINR(calculations.finalTotal)}
              </strong>
            </div>

            <div className="billing-submit-actions">
              <button
                type="button"
                className="billing-glass-btn reset-bill-btn"
                onClick={handleResetForm}
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={submittingBill || calculations.totalItems === 0}
                className="billing-glass-btn generate-bill-btn"
              >
                {submittingBill ? 'Generating Bill...' : 'Generate Bill'}
              </button>
            </div>
          </div>
        </div>
      </form>
      )}

      {/* 4. Invoice History Section */}
      <section className="invoice-history-section">
        <div className="invoice-history-header">
          <div>
            <h2 className="invoice-history-title">Invoice History</h2>
            <p className="invoice-history-subtitle">
              Search, view, print, or download previously generated customer bills
            </p>
          </div>

          <div className="invoice-history-filters">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search Invoice No, Customer, or Mobile..."
              className="history-search-input"
            />
            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="history-date-input"
            />
            {(historySearch || historyDate) && (
              <button
                type="button"
                className="billing-glass-btn clear-filter-btn"
                onClick={() => {
                  setHistorySearch('')
                  setHistoryDate('')
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="invoice-history-table-card">
          {loadingInvoices ? (
            <div style={{ padding: '16px' }}>
              <TableSkeleton rows={5} cols={7} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="history-empty-box">
              No invoices match your current filter.
            </div>
          ) : (
            <div className="billing-table-wrapper">
              <table className="invoice-history-table">
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Customer Name</th>
                    <th>Mobile Number</th>
                    <th>Invoice Date</th>
                    <th>Total Qty</th>
                    <th>Final Amount</th>
                    <th>Created By</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv._id}>
                      <td>
                        <span className="inv-num-badge">
                          {inv.invoiceNumber}
                        </span>
                      </td>
                      <td>
                        <strong>{inv.customerName}</strong>
                      </td>
                      <td>+91 {inv.mobileNumber}</td>
                      <td>
                        {new Date(
                          inv.invoiceDate || inv.createdAt
                        ).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <strong>{inv.totalQuantity} Rolls</strong>
                      </td>
                      <td className="inv-amount-cell">
                        <strong>{formatINR(inv.finalTotal)}</strong>
                      </td>
                      <td>
                        {inv.createdBy?.fullName ||
                          inv.createdBy?.email ||
                          'Admin'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="inv-row-actions">
                          <button
                            type="button"
                            className="billing-glass-btn inv-action-sm"
                            onClick={() => setSelectedInvoiceModal(inv)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="billing-glass-btn inv-action-sm"
                            onClick={() => printInvoiceDocument(inv)}
                          >
                            Print
                          </button>
                          <ProgressButton
                            id={`billing-inv-pdf-${inv._id || inv.invoiceNumber}`}
                            type="button"
                            className="billing-glass-btn inv-action-sm"
                            onClick={() => handleDownloadInvoicePdf(inv)}
                            loadingText=""
                          >
                            PDF
                          </ProgressButton>
                          <button
                            type="button"
                            className="billing-glass-btn inv-action-sm"
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
      </section>

      {/* 5. Confirmation Modal Before Generating Bill */}
      {showConfirmModal && (
        <div
          className="billing-modal-backdrop"
          onClick={() => !submittingBill && setShowConfirmModal(false)}
        >
          <div
            className="billing-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="billing-modal-title">Confirm Bill Generation</h3>
            <p className="billing-modal-desc">
              This will generate an official invoice for{' '}
              <strong>{customerName.trim()}</strong> (+91 {mobileNumber}) and
              automatically deduct{' '}
              <strong>{calculations.totalQuantity} rolls</strong> from MongoDB
              inventory.
            </p>

            <div className="confirm-summary-box">
              <div className="confirm-row">
                <span>Total Patterns:</span>
                <strong>{calculations.totalItems}</strong>
              </div>
              <div className="confirm-row">
                <span>Total Rolls to Deduct:</span>
                <strong>{calculations.totalQuantity} Rolls</strong>
              </div>
              <div className="confirm-row">
                <span>Subtotal:</span>
                <strong>{formatINR(calculations.subtotal)}</strong>
              </div>
              <div className="confirm-row">
                <span>Discount:</span>
                <strong>- {formatINR(calculations.discountAmount)}</strong>
              </div>
              {calculations.taxRate > 0 && (
                <div className="confirm-row">
                  <span>GST ({calculations.taxRate}%):</span>
                  <strong>+ {formatINR(calculations.taxAmount)}</strong>
                </div>
              )}
              <div className="confirm-row confirm-row-final">
                <span>Final Payable:</span>
                <strong>{formatINR(calculations.finalTotal)}</strong>
              </div>
            </div>

            <div className="billing-modal-actions">
              <button
                type="button"
                disabled={submittingBill}
                className="billing-glass-btn"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingBill}
                className="billing-glass-btn generate-bill-btn"
                onClick={handleConfirmGenerateBill}
              >
                {submittingBill
                  ? 'Processing Transaction...'
                  : 'Confirm & Generate Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Invoice Details / Print / Download Modal */}
      {selectedInvoiceModal && (
        <div
          className="billing-modal-backdrop"
          onClick={() => setSelectedInvoiceModal(null)}
        >
          <div
            className="billing-modal-card invoice-preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invoice-preview-top">
              <div className="invoice-preview-brand">
                <img
                  src="/Logo.png"
                  alt="NH Wallpaper "
                  className="invoice-preview-logo"
                />
                <div>
                  <h3>NH Wallpaper</h3>
                  <p>Premium Wallpaper &amp; Roll Collections – Tax / Retail Invoice</p>
                  <p className="invoice-header-contact">Mob: +91 8828251111, +91 9930317192</p>
                  <p className="invoice-header-address">
                    Rani Residency, Shop No 02, Opp Apha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086
                  </p>
                </div>
              </div>
              <div className="invoice-preview-meta" style={{ textAlign: 'right' }}>
                <p style={{ margin: '0 0 3px', fontSize: '11px', fontWeight: '700', color: '#0f172a', letterSpacing: '0.4px' }}>
                  GSTIN: 27DXLPR9950M1ZB
                </p>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                  Invoice: {selectedInvoiceModal.invoiceNumber}
                </span>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Date:{' '}
                  {new Date(
                    selectedInvoiceModal.invoiceDate ||
                      selectedInvoiceModal.createdAt
                  ).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  Time:{' '}
                  {new Date(
                    selectedInvoiceModal.invoiceDate ||
                      selectedInvoiceModal.createdAt
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
                <strong>{selectedInvoiceModal.customerName}</strong>
              </div>
              <div>
                <span>Mobile Number:</span>{' '}
                <strong>+91 {selectedInvoiceModal.mobileNumber}</strong>
              </div>
              <div>
                <span>Billed By:</span>{' '}
                <strong>
                  {selectedInvoiceModal.createdBy?.fullName ||
                    selectedInvoiceModal.createdBy?.email ||
                    'Admin'}
                </strong>
              </div>
            </div>

            <div className="billing-table-wrapper">
              <table className="invoice-history-table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Sr No</th>
                    <th style={{ paddingLeft: '24px' }}>Catalogue</th>
                    <th>Pattern No.</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedInvoiceModal.items || []).map((it, idx) => (
                    <tr key={`${it.catalogueId}_${it.patternNumber}_${idx}`}>
                      <td>{idx + 1}</td>
                      <td style={{ paddingLeft: '24px' }}>
                        <strong>
                          {formatCatalogueLabel(
                            it.catalogueName || it.catalogueSlug
                          )}
                        </strong>
                      </td>
                      <td>
                        <strong>{it.patternNumber}</strong>
                      </td>
                      <td>{it.quantity} Rolls</td>
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
                  <strong>{formatINR(selectedInvoiceModal.subtotal)}</strong>
                </div>
                <div className="confirm-row" style={{ color: '#b91c1c' }}>
                  <span>
                    Discount
                    {selectedInvoiceModal.discountType === 'PERCENTAGE' &&
                    selectedInvoiceModal.discountValue > 0
                      ? ` (${selectedInvoiceModal.discountValue}%)`
                      : ''}
                    :
                  </span>
                  <strong>
                    - {formatINR(selectedInvoiceModal.discountAmount || 0)}
                  </strong>
                </div>
                {selectedInvoiceModal.taxRate > 0 && (
                  <div className="confirm-row" style={{ color: '#0f172a' }}>
                    <span>GST ({selectedInvoiceModal.taxRate}%):</span>
                    <strong>+ {formatINR(selectedInvoiceModal.taxAmount || 0)}</strong>
                  </div>
                )}
                <div className="confirm-row confirm-row-final">
                  <span>Final Payable Amount:</span>
                  <strong>{formatINR(selectedInvoiceModal.finalTotal)}</strong>
                </div>

                <div style={{ marginTop: '18px', textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: '12.5px', fontWeight: '800', color: '#0f172a' }}>For NH Wallpaper</p>
                  <p style={{ margin: '24px 0 0', fontSize: '11px', color: '#64748b' }}>Authorised Signatory</p>
                </div>
              </div>
            </div>

            {/* EKE DAM NEECHE (Bottom of Modal Card): Terms & Conditions */}
            <div style={{ marginTop: '24px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }}>Terms &amp; Conditions :</p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: '#475569', lineHeight: '1.6', listStyleType: 'disc' }}>
                <li>Subject to Mumbai Jurisdiction.</li>
                <li>No complaint will be entertained after acceptance of the delivery.</li>
                <li>Goods once sold will not be taken back or exchanged.</li>
                <li>Our responsibility ceses after delivery of goods to the carriers.</li>
              </ul>
            </div>

            <div className="billing-modal-actions">
              <button
                type="button"
                className="billing-glass-btn"
                onClick={() => printInvoiceDocument(selectedInvoiceModal)}
              >
                Print Invoice
              </button>
              <ProgressButton
                id={`billing-inv-pdf-${selectedInvoiceModal?._id || selectedInvoiceModal?.invoiceNumber}`}
                type="button"
                className="billing-glass-btn generate-bill-btn"
                onClick={() => handleDownloadInvoicePdf(selectedInvoiceModal)}
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
                onClick={() => handleSendWhatsAppImage(selectedInvoiceModal)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.5-1.4-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.41 1.02 2.58.12.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.42.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.07-.1-.23-.17-.48-.29z"/>
                </svg>
                Send to WhatsApp
              </button>
              <button
                type="button"
                className="billing-glass-btn"
                onClick={() => setSelectedInvoiceModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
