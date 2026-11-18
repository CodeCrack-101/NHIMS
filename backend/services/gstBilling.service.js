import mongoose from 'mongoose'
import { GstInvoice } from '../models/GstInvoice.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryLog } from '../models/InventoryLog.js'
import { Catalogue } from '../models/Catalogue.js'
import { recordAuditLog } from './audit.service.js'
import { broadcastInventoryEvent } from './inventory.service.js'
import { AppError } from '../utils/AppError.js'

// Number to Words converter in Indian Numbering System
export const convertNumberToWords = (amount) => {
  const num = Math.round(Number(amount) || 0)
  if (num === 0) return 'Zero Rupees Only'

  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ]
  const b = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ]

  const inWords = (n) => {
    if (n < 20) return a[n]
    const digit = n % 10
    return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '')
  }

  let words = ''
  let remaining = num

  const crore = Math.floor(remaining / 10000000)
  remaining %= 10000000
  if (crore > 0) words += `${inWords(crore)} Crore `

  const lakh = Math.floor(remaining / 100000)
  remaining %= 100000
  if (lakh > 0) words += `${inWords(lakh)} Lakh `

  const thousand = Math.floor(remaining / 1000)
  remaining %= 1000
  if (thousand > 0) words += `${inWords(thousand)} Thousand `

  const hundred = Math.floor(remaining / 100)
  remaining %= 100
  if (hundred > 0) words += `${inWords(hundred)} Hundred `

  if (remaining > 0) {
    if (words !== '') words += 'and '
    words += inWords(remaining)
  }

  return `${words.trim()} Rupees Only`
}

export const generateNextGstInvoiceNumber = async (session = null) => {
  const latestQuery = GstInvoice.findOne({})
    .sort({ createdAt: -1 })
    .select('invoiceNumber')
    .lean()

  if (session) {
    latestQuery.session(session)
  }

  const latest = await latestQuery
  if (!latest?.invoiceNumber) {
    return '314' // Matches user image start or next
  }

  // Parse trailing numeric
  const match = String(latest.invoiceNumber).match(/\d+$/)
  if (match) {
    const nextVal = parseInt(match[0], 10) + 1
    return String(nextVal)
  }

  return '315'
}

/**
 * Create GST Tax Invoice
 * Supports Catalogue live stock deduction if itemType === 'CATALOGUE'
 */
export const createGstInvoice = async (payload, userId, req = null) => {
  const {
    invoiceDate = new Date(),
    placeOfSupply = '33-Tamil Nadu',
    billTo,
    shipTo,
    items,
    paymentStatus = 'PAID',
    paymentMode = 'Gpay',
    receivedAmount,
    billerName = 'Shifa',
    notes = '',
  } = payload

  if (!billTo || !billTo.firmName || !billTo.contactNumber) {
    throw new AppError('Bill To firm name and contact number are required.', 400)
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('At least one item is required in GST invoice.', 400)
  }

  // Determine Inter-state (IGST) vs Intra-state (CGST + SGST)
  // NH Wallpaper is State 27 (Maharashtra). If place of supply starts with '27', it is Intra-state.
  const posCode = String(placeOfSupply).split('-')[0].trim()
  const isInterState = posCode !== '27'

  // Process and calculate items
  let subTotal = 0
  let totalTax = 0
  let totalQuantity = 0
  const processedItems = []
  const stockDeductions = []

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    const qty = Number(it.quantity) || 0
    const price = Number(it.pricePerUnit) || 0
    const gstRate = Number(it.gstRate ?? 18) || 0

    if (qty <= 0) {
      throw new AppError(`Item #${idx + 1} must have a quantity greater than zero.`, 400)
    }

    // In GST invoice, Price/Unit is typically taxable base rate, or can be base:
    // Amount = Qty * Price + GST
    const taxable = Math.round(qty * price * 100) / 100
    const gstAmt = Math.round((taxable * (gstRate / 100)) * 100) / 100
    const lineTotal = Math.round((taxable + gstAmt) * 100) / 100

    subTotal += taxable
    totalTax += gstAmt
    totalQuantity += qty

    // Catalogue item deduction
    if (it.itemType === 'CATALOGUE' && it.patternId) {
      stockDeductions.push({
        patternId: it.patternId,
        catalogueId: it.catalogueId,
        catalogueName: it.catalogueName,
        patternNumber: it.patternNumber,
        quantity: qty,
      })
    }

    processedItems.push({
      itemType: it.itemType || 'CUSTOM',
      catalogueId: it.catalogueId || null,
      catalogueName: it.catalogueName || '',
      patternId: it.patternId || null,
      patternNumber: it.patternNumber || '',
      itemName: it.itemName || `Item ${idx + 1}`,
      hsnCode: it.hsnCode || '39219099',
      quantity: qty,
      unit: it.unit || 'Rol',
      pricePerUnit: price,
      gstRate,
      taxableAmount: taxable,
      gstAmount: gstAmt,
      totalAmount: lineTotal,
    })
  }

  subTotal = Math.round(subTotal * 100) / 100
  totalTax = Math.round(totalTax * 100) / 100
  const finalTotal = Math.round((subTotal + totalTax) * 100) / 100

  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0

  if (isInterState) {
    igstAmount = totalTax
  } else {
    cgstAmount = Math.round((totalTax / 2) * 100) / 100
    sgstAmount = Math.round((totalTax - cgstAmount) * 100) / 100
  }

  const recAmt =
    paymentStatus === 'PAID'
      ? finalTotal
      : paymentStatus === 'UNPAID'
      ? 0
      : Number(receivedAmount) || 0
  const balAmt = Math.max(0, Math.round((finalTotal - recAmt) * 100) / 100)

  // Use session for atomic inventory deduction if catalog items exist
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Deduct stock for catalogue items
    for (const d of stockDeductions) {
      const invRecord = await Inventory.findById(d.patternId).session(session)
      if (!invRecord) {
        throw new AppError(
          `Catalogue pattern "${d.patternNumber}" not found in inventory.`,
          404
        )
      }
      if (invRecord.quantity < d.quantity) {
        throw new AppError(
          `Insufficient stock for pattern "${d.patternNumber}". Available: ${invRecord.quantity}, Requested: ${d.quantity}`,
          400
        )
      }

      const prevQty = invRecord.quantity
      invRecord.quantity -= d.quantity
      await invRecord.save({ session })

      await InventoryLog.create(
        [
          {
            catalogueId: d.catalogueId,
            patternId: d.patternId,
            patternNumber: d.patternNumber,
            changeType: 'SALE_DEDUCTION',
            quantityChange: -d.quantity,
            previousQuantity: prevQty,
            newQuantity: invRecord.quantity,
            reason: `GST Tax Invoice sale (${d.quantity} rolls)`,
            userId,
          },
        ],
        { session }
      )
    }

    // 2. Generate invoice number and save
    const invoiceNumber = await generateNextGstInvoiceNumber(session)
    const finalWords = convertNumberToWords(finalTotal)

    const [created] = await GstInvoice.create(
      [
        {
          invoiceNumber,
          invoiceDate,
          placeOfSupply,
          supplyStateCode: posCode,
          supplyStateName: String(placeOfSupply).split('-')[1]?.trim() || '',
          billTo,
          shipTo: shipTo || billTo,
          items: processedItems,
          totalItems: processedItems.length,
          totalQuantity,
          subTotal,
          isInterState,
          cgstAmount,
          sgstAmount,
          igstAmount,
          totalTax,
          finalTotal,
          finalTotalInWords: finalWords,
          receivedAmount: recAmt,
          balanceAmount: balAmt,
          paymentStatus,
          paymentMode,
          notes,
          billerName,
          createdBy: userId,
        },
      ],
      { session }
    )

    await session.commitTransaction()

    // Broadcast inventory event for live updates
    for (const d of stockDeductions) {
      broadcastInventoryEvent('STOCK_UPDATED', {
        catalogueId: d.catalogueId,
        patternId: d.patternId,
      })
    }

    if (req) {
      recordAuditLog({
        userId,
        action: 'GST_INVOICE_CREATED',
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
        metadata: {
          invoiceNumber: created.invoiceNumber,
          finalTotal: created.finalTotal,
          customer: billTo.firmName,
        },
      }).catch(() => {})
    }

    return created
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

