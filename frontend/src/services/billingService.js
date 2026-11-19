import api from './api.js'

export const billingService = {
  getCatalogues: () => api.get('/billing/catalogues'),

  getPatternsByCatalogue: (catalogueId) =>
    api.get(`/billing/catalogues/${encodeURIComponent(catalogueId)}/patterns`),

  getPatternStock: (patternId) =>
    api.get(`/billing/pattern/${encodeURIComponent(patternId)}/stock`),

  createBill: (payload, idempotencyKey) =>
    api.post('/billing/create', payload, {
      headers: idempotencyKey
        ? { 'X-Idempotency-Key': idempotencyKey }
        : undefined,
    }),

  getInvoices: (params = {}) => api.get('/billing/invoices', { params }),

  searchInvoices: (params = {}) =>
    api.get('/billing/invoices/search', { params }),

  getInvoiceById: (invoiceId) =>
    api.get(`/billing/invoices/${encodeURIComponent(invoiceId)}`),

  getInvoicePdfData: (invoiceId) =>
    api.get(`/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`),

  updatePaymentStatus: (invoiceId, paymentStatus) =>
    api.patch(`/billing/invoices/${encodeURIComponent(invoiceId)}/payment-status`, {
      paymentStatus,
    }),

  updateInvoice: (invoiceId, payload) =>
    api.put(`/billing/invoices/${encodeURIComponent(invoiceId)}`, payload),

  deleteInvoice: (invoiceId) =>
    api.delete(`/billing/invoices/${encodeURIComponent(invoiceId)}`),

  getPendingSummary: () => api.get('/billing/pending-summary'),
}
