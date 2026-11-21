import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { billingService } from '../services/billingService.js'
import { gstBillingService } from '../services/gstBillingService.js'
import { catalogueService, formatCatalogueLabel } from '../services/catalogueService.js'
import { SearchableSelect } from '../components/SearchableSelect.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { useDownloadProgress } from '../context/DownloadProgressContext.jsx'
import { downloadGstInvoicePdf, printGstInvoiceDocument } from '../utils/exportGstInvoicePdf.js'
import { TableSkeleton } from '../components/Skeleton.jsx'
import '../styles/GstBilling.css'

// Standard Place of supply / State list with official GST state codes
const INDIAN_STATES = [
  { code: '27', name: 'Maharashtra' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '24', name: 'Gujarat' },
  { code: '07', name: 'Delhi' },
  { code: '29', name: 'Karnataka' },
  { code: '36', name: 'Telangana' },
  { code: '32', name: 'Kerala' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '19', name: 'West Bengal' },
  { code: '08', name: 'Rajasthan' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '06', name: 'Haryana' },
  { code: '03', name: 'Punjab' },
  { code: '10', name: 'Bihar' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '21', name: 'Odisha' },
]

let rowKey = 1
const createDefaultRow = (itemType = 'CUSTOM') => ({
  id: `row_${Date.now()}_${rowKey++}`,
  itemType, // 'CUSTOM' or 'CATALOGUE'
  catalogueId: '',
  catalogueName: '',
  patternId: '',
  patternNumber: '',
  availableStock: 0,
  itemName: '',
  hsnCode: '39219099',
  quantity: 1,
  unit: 'Rol',
  pricePerUnit: 1250,
  gstRate: 18,
})

