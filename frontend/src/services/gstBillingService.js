import api from './api.js'

export const gstBillingService = {
  getNextInvoiceNumber: () => api.get('/gst-billing/next-number'),
  createGstBill: (payload) => api.post('/gst-billing/create', payload),
  getGstInvoices: (params = {}) => api.get('/gst-billing/invoices', { params }),
  getGstInvoiceById: (id) => api.get(`/gst-billing/invoices/${encodeURIComponent(id)}`),
  updatePaymentStatus: (id, paymentStatus) =>
    api.patch(`/gst-billing/invoices/${encodeURIComponent(id)}/payment-status`, {
      paymentStatus,
    }),
}
