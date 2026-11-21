import { Router } from 'express'
import {
  requireAuth,
  requireRoles,
} from '../middleware/auth.middleware.js'
import { ROLES } from '../models/User.js'
import {
  createGstInvoiceController,
  listGstInvoicesController,
  getGstInvoiceByIdController,
  updateGstPaymentStatusController,
  getNextGstInvoiceNumberController,
  updateGstInvoiceController,
  deleteGstInvoiceController,
} from '../controllers/gstBilling.controller.js'

const router = Router()

router.use(requireAuth)
router.use(requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE))

// Next invoice number preview
router.get('/next-number', getNextGstInvoiceNumberController)

// Create GST Tax Invoice
router.post('/create', createGstInvoiceController)

// List GST Invoices with search and filter
router.get('/invoices', listGstInvoicesController)

// Get single GST Invoice
router.get('/invoices/:id', getGstInvoiceByIdController)

// Update Payment status
router.patch('/invoices/:id/payment-status', updateGstPaymentStatusController)

// Edit GST Invoice & live stock adjustment
router.put('/invoices/:id', updateGstInvoiceController)

// Delete GST Invoice & live stock restore
router.delete('/invoices/:id', deleteGstInvoiceController)

export default router
