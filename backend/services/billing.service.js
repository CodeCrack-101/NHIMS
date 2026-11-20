import mongoose from 'mongoose'
import { Catalogue } from '../models/Catalogue.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryLog } from '../models/InventoryLog.js'
import { Invoice } from '../models/Invoice.js'
import {
  ensureDefaultCataloguesAndSync,
  broadcastInventoryEvent,
} from './inventory.service.js'
import { recordAuditLog } from './audit.service.js'
import { AppError } from '../utils/AppError.js'

// Decimal-safe currency rounding to 2 decimal places
export const roundCurrency = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.round((num + Number.EPSILON) * 100) / 100
}

export const generateNextInvoiceNumber = async (session = null) => {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const datePrefix = `${yy}${mm}-`

  const latestQuery = Invoice.findOne({
    invoiceNumber: { $regex: `^${datePrefix}` },
  })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean()

  if (session) {
    latestQuery.session(session)
  }

  const latest = await latestQuery
  let nextSeq = 1
  if (latest?.invoiceNumber) {
    const tail = latest.invoiceNumber.replace(datePrefix, '')
    const parsed = parseInt(tail, 10)
    if (Number.isFinite(parsed) && parsed >= 1) {
      nextSeq = parsed + 1
    }
  }

  return `${datePrefix}${String(nextSeq).padStart(4, '0')}`
}

export const getBillingCatalogues = async () => {
  await ensureDefaultCataloguesAndSync()

  const catalogues = await Catalogue.find({ isActive: true })
    .sort({ createdAt: 1 })
    .lean()

  const statsAgg = await Inventory.aggregate([
    {
      $group: {
        _id: '$catalogueId',
        totalPatterns: { $sum: 1 },
        availablePatterns: {
          $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] },
        },
        totalStock: { $sum: '$quantity' },
      },
    },
  ])

  const statsMap = new Map(statsAgg.map((s) => [s._id.toString(), s]))

  return catalogues.map((cat) => {
    const stat = statsMap.get(cat._id.toString()) || {
      totalPatterns: 0,
      availablePatterns: 0,
      totalStock: 0,
    }
    return {
      _id: cat._id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      defaultRate: cat.defaultRate ?? 1250,
      totalPatterns: stat.totalPatterns,
      availablePatterns: stat.availablePatterns,
      totalStock: stat.totalStock,
    }
  })
}

export const getPatternsByCatalogue = async (catalogueIdOrSlug) => {
  await ensureDefaultCataloguesAndSync()

  const raw = String(catalogueIdOrSlug || '').trim()
  let catalogue = null

  if (mongoose.Types.ObjectId.isValid(raw)) {
    catalogue = await Catalogue.findById(raw).lean()
  }
  if (!catalogue) {
    const upperSlug = raw.toUpperCase().replace(/\s+/g, '_')
    catalogue =
      (await Catalogue.findOne({ slug: upperSlug }).lean()) ||
      (await Catalogue.findOne({ slug: raw.toUpperCase() }).lean())
  }

  if (!catalogue) {
    throw new AppError('Selected catalogue not found.', 404, 'CATALOGUE_NOT_FOUND')
  }

  const patterns = await Inventory.find({ catalogueId: catalogue._id })
    .sort({ sequenceNumber: 1, patternNumber: 1 })
    .lean()

  const defaultRate = catalogue.defaultRate ?? 500

  return {
    catalogue: {
      _id: catalogue._id,
      name: catalogue.name,
      slug: catalogue.slug,
      defaultRate,
    },
    patterns: patterns.map((p) => ({
      _id: p._id,
      catalogueId: p.catalogueId,
      patternNumber: p.patternNumber,
      sequenceNumber: p.sequenceNumber,
      imagePath: p.imagePath,
      quantity: p.quantity,
      rate: p.rate ?? defaultRate,
      isAvailable: p.quantity > 0,
    })),
  }
}

export const getPatternStockById = async (patternId) => {
  const raw = String(patternId || '').trim()
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError('Invalid pattern ID.', 400, 'INVALID_PATTERN_ID')
  }

  const pattern = await Inventory.findById(raw)
    .populate('catalogueId', 'name slug defaultRate')
    .lean()

  if (!pattern) {
    throw new AppError('Pattern record not found.', 404, 'PATTERN_NOT_FOUND')
  }

  const defaultRate = pattern.catalogueId?.defaultRate ?? 500

  return {
    _id: pattern._id,
    catalogueId: pattern.catalogueId?._id || pattern.catalogueId,
    catalogueName: pattern.catalogueId?.name || '',
    catalogueSlug: pattern.catalogueId?.slug || '',
    patternNumber: pattern.patternNumber,
    imagePath: pattern.imagePath,
    quantity: pattern.quantity,
    rate: pattern.rate ?? defaultRate,
    isAvailable: pattern.quantity > 0,
  }
}

