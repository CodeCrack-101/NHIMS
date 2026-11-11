import mongoose from 'mongoose'
import { Catalogue } from '../models/Catalogue.js'
import { Inventory } from '../models/Inventory.js'
import { InventoryLog } from '../models/InventoryLog.js'
import {
  ensureDefaultCataloguesAndSync,
  adjustPatternQuantityAtomic,
  registerSseClient,
} from '../services/inventory.service.js'
import { AppError } from '../utils/AppError.js'

const resolveCatalogueDoc = async (catalogueIdOrSlug) => {
  const raw = String(catalogueIdOrSlug || '').trim()
  if (mongoose.Types.ObjectId.isValid(raw)) {
    const byId = await Catalogue.findById(raw).lean()
    if (byId) return byId
  }
  const normalizedSlug = raw.toUpperCase().replace(/\s+/g, '_')
  const bySlug =
    (await Catalogue.findOne({ slug: normalizedSlug }).lean()) ||
    (await Catalogue.findOne({ slug: raw.toUpperCase() }).lean())
  if (!bySlug) {
    throw new AppError(`Catalogue '${raw}' not found.`, 404, 'CATALOGUE_NOT_FOUND')
  }
  return bySlug
}

export const getInventoryByCatalogueController = async (req, res, next) => {
  try {
    await ensureDefaultCataloguesAndSync()
    const catalogue = await resolveCatalogueDoc(req.params.catalogueId)
    const lowStockThreshold = Number(req.query.lowStockThreshold) || 10

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

    return res.status(200).json({
      success: true,
      data: {
        catalogue,
        summary,
        items,
      },
    })
  } catch (error) {
    next(error)
  }
}

export const getSinglePatternController = async (req, res, next) => {
  try {
    const catalogue = await resolveCatalogueDoc(req.params.catalogueId)
    const patternNumber = String(req.params.patternNumber || '').trim()

    const item = await Inventory.findOne({
      catalogueId: catalogue._id,
      patternNumber,
    }).lean()

    if (!item) {
      throw new AppError('Pattern not found.', 404, 'PATTERN_NOT_FOUND')
    }

    return res.status(200).json({
      success: true,
      data: { item },
    })
  } catch (error) {
    next(error)
  }
}

export const searchGlobalRollsController = async (req, res, next) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim()
    if (!query) {
      return res.status(200).json({
        success: true,
        data: { items: [] },
      })
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patternRegex = new RegExp(escaped, 'i')

    const items = await Inventory.find({ patternNumber: patternRegex })
      .populate('catalogueId', 'name slug defaultRate')
      .sort({ quantity: -1 })
      .limit(30)
      .lean()

    const formatted = items.map((it) => ({
      _id: it._id,
      patternNumber: it.patternNumber,
      sequenceNumber: it.sequenceNumber,
      imagePath: it.imagePath,
      quantity: it.quantity,
      rate: it.rate || it.catalogueId?.defaultRate || 1250,
      catalogue: it.catalogueId,
      catalogueName: it.catalogueId?.name || '',
      catalogueSlug: it.catalogueId?.slug || '',
    }))

    return res.status(200).json({
      success: true,
      data: { items: formatted },
    })
  } catch (error) {
    next(error)
  }
}

export const updatePatternQuantityController = async (req, res, next) => {
  try {
    const catalogue = await resolveCatalogueDoc(req.params.catalogueId)
    const patternNumber = String(req.params.patternNumber || '').trim()
    const { actionType, amount = 1 } = req.body

    const updatedItem = await adjustPatternQuantityAtomic({
      catalogueId: catalogue._id,
      patternNumber,
      actionType,
      amount,
      userId: req.user.id,
    })

    return res.status(200).json({
      success: true,
      message: 'Stock quantity updated.',
      data: { item: updatedItem },
    })
  } catch (error) {
    next(error)
  }
}

export const seedInventoryController = async (req, res, next) => {
  try {
    const manifest = req.body?.manifest || {}
    await ensureDefaultCataloguesAndSync(manifest, true)

    return res.status(200).json({
      success: true,
      message: 'Catalogue patterns synchronized safely without overwriting quantities.',
    })
  } catch (error) {
    next(error)
  }
}

export const getInventoryLogsController = async (req, res, next) => {
  try {
    const catalogue = await resolveCatalogueDoc(req.params.catalogueId)
    const limit = Math.min(100, Number(req.query.limit) || 30)

    const logs = await InventoryLog.find({ catalogueId: catalogue._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('updatedBy', 'fullName email role')
      .lean()

    return res.status(200).json({
      success: true,
      data: { logs },
    })
  } catch (error) {
    next(error)
  }
}

export const streamInventoryEventsController = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`)
  registerSseClient(res)
}
