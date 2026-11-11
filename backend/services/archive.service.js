import crypto from 'crypto'
import { Invoice } from '../models/Invoice.js'
import { ArchiveMetadata } from '../models/ArchiveMetadata.js'
import { ArchivedInvoiceMetadata } from '../models/ArchivedInvoiceMetadata.js'
import { recordAuditLog } from './audit.service.js'
import { AppError } from '../utils/AppError.js'
import { buildDateFilter } from './reports.service.js'

/**
 * 1. Generate Complete Quarterly Data Package (Payload for Client/ZIP generation)
 */
export const prepareQuarterlyArchiveData = async ({
  startDate,
  endDate,
  quarterLabel,
  userId,
}) => {
  const start = new Date(startDate)
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new AppError('Invalid start or end date provided.', 400)
  }

  // Fetch all invoices in date range
  const invoices = await Invoice.find({
    invoiceDate: { $gte: start, $lte: end },
  })
    .sort({ invoiceDate: 1 })
    .lean()

  if (invoices.length === 0) {
    throw new AppError('No invoices found in the selected date range to archive.', 404)
  }

  // Financial and Items Calculations
  let totalSales = 0
  let totalDiscount = 0
  let totalQuantity = 0
  const catalogueMap = new Map()
  const patternMap = new Map()

  const flatItems = []

  for (const inv of invoices) {
    totalSales += inv.finalTotal || 0
    totalDiscount += inv.discountAmount || 0
    totalQuantity += inv.totalQuantity || 0

    for (const it of inv.items || []) {
      flatItems.push({
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: inv.customerName,
        mobileNumber: inv.mobileNumber,
        catalogueName: it.catalogueName,
        patternNumber: it.patternNumber,
        quantity: it.quantity,
        rate: it.rate,
        subtotal: it.subtotal,
      })

      // Catalogue summary
      const cStat = catalogueMap.get(it.catalogueName) || { rollsCount: 0, revenue: 0 }
      cStat.rollsCount += it.quantity
      cStat.revenue += it.subtotal
      catalogueMap.set(it.catalogueName, cStat)

      // Pattern summary
      const key = `${it.catalogueName} - ${it.patternNumber}`
      const pStat = patternMap.get(key) || { rollsCount: 0, revenue: 0 }
      pStat.rollsCount += it.quantity
      pStat.revenue += it.subtotal
      patternMap.set(key, pStat)
    }
  }

  const catalogueSummary = Array.from(catalogueMap.entries()).map(([k, v]) => ({
    catalogueName: k,
    rollsCount: v.rollsCount,
    revenue: v.revenue,
  }))

  const patternSummary = Array.from(patternMap.entries()).map(([k, v]) => ({
    patternKey: k,
    rollsCount: v.rollsCount,
    revenue: v.revenue,
  }))

  const archiveId = `ARCHIVE-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

  // Prepare Archive Manifest
  const manifest = {
    archiveId,
    system: 'NH Enterprise CRM',
    quarterLabel: quarterLabel || `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    generatedAt: new Date().toISOString(),
    invoiceCount: invoices.length,
    totalQuantity,
    totalSales,
    totalDiscount,
    catalogueSummary,
    patternSummary,
    recordSnapshotsCount: flatItems.length,
  }

  const manifestString = JSON.stringify(manifest, null, 2)
  const manifestChecksum = crypto.createHash('sha256').update(manifestString).digest('hex')
  manifest.manifestChecksum = manifestChecksum

  // Save preliminary record in ArchiveMetadata
  const archiveDoc = await ArchiveMetadata.create({
    archiveId,
    quarterLabel: manifest.quarterLabel,
    startDate: start,
    endDate: end,
    invoiceCount: invoices.length,
    totalQuantity,
    totalSales,
    totalDiscount,
    catalogueSummary,
    manifestChecksum,
    status: 'EXPORTED',
    createdBy: userId,
  })

  await recordAuditLog({
    userId,
    event: 'QUARTERLY_ARCHIVE_DATA_EXPORTED',
    severity: 'INFO',
    metadata: {
      archiveId,
      invoiceCount: invoices.length,
      totalSales,
      dateRange: { start, end },
    },
  })

  return {
    archiveId,
    manifest,
    invoices,
    flatItems,
    catalogueSummary,
    patternSummary,
  }
}

