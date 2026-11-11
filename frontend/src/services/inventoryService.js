import api from './api.js'

export const inventoryService = {
  getInventoryByCatalogue: (catalogueIdOrSlug, lowStockThreshold = 10) =>
    api.get(
      `/inventory/${encodeURIComponent(catalogueIdOrSlug)}?lowStockThreshold=${lowStockThreshold}`
    ),
  getPatternItem: (catalogueIdOrSlug, patternNumber) =>
    api.get(
      `/inventory/${encodeURIComponent(catalogueIdOrSlug)}/${encodeURIComponent(patternNumber)}`
    ),
  searchRolls: (query) =>
    api.get(`/inventory/search`, { params: { q: query } }),
  updatePatternQuantity: (catalogueIdOrSlug, patternNumber, actionType, amount = 1) =>
    api.patch(
      `/inventory/${encodeURIComponent(catalogueIdOrSlug)}/${encodeURIComponent(
        patternNumber
      )}/quantity`,
      { actionType, amount }
    ),
  seedInventory: (manifest = {}) => api.post('/inventory/seed', { manifest }),
  getInventoryLogs: (catalogueIdOrSlug, limit = 25) =>
    api.get(`/inventory/${encodeURIComponent(catalogueIdOrSlug)}/logs?limit=${limit}`),
}
