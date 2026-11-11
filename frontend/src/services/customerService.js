import api from './api.js'

export const customerService = {
  getCustomers: (params = {}) => api.get('/customers', { params }),
  getCustomerBills: (mobileNumber, params = {}) =>
    api.get(`/customers/${encodeURIComponent(mobileNumber)}/bills`, { params }),
}
