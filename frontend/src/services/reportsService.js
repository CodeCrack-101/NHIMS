import api from './api.js'

export const reportsService = {
  getOverview: (params = {}) => api.get('/reports/overview', { params }),

  getInvoices: (params = {}) => api.get('/reports/invoices', { params }),

  searchArchivedInvoices: (params = {}) =>
    api.get('/reports/archives/invoices', { params }),

  getArchiveHistory: () => api.get('/reports/archives/history'),

  prepareQuarterlyArchive: (payload) =>
    api.post('/reports/archives/prepare', payload),

  verifyArchive: (payload) =>
    api.post('/reports/archives/verify', payload),

  cleanupActiveDatabase: (payload) =>
    api.post('/reports/archives/cleanup', payload),

  restoreArchive: (payload) =>
    api.post('/reports/archives/restore', payload),
}