export const listGstInvoices = async ({
  search = '',
  startDate,
  endDate,
  paymentStatus,
  page = 1,
  limit = 50,
} = {}) => {
  const filter = {}

  if (search && search.trim()) {
    const s = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(s, 'i')
    filter.$or = [
      { invoiceNumber: regex },
      { 'billTo.firmName': regex },
      { 'billTo.contactNumber': regex },
      { 'billTo.gstin': regex },
      { 'items.itemName': regex },
    ]
  }

  if (paymentStatus && paymentStatus !== 'ALL') {
    filter.paymentStatus = paymentStatus
  }

  if (startDate || endDate) {
    filter.invoiceDate = {}
    if (startDate) {
      const s = new Date(`${startDate}T00:00:00.000Z`)
      if (!Number.isNaN(s.getTime())) filter.invoiceDate.$gte = s
    }
    if (endDate) {
      const e = new Date(`${endDate}T23:59:59.999Z`)
      if (!Number.isNaN(e.getTime())) filter.invoiceDate.$lte = e
    }
  }

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50))
  const safePage = Math.max(1, Number(page) || 1)
  const skip = (safePage - 1) * safeLimit

  const [invoices, totalCount, nextInvoicePreview] = await Promise.all([
    GstInvoice.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('createdBy', 'fullName email')
      .lean(),
    GstInvoice.countDocuments(filter),
    generateNextGstInvoiceNumber(),
  ])

  return {
    invoices,
    totalCount,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(totalCount / safeLimit) || 1,
    nextInvoicePreview,
  }
}

export const getGstInvoiceById = async (invoiceId) => {
  const invoice = await GstInvoice.findById(invoiceId)
    .populate('createdBy', 'fullName email')
    .lean()

  if (!invoice) {
    throw new AppError('GST Invoice not found.', 404)
  }
  return invoice
}

export const updateGstPaymentStatus = async (invoiceId, paymentStatus) => {
  const normalized = String(paymentStatus).toUpperCase()
  if (!['PAID', 'UNPAID', 'PARTIAL'].includes(normalized)) {
    throw new AppError('Invalid payment status.', 400)
  }

  const invoice = await GstInvoice.findById(invoiceId)
  if (!invoice) {
    throw new AppError('GST Invoice not found.', 404)
  }

  invoice.paymentStatus = normalized
  if (normalized === 'PAID') {
    invoice.receivedAmount = invoice.finalTotal
    invoice.balanceAmount = 0
  } else if (normalized === 'UNPAID') {
    invoice.receivedAmount = 0
    invoice.balanceAmount = invoice.finalTotal
  }
  await invoice.save()
  return invoice
}
