import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Catalogue } from '../models/Catalogue.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryLog } from '../models/InventoryLog.js'
import { AppError } from '../utils/AppError.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FRONTEND_PUBLIC_DIR = path.resolve(__dirname, '../../frontend/public')
const FRONTEND_MANIFEST_FILE = path.resolve(
  __dirname,
  '../../frontend/src/assets/imageManifest.js'
)

const readFrontendManifestFromDisk = () => {
  try {
    if (!fs.existsSync(FRONTEND_MANIFEST_FILE)) return {}
    const content = fs.readFileSync(FRONTEND_MANIFEST_FILE, 'utf8')
    const match = content.match(
      /export\s+const\s+IMAGE_MANIFEST\s*=\s*(\{[\s\S]*?\n\})/
    )
    if (!match) return {}
    return JSON.parse(match[1])
  } catch {
    return {}
  }
}

// Real-time Server-Sent Events (SSE) clients registry
const sseClients = new Set()

export const registerSseClient = (res) => {
  sseClients.add(res)
  res.on('close', () => {
    sseClients.delete(res)
  })
}

export const broadcastInventoryEvent = (payload) => {
  const data = `data: ${JSON.stringify(payload)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(data)
    } catch {
      sseClients.delete(client)
    }
  }
}

const DEFAULT_CATALOGUES = [
  {
    name: 'SOHO',
    slug: 'SOHO',
    description: 'SOHO Premium Roll Collection',
    isActive: true,
  },
  {
    name: 'SELFIE POINT',
    slug: 'SELFIE_POINT',
    description: 'Selfie Point Exclusive Roll Collection',
    isActive: true,
  },
  {
    name: 'EPIC WALL',
    slug: 'EW',
    description: 'Epic Wall Exclusive Roll Collection',
    isActive: true,
  },
  {
    name: 'ROYAL TEXTURE',
    slug: 'ROYAL_TEXTURE',
    description: 'Royal Texture Premium Roll Collection',
    isActive: true,
  },
  {
    name: 'ICONIC',
    slug: 'ICONIC',
    description: 'Iconic Premium Roll Collection',
    isActive: true,
  },
]

// Parse filename like "soho1.1.png", "ew1.1 - Copy.png", "rt1.png", "1.jpg" into patternNumber & sequenceNumber
export const parseAssetFilename = (filename, slug) => {
  const ext = path.extname(filename)
  const rawBase = path.basename(filename, ext)
  // Strip "- Copy" or "(1)" suffixes added by Windows
  const base = rawBase.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '').trim()
  const upperSlug = String(slug || '').toUpperCase().replace(/\s+/g, '_')

  // Strip any leading alphabetic prefix (e.g. "soho", "ew", "rt", "royal_texture") before the pattern number
  const cleanedPattern = base.replace(/^[a-zA-Z_\-\s]+(?=\d)/, '').trim() || base
  const seqMatch = cleanedPattern.match(/^(\d+)/)
  const rawNumber = seqMatch ? Number(seqMatch[1]) : 999999

  if (upperSlug === 'SOHO' && rawNumber !== 999999) {
    const sequenceNumber = rawNumber >= 525300 ? rawNumber - 525300 : rawNumber
    const patternNumber = String(525300 + sequenceNumber)
    return {
      patternNumber,
      sequenceNumber,
    }
  }

  if (upperSlug === 'EW' && rawNumber !== 999999) {
    const sequenceNumber = rawNumber >= 78600 ? rawNumber - 78600 : rawNumber
    const patternNumber = String(78600 + sequenceNumber)
    return {
      patternNumber,
      sequenceNumber,
    }
  }

  return {
    patternNumber: cleanedPattern,
    sequenceNumber: rawNumber,
  }
}

// Discover local images from frontend/public/Assests/<SLUG> or frontend/public/assets/<SLUG>
export const scanLocalCatalogueImages = (slug) => {
  const upperSlug = String(slug).toUpperCase().replace(/\s+/g, '_')
  const spaceSlug = upperSlug.replace(/_/g, ' ')
  const extraAliases = upperSlug === 'EW' ? ['Epic Wall', 'EPIC WALL'] : []
  const candidateFolders = [
    { dir: path.join(FRONTEND_PUBLIC_DIR, 'Assests', upperSlug), urlPrefix: `/Assests/${upperSlug}` },
    { dir: path.join(FRONTEND_PUBLIC_DIR, 'Assests', spaceSlug), urlPrefix: `/Assests/${spaceSlug}` },
    ...extraAliases.map((alias) => ({
      dir: path.join(FRONTEND_PUBLIC_DIR, 'Assests', alias),
      urlPrefix: `/Assests/${alias}`,
    })),
    { dir: path.join(FRONTEND_PUBLIC_DIR, 'assets', upperSlug), urlPrefix: `/assets/${upperSlug}` },
    { dir: path.join(FRONTEND_PUBLIC_DIR, 'assets', spaceSlug), urlPrefix: `/assets/${spaceSlug}` },
  ]

  const discovered = []
  const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])

  for (const candidate of candidateFolders) {
    if (fs.existsSync(candidate.dir)) {
      const files = fs.readdirSync(candidate.dir)
      for (const file of files) {
        const ext = path.extname(file).toLowerCase()
        if (!allowedExts.has(ext)) continue
        const { patternNumber, sequenceNumber } = parseAssetFilename(file, upperSlug)
        discovered.push({
          patternNumber,
          sequenceNumber,
          imagePath: `${candidate.urlPrefix}/${file}`,
        })
      }
      break
    }
  }

  discovered.sort((a, b) => {
    if (a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber
    }
    return a.patternNumber.localeCompare(b.patternNumber, undefined, { numeric: true })
  })

  return discovered
}

let hasInitializedCatalogues = false
let lastManifestMtimeMs = 0

export const ensureDefaultCataloguesAndSync = async (manifestMap = {}, force = false) => {
  let currentMtimeMs = 0
  try {
    if (fs.existsSync(FRONTEND_MANIFEST_FILE)) {
      currentMtimeMs = fs.statSync(FRONTEND_MANIFEST_FILE).mtimeMs
    }
  } catch {
    // Ignore stat errors
  }

  const manifestFileChanged =
    currentMtimeMs > 0 && currentMtimeMs !== lastManifestMtimeMs

  if (
    hasInitializedCatalogues &&
    !force &&
    !manifestFileChanged &&
    Object.keys(manifestMap).length === 0
  ) {
    return
  }
  hasInitializedCatalogues = true
  if (currentMtimeMs > 0) {
    lastManifestMtimeMs = currentMtimeMs
  }

  for (const catDef of DEFAULT_CATALOGUES) {
    await Catalogue.findOneAndUpdate(
      { slug: catDef.slug },
      { $setOnInsert: catDef },
      { upsert: true, new: true }
    )
  }

  const allCatalogues = await Catalogue.find({ isActive: true })

  const diskManifestMap = readFrontendManifestFromDisk()
  const effectiveManifestMap =
    Object.keys(manifestMap).length > 0 ? manifestMap : diskManifestMap

  for (const catalogue of allCatalogues) {
    const manifestItems = Array.isArray(effectiveManifestMap[catalogue.slug])
      ? effectiveManifestMap[catalogue.slug]
      : []

    if (manifestItems.length > 0) {
      // Preserve existing quantities by sequenceNumber and patternNumber, then replace cleanly to avoid E11000 conflicts
      const existingDocs = await Inventory.find({
        catalogueId: catalogue._id,
      }).lean()

      const qtyBySeq = new Map()
      const qtyByPat = new Map()
      const rateBySeq = new Map()
      const rateByPat = new Map()
      for (const doc of existingDocs) {
        const q = Number(doc.quantity) || 0
        const r = Number(doc.rate) || 500
        if (doc.sequenceNumber) {
          qtyBySeq.set(
            Number(doc.sequenceNumber),
            Math.max(q, qtyBySeq.get(Number(doc.sequenceNumber)) || 0)
          )
          rateBySeq.set(Number(doc.sequenceNumber), r)
        }
        if (doc.patternNumber) {
          qtyByPat.set(
            String(doc.patternNumber).trim(),
            Math.max(q, qtyByPat.get(String(doc.patternNumber).trim()) || 0)
          )
          rateByPat.set(String(doc.patternNumber).trim(), r)
        }
      }

      await Inventory.deleteMany({ catalogueId: catalogue._id })

      const seenPatterns = new Set()
      const docsToInsert = []
      for (const item of manifestItems) {
        const seqNum = Number(item.sequenceNumber) || 0
        const patNum = String(item.patternNumber).trim()
        if (!patNum || seenPatterns.has(patNum)) continue
        seenPatterns.add(patNum)

        const preservedQty =
          qtyByPat.get(patNum) ?? qtyBySeq.get(seqNum) ?? 0
        const preservedRate =
          rateByPat.get(patNum) ?? rateBySeq.get(seqNum) ?? (catalogue.defaultRate || 500)

        docsToInsert.push({
          catalogueId: catalogue._id,
          patternNumber: patNum,
          sequenceNumber: seqNum,
          imagePath: item.imagePath || '',
          quantity: preservedQty,
          rate: preservedRate,
        })
      }

      if (docsToInsert.length > 0) {
        await Inventory.insertMany(docsToInsert, { ordered: false })
      }
      continue
    }

    const diskItems = scanLocalCatalogueImages(catalogue.slug)
    if (diskItems.length > 0) {
      const ops = diskItems.map((item) => ({
        updateOne: {
          filter: {
            catalogueId: catalogue._id,
            patternNumber: item.patternNumber,
          },
          update: {
            $set: {
              sequenceNumber: item.sequenceNumber,
            },
            $setOnInsert: {
              imagePath: item.imagePath,
              quantity: 0,
            },
          },
          upsert: true,
        },
      }))
      await Inventory.bulkWrite(ops, { ordered: false })
    }
  }
}

export const getCataloguesWithStats = async (lowStockThreshold = 10) => {
  await ensureDefaultCataloguesAndSync()

  const catalogues = await Catalogue.find({ isActive: true })
    .sort({ createdAt: 1 })
    .lean()

  const statsAgg = await Inventory.aggregate([
    {
      $group: {
        _id: '$catalogueId',
        totalPatterns: { $sum: 1 },
        totalStock: { $sum: '$quantity' },
        outOfStock: {
          $sum: { $cond: [{ $eq: ['$quantity', 0] }, 1, 0] },
        },
        lowStock: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$quantity', 0] }, { $lt: ['$quantity', lowStockThreshold] }] },
              1,
              0,
            ],
          },
        },
      },
    },
  ])

  const statsByCatId = new Map(statsAgg.map((s) => [s._id.toString(), s]))

  return catalogues.map((cat) => {
    const stat = statsByCatId.get(cat._id.toString()) || {
      totalPatterns: 0,
      totalStock: 0,
      outOfStock: 0,
      lowStock: 0,
    }
    return {
      ...cat,
      totalPatterns: stat.totalPatterns,
      totalStock: stat.totalStock,
      outOfStock: stat.outOfStock,
      lowStock: stat.lowStock,
    }
  })
}

export const getCatalogueBySlug = async (slug, lowStockThreshold = 10) => {
  await ensureDefaultCataloguesAndSync()
  const rawSlug = String(slug || '').trim().toUpperCase()
  const normalizedSlug = rawSlug.replace(/\s+/g, '_')
  const catalogue =
    (await Catalogue.findOne({ slug: normalizedSlug }).lean()) ||
    (await Catalogue.findOne({ slug: rawSlug }).lean())

  if (!catalogue) {
    throw new AppError(`Catalogue '${normalizedSlug}' not found.`, 404, 'CATALOGUE_NOT_FOUND')
  }

  const items = await Inventory.find({ catalogueId: catalogue._id })
    .sort({ sequenceNumber: 1, patternNumber: 1 })
    .lean()

  const summary = items.reduce(
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
    { totalPatterns: 0, totalStock: 0, outOfStock: 0, lowStock: 0, lowStockThreshold }
  )

  return {
    catalogue,
    summary,
    items,
  }
}

export const adjustPatternQuantityAtomic = async ({
  catalogueId,
  patternNumber,
  actionType,
  amount = 1,
  userId,
}) => {
  const step = Math.max(1, Math.floor(Number(amount) || 1))
  const normalizedAction = String(actionType || '').toUpperCase()

  if (!['INCREASE', 'DECREASE'].includes(normalizedAction)) {
    throw new AppError('Invalid actionType. Use INCREASE or DECREASE.', 400, 'INVALID_ACTION')
  }

  const delta = normalizedAction === 'INCREASE' ? step : -step
  const filter = {
    catalogueId,
    patternNumber: String(patternNumber).trim(),
  }

  // Prevent negative quantities atomically in MongoDB query filter
  if (delta < 0) {
    filter.quantity = { $gte: step }
  }

  const updatedDoc = await Inventory.findOneAndUpdate(
    filter,
    { $inc: { quantity: delta } },
    { new: true }
  ).lean()

  if (!updatedDoc) {
    const exists = await Inventory.findOne({
      catalogueId,
      patternNumber: String(patternNumber).trim(),
    }).lean()

    if (!exists) {
      throw new AppError('Pattern record not found in this catalogue.', 404, 'PATTERN_NOT_FOUND')
    }

    throw new AppError(
      'Quantity cannot be reduced below 0.',
      400,
      'NEGATIVE_QUANTITY_PREVENTED'
    )
  }

  const previousQuantity = updatedDoc.quantity - delta
  const newQuantity = updatedDoc.quantity

  await InventoryLog.create({
    catalogueId: updatedDoc.catalogueId,
    patternNumber: updatedDoc.patternNumber,
    previousQuantity,
    newQuantity,
    changeAmount: step,
    actionType: normalizedAction,
    updatedBy: userId,
  })

  broadcastInventoryEvent({
    type: 'INVENTORY_UPDATED',
    catalogueId: updatedDoc.catalogueId.toString(),
    patternNumber: updatedDoc.patternNumber,
    quantity: updatedDoc.quantity,
    previousQuantity,
    actionType: normalizedAction,
    updatedAt: updatedDoc.updatedAt,
  })

  return updatedDoc
}