export const createBillTransaction = async ({
  customerName,
  mobileNumber,
  items,
  discountType = 'PERCENTAGE',
  discountValue = 0,
  taxRate = 0,
  paymentStatus = 'PAID',
  paymentMode = 'Cash',
  idempotencyKey = null,
  billerName = '',
  invoiceDate = null,
  userId,
  req,
}) => {
  // 1. Check idempotency key to prevent duplicate invoice submissions
  const cleanIdempotencyKey = idempotencyKey
    ? String(idempotencyKey).trim().slice(0, 120)
    : null

  if (cleanIdempotencyKey) {
    const existingInvoice = await Invoice.findOne({
      idempotencyKey: cleanIdempotencyKey,
    })
      .populate('createdBy', 'fullName email role')
      .lean()
    if (existingInvoice) {
      return { invoice: existingInvoice, duplicate: true }
    }
  }

  // 2. Validate Customer Details
  const cleanName = String(customerName || '').trim()
  if (cleanName.length < 2 || cleanName.length > 120) {
    throw new AppError(
      'Customer name must be between 2 and 120 characters.',
      400,
      'INVALID_CUSTOMER_NAME'
    )
  }

  const cleanMobile = String(mobileNumber || '')
    .trim()
    .replace(/[\s\-+()]/g, '')
  const normalizedMobile =
    cleanMobile.length === 12 && cleanMobile.startsWith('91')
      ? cleanMobile.slice(2)
      : cleanMobile

  if (!/^\d{10}$/.test(normalizedMobile)) {
    throw new AppError(
      'Please enter a valid 10-digit mobile number.',
      400,
      'INVALID_MOBILE_NUMBER'
    )
  }

  // 3. Validate Items Array & Consolidate Identical (catalogueId + patternNumber) Rows
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(
      'Please add at least one product roll to generate a bill.',
      400,
      'EMPTY_BILL_ITEMS'
    )
  }

  const consolidatedMap = new Map()
  for (let i = 0; i < items.length; i++) {
    const row = items[i]
    const rowNum = i + 1
    const rawCatId = String(row.catalogueId || '').trim()
    const rawPatNum = String(row.patternNumber || '').trim()
    const qty = Number(row.quantity)
    const rate = Number(row.rate)

    if (!rawCatId) {
      throw new AppError(
        `Row ${rowNum}: Please select a catalogue.`,
        400,
        'MISSING_CATALOGUE'
      )
    }
    if (!rawPatNum) {
      throw new AppError(
        `Row ${rowNum}: Please select a pattern number.`,
        400,
        'MISSING_PATTERN'
      )
    }
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new AppError(
        `Row ${rowNum} (Pattern ${rawPatNum}): Quantity must be a whole number greater than 0.`,
        400,
        'INVALID_QUANTITY'
      )
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new AppError(
        `Row ${rowNum} (Pattern ${rawPatNum}): Selling rate must be greater than ₹0.`,
        400,
        'INVALID_RATE'
      )
    }

    const key = `${rawCatId}::${rawPatNum}`
    if (consolidatedMap.has(key)) {
      const prev = consolidatedMap.get(key)
      prev.quantity += qty
      prev.rate = roundCurrency(rate)
    } else {
      consolidatedMap.set(key, {
        catalogueId: rawCatId,
        patternNumber: rawPatNum,
        quantity: qty,
        rate: roundCurrency(rate),
      })
    }
  }

  const consolidatedItems = Array.from(consolidatedMap.values())

  // 4. Validate Discount Input
  const normalizedDiscountType =
    String(discountType || 'PERCENTAGE').toUpperCase() === 'FIXED'
      ? 'FIXED'
      : 'PERCENTAGE'
  const cleanDiscountValue = roundCurrency(Math.max(0, Number(discountValue) || 0))

  if (normalizedDiscountType === 'PERCENTAGE' && cleanDiscountValue > 100) {
    throw new AppError(
      'Percentage discount cannot exceed 100%.',
      400,
      'INVALID_DISCOUNT'
    )
  }

  // 5. Ensure collections exist before starting a multi-document transaction (prevents MongoDB Atlas M0 namespace error)
  await ensureDefaultCataloguesAndSync()
  await Invoice.createCollection().catch(() => {})
  await InventoryLog.createCollection().catch(() => {})

  let createdInvoiceId = null
  const sseEventsToBroadcast = []

  const executeBillingOperations = async (session = null) => {
    sseEventsToBroadcast.length = 0

    const invoiceItems = []
    const logsToInsert = []
    const deductedRollbackList = []
    let runningSubtotal = 0
    let runningTotalQty = 0

    const invoiceNumber = await generateNextInvoiceNumber(session)

    try {
      for (const reqItem of consolidatedItems) {
        let catalogue = null
        if (mongoose.Types.ObjectId.isValid(reqItem.catalogueId)) {
          const q = Catalogue.findById(reqItem.catalogueId).lean()
          if (session) q.session(session)
          catalogue = await q
        }
        if (!catalogue) {
          const upperSlug = reqItem.catalogueId.toUpperCase().replace(/\s+/g, '_')
          const q = Catalogue.findOne({
            $or: [{ slug: upperSlug }, { name: reqItem.catalogueId.toUpperCase() }],
          }).lean()
          if (session) q.session(session)
          catalogue = await q
        }

        if (!catalogue) {
          throw new AppError(
            `Catalogue '${reqItem.catalogueId}' not found.`,
            404,
            'CATALOGUE_NOT_FOUND'
          )
        }

        const updateOpts = session ? { new: true, session } : { new: true }
        const updatedInventory = await Inventory.findOneAndUpdate(
          {
            catalogueId: catalogue._id,
            patternNumber: reqItem.patternNumber,
            quantity: { $gte: reqItem.quantity },
          },
          {
            $inc: { quantity: -reqItem.quantity },
            $set: { rate: reqItem.rate },
          },
          updateOpts
        ).lean()

        if (!updatedInventory) {
          const findQ = Inventory.findOne({
            catalogueId: catalogue._id,
            patternNumber: reqItem.patternNumber,
          }).lean()
          if (session) findQ.session(session)
          const currentRecord = await findQ

          if (!currentRecord) {
            throw new AppError(
              `Pattern '${reqItem.patternNumber}' does not exist in ${catalogue.name}.`,
              404,
              'PATTERN_NOT_FOUND'
            )
          }

          throw new AppError(
            `Insufficient stock for ${catalogue.name} – Pattern ${reqItem.patternNumber}. Available: ${currentRecord.quantity} rolls, Requested: ${reqItem.quantity} rolls.`,
            400,
            'INSUFFICIENT_STOCK'
          )
        }

        deductedRollbackList.push({
          _id: updatedInventory._id,
          quantity: reqItem.quantity,
        })

        const previousQuantity = updatedInventory.quantity + reqItem.quantity
        const newQuantity = updatedInventory.quantity
        const itemSubtotal = roundCurrency(reqItem.quantity * reqItem.rate)

        runningSubtotal = roundCurrency(runningSubtotal + itemSubtotal)
        runningTotalQty += reqItem.quantity

        invoiceItems.push({
          catalogueId: catalogue._id,
          catalogueName: catalogue.name,
          catalogueSlug: catalogue.slug,
          patternId: updatedInventory._id,
          patternNumber: updatedInventory.patternNumber,
          imagePath: updatedInventory.imagePath || '',
          quantity: reqItem.quantity,
          rate: reqItem.rate,
          subtotal: itemSubtotal,
        })

        logsToInsert.push({
          catalogueId: catalogue._id,
          patternNumber: updatedInventory.patternNumber,
          previousQuantity,
          newQuantity,
          changeAmount: reqItem.quantity,
          actionType: 'DECREASE',
          invoiceNumber,
          reason: 'BILLING_DEDUCTION',
          updatedBy: userId,
        })

        sseEventsToBroadcast.push({
          type: 'INVENTORY_UPDATED',
          catalogueId: catalogue._id.toString(),
          patternNumber: updatedInventory.patternNumber,
          quantity: newQuantity,
          previousQuantity,
          actionType: 'DECREASE',
          invoiceNumber,
          updatedAt: updatedInventory.updatedAt || new Date(),
        })
      }

      const computedDiscountAmount =
        normalizedDiscountType === 'PERCENTAGE'
          ? roundCurrency((runningSubtotal * cleanDiscountValue) / 100)
          : roundCurrency(cleanDiscountValue)

      if (computedDiscountAmount > runningSubtotal) {
        throw new AppError(
          `Discount amount (₹${computedDiscountAmount}) cannot exceed subtotal (₹${runningSubtotal}).`,
          400,
          'DISCOUNT_EXCEEDS_SUBTOTAL'
        )
      }

      const cleanTaxRate = roundCurrency(Math.max(0, Number(taxRate) || 0))
      const taxableAmount = roundCurrency(runningSubtotal - computedDiscountAmount)
      const computedTaxAmount = cleanTaxRate > 0 ? roundCurrency((taxableAmount * cleanTaxRate) / 100) : 0
      const finalTotal = roundCurrency(taxableAmount + computedTaxAmount)

      let parsedInvoiceDate = new Date()
      if (invoiceDate) {
        const customD = new Date(invoiceDate)
        if (!Number.isNaN(customD.getTime())) {
          parsedInvoiceDate = customD
        }
      }

      const invoiceDocData = {
        invoiceNumber,
        customerName: cleanName,
        mobileNumber: normalizedMobile,
        invoiceDate: parsedInvoiceDate,
        items: invoiceItems,
        totalItems: invoiceItems.length,
        totalQuantity: runningTotalQty,
        subtotal: runningSubtotal,
        discountType: normalizedDiscountType,
        discountValue: cleanDiscountValue,
        discountAmount: computedDiscountAmount,
        taxRate: cleanTaxRate,
        taxAmount: computedTaxAmount,
        finalTotal,
        paymentStatus: ['PAID', 'UNPAID'].includes(String(paymentStatus).toUpperCase())
          ? String(paymentStatus).toUpperCase()
          : 'PAID',
        paymentMode: String(paymentMode || 'Cash').trim(),
        billerName: String(billerName || '').trim(),
        createdBy: userId,
      }

      if (cleanIdempotencyKey) {
        invoiceDocData.idempotencyKey = cleanIdempotencyKey
      }

      if (session) {
        const [createdInvoice] = await Invoice.create([invoiceDocData], {
          session,
        })
        createdInvoiceId = createdInvoice._id
        if (logsToInsert.length > 0) {
          await InventoryLog.insertMany(logsToInsert, { session })
        }
      } else {
        const createdInvoice = await Invoice.create(invoiceDocData)
        createdInvoiceId = createdInvoice._id
        if (logsToInsert.length > 0) {
          await InventoryLog.insertMany(logsToInsert)
        }
      }
    } catch (opErr) {
      // If running in non-session fallback mode, roll back any deducted quantities
      if (!session && deductedRollbackList.length > 0) {
        await Promise.all(
          deductedRollbackList.map((rb) =>
            Inventory.findByIdAndUpdate(rb._id, {
              $inc: { quantity: rb.quantity },
            }).catch(() => {})
          )
        )
      }
      throw opErr
    }
  }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await executeBillingOperations(session)
    })
  } catch (txErr) {
    if (txErr.isOperational) {
      throw txErr
    }
    // Fallback if MongoDB cluster disallows multi-doc transaction namespace operation
    await executeBillingOperations(null)
  } finally {
    await session.endSession()
  }

  // Broadcast real-time stock deductions to all connected CRM views (Dashboard, Roll Details, Add Products, Billing)
  for (const evt of sseEventsToBroadcast) {
    broadcastInventoryEvent(evt)
  }

  const populatedInvoice = await Invoice.findById(createdInvoiceId)
    .populate('createdBy', 'fullName email role')
    .lean()

  if (req) {
    await recordAuditLog({
      userId,
      event: 'BILLING_INVOICE_CREATED',
      severity: 'INFO',
      req,
      metadata: {
        invoiceNumber: populatedInvoice.invoiceNumber,
        customerName: populatedInvoice.customerName,
        totalQuantity: populatedInvoice.totalQuantity,
        finalTotal: populatedInvoice.finalTotal,
      },
    }).catch(() => {})
  }

  return { invoice: populatedInvoice, duplicate: false }
}

