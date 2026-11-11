import api from './api.js'
import { IMAGE_MANIFEST } from '../assets/imageManifest.js'

export const formatCatalogueLabel = (raw = '') => {
  const clean = String(raw || '')
    .trim()
    .replace(/_/g, ' ')
  if (!clean) return ''
  if (clean.toUpperCase() === 'EW') return 'Epic Wall'
  return clean
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export const catalogueService = {
  getAllCatalogues: async (lowStockThreshold = 10) => {
    const res = await api.get(
      `/catalogues?lowStockThreshold=${lowStockThreshold}`
    )
    const rawCatalogues = res.data?.data?.catalogues || []
    let needsBackendSync = false

    const syncedCatalogues = rawCatalogues.map((cat) => {
      const manifestItems = IMAGE_MANIFEST[cat.slug]
      if (Array.isArray(manifestItems) && manifestItems.length > 0) {
        if (cat.totalPatterns !== manifestItems.length) {
          needsBackendSync = true
        }
        const adjustedOutOfStock =
          cat.totalStock === 0
            ? manifestItems.length
            : Math.min(cat.outOfStock || 0, manifestItems.length)
        return {
          ...cat,
          totalPatterns: manifestItems.length,
          outOfStock: adjustedOutOfStock,
        }
      }
      return cat
    })

    if (needsBackendSync) {
      api.post('/inventory/seed', { manifest: IMAGE_MANIFEST }).catch(() => {})
    }

    if (res.data?.data) {
      res.data.data.catalogues = syncedCatalogues
    }
    return res
  },
  getCatalogueBySlug: (slug, lowStockThreshold = 10) =>
    api.get(
      `/catalogues/${encodeURIComponent(slug)}?lowStockThreshold=${lowStockThreshold}`
    ),
  createCatalogue: (payload) => api.post('/catalogues', payload),
}
