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
import { getStreamUrl } from '../utils/getStreamUrl.js'
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
  isCustom: false,
})

const createCustomBillingRow = () => ({
  rowId: `row_${Date.now()}_${rowIdSeq++}`,
  catalogueId: 'CUSTOM',
  catalogueName: 'Custom Item',
  catalogueSlug: 'CUSTOM',
  patternId: '',
  patternNumber: '',
  availableStock: 999999,
  quantity: 1,
  rate: 0,
  imagePath: '',
  isCustom: true,
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
  allowCustomInput = false,
  customInputPrefix = '✨ Use custom: ',
  onCustomInput = null,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const wrapperRef = useRef(null)

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  )

  // Keep input text synced with selected option or custom value when not actively typing
  useEffect(() => {
    if (!isTyping) {
      if (selectedOption) {
        setQuery(selectedOption.label)
      } else if (allowCustomInput && value && !String(value).startsWith('CUSTOM_ID_')) {
        setQuery(String(value))
      } else if (allowCustomInput && !value) {
        setQuery('')
      }
    }
  }, [selectedOption, isTyping, allowCustomInput, value])

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

  const hasExactOptionMatch = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return false
    return options.some(
      (o) =>
        !o.disabled &&
        (o.label.toLowerCase() === q || String(o.value).toLowerCase() === q)
    )
  }, [options, query])

  const commitTypedQueryIfNeeded = useCallback(() => {
    const q = query.trim()
    const qLower = q.toLowerCase()
    if (!q) {
      setIsTyping(false)
      setQuery(selectedOption ? selectedOption.label : '')
      return
    }
    const exactMatch = options.find(
      (o) =>
        !o.disabled &&
        (o.label.toLowerCase() === qLower || String(o.value).toLowerCase() === qLower)
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
    } else if (allowCustomInput && q) {
      setIsTyping(false)
      if (onCustomInput) {
        onCustomInput(q)
      } else {
        onChange(q)
      }
    } else {
      setIsTyping(false)
      setQuery(selectedOption ? selectedOption.label : '')
    }
  }, [query, options, filteredOptions, selectedOption, isTyping, value, onChange, allowCustomInput, onCustomInput])

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

  const handleSelectCustom = (customText) => {
    setIsTyping(false)
    setQuery(customText)
    setOpen(false)
    if (onCustomInput) {
      onCustomInput(customText)
    } else {
      onChange(customText)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const firstAvailable = filteredOptions.find((o) => !o.disabled)
      if (firstAvailable) {
        handleSelectOption(firstAvailable)
      } else if (allowCustomInput && query.trim()) {
        handleSelectCustom(query.trim())
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
        {Boolean(value || query) && !disabled && (
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
          {allowCustomInput && query.trim() && !hasExactOptionMatch && (
            <li
              role="option"
              className="billing-combo-item custom-typed-option"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelectCustom(query.trim())
              }}
            >
              <span className="combo-item-main">
                {customInputPrefix ? `${customInputPrefix} ` : ''}&ldquo;{query.trim()}&rdquo;
              </span>
            </li>
          )}

          {filteredOptions.length === 0 && (!allowCustomInput || !query.trim()) ? (
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
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  // Customer info & Biller info
  const [customerName, setCustomerName] = useState('')
  const [mobileNumber, setMobileNumber] = useState('')
  const [billerName, setBillerName] = useState(() => {
    return localStorage.getItem('nh_last_biller') || 'Pooja'
  })
  const [billerOptions, setBillerOptions] = useState(() => {
    const saved = localStorage.getItem('nh_shop_billers')
    return saved ? JSON.parse(saved) : ['Pooja', 'Sabira', 'Shifa', 'Sapna']
  })
  const [newBillerInput, setNewBillerInput] = useState('')
  const [showAddBiller, setShowAddBiller] = useState(false)
  const [customerErrors, setCustomerErrors] = useState({})

  const [billerDropdownOpen, setBillerDropdownOpen] = useState(false)
  const billerWrapperRef = useRef(null)

  useEffect(() => {
    const handleClickOutsideBiller = (e) => {
      if (billerWrapperRef.current && !billerWrapperRef.current.contains(e.target)) {
        setBillerDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutsideBiller)
    return () => document.removeEventListener('mousedown', handleClickOutsideBiller)
  }, [])

  // Billing rows
  const [rows, setRows] = useState(() => [createEmptyBillingRow()])
  const [rowErrors, setRowErrors] = useState({})

  // Discount state
  const [discountType, setDiscountType] = useState('PERCENTAGE') // 'PERCENTAGE' | 'FIXED'
  const [discountValue, setDiscountValue] = useState('')

  // GST State (Default 0, optional 18% or custom)
  const [taxRate, setTaxRate] = useState(0)
  const [paymentStatus, setPaymentStatus] = useState('PAID') // 'PAID' | 'UNPAID'
  const [paymentMode, setPaymentMode] = useState('Cash') // 'Cash' | 'COD' | 'GPay' | 'Card' | 'UPI' | 'Cheque' | 'Bank Transfer (NEFT/RTGS)'
  const [paymentTime, setPaymentTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [historyPaymentStatus, setHistoryPaymentStatus] = useState('ALL')
  const [showPendingSidebar, setShowPendingSidebar] = useState(false)
  const [pendingSummary, setPendingSummary] = useState({
    overallPendingAmount: 0,
    totalPendingCustomers: 0,
    totalPendingInvoices: 0,
    customers: [],
  })
  const [loadingPendingSummary, setLoadingPendingSummary] = useState(false)
  const [pendingSearch, setPendingSearch] = useState('')

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

  // Multi-Pattern Selection Modal from Single Catalogue
  const [showMultiPatternModal, setShowMultiPatternModal] = useState(false)
  const [multiSelectCatId, setMultiSelectCatId] = useState('')
  const [multiSelectedPatterns, setMultiSelectedPatterns] = useState([])
  const [multiPatternSearch, setMultiPatternSearch] = useState('')

  // Edit Invoice State
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [editFormData, setEditFormData] = useState({
    customerName: '',
    mobileNumber: '',
    billerName: '',
    paymentStatus: 'PAID',
    paymentMode: 'Cash',
    discountType: 'PERCENTAGE',
    discountValue: 0,
    taxRate: 0,
    items: [],
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState(null)

  const loadPendingSummary = useCallback(async () => {
    try {
      setLoadingPendingSummary(true)
      const res = await billingService.getPendingSummary()
      setPendingSummary(
        res.data?.data || {
          overallPendingAmount: 0,
          totalPendingCustomers: 0,
          totalPendingInvoices: 0,
          customers: [],
        }
      )
    } catch {
      // Handled silently
    } finally {
      setLoadingPendingSummary(false)
    }
  }, [])

  const handleUpdatePaymentStatus = async (invoiceId, newStatus) => {
    try {
      await billingService.updatePaymentStatus(invoiceId, newStatus)
      showToast({
        type: 'success',
        title: 'Status Updated',
        message: `Invoice marked as ${newStatus} successfully.`,
      })
      await loadPendingSummary()
      await loadInvoiceHistory(historySearch, historyDate, historyPaymentStatus, true)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
      })
    }
  }

  // Handle Delete Invoice and Restore Stock
  const handleDeleteInvoice = async (inv) => {
    if (!inv) return
    const confirmed = window.confirm(
      `Are you sure you want to delete Invoice ${inv.invoiceNumber}?\n\nThis will completely remove the bill and AUTOMATICALLY RESTORE all ${inv.totalQuantity} roll(s) back into your stock!`
    )
    if (!confirmed) return

    setDeletingInvoiceId(inv._id)
    try {
      const res = await billingService.deleteInvoice(inv._id)
      showToast({
        type: 'success',
        title: 'Invoice Deleted & Stock Restored',
        message: res.data?.message || `Invoice ${inv.invoiceNumber} deleted and ${inv.totalQuantity} rolls restored back to stock.`,
        duration: 4500,
      })
      if (selectedInvoiceModal?._id === inv._id) {
        setSelectedInvoiceModal(null)
      }
      await loadInvoiceHistory(historySearch, historyDate, historyPaymentStatus, true)
      await loadBillingCatalogues(true)
      await loadPendingSummary()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.response?.data?.message || 'Failed to delete invoice.',
      })
    } finally {
      setDeletingInvoiceId(null)
    }
  }

  // Handle Open Edit Invoice Modal
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
      items: (inv.items || []).map((it) => ({
        catalogueId: it.isCustom || !it.catalogueId || it.catalogueId === 'CUSTOM' ? 'CUSTOM' : (it.catalogueId?._id || it.catalogueId),
        catalogueName: it.catalogueName || '',
        catalogueSlug: it.catalogueSlug || '',
        patternNumber: it.patternNumber || '',
        imagePath: it.imagePath || '',
        quantity: it.quantity,
        rate: it.rate,
        isCustom: Boolean(it.isCustom || !it.catalogueId || it.catalogueId === 'CUSTOM'),
      })),
    })
  }

  // Handle Save Edit Invoice
  const handleSaveEditInvoice = async (e) => {
    e.preventDefault()
    if (!editingInvoice) return

    // Validation
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
    for (const it of editFormData.items) {
      if (!it.catalogueId && !it.catalogueName) {
        showToast('error', 'Every item must have a catalogue or item name.')
        return
      }
      if (!it.patternNumber || !String(it.patternNumber).trim()) {
        showToast('error', 'Every item must have a pattern number or description.')
        return
      }
      if (!it.quantity || Number(it.quantity) <= 0) {
        showToast('error', `Quantity for Pattern ${it.patternNumber || 'item'} must be > 0.`)
        return
      }
      if (!it.rate || Number(it.rate) <= 0) {
        showToast('error', `Rate for Pattern ${it.patternNumber || 'item'} must be > ₹0.`)
        return
      }
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

      showToast({
        type: 'success',
        title: 'Invoice Updated',
        message: res.data?.message || 'Invoice updated and stock adjusted successfully.',
      })
      setEditingInvoice(null)
      await loadInvoiceHistory(historySearch, historyDate, historyPaymentStatus, true)
      await loadBillingCatalogues(true)
      await loadPendingSummary()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.message || 'Failed to update invoice.',
      })
    } finally {
      setSavingEdit(false)
    }
  }

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
    async (
      searchVal = historySearch,
      dateVal = historyDate,
      statusVal = historyPaymentStatus,
      silent = false
    ) => {
      if (!silent) setLoadingInvoices(true)
      try {
        const res = await billingService.searchInvoices({
          q: searchVal.trim(),
          date: dateVal,
          paymentStatus: statusVal,
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
    [historySearch, historyDate, historyPaymentStatus]
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
    const eventSource = new EventSource(getStreamUrl('/inventory/stream'), {
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

  // Handle Catalogue Selection in a Row (Supports standard catalogues and typed custom item/category e.g. UV, Marble, etc.)
  const handleCatalogueChange = async (rowId, selectedCatId, customName = null) => {
    // If selectedCatId is 'CUSTOM' or anything custom typed
    if (selectedCatId === 'CUSTOM' || customName || selectedCatId.startsWith('CUSTOM:')) {
      const displayName = customName || (selectedCatId.startsWith('CUSTOM:') ? selectedCatId.replace('CUSTOM:', '') : 'Custom Item')
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId
            ? {
                ...r,
                catalogueId: 'CUSTOM',
                catalogueName: displayName,
                catalogueSlug: 'CUSTOM',
                patternId: '',
                patternNumber: r.patternNumber || '',
                availableStock: 999999,
                quantity: r.quantity || 1,
                rate: r.rate > 0 ? r.rate : 0,
                imagePath: '',
                isCustom: true,
              }
            : r
        )
      )
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      return
    }

    const catObj = catalogues.find((c) => c._id === selectedCatId)
    if (!catObj && selectedCatId) {
      // User typed a non-existent catalogue name directly (e.g. "UV", "Marble Sheet")
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId
            ? {
                ...r,
                catalogueId: 'CUSTOM',
                catalogueName: selectedCatId,
                catalogueSlug: 'CUSTOM',
                patternId: '',
                patternNumber: r.patternNumber || '',
                availableStock: 999999,
                quantity: r.quantity || 1,
                rate: r.rate > 0 ? r.rate : 0,
                imagePath: '',
                isCustom: true,
              }
            : r
        )
      )
      setRowErrors((prev) => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      return
    }

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
              rate: catObj?.defaultRate ?? 1250,
              imagePath: '',
              isCustom: false,
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

    if (targetRow.isCustom || targetRow.catalogueId === 'CUSTOM') {
      setRows((prev) =>
        prev.map((r) =>
          r.rowId === rowId
            ? {
                ...r,
                patternNumber: selectedPatNumber,
              }
            : r
        )
      )
      setRowErrors((prev) => {
        const next = { ...prev }
        if (next[rowId]) {
          delete next[rowId].pattern
          if (Object.keys(next[rowId]).length === 0) delete next[rowId]
        }
        return next
      })
      return
    }

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
    // If the last row already has a catalogue selected, inherit that catalogue for convenience
    const lastRow = rows[rows.length - 1]
    if (lastRow && lastRow.catalogueId && lastRow.catalogueId !== 'CUSTOM') {
      const catObj = catalogues.find((c) => c._id === lastRow.catalogueId)
      setRows((prev) => [
        ...prev,
        {
          ...createEmptyBillingRow(),
          catalogueId: lastRow.catalogueId,
          catalogueName: lastRow.catalogueName || catObj?.name || '',
          catalogueSlug: lastRow.catalogueSlug || catObj?.slug || '',
          rate: lastRow.rate || catObj?.defaultRate || 1250,
        },
      ])
      // Ensure patterns are loaded for this catalogue
      fetchPatternsForCatalogue(lastRow.catalogueId)
      return
    }
    setRows((prev) => [...prev, createEmptyBillingRow()])
  }

  // Quick Add Another Pattern with same catalogue right below a specific row
  const handleAddPatternBelowRow = (targetRow, rowIndex) => {
    if (!targetRow || !targetRow.catalogueId) {
      handleAddRow()
      return
    }

    const catObj = catalogues.find((c) => c._id === targetRow.catalogueId)
    const newRow = {
      ...createEmptyBillingRow(),
      catalogueId: targetRow.catalogueId,
      catalogueName: targetRow.catalogueName || catObj?.name || '',
      catalogueSlug: targetRow.catalogueSlug || catObj?.slug || '',
      rate: targetRow.rate || catObj?.defaultRate || 1250,
      isCustom: Boolean(targetRow.isCustom),
    }

    setRows((prev) => {
      const next = [...prev]
      next.splice(rowIndex + 1, 0, newRow)
      return next
    })

    if (targetRow.catalogueId !== 'CUSTOM') {
      fetchPatternsForCatalogue(targetRow.catalogueId)
    }
  }

  // Open Multi-Pattern Selection Modal
  const handleOpenMultiPatternModal = (preferredCatId = '') => {
    // If there is an active catalogue in the table or passed in, use that as initial
    const initialCatId =
      preferredCatId ||
      rows.find((r) => r.catalogueId && r.catalogueId !== 'CUSTOM')?.catalogueId ||
      (catalogues.length > 0 ? catalogues[0]._id : '')

    setMultiSelectCatId(initialCatId)
    setMultiSelectedPatterns([])
    setMultiPatternSearch('')
    setShowMultiPatternModal(true)
    if (initialCatId) {
      fetchPatternsForCatalogue(initialCatId)
    }
  }

  // Toggle Pattern Selection in Multi-Pattern Modal
  const handleToggleMultiPattern = (pattern) => {
    setMultiSelectedPatterns((prev) => {
      const exists = prev.some((p) => p._id === pattern._id)
      if (exists) {
        return prev.filter((p) => p._id !== pattern._id)
      } else {
        return [...prev, pattern]
      }
    })
  }

  // Select / Deselect All Filtered Patterns
  const handleToggleSelectAllPatterns = (filteredPatterns) => {
    const availableFiltered = filteredPatterns.filter((p) => p.quantity > 0)
    const allSelected = availableFiltered.length > 0 && availableFiltered.every((p) =>
      multiSelectedPatterns.some((sp) => sp._id === p._id)
    )

    if (allSelected) {
      // Unselect all these
      setMultiSelectedPatterns((prev) =>
        prev.filter((p) => !availableFiltered.some((fp) => fp._id === p._id))
      )
    } else {
      // Select all available
      setMultiSelectedPatterns((prev) => {
        const map = new Map(prev.map((p) => [p._id, p]))
        availableFiltered.forEach((p) => map.set(p._id, p))
        return Array.from(map.values())
      })
    }
  }

  // Confirm Multi-Pattern Selection and Append to Rows
  const handleConfirmMultiPatterns = () => {
    if (!multiSelectCatId || multiSelectedPatterns.length === 0) {
      setShowMultiPatternModal(false)
      return
    }

    const catObj = catalogues.find((c) => c._id === multiSelectCatId)
    const catRate = catObj?.defaultRate ?? 1250

    // Filter out rows that are completely blank (empty catalogue and empty pattern)
    const existingNonEmptyRows = rows.filter(
      (r) => r.catalogueId || r.patternNumber || r.isCustom
    )

    // Create new rows for each selected pattern
    const newPatternRows = multiSelectedPatterns.map((pat) => ({
      rowId: `row_${Date.now()}_${rowIdSeq++}_${pat.patternNumber}`,
      catalogueId: multiSelectCatId,
      catalogueName: catObj?.name || '',
      catalogueSlug: catObj?.slug || '',
      patternId: pat._id,
      patternNumber: String(pat.patternNumber),
      availableStock: pat.quantity,
      quantity: 1,
      rate: catRate,
      imagePath: pat.imagePath || '',
      isCustom: false,
    }))

    // Combine and ensure duplicate consolidation if already present
    const consolidated = [...existingNonEmptyRows]
    newPatternRows.forEach((newRow) => {
      const existingMatchIndex = consolidated.findIndex(
        (r) =>
          r.catalogueId === newRow.catalogueId &&
          r.patternNumber === newRow.patternNumber
      )
      if (existingMatchIndex !== -1) {
        // Increment quantity if stock permits
        const curr = consolidated[existingMatchIndex]
        const nextQty = Math.min(
          newRow.availableStock,
          (Number(curr.quantity) || 1) + 1
        )
        consolidated[existingMatchIndex] = {
          ...curr,
          quantity: nextQty,
        }
      } else {
        consolidated.push(newRow)
      }
    })

    setRows(consolidated.length > 0 ? consolidated : [createEmptyBillingRow()])
    setShowMultiPatternModal(false)
    showToast({
      type: 'success',
      title: 'Patterns Added',
      message: `Added ${multiSelectedPatterns.length} pattern(s) from "${catObj?.name || 'Catalogue'}".`,
      duration: 3500,
    })
  }

  // Add Custom / UV Extra Row (No stock deduction)
  const handleAddCustomRow = () => {
    setRows((prev) => [...prev, createCustomBillingRow()])
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
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    setInvoiceDate(`${year}-${month}-${day}`)
    setCustomerErrors({})
    setRows([createEmptyBillingRow()])
    setRowErrors({})
    setDiscountType('PERCENTAGE')
    setDiscountValue('')
    setTaxRate(0)
    setPaymentStatus('PAID')
    setPaymentMode('Cash')
    const now = new Date()
    setPaymentTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
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
      const isCustom = Boolean(r.isCustom || r.catalogueId === 'CUSTOM')
      if (!isCustom && !r.catalogueId) {
        err.catalogue = 'Select a catalogue'
      }
      if (!r.patternNumber || !r.patternNumber.trim()) {
        err.pattern = isCustom ? 'Enter item name or description' : 'Select a pattern'
      }
      const q = Number(r.quantity)
      if (!Number.isInteger(q) || q <= 0) {
        err.quantity = 'Enter valid qty (> 0)'
      } else if (!isCustom && r.patternNumber && q > r.availableStock) {
        err.quantity = `Max available is ${r.availableStock} rolls`
      }

      const rate = Number(r.rate)
      if (!Number.isFinite(rate) || rate < 0) {
        err.rate = 'Rate must be >= ₹0'
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

  const handleSelectBiller = (val) => {
    setBillerName(val)
    localStorage.setItem('nh_last_biller', val)
  }

  const handleAddCustomBiller = () => {
    const trimmed = newBillerInput.trim()
    if (!trimmed) return
    if (!billerOptions.includes(trimmed)) {
      const updated = [...billerOptions, trimmed]
      setBillerOptions(updated)
      localStorage.setItem('nh_shop_billers', JSON.stringify(updated))
    }
    handleSelectBiller(trimmed)
    setNewBillerInput('')
    setShowAddBiller(false)
  }

  const handleDeleteBiller = (billerToDelete, e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const updated = billerOptions.filter((name) => name !== billerToDelete)
    if (updated.length === 0) {
      showToast('error', 'At least one employee must remain in the list.')
      return
    }
    setBillerOptions(updated)
    localStorage.setItem('nh_shop_billers', JSON.stringify(updated))

    if (billerName === billerToDelete) {
      const nextBiller = updated[0]
      setBillerName(nextBiller)
      localStorage.setItem('nh_last_biller', nextBiller)
    }
    showToast('info', `Removed employee "${billerToDelete}".`)
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
        billerName: billerName.trim(),
        invoiceDate,
        items: rows.map((r) => ({
          catalogueId: r.isCustom || r.catalogueId === 'CUSTOM' ? 'CUSTOM' : r.catalogueId,
          catalogueName: r.isCustom || r.catalogueId === 'CUSTOM' ? (r.catalogueName || 'Custom Item') : r.catalogueName,
          patternNumber: String(r.patternNumber || '').trim(),
          quantity: Number(r.quantity),
          rate: Number(r.rate),
          isCustom: Boolean(r.isCustom || r.catalogueId === 'CUSTOM'),
        })),
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRate: Number(taxRate) || 0,
        paymentStatus,
        paymentMode,
        paymentTime: ['GPay', 'UPI', 'Card', 'Bank Transfer (NEFT/RTGS)'].includes(paymentMode) ? paymentTime : '',
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
        ...new Set(
          rows
            .map((r) => r.catalogueId)
            .filter((id) => id && id !== 'CUSTOM')
        ),
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
            <span className="billing-meta-label">BILL DATE:</span>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="billing-meta-date-input"
              title="Click to select custom bill date (default is today)"
            />
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
        {/* TOP: Customer Name | Mobile Number | Billed By (Employee) */}
        <div className="billing-customer-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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

          <div className="billing-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="billing-employee-select">
                Billed By (Employee) <span className="req-star">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowAddBiller((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showAddBiller ? 'Cancel' : '+ Add Name'}
              </button>
            </div>

            {showAddBiller ? (
              <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                <input
                  type="text"
                  placeholder="Enter employee name"
                  value={newBillerInput}
                  onChange={(e) => setNewBillerInput(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', fontSize: '13px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustomBiller()
                    }
                  }}
                />
                <button
                  type="button"
                  className="billing-glass-btn"
                  onClick={handleAddCustomBiller}
                  style={{ padding: '7px 12px', fontSize: '12px' }}
                >
                  Save
                </button>
              </div>
            ) : (
              <div ref={billerWrapperRef} className="billing-employee-custom-select" style={{ position: 'relative' }}>
                <div
                  className={`billing-combo-control ${billerDropdownOpen ? 'combo-open' : ''}`}
                  onClick={() => setBillerDropdownOpen((prev) => !prev)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px' }}
                >
                  <span style={{ fontSize: '13.5px', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    👤 {billerName || 'Select employee'}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      transform: billerDropdownOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.15s ease',
                      color: '#64748b',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {billerDropdownOpen && (
                  <ul
                    className="billing-combo-menu"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 50,
                      margin: '4px 0 0',
                      padding: '4px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                      listStyle: 'none',
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}
                  >
                    {billerOptions.map((name) => {
                      const isSelected = name === billerName
                      return (
                        <li
                          key={name}
                          onClick={() => {
                            handleSelectBiller(name)
                            setBillerDropdownOpen(false)
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '13.5px',
                            fontWeight: isSelected ? '700' : '500',
                            color: isSelected ? '#1d4ed8' : '#0f172a',
                            background: isSelected ? '#eff6ff' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f8fafc'
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            👤 {name}
                          </span>
                          <button
                            type="button"
                            title={`Delete ${name}`}
                            onClick={(e) => handleDeleteBiller(name, e)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              fontSize: '14px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              lineHeight: 1,
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#ef4444'
                              e.currentTarget.style.background = '#fee2e2'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#94a3b8'
                              e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            ✕
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
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
                  !row.isCustom &&
                  row.catalogueId !== 'CUSTOM' &&
                  Boolean(row.patternNumber) &&
                  rowQty > row.availableStock

                return (
                  <tr key={row.rowId} className="billing-item-row">
                    <td className="row-index-cell">{index + 1}</td>

                    {/* 1. Catalogue Searchable Select */}
                    <td>
                      <SearchableSelect
                        value={row.catalogueId === 'CUSTOM' ? (row.catalogueName || '') : row.catalogueId}
                        onChange={(val) =>
                          handleCatalogueChange(row.rowId, val)
                        }
                        allowCustomInput={true}
                        customInputPrefix=""
                        onCustomInput={(typedText) =>
                          handleCatalogueChange(row.rowId, 'CUSTOM', typedText)
                        }
                        placeholder="Select or type catalogue..."
                        hasError={Boolean(rErr.catalogue)}
                        emptyText="Press Enter to use this name"
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

                    {/* 2. Pattern Number or Custom Item Name Input */}
                    <td>
                      {row.isCustom || row.catalogueId === 'CUSTOM' ? (
                        <div>
                          <input
                            type="text"
                            value={row.patternNumber}
                            placeholder="e.g. UV Marble Sheet, Custom Roll..."
                            onChange={(e) =>
                              handlePatternChange(row.rowId, e.target.value)
                            }
                            className={`billing-num-input ${
                              rErr.pattern ? 'input-err' : ''
                            }`}
                            style={{
                              textAlign: 'left',
                              width: '100%',
                              padding: '10px 14px',
                              fontWeight: '600',
                              color: '#0f172a',
                            }}
                          />
                          {rErr.pattern && (
                            <span className="cell-err-text">{rErr.pattern}</span>
                          )}
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
                      {/* Quick + Add Pattern under Pattern Number */}
                      {row.catalogueId && (
                        <div style={{ marginTop: '5px' }}>
                          <button
                            type="button"
                            onClick={() => handleAddPatternBelowRow(row, index)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'transparent',
                              border: 'none',
                              color: '#2563eb',
                              fontSize: '11.5px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#1d4ed8'
                              e.currentTarget.style.textDecoration = 'underline'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#2563eb'
                              e.currentTarget.style.textDecoration = 'none'
                            }}
                            title={`Add another pattern from ${row.catalogueName || 'this catalogue'}`}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '15px',
                                height: '15px',
                                borderRadius: '50%',
                                background: '#dbeafe',
                                color: '#1d4ed8',
                                fontSize: '11px',
                                lineHeight: 1,
                              }}
                            >
                              +
                            </span>
                            <span>Add Pattern</span>
                          </button>
                        </div>
                      )}
                    </td>

                    {/* 3. Quantity Input + Available Stock Pill */}
                    <td>
                      <div className="qty-cell-stack">
                        <div className="qty-input-with-stock">
                          <input
                            type="number"
                            min={1}
                            max={
                              row.isCustom || row.catalogueId === 'CUSTOM'
                                ? 99999
                                : row.availableStock || 9999
                            }
                            value={row.quantity}
                            placeholder="Qty"
                            onChange={(e) =>
                              handleQuantityInput(row.rowId, e.target.value)
                            }
                            className={`billing-num-input ${
                              rErr.quantity || exceedsStock ? 'input-err' : ''
                            }`}
                          />
                          {!(row.isCustom || row.catalogueId === 'CUSTOM') && row.patternNumber && (
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

        {/* BELOW TABLE: Add More Rows */}
        <div className="billing-add-more-row">
          <button
            type="button"
            className="billing-glass-btn add-more-btn"
            onClick={handleAddRow}
            title="Add a single new item row"
          >
            + Add Item Row
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

            {/* GST, Payment Method & Payment Status in a single aligned row */}
            <div
              className="gst-configuration-row"
              style={{
                marginTop: '16px',
                paddingTop: '14px',
                borderTop: '1px solid #f1f5f9',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
                alignItems: 'flex-start',
              }}
            >
              <div className="discount-type-field" style={{ minWidth: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                  <span>GST Tax</span>
                  <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '500' }}>(0%)</span>
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

              {/* Payment Mode Selection: COD, GPay, Card, Cash, etc. */}
              <div className="discount-type-field" style={{ minWidth: 0 }}>
                <label style={{ whiteSpace: 'nowrap' }}>Payment Method</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="billing-select"
                  style={{ fontWeight: '600' }}
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

              {/* Online Payment Received Time (24hr format) */}
              {['GPay', 'UPI', 'Card', 'Bank Transfer (NEFT/RTGS)'].includes(paymentMode) && (
                <div className="discount-type-field" style={{ minWidth: 0 }}>
                  <label style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Payment Time (24h)</span>
                  </label>
                  <input
                    type="time"
                    step="60"
                    value={paymentTime}
                    onChange={(e) => setPaymentTime(e.target.value)}
                    className="billing-text-input"
                    style={{ fontWeight: '600', padding: '9px 10px', height: '39px' }}
                    title="Time when payment was received (24hr format)"
                  />
                </div>
              )}

              {/* Payment Status Dropdown Menu: Paid vs Unpaid */}
              <div className="discount-type-field" style={{ minWidth: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', whiteSpace: 'nowrap' }}>
                  <span>Payment Status</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      fontWeight: '700',
                      backgroundColor: paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2',
                      color: paymentStatus === 'PAID' ? '#166534' : '#991b1b',
                    }}
                  >
                    {paymentStatus === 'PAID' ? 'PAID' : 'PENDING'}
                  </span>
                </label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="billing-select"
                  style={{
                    borderColor: paymentStatus === 'UNPAID' ? '#f87171' : '#cbd5e1',
                    backgroundColor: paymentStatus === 'UNPAID' ? '#fff5f5' : '#ffffff',
                    fontWeight: '600',
                    color: paymentStatus === 'UNPAID' ? '#b91c1c' : '#0f172a',
                  }}
                >
                  <option value="PAID">Amount Paid (Full)</option>
                  <option value="UNPAID">Amount Unpaid (Due)</option>
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

            <div className="summary-line" style={{ paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Payment Details:</span>
              <span style={{ fontSize: '12.5px', fontWeight: '700', color: paymentStatus === 'PAID' ? '#166534' : '#991b1b' }}>
                {paymentMode} • {paymentStatus === 'PAID' ? 'Paid' : 'Unpaid (Due)'}
              </span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <h2 className="invoice-history-title">Invoice History</h2>
              <button
                type="button"
                className="btn-open-pending-sidebar"
                onClick={() => {
                  loadPendingSummary()
                  setShowPendingSidebar(true)
                }}
                title="View all customers with pending amounts"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Pending Amounts</span>
                {pendingSummary.totalPendingCustomers > 0 && (
                  <span className="pending-badge-count">
                    {pendingSummary.totalPendingCustomers}
                  </span>
                )}
              </button>
            </div>
            <p className="invoice-history-subtitle">
              Search, view, print, or download previously generated customer bills
            </p>
          </div>

          <div className="invoice-history-filters">
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search Invoice No, Pattern, Customer, or Mobile..."
              className="history-search-input"
            />
            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="history-date-input"
            />
            <select
              value={historyPaymentStatus}
              onChange={(e) => {
                setHistoryPaymentStatus(e.target.value)
                loadInvoiceHistory(historySearch, historyDate, e.target.value)
              }}
              className="history-date-input"
              style={{ minWidth: '150px', cursor: 'pointer', fontWeight: '600' }}
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Paid Only</option>
              <option value="UNPAID">Unpaid / Pending Only</option>
            </select>
            {(historySearch || historyDate) && (
              <button
                type="button"
                className="billing-glass-btn clear-filter-btn"
                onClick={() => {
                  setHistorySearch('')
                  setHistoryDate('')
                  setHistoryPaymentStatus('ALL')
                  loadInvoiceHistory('', '', 'ALL')
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
                    <th>Payment Status</th>
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
                        <button
                          type="button"
                          onClick={() => handleUpdatePaymentStatus(inv._id, (inv.paymentStatus || 'PAID') === 'PAID' ? 'UNPAID' : 'PAID')}
                          title="Click to toggle Paid / Unpaid"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: '700',
                            backgroundColor: (inv.paymentStatus || 'PAID') === 'PAID' ? '#dcfce7' : '#fee2e2',
                            color: (inv.paymentStatus || 'PAID') === 'PAID' ? '#166534' : '#991b1b',
                            border: `1px solid ${(inv.paymentStatus || 'PAID') === 'PAID' ? '#86efac' : '#fca5a5'}`,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: (inv.paymentStatus || 'PAID') === 'PAID' ? '#16a34a' : '#dc2626' }}></span>
                          {(inv.paymentStatus || 'PAID') === 'PAID' ? 'PAID' : 'UNPAID'}
                        </button>
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
                          <button
                            type="button"
                            className="billing-glass-btn inv-action-sm"
                            style={{ color: '#2563eb', borderColor: '#93c5fd' }}
                            onClick={() => handleOpenEditModal(inv)}
                            title="Edit Bill Price, Quantity & Customer Details"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="billing-glass-btn inv-action-sm"
                            style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                            disabled={deletingInvoiceId === inv._id}
                            onClick={() => handleDeleteInvoice(inv)}
                            title="Delete Bill & Restore Rolls back to Stock"
                          >
                            {deletingInvoiceId === inv._id ? 'Deleting...' : 'Delete'}
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

      
      {/* 6. Pending Amount Users Sidebar Drawer */}
      {showPendingSidebar && (
        <div
          className="pending-drawer-backdrop"
          onClick={() => setShowPendingSidebar(false)}
        >
          <div
            className="pending-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pending-drawer-header">
              <div className="pending-drawer-title-box">
                <h3>Pending Amount Users</h3>
                <p>
                  {pendingSummary.totalPendingCustomers} customer(s) with unpaid invoices
                </p>
              </div>
              <button
                type="button"
                className="pending-drawer-close-btn"
                onClick={() => setShowPendingSidebar(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="pending-total-banner">
              <div>
                <div className="pending-total-label">Total Outstanding Due</div>
                <div className="pending-total-sub">
                  Across {pendingSummary.totalPendingInvoices} unpaid invoices
                </div>
              </div>
              <div className="pending-total-val">
                {formatINR(pendingSummary.overallPendingAmount)}
              </div>
            </div>

            <div className="pending-search-bar">
              <input
                type="text"
                placeholder="Search pending customer name or mobile..."
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                className="pending-search-input"
              />
            </div>

            <div className="pending-customers-list">
              {loadingPendingSummary ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                  Loading pending details...
                </div>
              ) : pendingSummary.customers.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: '#10b981' }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 10px', display: 'block' }}>
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <strong>All Clear!</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#64748b' }}>
                    There are no pending or unpaid customer amounts.
                  </p>
                </div>
              ) : (
                pendingSummary.customers
                  .filter((c) => {
                    if (!pendingSearch.trim()) return true
                    const q = pendingSearch.toLowerCase()
                    return (
                      (c.customerName || '').toLowerCase().includes(q) ||
                      (c.mobileNumber || '').includes(q)
                    )
                  })
                  .map((c) => (
                    <div key={c.mobileNumber} className="pending-customer-card">
                      <div className="pending-card-top">
                        <div>
                          <div className="pending-cust-name">{c.customerName}</div>
                          <div className="pending-cust-phone">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                            +91 {c.mobileNumber}
                          </div>
                        </div>
                        <div className="pending-cust-amount">
                          {formatINR(c.totalPendingAmount)}
                          <div style={{ fontSize: '11px', fontWeight: '500', color: '#64748b' }}>
                            {c.unpaidInvoicesCount} bill(s) pending
                          </div>
                        </div>
                      </div>

                      <div className="pending-card-invoices">
                        {c.invoices.map((inv) => (
                          <div key={inv._id} className="pending-inv-row">
                            <div>
                              <div className="pending-inv-num">{inv.invoiceNumber}</div>
                              <div className="pending-inv-date">
                                {new Date(inv.invoiceDate).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                                {inv.paymentMode ? ` • ${inv.paymentMode}` : ''}
                                {inv.billerName ? ` • ${inv.billerName}` : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <strong style={{ color: '#b91c1c' }}>
                                {formatINR(inv.finalTotal)}
                              </strong>
                              <button
                                type="button"
                                className="pending-mark-paid-btn"
                                onClick={() => handleUpdatePaymentStatus(inv._id, 'PAID')}
                                title="Mark this invoice as Paid"
                              >
                                Mark Paid
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}


      {/* 4.5 Multi-Pattern Selector Modal (Pick Catalogue Once, Select Multiple Patterns) */}
      {showMultiPatternModal && (
        <div
          className="billing-modal-backdrop"
          onClick={() => setShowMultiPatternModal(false)}
        >
          <div
            className="billing-modal-card multi-pattern-modal-card"
            style={{ maxWidth: '680px', width: '92%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 className="billing-modal-title" style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>⚡</span> Multi-Pattern Quick Selector
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  Select catalogue once and pick all the patterns you want to bill.
                </p>
              </div>
              <button
                type="button"
                className="pending-drawer-close-btn"
                style={{ position: 'static' }}
                onClick={() => setShowMultiPatternModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Catalogue Selection Dropdown */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                Choose Catalogue
              </label>
              <SearchableSelect
                value={multiSelectCatId}
                onChange={(catId) => {
                  setMultiSelectCatId(catId)
                  setMultiSelectedPatterns([])
                  if (catId) {
                    fetchPatternsForCatalogue(catId)
                  }
                }}
                placeholder="Choose catalogue..."
                options={catalogues.map((cat) => ({
                  value: cat._id,
                  label: formatCatalogueLabel(cat.name),
                  searchKeywords: `${cat.name} ${cat.slug}`,
                  badgeText: `Stock: ${cat.totalStock ?? 0}`,
                  badgeTone: (cat.totalStock ?? 0) > 0 ? 'success' : 'danger',
                }))}
              />
            </div>

            {/* Pattern Search & Select-All Bar */}
            {multiSelectCatId && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                <input
                  type="text"
                  placeholder="Filter pattern numbers (e.g. 101, 102)..."
                  value={multiPatternSearch}
                  onChange={(e) => setMultiPatternSearch(e.target.value)}
                  className="billing-text-input"
                  style={{ flex: 1, padding: '8px 12px', fontSize: '13.5px' }}
                />
                {(() => {
                  const catPatterns = patternsByCatalogue[multiSelectCatId] || []
                  const filtered = catPatterns.filter((p) =>
                    String(p.patternNumber).toLowerCase().includes(multiPatternSearch.toLowerCase().trim())
                  )
                  const availableFiltered = filtered.filter((p) => p.quantity > 0)
                  const isAllSelected =
                    availableFiltered.length > 0 &&
                    availableFiltered.every((p) =>
                      multiSelectedPatterns.some((sp) => sp._id === p._id)
                    )

                  return (
                    <button
                      type="button"
                      className="billing-glass-btn"
                      style={{
                        padding: '6px 14px',
                        fontSize: '12.5px',
                        whiteSpace: 'nowrap',
                        background: isAllSelected ? '#eff6ff' : '#ffffff',
                        borderColor: isAllSelected ? '#3b82f6' : '#cbd5e1',
                      }}
                      onClick={() => handleToggleSelectAllPatterns(filtered)}
                      disabled={availableFiltered.length === 0}
                    >
                      {isAllSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  )
                })()}
              </div>
            )}

            {/* Patterns Grid / Chips */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px',
                background: '#f8fafc',
                minHeight: '180px',
                maxHeight: '340px',
              }}
            >
              {!multiSelectCatId ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '13.5px' }}>
                  Please select a catalogue above to view and pick patterns.
                </div>
              ) : loadingPatternsMap[multiSelectCatId] ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#64748b', fontSize: '13.5px' }}>
                  Loading patterns from catalogue...
                </div>
              ) : (() => {
                const catPatterns = patternsByCatalogue[multiSelectCatId] || []
                const filtered = catPatterns.filter((p) =>
                  String(p.patternNumber).toLowerCase().includes(multiPatternSearch.toLowerCase().trim())
                )

                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '13.5px' }}>
                      No patterns found matching "{multiPatternSearch}".
                    </div>
                  )
                }

                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {filtered.map((pat) => {
                      const isSelected = multiSelectedPatterns.some((sp) => sp._id === pat._id)
                      const isOutOfStock = pat.quantity <= 0

                      return (
                        <div
                          key={pat._id}
                          onClick={() => {
                            if (!isOutOfStock) handleToggleMultiPattern(pat)
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: isSelected
                              ? '2px solid #2563eb'
                              : isOutOfStock
                              ? '1px dashed #cbd5e1'
                              : '1px solid #e2e8f0',
                            background: isSelected
                              ? '#eff6ff'
                              : isOutOfStock
                              ? '#f1f5f9'
                              : '#ffffff',
                            cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                            opacity: isOutOfStock ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            position: 'relative',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: '700',
                                color: isSelected ? '#1d4ed8' : '#0f172a',
                              }}
                            >
                              {pat.patternNumber}
                            </span>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isOutOfStock}
                              onChange={() => {}}
                              style={{ cursor: isOutOfStock ? 'not-allowed' : 'pointer' }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: '600',
                                color: isOutOfStock
                                  ? '#ef4444'
                                  : pat.quantity < 10
                                  ? '#d97706'
                                  : '#16a34a',
                              }}
                            >
                              {isOutOfStock ? 'Out of stock' : `${pat.quantity} rolls`}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* Modal Bottom Action Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                Selected: <strong style={{ color: '#2563eb' }}>{multiSelectedPatterns.length} pattern(s)</strong>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="billing-glass-btn"
                  onClick={() => setShowMultiPatternModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="billing-glass-btn"
                  style={{
                    background: multiSelectedPatterns.length > 0 ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#e2e8f0',
                    color: multiSelectedPatterns.length > 0 ? '#ffffff' : '#94a3b8',
                    borderColor: multiSelectedPatterns.length > 0 ? '#1d4ed8' : '#cbd5e1',
                    boxShadow: multiSelectedPatterns.length > 0 ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
                  }}
                  disabled={multiSelectedPatterns.length === 0}
                  onClick={handleConfirmMultiPatterns}
                >
                  Add {multiSelectedPatterns.length} Pattern(s) to Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <strong>{customerName.trim()}</strong> (+91 {mobileNumber}) by{' '}
              <strong style={{ color: '#2563eb' }}>{billerName}</strong> and
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
              <div className="confirm-row" style={{ paddingTop: '4px' }}>
                <span>Payment Method &amp; Status:</span>
                <strong style={{ color: paymentStatus === 'PAID' ? '#16a34a' : '#dc2626' }}>
                  {paymentMode} {['GPay', 'UPI', 'Card', 'Bank Transfer (NEFT/RTGS)'].includes(paymentMode) && paymentTime ? `(${paymentTime})` : ''} • {paymentStatus}
                </strong>
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
                    Rani Residency, Shop No 02, Opp Alpha Park Building Near Taj Darbar Hotel, Chirag Nagar, Ghatkopar (W), Mumbai 400086
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
                  {selectedInvoiceModal.billerName ||
                    selectedInvoiceModal.createdBy?.fullName ||
                    selectedInvoiceModal.createdBy?.email ||
                    'Admin'}
                </strong>
              </div>
              {selectedInvoiceModal.paymentMode && (
                <div>
                  <span>Payment Method:</span>{' '}
                  <strong style={{ color: '#2563eb' }}>
                    {selectedInvoiceModal.paymentMode}
                    {selectedInvoiceModal.paymentTime ? ` (${selectedInvoiceModal.paymentTime})` : ''}
                  </strong>
                </div>
              )}
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
                  <p style={{ margin: '18px 0 0', fontSize: '11px', color: '#64748b' }}>Authorised Signatory</p>
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
                style={{ color: '#2563eb', borderColor: '#93c5fd' }}
                onClick={() => {
                  const inv = selectedInvoiceModal
                  setSelectedInvoiceModal(null)
                  handleOpenEditModal(inv)
                }}
              >
                Edit Bill
              </button>
              <button
                type="button"
                className="billing-glass-btn"
                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                disabled={deletingInvoiceId === selectedInvoiceModal?._id}
                onClick={() => handleDeleteInvoice(selectedInvoiceModal)}
              >
                {deletingInvoiceId === selectedInvoiceModal?._id ? 'Deleting...' : 'Delete Bill'}
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
                                  min={1}
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