export const searchAndListInvoices = async ({
  search = '',
  date = '',
  startDate = '',
  endDate = '',
  catalogue = '',
  minPrice = '',
  maxPrice = '',
  billerName = '',
  paymentStatus = '',
  page = 1,
  limit = 50,
}) => {
  const filter = {}
  const q = String(search || '').trim()

  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'i')
    filter.$or = [
      { invoiceNumber: regex },
      { customerName: regex },
      { mobileNumber: regex },
      { billerName: regex },
    ]
  }

  if (paymentStatus && paymentStatus !== 'ALL') {
    filter.paymentStatus = String(paymentStatus).toUpperCase()
  }

  if (billerName && billerName !== 'ALL') {
    filter.billerName = new RegExp(`^${billerName.trim()}$`, 'i')
  }

  if (date) {
    const dayStart = new Date(`${date}T00:00:00.000Z`)
    const dayEnd = new Date(`${date}T23:59:59.999Z`)
    if (!Number.isNaN(dayStart.getTime()) && !Number.isNaN(dayEnd.getTime())) {
      filter.invoiceDate = { $gte: dayStart, $lte: dayEnd }
    }
  } else if (startDate || endDate) {
    filter.invoiceDate = {}
    if (startDate) {
      const s = new Date(`${startDate}T00:00:00.000Z`)
      if (!Number.isNaN(s.getTime())) filter.invoiceDate.$gte = s
    }
    if (endDate) {
      const e = new Date(`${endDate}T23:59:59.999Z`)
      if (!Number.isNaN(e.getTime())) filter.invoiceDate.$lte = e
    }
    if (Object.keys(filter.invoiceDate).length === 0) {
      delete filter.invoiceDate
    }
  }

  // Catalogue filter (matching catalogueId or catalogueName/Slug inside items array)
  if (catalogue && catalogue !== 'ALL') {
    if (mongoose.Types.ObjectId.isValid(catalogue)) {
      filter['items.catalogueId'] = new mongoose.Types.ObjectId(catalogue)
    } else {
      filter.$or = filter.$or || []
      const catRegex = new RegExp(catalogue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter['items.catalogueName'] = catRegex
    }
  }

  // Price (finalTotal) filter
  const numMin = Number(minPrice)
  const numMax = Number(maxPrice)
  if (!Number.isNaN(numMin) && minPrice !== '' && minPrice !== null) {
    filter.finalTotal = filter.finalTotal || {}
    filter.finalTotal.$gte = numMin
  }
  if (!Number.isNaN(numMax) && maxPrice !== '' && maxPrice !== null) {
    filter.finalTotal = filter.finalTotal || {}
    filter.finalTotal.$lte = numMax
  }

  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50))
  const safePage = Math.max(1, Number(page) || 1)
  const skip = (safePage - 1) * safeLimit

  const [invoices, totalCount, nextInvoicePreview] = await Promise.all([
    Invoice.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('createdBy', 'fullName email role')
      .lean(),
    Invoice.countDocuments(filter),
    generateNextInvoiceNumber(),
  ])

  return {
    invoices,
    totalCount,
    page: safePage,
    limit: safeLimit,
    nextInvoicePreview,
  }
}