/**
 * 2. Verify Uploaded / Inspected Archive Manifest against Database
 */
export const verifyArchiveIntegrity = async ({ archiveId, manifest, userId }) => {
  if (!archiveId || !manifest) {
    throw new AppError('Archive ID and Manifest are required for verification.', 400)
  }

  const record = await ArchiveMetadata.findOne({ archiveId })
  if (!record) {
    throw new AppError(`Archive record ${archiveId} not found in database.`, 404)
  }

  // Verify financial totals and invoice count match
  if (record.invoiceCount !== manifest.invoiceCount) {
    throw new AppError(
      `Invoice count mismatch! DB: ${record.invoiceCount}, Manifest: ${manifest.invoiceCount}`,
      422
    )
  }

  if (Math.abs(record.totalSales - manifest.totalSales) > 0.01) {
    throw new AppError(
      `Financial total mismatch! DB: ${record.totalSales}, Manifest: ${manifest.totalSales}`,
      422
    )
  }

  if (record.totalQuantity !== manifest.totalQuantity) {
    throw new AppError(
      `Total rolls quantity mismatch! DB: ${record.totalQuantity}, Manifest: ${manifest.totalQuantity}`,
      422
    )
  }

  record.status = 'VERIFIED'
  record.verifiedAt = new Date()
  await record.save()

  await recordAuditLog({
    userId,
    event: 'ARCHIVE_VERIFICATION_SUCCESSFUL',
    severity: 'INFO',
    metadata: {
      archiveId,
      invoiceCount: record.invoiceCount,
      totalSales: record.totalSales,
    },
  })

  return {
    success: true,
    message: 'Archive verified successfully against DB audit records.',
    archive: record,
  }
}

/**
 * 3. Manual Cleanup Confirmation Execution
 * Only executes if archive was verified and explicit admin consent is provided.
 */
export const performManualActiveCleanup = async ({
  archiveId,
  adminConfirmation,
  userId,
}) => {
  const requiredConsent =
    'I have safely downloaded and verified this quarterly archive. I understand that eligible detailed invoice records will be removed from the active database.'

  if (adminConfirmation?.trim() !== requiredConsent) {
    throw new AppError(
      'Cleanup confirmation phrase does not match the exact security requirement.',
      400
    )
  }

  const archiveRecord = await ArchiveMetadata.findOne({ archiveId })
  if (!archiveRecord) {
    throw new AppError(`Archive ${archiveId} not found.`, 404)
  }

  if (archiveRecord.status !== 'VERIFIED') {
    throw new AppError(
      `Cannot clean active database. Archive ${archiveId} has status: "${archiveRecord.status}". It must be VERIFIED first.`,
      403
    )
  }

  // 1. Fetch eligible detailed invoices to move into ArchivedInvoiceMetadata
  const eligibleInvoices = await Invoice.find({
    invoiceDate: { $gte: archiveRecord.startDate, $lte: archiveRecord.endDate },
  }).lean()

  if (eligibleInvoices.length === 0) {
    throw new AppError('No matching active invoices found for this period to clean.', 400)
  }

  // 2. Insert into ArchivedInvoiceMetadata
  const lightweightBatch = eligibleInvoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    archiveId: archiveRecord.archiveId,
    customerName: inv.customerName,
    mobileNumber: inv.mobileNumber,
    invoiceDate: inv.invoiceDate,
    catalogues: Array.from(new Set(inv.items.map((i) => i.catalogueName))),
    patternNumbers: Array.from(new Set(inv.items.map((i) => i.patternNumber))),
    totalItems: inv.totalItems,
    totalQuantity: inv.totalQuantity,
    subtotal: inv.subtotal,
    discountAmount: inv.discountAmount,
    finalTotal: inv.finalTotal,
    fullSnapshot: inv, // preserves all customer, rates, and items snapshot
    isArchived: true,
  }))

  // Save lightweight searchable metadata (using bulkWrite with upsert to prevent duplicates)
  const bulkOps = lightweightBatch.map((doc) => ({
    updateOne: {
      filter: { invoiceNumber: doc.invoiceNumber },
      update: { $set: doc },
      upsert: true,
    },
  }))
  await ArchivedInvoiceMetadata.bulkWrite(bulkOps)

  // 3. Remove from active Invoices collection
  const invoiceIds = eligibleInvoices.map((i) => i._id)
  const deleteResult = await Invoice.deleteMany({ _id: { $in: invoiceIds } })

  // 4. Update ArchiveMetadata status
  archiveRecord.status = 'CLEANED_ACTIVE'
  archiveRecord.cleanedAt = new Date()
  await archiveRecord.save()

  // 5. Audit Log (Never deletes inventory, catalogue, or counters)
  await recordAuditLog({
    userId,
    event: 'MANUAL_QUARTERLY_DATABASE_CLEANUP_COMPLETED',
    severity: 'WARN',
    metadata: {
      archiveId,
      cleanedInvoiceCount: deleteResult.deletedCount,
      retainedLightweightCount: lightweightBatch.length,
      period: {
        start: archiveRecord.startDate,
        end: archiveRecord.endDate,
      },
    },
  })

  return {
    success: true,
    deletedFromActive: deleteResult.deletedCount,
    retainedMetadataCount: lightweightBatch.length,
    message: `Cleaned ${deleteResult.deletedCount} invoices from active DB. Searchable metadata and historical numbers preserved.`,
  }
}

