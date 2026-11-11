import { Catalogue } from '../models/Catalogue.js'
import {
  getCataloguesWithStats,
  getCatalogueBySlug,
} from '../services/inventory.service.js'
import { AppError } from '../utils/AppError.js'

export const listCataloguesController = async (req, res, next) => {
  try {
    const threshold = Number(req.query.lowStockThreshold) || 10
    const catalogues = await getCataloguesWithStats(threshold)

    return res.status(200).json({
      success: true,
      data: { catalogues },
    })
  } catch (error) {
    next(error)
  }
}

export const getCatalogueBySlugController = async (req, res, next) => {
  try {
    const { slug } = req.params
    const threshold = Number(req.query.lowStockThreshold) || 10
    const data = await getCatalogueBySlug(slug, threshold)

    return res.status(200).json({
      success: true,
      data,
    })
  } catch (error) {
    next(error)
  }
}

export const createCatalogueController = async (req, res, next) => {
  try {
    const { name, slug, description } = req.body
    if (!name || !slug) {
      throw new AppError('Catalogue name and slug are required.', 400, 'VALIDATION_ERROR')
    }

    const normalizedSlug = String(slug).trim().toUpperCase().replace(/\s+/g, '_')
    const existing = await Catalogue.findOne({ slug: normalizedSlug })
    if (existing) {
      throw new AppError(`Catalogue '${normalizedSlug}' already exists.`, 409, 'DUPLICATE_CATALOGUE')
    }

    const catalogue = await Catalogue.create({
      name: String(name).trim(),
      slug: normalizedSlug,
      description: String(description || '').trim(),
      isActive: true,
    })

    return res.status(201).json({
      success: true,
      message: 'Catalogue created successfully.',
      data: { catalogue },
    })
  } catch (error) {
    next(error)
  }
}