export const getDistinctBillers = async () => {
  const billers = await Invoice.distinct('billerName', {
    billerName: { $exists: true, $ne: '' },
  })
  return billers.filter(Boolean).sort()
}

export const getInvoiceById = async (invoiceIdOrNumber) => {
  const raw = String(invoiceIdOrNumber || '').trim()
  let invoice = null

  if (mongoose.Types.ObjectId.isValid(raw)) {
    invoice = await Invoice.findById(raw)
      .populate('createdBy', 'fullName email role')
      .lean()
  }
  if (!invoice) {
    invoice = await Invoice.findOne({ invoiceNumber: raw.toUpperCase() })
      .populate('createdBy', 'fullName email role')
      .lean()
  }

  if (!invoice) {
    throw new AppError('Invoice record not found.', 404, 'INVOICE_NOT_FOUND')
  }

  return invoice
}


export const updateInvoicePaymentStatus = async (invoiceId, paymentStatus, userId, req) => {
  const normalized = String(paymentStatus).toUpperCase()
  if (!['PAID', 'UNPAID'].includes(normalized)) {
    throw new AppError('Invalid payment status. Must be PAID or UNPAID.', 400, 'INVALID_PAYMENT_STATUS')
  }

  const invoice = await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: { paymentStatus: normalized } },
    { new: true }
  ).populate('createdBy', 'fullName email role')

  if (!invoice) {
    throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND')
  }

  if (req) {
    await recordAuditLog({
      userId,
      event: 'INVOICE_PAYMENT_STATUS_UPDATED',
      severity: 'INFO',
      req,
      metadata: {
        invoiceNumber: invoice.invoiceNumber,
        newStatus: normalized,
      },
    }).catch(() => {})
  }

  return invoice
}