export function GstBilling() {
  const { showToast } = useToast()
  const { trackDownload } = useDownloadProgress()

  // Top Meta
  const [invoiceNumberPreview, setInvoiceNumberPreview] = useState('1')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().split('T')[0])
  const [placeOfSupply, setPlaceOfSupply] = useState('33-Tamil Nadu')
  const [billerName, setBillerName] = useState('Shifa')

  // Bill To
  const [billToFirm, setBillToFirm] = useState('')
  const [billToAddress, setBillToAddress] = useState('')
  const [billToContact, setBillToContact] = useState('')
  const [billToGstin, setBillToGstin] = useState('')
  const [billToState, setBillToState] = useState('33-Tamil Nadu')

  // Ship To (Same as Bill To checkbox)
  const [sameAsBillTo, setSameAsBillTo] = useState(true)
  const [shipToFirm, setShipToFirm] = useState('')
  const [shipToAddress, setShipToAddress] = useState('')
  const [shipToContact, setShipToContact] = useState('')
  const [shipToGstin, setShipToGstin] = useState('')
  const [shipToState, setShipToState] = useState('33-Tamil Nadu')

  // Rows & Catalogues
  const [rows, setRows] = useState([
    {
      ...createDefaultRow('CUSTOM'),
      itemName: 'UV marble roll 4x10',
      quantity: 50,
      unit: 'Rol',
      pricePerUnit: 42.37,
      gstRate: 18,
    },
    {
      ...createDefaultRow('CATALOGUE'),
      quantity: 1,
      unit: 'Rol',
      pricePerUnit: 1250,
      gstRate: 18,
    },
  ])

  const [catalogues, setCatalogues] = useState([])
  const [cataloguePatterns, setCataloguePatterns] = useState({}) // catId -> patterns[]
  const [loadingPatternsMap, setLoadingPatternsMap] = useState({})

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('PAID')
  const [paymentMode, setPaymentMode] = useState('Gpay')
  const [submitting, setSubmitting] = useState(false)

  // Edit Mode state
  const [editingInvoiceId, setEditingInvoiceId] = useState(null)
  const [editingInvoiceNumber, setEditingInvoiceNumber] = useState('')

  // Delete Confirm Modal state
  const [invoiceToDelete, setInvoiceToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Recent GST Invoices
  const [recentInvoices, setRecentInvoices] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Load patterns when catalogue selected
  const loadPatterns = useCallback(async (catId) => {
    if (!catId) return []
    const key = String(catId)
    if (cataloguePatterns[key] && cataloguePatterns[key].length > 0) {
      return cataloguePatterns[key]
    }
    setLoadingPatternsMap((prev) => ({ ...prev, [key]: true }))
    try {
      const res = await billingService.getPatternsByCatalogue(catId)
      const patterns = res.data?.data?.patterns || []
      setCataloguePatterns((prev) => ({
        ...prev,
        [key]: patterns,
      }))
      return patterns
    } catch (err) {
      console.error('Failed to load patterns for', catId, err)
      return []
    } finally {
      setLoadingPatternsMap((prev) => ({ ...prev, [key]: false }))
    }
  }, [cataloguePatterns])

  // Load catalogues and next invoice number
  useEffect(() => {
    gstBillingService
      .getNextInvoiceNumber()
      .then((res) => {
        if (res.data?.data?.nextInvoiceNumber) {
          setInvoiceNumberPreview(res.data.data.nextInvoiceNumber)
        }
      })
      .catch(() => {})

    const fetchAllCatalogues = async () => {
      try {
        const res = await billingService.getCatalogues()
        let cats = res.data?.data?.catalogues || []
        if (!cats.length) {
          const fallback = await catalogueService.getAllCatalogues()
          cats = fallback.data?.data?.catalogues || []
        }
        setCatalogues(cats)
      } catch {
        try {
          const fallback = await catalogueService.getAllCatalogues()
          setCatalogues(fallback.data?.data?.catalogues || [])
        } catch {
          // silent
        }
      }
    }

    fetchAllCatalogues()
    fetchRecentInvoices()
  }, [])

  const fetchRecentInvoices = useCallback(async () => {
    try {
      setLoadingHistory(true)
      const res = await gstBillingService.getGstInvoices({ limit: 10 })
      setRecentInvoices(res.data?.data?.invoices || [])
    } catch {
      // silent
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  // Row operations
  const handleAddRow = (itemType = 'CUSTOM') => {
    setRows((prev) => [...prev, createDefaultRow(itemType)])
  }

  const handleRemoveRow = (id) => {
    if (rows.length <= 1) return
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const handleUpdateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, [field]: value }

        // If switching catalogue, reset pattern and fetch patterns
        if (field === 'catalogueId') {
          const selectedCat = catalogues.find(
            (c) => String(c._id) === String(value) || c.slug === value
          )
          updated.catalogueId = value
          updated.catalogueName = selectedCat ? formatCatalogueLabel(selectedCat.name) : ''
          updated.patternId = ''
          updated.patternNumber = ''
          updated.availableStock = 0
          if (selectedCat) {
            updated.itemName = `${updated.catalogueName}`
            if (selectedCat.defaultRate) {
              updated.pricePerUnit = selectedCat.defaultRate
            }
            loadPatterns(value)
          }
        }

        // If selecting pattern, update name & available stock & price
        if (field === 'patternNumber') {
          const pats = cataloguePatterns[String(r.catalogueId)] || []
          const pat = pats.find((p) => String(p.patternNumber) === String(value))
          if (pat) {
            updated.patternId = pat._id
            updated.availableStock = pat.quantity ?? 0
            updated.itemName = `${r.catalogueName || 'Catalogue'} - ${pat.patternNumber}`
            if (pat.rate) updated.pricePerUnit = pat.rate
          } else {
            updated.patternNumber = value
          }
        }

        // If changing itemType
        if (field === 'itemType') {
          if (value === 'CUSTOM') {
            updated.catalogueId = ''
            updated.catalogueName = ''
            updated.patternId = ''
            updated.patternNumber = ''
            updated.availableStock = 0
          }
        }

        return updated
      })
    )
  }

  // Financial calculations
  const isInterState = useMemo(() => {
    const code = String(placeOfSupply).split('-')[0].trim()
    return code !== '27'
  }, [placeOfSupply])

  const calculatedSummary = useMemo(() => {
    let subTotal = 0
    let totalTax = 0
    let totalQty = 0

    const computedRows = rows.map((r) => {
      const qty = Number(r.quantity) || 0
      const price = Number(r.pricePerUnit) || 0
      const gstRate = Number(r.gstRate) || 0

      const taxable = Math.round(qty * price * 100) / 100
      const gstAmt = Math.round((taxable * (gstRate / 100)) * 100) / 100
      const rowTotal = Math.round((taxable + gstAmt) * 100) / 100

      subTotal += taxable
      totalTax += gstAmt
      totalQty += qty

      return {
        ...r,
        taxable,
        gstAmt,
        rowTotal,
      }
    })

    subTotal = Math.round(subTotal * 100) / 100
    totalTax = Math.round(totalTax * 100) / 100
    const finalTotal = Math.round((subTotal + totalTax) * 100) / 100

    let cgst = 0
    let sgst = 0
    let igst = 0

    if (isInterState) {
      igst = totalTax
    } else {
      cgst = Math.round((totalTax / 2) * 100) / 100
      sgst = Math.round((totalTax - cgst) * 100) / 100
    }

    const received = paymentStatus === 'PAID' ? finalTotal : 0
    const balance = paymentStatus === 'PAID' ? 0 : finalTotal

    return {
      computedRows,
      subTotal,
      totalTax,
      totalQty,
      finalTotal,
      cgst,
      sgst,
      igst,
      received,
      balance,
    }
  }, [rows, isInterState, paymentStatus])

  // Submit and Create Bill
  const handleGenerateBill = async (andPrint = false) => {
    if (!billToFirm.trim()) {
      showToast({ type: 'warning', title: 'Firm Name Required', message: 'Please enter Bill To Customer or Firm name.' })
      return
    }
    if (!billToContact.trim()) {
      showToast({ type: 'warning', title: 'Contact Required', message: 'Please enter a contact number.' })
      return
    }
    if (rows.length === 0) {
      showToast({ type: 'warning', title: 'Items Required', message: 'Please add at least one item.' })
      return
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r.itemType === 'CATALOGUE' && (!r.catalogueId || !r.patternNumber)) {
        showToast({
          type: 'warning',
          title: 'Select Catalogue & Pattern',
          message: `Row #${i + 1} is set to Catalogue Roll. Please select both Catalogue and Pattern Number.`,
        })
        return
      }
      if (r.itemType === 'CUSTOM' && !r.itemName.trim()) {
        showToast({
          type: 'warning',
          title: 'Enter Item Name',
          message: `Row #${i + 1} is missing an item description.`,
        })
        return
      }
    }

    try {
      setSubmitting(true)
      const payload = {
        invoiceDate,
        placeOfSupply,
        billerName,
        billTo: {
          firmName: billToFirm,
          address: billToAddress,
          contactNumber: billToContact,
          gstin: billToGstin,
          state: billToState,
          stateCode: billToState.split('-')[0],
        },
        shipTo: sameAsBillTo
          ? {
              firmName: billToFirm,
              address: billToAddress,
              contactNumber: billToContact,
              gstin: billToGstin,
              state: billToState,
              stateCode: billToState.split('-')[0],
            }
          : {
              firmName: shipToFirm || billToFirm,
              address: shipToAddress || billToAddress,
              contactNumber: shipToContact || billToContact,
              gstin: shipToGstin || billToGstin,
              state: shipToState,
              stateCode: shipToState.split('-')[0],
            },
        items: rows.map((r) => ({
          itemType: r.itemType,
          catalogueId: r.catalogueId || undefined,
          catalogueName: r.catalogueName || undefined,
          patternId: r.patternId || undefined,
          patternNumber: r.patternNumber || undefined,
          itemName: r.itemName || 'Item',
          hsnCode: r.hsnCode || '39219099',
          quantity: Number(r.quantity) || 1,
          unit: r.unit || 'Rol',
          pricePerUnit: Number(r.pricePerUnit) || 0,
          gstRate: Number(r.gstRate) || 0,
        })),
        paymentStatus,
        paymentMode,
      }

      let created = null

      if (editingInvoiceId) {
        const res = await gstBillingService.updateGstInvoice(editingInvoiceId, payload)
        created = res.data?.data?.invoice
        showToast({
          type: 'success',
          title: 'GST Invoice Updated!',
          message: `Invoice #${created.invoiceNumber} updated & stock synchronized.`,
        })
        setEditingInvoiceId(null)
        setEditingInvoiceNumber('')
      } else {
        const res = await gstBillingService.createGstBill(payload)
        created = res.data?.data?.invoice
        showToast({
          type: 'success',
          title: 'GST Invoice Generated!',
          message: `Invoice #${created.invoiceNumber} created successfully.`,
        })
      }

      // Print or Download
      if (andPrint) {
        await printGstInvoiceDocument(created)
      } else {
        await downloadGstInvoicePdf(created)
      }

      // Reset Form
      setBillToFirm('')
      setBillToAddress('')
      setBillToContact('')
      setBillToGstin('')
      setRows([createDefaultRow('CUSTOM')])
      fetchRecentInvoices()

      // Refresh next invoice number
      gstBillingService.getNextInvoiceNumber().then((r) => {
        if (r.data?.data?.nextInvoiceNumber) {
          setInvoiceNumberPreview(r.data.data.nextInvoiceNumber)
        }
      })
    } catch (err) {
      showToast({
        type: 'error',
        title: editingInvoiceId ? 'Update Failed' : 'Generation Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Edit Action
  const handleStartEdit = (inv) => {
    setEditingInvoiceId(inv._id)
    setEditingInvoiceNumber(inv.invoiceNumber)

    // Fill metadata
    setInvoiceDate(inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split('T')[0] : '')
    setPlaceOfSupply(inv.placeOfSupply || '27-Maharashtra')
    setBillerName(inv.billerName || 'Shifa')

    // Fill Bill To
    setBillToFirm(inv.billTo?.firmName || '')
    setBillToAddress(inv.billTo?.address || '')
    setBillToContact(inv.billTo?.contactNumber || '')
    setBillToGstin(inv.billTo?.gstin || '')
    setBillToState(
      inv.billTo?.state
        ? `${inv.billTo.stateCode ? `${inv.billTo.stateCode}-` : ''}${inv.billTo.state}`
        : inv.placeOfSupply || '27-Maharashtra'
    )

    // Fill Ship To
    if (inv.shipTo && inv.shipTo.firmName && inv.shipTo.firmName !== inv.billTo?.firmName) {
      setSameAsBillTo(false)
      setShipToFirm(inv.shipTo.firmName || '')
      setShipToAddress(inv.shipTo.address || '')
      setShipToContact(inv.shipTo.contactNumber || '')
      setShipToGstin(inv.shipTo.gstin || '')
      setShipToState(inv.shipTo.state || inv.placeOfSupply || '27-Maharashtra')
    } else {
      setSameAsBillTo(true)
      setShipToFirm('')
      setShipToAddress('')
      setShipToContact('')
      setShipToGstin('')
      setShipToState(inv.placeOfSupply || '27-Maharashtra')
    }

    // Fill Rows
    if (Array.isArray(inv.items) && inv.items.length > 0) {
      const mappedRows = inv.items.map((it) => {
        if (it.itemType === 'CATALOGUE' && it.catalogueId) {
          loadPatterns(it.catalogueId)
        }
        return {
          id: `row_edit_${Date.now()}_${Math.random()}`,
          itemType: it.itemType || 'CUSTOM',
          catalogueId: it.catalogueId || '',
          catalogueName: it.catalogueName || '',
          patternId: it.patternId || '',
          patternNumber: it.patternNumber || '',
          availableStock: it.quantity || 0,
          itemName: it.itemName || '',
          hsnCode: it.hsnCode || '39219099',
          quantity: it.quantity || 1,
          unit: it.unit || 'Rol',
          pricePerUnit: it.pricePerUnit || 0,
          gstRate: it.gstRate || 18,
        }
      })
      setRows(mappedRows)
    }

    // Payment
    setPaymentStatus(inv.paymentStatus || 'PAID')
    setPaymentMode(inv.paymentMode || 'Gpay')

    // Scroll to top of billing form smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' })
    showToast({
      type: 'info',
      title: 'Editing Mode Active',
      message: `Loaded Invoice #${inv.invoiceNumber}. Modify details and click Update.`,
    })
  }

  const handleCancelEdit = () => {
    setEditingInvoiceId(null)
    setEditingInvoiceNumber('')
    setBillToFirm('')
    setBillToAddress('')
    setBillToContact('')
    setBillToGstin('')
    setRows([createDefaultRow('CUSTOM')])
    gstBillingService.getNextInvoiceNumber().then((r) => {
      if (r.data?.data?.nextInvoiceNumber) {
        setInvoiceNumberPreview(r.data.data.nextInvoiceNumber)
      }
    })
  }

  // Handle Delete Action
  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return
    try {
      setDeleting(true)
      const res = await gstBillingService.deleteGstInvoice(invoiceToDelete._id)
      showToast({
        type: 'success',
        title: 'GST Invoice Deleted',
        message: res.data?.message || `Invoice #${invoiceToDelete.invoiceNumber} deleted and stock restored.`,
      })
      setInvoiceToDelete(null)
      if (editingInvoiceId === invoiceToDelete._id) {
        handleCancelEdit()
      }
      fetchRecentInvoices()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="gst-billing-page">
      {/* 1. Breadcrumb matching Billing page */}
      <nav className="gst-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="gst-breadcrumb-link">
          Home
        </Link>
        <span className="gst-breadcrumb-sep">&gt;</span>
        <span className="gst-breadcrumb-current">GST Billing</span>
      </nav>

      {/* 2. Top Header with Invoice No & Date Pills matching Billing page */}
      <div className="gst-topbar">
        <div>
          <h1 className="gst-heading">
            {editingInvoiceId ? `Edit GST Invoice #${editingInvoiceNumber}` : 'GST Tax Invoice Billing'}
          </h1>
          <p className="gst-subtext">
            {editingInvoiceId
              ? 'Modifying saved GST tax invoice. Changes will automatically synchronize catalogue inventory.'
              : 'Generate standard GST compliant tax invoices with live catalogue stock deduction and custom products'}
          </p>
        </div>

        <div className="gst-meta-pills">
          <div className="gst-meta-pill">
            <span className="gst-meta-label">{editingInvoiceId ? 'EDITING NO:' : 'INVOICE NO:'}</span>
            <strong className="gst-meta-value">{editingInvoiceId ? editingInvoiceNumber : invoiceNumberPreview}</strong>
          </div>
          <div className="gst-meta-pill">
            <span className="gst-meta-label">DATE:</span>
            <strong className="gst-meta-value">
              {new Date(invoiceDate).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </strong>
          </div>
        </div>
      </div>

      {editingInvoiceId && (
        <div className="gst-edit-banner">
          <div>
            <strong>You are currently editing GST Invoice #{editingInvoiceNumber}</strong>
            <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
              Update items, customer firm, GSTIN, or shipping details below and click &quot;Update Invoice&quot;.
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCancelEdit}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            Cancel Edit
          </button>
        </div>
      )}

      {/* 3. Invoice Meta Section inside main card */}
      <div className="gst-main-card">
        <div className="gst-card-section-title">
          <h3>Invoice Configuration</h3>
        </div>

        <div className="gst-meta-grid">
          <div className="gst-field">
            <label>Invoice Date *</label>
            <input
              type="date"
              className="gst-input"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>

          <div className="gst-field">
            <label>Place of Supply (State) *</label>
            <select
              className="gst-select"
              value={placeOfSupply}
              onChange={(e) => {
                setPlaceOfSupply(e.target.value)
                if (sameAsBillTo) {
                  setBillToState(e.target.value)
                }
              }}
            >
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={`${s.code}-${s.name}`}>
                  {s.code}-{s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="gst-field">
            <label>Tax Type</label>
            <div className={`gst-tax-type-pill ${isInterState ? 'igst' : 'cgst'}`}>
              {isInterState ? 'IGST (Inter-State 18%)' : 'CGST + SGST (Intra-State 9% + 9%)'}
            </div>
          </div>

          <div className="gst-field">
            <label>Billed By (Employee)</label>
            <input
              type="text"
              className="gst-input"
              value={billerName}
              onChange={(e) => setBillerName(e.target.value)}
              placeholder="e.g. Shifa"
            />
          </div>
        </div>
      </div>

      {/* 4. Bill To & Ship To Section */}
      <div className="gst-parties-grid">
        {/* Bill To Box */}
        <div className="gst-main-card">
          <div className="gst-card-section-title">
            <h3>Bill To (Customer / Firm Details)</h3>
          </div>
          <div className="gst-party-fields">
            <div className="gst-field">
              <label>Customer / Firm Name *</label>
              <input
                type="text"
                className="gst-input"
                placeholder="e.g. UNIVERSAL WALLPAPER INTERIOR DESIGN WORKS"
                value={billToFirm}
                onChange={(e) => setBillToFirm(e.target.value)}
              />
            </div>

            <div className="gst-field">
              <label>Complete Address</label>
              <textarea
                className="gst-textarea"
                rows="2"
                placeholder="Street address, building, city, pincode..."
                value={billToAddress}
                onChange={(e) => setBillToAddress(e.target.value)}
              />
            </div>

            <div className="gst-field-row">
              <div className="gst-field">
                <label>Contact Mobile No. *</label>
                <input
                  type="text"
                  className="gst-input"
                  placeholder="e.g. 9360760495"
                  value={billToContact}
                  onChange={(e) => setBillToContact(e.target.value)}
                />
              </div>

              <div className="gst-field">
                <label>GSTIN Number (Optional)</label>
                <input
                  type="text"
                  className="gst-input"
                  placeholder="e.g. 33JCPPS4902F1ZB"
                  value={billToGstin}
                  onChange={(e) => setBillToGstin(e.target.value.toUpperCase())}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Ship To Box */}
        <div className="gst-main-card">
          <div className="gst-card-section-title">
            <h3>Ship To Details</h3>
            <label className="gst-checkbox-label">
              <input
                type="checkbox"
                checked={sameAsBillTo}
                onChange={(e) => setSameAsBillTo(e.target.checked)}
              />
              <span>Same as Bill To</span>
            </label>
          </div>
          {!sameAsBillTo ? (
            <div className="gst-party-fields">
              <div className="gst-field">
                <label>Shipping Firm Name</label>
                <input
                  type="text"
                  className="gst-input"
                  placeholder="Shipping company name"
                  value={shipToFirm}
                  onChange={(e) => setShipToFirm(e.target.value)}
                />
              </div>

              <div className="gst-field">
                <label>Shipping Address</label>
                <textarea
                  className="gst-textarea"
                  rows="2"
                  placeholder="Delivery address..."
                  value={shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                />
              </div>

              <div className="gst-field-row">
                <div className="gst-field">
                  <label>Shipping Contact No.</label>
                  <input
                    type="text"
                    className="gst-input"
                    placeholder="Contact number"
                    value={shipToContact}
                    onChange={(e) => setShipToContact(e.target.value)}
                  />
                </div>

                <div className="gst-field">
                  <label>State</label>
                  <select
                    className="gst-select"
                    value={shipToState}
                    onChange={(e) => setShipToState(e.target.value)}
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={`${s.code}-${s.name}`}>
                        {s.code}-{s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div className="gst-same-banner">
              <p>✓ Shipping destination is set same as customer address.</p>
            </div>
          )}
        </div>
      </div>

      {/* 5. Items Table Builder */}
      <div className="gst-main-card">
        <div className="gst-items-header">
          <h3>Billing Items ({rows.length})</h3>
          <div className="gst-item-btn-group">
            <button
              type="button"
              className="gst-btn-sm gst-btn-secondary"
              onClick={() => handleAddRow('CUSTOM')}
            >
              + Add Custom Item (Manual Entry)
            </button>
            <button
              type="button"
              className="gst-btn-sm gst-btn-primary"
              onClick={() => handleAddRow('CATALOGUE')}
            >
              + Add Catalogue Roll (Live Stock Minus)
            </button>
          </div>
        </div>

        <div className="gst-table-wrapper">
          <table className="gst-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '130px' }}>Type</th>
                <th>Item Description / Catalogue Pattern</th>
                <th style={{ width: '100px' }}>HSN/SAC</th>
                <th style={{ width: '85px' }}>Qty</th>
                <th style={{ width: '85px' }}>Unit</th>
                <th style={{ width: '110px' }}>Price/Unit (₹)</th>
                <th style={{ width: '90px' }}>GST %</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Total (₹)</th>
                <th style={{ width: '50px', textAlign: 'center' }}>✕</th>
              </tr>
            </thead>
            <tbody>
              {calculatedSummary.computedRows.map((r, idx) => (
                <tr key={r.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <select
                      className="gst-table-select"
                      value={r.itemType}
                      onChange={(e) => handleUpdateRow(r.id, 'itemType', e.target.value)}
                    >
                      <option value="CUSTOM">Custom Item</option>
                      <option value="CATALOGUE">Catalogue Roll</option>
                    </select>
                  </td>
                  <td>
                    {r.itemType === 'CATALOGUE' ? (
                      <div className="gst-cat-picker-grid">
                        <div style={{ minWidth: 0 }}>
                          <SearchableSelect
                            value={r.catalogueId}
                            onChange={(val) => handleUpdateRow(r.id, 'catalogueId', val)}
                            placeholder="Type or select catalogue..."
                            emptyText="No matching catalogue"
                            options={catalogues.map((c) => ({
                              value: c._id,
                              label: formatCatalogueLabel(c.name),
                              searchKeywords: `${c.name} ${c.slug || ''}`,
                              badgeText: `Stock: ${c.totalStock ?? 0}`,
                              badgeTone: (c.totalStock ?? 0) > 0 ? 'success' : 'danger',
                            }))}
                          />
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <SearchableSelect
                            value={r.patternNumber}
                            disabled={!r.catalogueId || loadingPatternsMap[String(r.catalogueId)]}
                            onChange={(val) => handleUpdateRow(r.id, 'patternNumber', val)}
                            placeholder={
                              !r.catalogueId
                                ? 'Select catalogue first'
                                : loadingPatternsMap[String(r.catalogueId)]
                                ? 'Loading patterns...'
                                : 'Type or select pattern...'
                            }
                            emptyText="No patterns found"
                            options={(cataloguePatterns[String(r.catalogueId)] || []).map((p) => {
                              const outOfStock = (p.quantity ?? 0) <= 0
                              return {
                                value: p.patternNumber,
                                label: String(p.patternNumber),
                                searchKeywords: String(p.patternNumber),
                                disabled: outOfStock,
                                badgeText: outOfStock
                                  ? 'Out of Stock (0)'
                                  : `Avail: ${p.quantity}`,
                                badgeTone: outOfStock
                                  ? 'danger'
                                  : p.quantity < 10
                                  ? 'warning'
                                  : 'success',
                              }
                            })}
                          />
                          {r.patternNumber && (
                            <span className="gst-cat-hint">
                              ✓ {r.catalogueName} - {r.patternNumber} ({r.availableStock} in stock)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="gst-table-input"
                        placeholder="e.g. UV marble roll 4x10, Adhesive, etc."
                        value={r.itemName}
                        onChange={(e) => handleUpdateRow(r.id, 'itemName', e.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="gst-table-input"
                      value={r.hsnCode}
                      onChange={(e) => handleUpdateRow(r.id, 'hsnCode', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      className="gst-table-input"
                      value={r.quantity}
                      onChange={(e) => handleUpdateRow(r.id, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="gst-table-select"
                      value={r.unit}
                      onChange={(e) => handleUpdateRow(r.id, 'unit', e.target.value)}
                    >
                      <option value="Rol">Rol</option>
                      <option value="Pcs">Pcs</option>
                      <option value="Box">Box</option>
                      <option value="Meter">Meter</option>
                      <option value="Sq.Ft">Sq.Ft</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="gst-table-input"
                      value={r.pricePerUnit}
                      onChange={(e) => handleUpdateRow(r.id, 'pricePerUnit', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="gst-table-select"
                      value={r.gstRate}
                      onChange={(e) => handleUpdateRow(r.id, 'gstRate', e.target.value)}
                    >
                      <option value="18">18%</option>
                      <option value="12">12%</option>
                      <option value="5">5%</option>
                      <option value="28">28%</option>
                      <option value="0">0%</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '700' }}>
                    ₹{r.rowTotal.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="gst-row-del-btn"
                      onClick={() => handleRemoveRow(r.id)}
                      disabled={rows.length <= 1}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Bottom Summary & Actions */}
      <div className="gst-bottom-grid">
        {/* Payment Configuration */}
        <div className="gst-main-card">
          <div className="gst-card-section-title">
            <h3>Payment & Mode</h3>
          </div>
          <div className="gst-payment-config-row">
            <div className="gst-field">
              <label>Payment Status</label>
              <select
                className="gst-select"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                style={{
                  fontWeight: '700',
                  color: paymentStatus === 'PAID' ? '#166534' : '#991b1b',
                  backgroundColor: paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2',
                }}
              >
                <option value="PAID">PAID (Amount Received)</option>
                <option value="UNPAID">UNPAID (Pending / Due)</option>
              </select>
            </div>

            <div className="gst-field">
              <label>Payment Mode</label>
              <select
                className="gst-select"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="Gpay">Gpay</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer (NEFT/RTGS)">Bank Transfer (NEFT/RTGS)</option>
                <option value="Cheque">Cheque</option>
                <option value="PhonePe">PhonePe</option>
                <option value="UPI">UPI</option>
              </select>
            </div>
          </div>
        </div>

        {/* Totals Summary Card */}
        <div className="gst-main-card gst-summary-card">
          <div className="gst-sum-line">
            <span>Sub Total (Taxable):</span>
            <strong>₹{calculatedSummary.subTotal.toFixed(2)}</strong>
          </div>

          {isInterState ? (
            <div className="gst-sum-line">
              <span>IGST (18%):</span>
              <strong>+ ₹{calculatedSummary.igst.toFixed(2)}</strong>
            </div>
          ) : (
            <>
              <div className="gst-sum-line">
                <span>CGST (9%):</span>
                <strong>+ ₹{calculatedSummary.cgst.toFixed(2)}</strong>
              </div>
              <div className="gst-sum-line">
                <span>SGST (9%):</span>
                <strong>+ ₹{calculatedSummary.sgst.toFixed(2)}</strong>
              </div>
            </>
          )}

          <div className="gst-sum-line gst-total-line">
            <span>Grand Total (Payable):</span>
            <strong>₹{calculatedSummary.finalTotal.toFixed(2)}</strong>
          </div>

          <div className="gst-sum-line" style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
            <span>Received: ₹{calculatedSummary.received.toFixed(2)}</span>
            <span style={{ color: calculatedSummary.balance > 0 ? '#dc2626' : '#166534', fontWeight: '600' }}>
              Balance: ₹{calculatedSummary.balance.toFixed(2)}
            </span>
          </div>

          <div className="gst-action-buttons">
            <button
              type="button"
              className="gst-btn gst-btn-print"
              disabled={submitting}
              onClick={() => handleGenerateBill(true)}
            >
              {submitting
                ? 'Processing...'
                : editingInvoiceId
                ? '💾 Update & Print Invoice'
                : '🖨️ Print GST Tax Invoice'}
            </button>
            <button
              type="button"
              className="gst-btn gst-btn-download"
              disabled={submitting}
              onClick={() => handleGenerateBill(false)}
            >
              {submitting
                ? 'Processing...'
                : editingInvoiceId
                ? '💾 Update & Download PDF'
                : '⬇️ Download PDF'}
            </button>
            {editingInvoiceId && (
              <button
                type="button"
                className="gst-btn btn-secondary"
                disabled={submitting}
                onClick={handleCancelEdit}
                style={{ backgroundColor: '#f1f5f9', color: '#475569' }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 7. History Table */}
      <div className="gst-main-card gst-history-card">
        <div className="gst-card-section-title">
          <h3>Previously Generated GST Tax Invoices</h3>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchRecentInvoices}
            style={{ padding: '4px 12px', fontSize: '12px' }}
          >
            Refresh
          </button>
        </div>

        {loadingHistory ? (
          <TableSkeleton rows={4} cols={6} />
        ) : recentInvoices.length === 0 ? (
          <div className="empty-state">No GST invoices created yet.</div>
        ) : (
          <table className="gst-history-table">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date</th>
                <th>Customer / Firm</th>
                <th>Place of Supply</th>
                <th>Total (₹)</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentInvoices.map((inv) => (
                <tr key={inv._id}>
                  <td>
                    <span className="gst-meta-pill" style={{ padding: '3px 8px', fontSize: '12px' }}>
                      <strong>{inv.invoiceNumber}</strong>
                    </span>
                  </td>
                  <td>{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</td>
                  <td>
                    <strong>{inv.billTo?.firmName}</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {inv.billTo?.contactNumber}
                    </div>
                  </td>
                  <td>{inv.placeOfSupply}</td>
                  <td>
                    <strong>₹{Number(inv.finalTotal || 0).toFixed(2)}</strong>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: '700',
                        backgroundColor: inv.paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2',
                        color: inv.paymentStatus === 'PAID' ? '#166534' : '#991b1b',
                      }}
                    >
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="gst-btn-sm gst-btn-edit"
                      onClick={() => handleStartEdit(inv)}
                      style={{ marginRight: '6px' }}
                      title="Edit this invoice"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      className="gst-btn-sm gst-btn-secondary"
                      onClick={() => printGstInvoiceDocument(inv)}
                      style={{ marginRight: '6px' }}
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      className="gst-btn-sm gst-btn-secondary"
                      onClick={() => downloadGstInvoicePdf(inv)}
                      style={{ marginRight: '6px' }}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className="gst-btn-sm gst-btn-danger"
                      onClick={() => setInvoiceToDelete(inv)}
                      title="Delete invoice and restore inventory stock"
                    >
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* Delete Confirmation Modal */}
      {invoiceToDelete && (
        <div className="gst-modal-overlay" onClick={() => !deleting && setInvoiceToDelete(null)}>
          <div className="gst-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="gst-modal-header">
              <h3>Confirm Delete GST Invoice</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => !deleting && setInvoiceToDelete(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}
              >
                &times;
              </button>
            </div>
            <div className="gst-modal-body">
              <p style={{ margin: '0 0 12px 0' }}>
                Are you sure you want to delete <strong>GST Invoice #{invoiceToDelete.invoiceNumber}</strong> for{' '}
                <strong>{invoiceToDelete.billTo?.firmName}</strong>?
              </p>
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '12.5px',
                }}
              >
                <strong>Stock Restore Guarantee:</strong> Any catalogue wallpaper items billed in this invoice will be
                automatically restored back to live stock inventory immediately.
              </div>
            </div>
            <div className="gst-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                disabled={deleting}
                onClick={() => setInvoiceToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gst-btn gst-btn-danger"
                disabled={deleting}
                onClick={handleDeleteInvoice}
                style={{ padding: '8px 18px', fontWeight: '700' }}
              >
                {deleting ? 'Deleting & Restoring...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