/**
 * 4. List Archive History
 */
export const getArchiveHistoryList = async () => {
  return ArchiveMetadata.find()
    .sort({ createdAt: -1 })
    .populate('createdBy', 'fullName email')
    .lean()
}

/**
 * 5. Historical Search across Active & Archived
 */
export const searchHistoricalArchivedInvoices = async ({
  invoiceNumber,
  mobileNumber,
  catalogue,
  patternNumber,
  startDate,
  endDate,
  page = 1,
  limit = 20,
}) => {
  const query = {}

  if (invoiceNumber) {
    query.invoiceNumber = new RegExp(invoiceNumber.trim(), 'i')
  }
  if (mobileNumber) {
    query.mobileNumber = new RegExp(mobileNumber.trim(), 'i')
  }
  if (catalogue && catalogue !== 'ALL') {
    query.catalogues = new RegExp(`^${catalogue.trim()}$`, 'i')
  }
  if (patternNumber && patternNumber !== 'ALL') {
    query.patternNumbers = new RegExp(`^${patternNumber.trim()}$`, 'i')
  }
  if (startDate || endDate) {
    query.invoiceDate = {}
    if (startDate) query.invoiceDate.$gte = new Date(startDate)
    if (endDate) {
      const e = new Date(endDate)
      e.setHours(23, 59, 59, 999)
      query.invoiceDate.$lte = e
    }
  }

  const skip = (Number(page) - 1) * Number(limit)

  const [totalCount, records] = await Promise.all([
    ArchivedInvoiceMetadata.countDocuments(query),
    ArchivedInvoiceMetadata.find(query)
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
  ])

  return {
    totalCount,
    page: Number(page),
    totalPages: Math.ceil(totalCount / Number(limit)),
    records,
  }
}

/**
 * 6. Restore Archived Invoices back to Active
 */
export const restoreArchivedInvoices = async ({ archiveId, userId }) => {
  const archive = await ArchiveMetadata.findOne({ archiveId })
  if (!archive) {
    throw new AppError(`Archive ${archiveId} not found.`, 404)
  }

  const archivedRecords = await ArchivedInvoiceMetadata.find({ archiveId }).lean()
  if (archivedRecords.length === 0) {
    throw new AppError(`No archived invoice metadata found for ${archiveId}.`, 404)
  }

  // Restore snapshots to active Invoice collection
  const invoicesToRestore = archivedRecords
    .filter((r) => r.fullSnapshot)
    .map((r) => r.fullSnapshot)

  if (invoicesToRestore.length > 0) {
    const bulkOps = invoicesToRestore.map((inv) => ({
      updateOne: {
        filter: { invoiceNumber: inv.invoiceNumber },
        update: { $set: inv },
        upsert: true,
      },
    }))
    await Invoice.bulkWrite(bulkOps)
  }

  archive.status = 'RESTORED'
  await archive.save()

  await recordAuditLog({
    userId,
    event: 'ARCHIVE_RESTORED_TO_ACTIVE',
    severity: 'INFO',
    metadata: {
      archiveId,
      restoredCount: invoicesToRestore.length,
    },
  })

  return {
    success: true,
    restoredCount: invoicesToRestore.length,
    message: `Restored ${invoicesToRestore.length} invoices to active database.`,
  }
}