export const getPendingAmountSummary = async () => {
  const pendingInvoices = await Invoice.find({ paymentStatus: 'UNPAID' })
    .sort({ invoiceDate: -1 })
    .lean()

  const customerMap = new Map()

  for (const inv of pendingInvoices) {
    const key = inv.mobileNumber || 'UNKNOWN'
    if (!customerMap.has(key)) {
      customerMap.set(key, {
        customerName: inv.customerName,
        mobileNumber: inv.mobileNumber,
        totalPendingAmount: 0,
        unpaidInvoicesCount: 0,
        invoices: [],
      })
    }
    const c = customerMap.get(key)
    c.totalPendingAmount += Number(inv.finalTotal) || 0
    c.unpaidInvoicesCount += 1
    c.invoices.push({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      finalTotal: inv.finalTotal,
      totalQuantity: inv.totalQuantity,
      billerName: inv.billerName,
      paymentMode: inv.paymentMode || 'Cash',
    })
  }

  const customers = Array.from(customerMap.values()).sort(
    (a, b) => b.totalPendingAmount - a.totalPendingAmount
  )

  const overallPendingAmount = customers.reduce(
    (sum, c) => sum + c.totalPendingAmount,
    0
  )

  return {
    overallPendingAmount,
    totalPendingCustomers: customers.length,
    totalPendingInvoices: pendingInvoices.length,
    customers,
  }
}

