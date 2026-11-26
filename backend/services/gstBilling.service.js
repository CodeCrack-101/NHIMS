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
    return '1'
  }

  // Parse trailing numeric
  const match = String(latest.invoiceNumber).match(/\d+$/)
  if (match) {
    const nextVal = parseInt(match[0], 10) + 1
    return String(nextVal)
  }

  return '1'
}

/**
 * Create GST Tax Invoice
 * Supports Catalogue live stock deduction if itemType === 'CATALOGUE'
 */
export const createGstInvoice = async (payload, userId, req = null) => {
  const effectiveUserId = userId || payload?.createdBy
  if (!effectiveUserId) {
    throw new AppError('Created By user ID is required to create a GST invoice.', 401)
  }

  const {
    invoiceDate = null,
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

  let parsedInvoiceDate = new Date()
  if (invoiceDate) {
    if (typeof invoiceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate.trim())) {
      const [yr, mo, da] = invoiceDate.trim().split('-').map(Number)
      const now = new Date()
      parsedInvoiceDate = new Date(yr, mo - 1, da, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
    } else {
      const customD = new Date(invoiceDate)
      if (!Number.isNaN(customD.getTime())) {
        parsedInvoiceDate = customD
      }
    }
  }

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
    if (it.itemType === 'CATALOGUE' && (it.patternId || it.patternNumber)) {
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
      let invRecord = null
      if (d.patternId) {
        invRecord = await Inventory.findById(d.patternId).session(session)
      }
      if (!invRecord && d.catalogueId && d.patternNumber) {
        invRecord = await Inventory.findOne({
          catalogueId: d.catalogueId,
          patternNumber: d.patternNumber,
        }).session(session)
      }
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
            userId: effectiveUserId,
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
          invoiceDate: parsedInvoiceDate,
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
          createdBy: effectiveUserId,
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
        userId: effectiveUserId,
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

/**
 * Delete GST Invoice and restore catalogue inventory stock
 */
export const deleteGstInvoiceAndRestoreStock = async (invoiceId, userId, req = null) => {
  const invoice = await GstInvoice.findById(invoiceId)
  if (!invoice) {
    throw new AppError('GST Invoice not found.', 404)
  }

  const items = invoice.items || []
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const sseUpdates = []

    for (const it of items) {
      // Restore ONLY catalogue items
      if (it.itemType === 'CATALOGUE' && (it.patternId || (it.catalogueId && it.patternNumber))) {
        let invDoc = null
        if (it.patternId) {
          invDoc = await Inventory.findById(it.patternId).session(session)
        }
        if (!invDoc && it.catalogueId && it.patternNumber) {
          invDoc = await Inventory.findOne({
            catalogueId: it.catalogueId,
            patternNumber: it.patternNumber,
          }).session(session)
        }

        if (invDoc) {
          const prevQty = invDoc.quantity
          const restoredQty = Number(it.quantity) || 0
          invDoc.quantity += restoredQty
          await invDoc.save({ session })

          await InventoryLog.create(
            [
              {
                catalogueId: invDoc.catalogueId,
                patternId: invDoc._id,
                patternNumber: invDoc.patternNumber,
                changeType: 'INVOICE_RESTORE',
                quantityChange: restoredQty,
                previousQuantity: prevQty,
                newQuantity: invDoc.quantity,
                reason: `GST Invoice #${invoice.invoiceNumber} deleted - stock restored`,
                userId,
              },
            ],
            { session }
          )

          sseUpdates.push({
            catalogueId: invDoc.catalogueId,
            patternId: invDoc._id,
          })
        }
      }
    }

    await GstInvoice.findByIdAndDelete(invoiceId).session(session)
    await session.commitTransaction()

    // Broadcast SSE updates after transaction commit
    for (const u of sseUpdates) {
      broadcastInventoryEvent('STOCK_UPDATED', u)
    }

    if (req) {
      recordAuditLog({
        userId,
        action: 'GST_INVOICE_DELETED',
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          customer: invoice.billTo?.firmName,
        },
      }).catch(() => {})
    }

    return { success: true, message: `GST Invoice #${invoice.invoiceNumber} deleted and catalogue stock restored.` }
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

/**
 * Update GST Invoice & Synchronously Adjust Catalogue Inventory Stock
 * Only items marked itemType === 'CATALOGUE' impact stock.
 * Custom items (itemType === 'CUSTOM') are saved without deducting stock.
 */
export const updateGstInvoiceAndAdjustStock = async (invoiceId, payload, userId, req = null) => {
  const existingInvoice = await GstInvoice.findById(invoiceId)
  if (!existingInvoice) {
    throw new AppError('GST Invoice not found.', 404)
  }

  const {
    invoiceDate = existingInvoice.invoiceDate,
    placeOfSupply = existingInvoice.placeOfSupply || '27-Maharashtra',
    billTo = existingInvoice.billTo,
    shipTo = existingInvoice.shipTo,
    items = existingInvoice.items,
    paymentStatus = existingInvoice.paymentStatus || 'PAID',
    paymentMode = existingInvoice.paymentMode || 'Gpay',
    receivedAmount,
    billerName = existingInvoice.billerName || 'Shifa',
    notes = existingInvoice.notes || '',
  } = payload

  if (!billTo || !billTo.firmName || !billTo.contactNumber) {
    throw new AppError('Bill To firm name and contact number are required.', 400)
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('At least one item is required in GST invoice.', 400)
  }

  const posCode = String(placeOfSupply).split('-')[0].trim()
  const isInterState = posCode !== '27'

  let parsedUpdateDate = existingInvoice.invoiceDate
  if (invoiceDate) {
    if (typeof invoiceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate.trim())) {
      const [yr, mo, da] = invoiceDate.trim().split('-').map(Number)
      const orig = existingInvoice.invoiceDate ? new Date(existingInvoice.invoiceDate) : new Date()
      parsedUpdateDate = new Date(yr, mo - 1, da, orig.getHours(), orig.getMinutes(), orig.getSeconds())
    } else {
      const customD = new Date(invoiceDate)
      if (!Number.isNaN(customD.getTime())) {
        parsedUpdateDate = customD
      }
    }
  }

  // Process & calculate items
  let subTotal = 0
  let totalTax = 0
  let totalQuantity = 0
  const processedItems = []

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    const qty = Number(it.quantity) || 0
    const price = Number(it.pricePerUnit) || 0
    const gstRate = Number(it.gstRate ?? 18) || 0

    if (qty <= 0) {
      throw new AppError(`Item #${idx + 1} must have a quantity greater than zero.`, 400)
    }

    const taxable = Math.round(qty * price * 100) / 100
    const gstAmt = Math.round(taxable * (gstRate / 100) * 100) / 100
    const lineTotal = Math.round((taxable + gstAmt) * 100) / 100

    subTotal += taxable
    totalTax += gstAmt
    totalQuantity += qty

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
  const finalWords = convertNumberToWords(finalTotal)

  // Calculate delta stock adjustments ONLY for itemType === 'CATALOGUE'
  // Old items map
  const oldCatalogMap = new Map()
  for (const oldIt of existingInvoice.items || []) {
    if (oldIt.itemType === 'CATALOGUE' && (oldIt.patternId || oldIt.patternNumber)) {
      const key = oldIt.patternId ? String(oldIt.patternId) : `${oldIt.catalogueId}_${oldIt.patternNumber}`
      oldCatalogMap.set(key, (oldCatalogMap.get(key) || 0) + Number(oldIt.quantity))
    }
  }

  // New items map
  const newCatalogMap = new Map()
  const keyToPatternInfo = new Map()
  for (const newIt of processedItems) {
    if (newIt.itemType === 'CATALOGUE' && (newIt.patternId || newIt.patternNumber)) {
      const key = newIt.patternId ? String(newIt.patternId) : `${newIt.catalogueId}_${newIt.patternNumber}`
      newCatalogMap.set(key, (newCatalogMap.get(key) || 0) + Number(newIt.quantity))
      if (!keyToPatternInfo.has(key)) {
        keyToPatternInfo.set(key, {
          patternId: newIt.patternId,
          catalogueId: newIt.catalogueId,
          patternNumber: newIt.patternNumber,
        })
      }
    }
  }

  // Merge all keys to compute net changes: netChange = oldQty - newQty
  // If netChange > 0: quantity was reduced in bill => restore to inventory
  // If netChange < 0: quantity was increased in bill => deduct from inventory
  const allKeys = new Set([...oldCatalogMap.keys(), ...newCatalogMap.keys()])

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const sseUpdates = []

    for (const key of allKeys) {
      const oldQty = oldCatalogMap.get(key) || 0
      const newQty = newCatalogMap.get(key) || 0
      const netRestoreQty = oldQty - newQty // positive means restore, negative means deduct

      if (netRestoreQty !== 0) {
        let invDoc = null
        const info = keyToPatternInfo.get(key) || {}
        if (info.patternId || (key.length === 24 && mongoose.Types.ObjectId.isValid(key))) {
          invDoc = await Inventory.findById(info.patternId || key).session(session)
        }
        if (!invDoc && info.catalogueId && info.patternNumber) {
          invDoc = await Inventory.findOne({
            catalogueId: info.catalogueId,
            patternNumber: info.patternNumber,
          }).session(session)
        }

        if (!invDoc) {
          // If trying to deduct from non-existent inventory
          if (netRestoreQty < 0) {
            throw new AppError(`Catalogue pattern in bill not found in inventory.`, 404)
          }
          continue
        }

        // If deducting more than available
        if (netRestoreQty < 0 && invDoc.quantity < Math.abs(netRestoreQty)) {
          throw new AppError(
            `Insufficient stock for pattern "${invDoc.patternNumber}". Available: ${invDoc.quantity}, needed additional: ${Math.abs(netRestoreQty)}`,
            400
          )
        }

        const prevQty = invDoc.quantity
        invDoc.quantity += netRestoreQty
        await invDoc.save({ session })

        await InventoryLog.create(
          [
            {
              catalogueId: invDoc.catalogueId,
              patternId: invDoc._id,
              patternNumber: invDoc.patternNumber,
              changeType: netRestoreQty > 0 ? 'INVOICE_RESTORE' : 'SALE_DEDUCTION',
              quantityChange: netRestoreQty,
              previousQuantity: prevQty,
              newQuantity: invDoc.quantity,
              reason: `GST Invoice #${existingInvoice.invoiceNumber} edited (${netRestoreQty > 0 ? `+${netRestoreQty}` : netRestoreQty} rolls)`,
              userId,
            },
          ],
          { session }
        )

        sseUpdates.push({
          catalogueId: invDoc.catalogueId,
          patternId: invDoc._id,
        })
      }
    }

    // Update the invoice document
    existingInvoice.invoiceDate = parsedUpdateDate
    existingInvoice.placeOfSupply = placeOfSupply
    existingInvoice.supplyStateCode = posCode
    existingInvoice.supplyStateName = String(placeOfSupply).split('-')[1]?.trim() || ''
    existingInvoice.billTo = billTo
    existingInvoice.shipTo = shipTo || billTo
    existingInvoice.items = processedItems
    existingInvoice.totalItems = processedItems.length
    existingInvoice.totalQuantity = totalQuantity
    existingInvoice.subTotal = subTotal
    existingInvoice.isInterState = isInterState
    existingInvoice.cgstAmount = cgstAmount
    existingInvoice.sgstAmount = sgstAmount
    existingInvoice.igstAmount = igstAmount
    existingInvoice.totalTax = totalTax
    existingInvoice.finalTotal = finalTotal
    existingInvoice.finalTotalInWords = finalWords
    existingInvoice.receivedAmount = recAmt
    existingInvoice.balanceAmount = balAmt
    existingInvoice.paymentStatus = paymentStatus
    existingInvoice.paymentMode = paymentMode
    existingInvoice.billerName = billerName
    existingInvoice.notes = notes

    await existingInvoice.save({ session })
    await session.commitTransaction()

    // Broadcast live SSE stock updates
    for (const u of sseUpdates) {
      broadcastInventoryEvent('STOCK_UPDATED', u)
    }

    if (req) {
      recordAuditLog({
        userId,
        action: 'GST_INVOICE_UPDATED',
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent'],
        metadata: {
          invoiceNumber: existingInvoice.invoiceNumber,
          finalTotal: existingInvoice.finalTotal,
          customer: billTo.firmName,
        },
      }).catch(() => {})
    }

    return existingInvoice
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}
