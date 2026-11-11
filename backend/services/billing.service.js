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
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const datePrefix = `NH-INV-${yyyy}${mm}${dd}-`

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
  idempotencyKey = null,
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

      const invoiceDocData = {
        invoiceNumber,
        customerName: cleanName,
        mobileNumber: normalizedMobile,
        invoiceDate: new Date(),
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
    ]
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