/**
 * DELETE INVOICE & RESTORE STOCK
 * Deletes invoice and reverts all deducted rolls back to inventory with logs and SSE broadcasts.
 */
export const deleteInvoiceAndRestoreStock = async (invoiceId, userId, req) => {
  const invoice = await Invoice.findById(invoiceId)
  if (!invoice) {
    throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND')
  }

  const invoiceNumber = invoice.invoiceNumber
  const items = invoice.items || []
  const logsToInsert = []
  const sseEventsToBroadcast = []

  const executeDeleteOperations = async (session) => {
    // 1. Revert each item's stock
    for (const item of items) {
      const invQuery = Inventory.findOne({
        catalogueId: item.catalogueId,
        patternNumber: item.patternNumber,
      })
      if (session) invQuery.session(session)
      const invDoc = await invQuery

      if (invDoc) {
        const previousQuantity = invDoc.quantity
        const restoredQuantity = item.quantity
        const newQuantity = previousQuantity + restoredQuantity

        const updateQuery = Inventory.findByIdAndUpdate(
          invDoc._id,
          {
            $set: { quantity: newQuantity },
          },
          { new: true }
        )
        if (session) updateQuery.session(session)
        const updatedInventory = await updateQuery

        logsToInsert.push({
          catalogueId: item.catalogueId,
          patternNumber: item.patternNumber,
          previousQuantity,
          newQuantity,
          changeAmount: restoredQuantity,
          actionType: 'INCREASE',
          invoiceNumber,
          reason: 'BILLING_CANCELLATION_RESTORE',
          updatedBy: userId,
        })

        sseEventsToBroadcast.push({
          type: 'INVENTORY_UPDATED',
          catalogueId: item.catalogueId.toString(),
          patternNumber: item.patternNumber,
          quantity: newQuantity,
          previousQuantity,
          actionType: 'INCREASE',
          invoiceNumber,
          updatedAt: updatedInventory?.updatedAt || new Date(),
        })
      }
    }

    if (logsToInsert.length > 0) {
      if (session) {
        await InventoryLog.insertMany(logsToInsert, { session })
      } else {
        await InventoryLog.insertMany(logsToInsert)
      }
    }

    // 2. Delete the Invoice
    const deleteQuery = Invoice.findByIdAndDelete(invoiceId)
    if (session) deleteQuery.session(session)
    await deleteQuery
  }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await executeDeleteOperations(session)
    })
  } catch (txErr) {
    if (txErr.isOperational) throw txErr
    await executeDeleteOperations(null)
  } finally {
    await session.endSession()
  }

  // 3. Broadcast real-time stock updates
  for (const evt of sseEventsToBroadcast) {
    broadcastInventoryEvent(evt)
  }

  if (req) {
    await recordAuditLog({
      userId,
      event: 'BILLING_INVOICE_DELETED',
      severity: 'WARNING',
      req,
      metadata: {
        invoiceNumber,
        customerName: invoice.customerName,
        totalQuantityRestored: invoice.totalQuantity,
        finalTotal: invoice.finalTotal,
      },
    }).catch(() => {})
  }

  return { invoiceNumber, restoredQuantity: invoice.totalQuantity }
}

/**
 * UPDATE/EDIT INVOICE & ADJUST STOCK
 * Adjusts inventory stock differences (diff = newQty - oldQty), updates prices, customer, discount, tax, etc.
 */
export const updateInvoiceAndAdjustStock = async (
  invoiceId,
  {
    customerName,
    mobileNumber,
    billerName,
    paymentStatus,
    paymentMode,
    discountType,
    discountValue,
    taxRate,
    invoiceDate,
    items: newItemsReq = [],
  },
  userId,
  req
) => {
  const existingInvoice = await Invoice.findById(invoiceId)
  if (!existingInvoice) {
    throw new AppError('Invoice not found.', 404, 'INVOICE_NOT_FOUND')
  }

  if (!newItemsReq || newItemsReq.length === 0) {
    throw new AppError('Invoice must contain at least one billing item.', 400, 'ITEMS_REQUIRED')
  }

  const invoiceNumber = existingInvoice.invoiceNumber
  const oldItems = existingInvoice.items || []

  // Map of old items: key -> item
  const oldItemMap = new Map()
  for (const oi of oldItems) {
    const key = `${oi.catalogueId.toString()}_${oi.patternNumber}`
    oldItemMap.set(key, (oldItemMap.get(key) || 0) + Number(oi.quantity))
  }

  // Map of new items: key -> total new qty
  const newItemMap = new Map()
  for (const ni of newItemsReq) {
    const key = `${ni.catalogueId.toString()}_${ni.patternNumber}`
    newItemMap.set(key, (newItemMap.get(key) || 0) + Number(ni.quantity))
  }

  const logsToInsert = []
  const sseEventsToBroadcast = []
  let updatedInvoiceDoc = null

  const executeUpdateOperations = async (session) => {
    // 1. Process all keys in old and new items to adjust stock
    const allKeys = new Set([...oldItemMap.keys(), ...newItemMap.keys()])

    for (const key of allKeys) {
      const [catIdStr, patternNumber] = key.split('_')
      const oldQty = oldItemMap.get(key) || 0
      const newQty = newItemMap.get(key) || 0
      const diff = newQty - oldQty // if > 0: need to deduct diff rolls; if < 0: need to restore (-diff) rolls

      if (diff !== 0) {
        const invQuery = Inventory.findOne({
          catalogueId: catIdStr,
          patternNumber,
        })
        if (session) invQuery.session(session)
        const invDoc = await invQuery

        if (!invDoc) {
          throw new AppError(
            `Inventory record not found for pattern ${patternNumber}.`,
            404,
            'PATTERN_NOT_FOUND'
          )
        }

        // If increasing bill quantity (diff > 0), verify stock availability
        if (diff > 0 && invDoc.quantity < diff) {
          throw new AppError(
            `Insufficient stock for Pattern ${patternNumber}. Need ${diff} more, but only ${invDoc.quantity} available.`,
            400,
            'INSUFFICIENT_STOCK'
          )
        }

        const previousQuantity = invDoc.quantity
        const newQuantity = previousQuantity - diff // deduct if diff > 0, restore if diff < 0

        const updateInvQuery = Inventory.findByIdAndUpdate(
          invDoc._id,
          { $set: { quantity: newQuantity } },
          { new: true }
        )
        if (session) updateInvQuery.session(session)
        const updatedInventory = await updateInvQuery

        const actionType = diff > 0 ? 'DECREASE' : 'INCREASE'
        const changeAmount = Math.abs(diff)

        logsToInsert.push({
          catalogueId: catIdStr,
          patternNumber,
          previousQuantity,
          newQuantity,
          changeAmount,
          actionType,
          invoiceNumber,
          reason: 'BILLING_EDIT_ADJUSTMENT',
          updatedBy: userId,
        })

        sseEventsToBroadcast.push({
          type: 'INVENTORY_UPDATED',
          catalogueId: catIdStr,
          patternNumber,
          quantity: newQuantity,
          previousQuantity,
          actionType,
          invoiceNumber,
          updatedAt: updatedInventory?.updatedAt || new Date(),
        })
      }
    }

    if (logsToInsert.length > 0) {
      if (session) {
        await InventoryLog.insertMany(logsToInsert, { session })
      } else {
        await InventoryLog.insertMany(logsToInsert)
      }
    }

    // 2. Recalculate invoice totals
    let runningSubtotal = 0
    let runningTotalQty = 0
    const processedInvoiceItems = []

    for (const it of newItemsReq) {
      const q = Number(it.quantity)
      const r = Number(it.rate)
      const itemSubtotal = roundCurrency(q * r)
      runningTotalQty += q
      runningSubtotal = roundCurrency(runningSubtotal + itemSubtotal)

      // Fetch catalogue name/slug
      const catQuery = Catalogue.findById(it.catalogueId)
      if (session) catQuery.session(session)
      const cat = await catQuery

      processedInvoiceItems.push({
        catalogueId: it.catalogueId,
        catalogueName: cat?.name || it.catalogueName || 'Catalogue',
        catalogueSlug: cat?.slug || it.catalogueSlug || 'catalogue',
        patternNumber: it.patternNumber,
        imagePath: it.imagePath || '',
        quantity: q,
        rate: r,
        subtotal: itemSubtotal,
      })
    }

    const normDiscountType = discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE'
    const cleanDiscountVal = Math.max(0, Number(discountValue) || 0)
    const computedDiscountAmount =
      normDiscountType === 'PERCENTAGE'
        ? roundCurrency((runningSubtotal * cleanDiscountVal) / 100)
        : roundCurrency(cleanDiscountVal)

    if (computedDiscountAmount > runningSubtotal) {
      throw new AppError(
        `Discount amount (₹${computedDiscountAmount}) cannot exceed subtotal (₹${runningSubtotal}).`,
        400,
        'DISCOUNT_EXCEEDS_SUBTOTAL'
      )
    }

    const cleanTaxRate = roundCurrency(Math.max(0, Number(taxRate) || 0))
    const taxableAmount = roundCurrency(runningSubtotal - computedDiscountAmount)
    const computedTaxAmount = cleanTaxRate > 0 ? roundCurrency((taxableAmount * cleanTaxRate) / 100) : 0
    const finalTotal = roundCurrency(taxableAmount + computedTaxAmount)

    let parsedUpdateDate = existingInvoice.invoiceDate
    if (invoiceDate) {
      const customD = new Date(invoiceDate)
      if (!Number.isNaN(customD.getTime())) {
        parsedUpdateDate = customD
      }
    }

    const updateData = {
      customerName: String(customerName || existingInvoice.customerName).trim(),
      mobileNumber: String(mobileNumber || existingInvoice.mobileNumber).trim(),
      billerName: String(billerName || existingInvoice.billerName || '').trim(),
      invoiceDate: parsedUpdateDate,
      paymentStatus: ['PAID', 'UNPAID'].includes(String(paymentStatus).toUpperCase())
        ? String(paymentStatus).toUpperCase()
        : existingInvoice.paymentStatus,
      paymentMode: String(paymentMode || existingInvoice.paymentMode || 'Cash').trim(),
      items: processedInvoiceItems,
      totalItems: processedInvoiceItems.length,
      totalQuantity: runningTotalQty,
      subtotal: runningSubtotal,
      discountType: normDiscountType,
      discountValue: cleanDiscountVal,
      discountAmount: computedDiscountAmount,
      taxRate: cleanTaxRate,
      taxAmount: computedTaxAmount,
      finalTotal,
    }

    const updateInvQuery = Invoice.findByIdAndUpdate(invoiceId, { $set: updateData }, { new: true })
    if (session) updateInvQuery.session(session)
    updatedInvoiceDoc = await updateInvQuery
  }

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      await executeUpdateOperations(session)
    })
  } catch (txErr) {
    if (txErr.isOperational) throw txErr
    await executeUpdateOperations(null)
  } finally {
    await session.endSession()
  }

  // 3. Broadcast real-time stock updates
  for (const evt of sseEventsToBroadcast) {
    broadcastInventoryEvent(evt)
  }

  if (req) {
    await recordAuditLog({
      userId,
      event: 'BILLING_INVOICE_UPDATED',
      severity: 'INFO',
      req,
      metadata: {
        invoiceNumber,
        newFinalTotal: updatedInvoiceDoc?.finalTotal,
        newQuantity: updatedInvoiceDoc?.totalQuantity,
      },
    }).catch(() => {})
  }

  return updatedInvoiceDoc
}
