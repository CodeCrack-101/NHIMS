import { Router } from 'express'
import {
  requireAuth,
  requireRoles,
} from '../middleware/auth.middleware.js'
import { ROLES } from '../models/User.js'
import {
  listBillingCataloguesController,
  listCataloguePatternsController,
  getPatternStockController,
  createBillController,
  listInvoicesController,
  searchInvoicesController,
  getInvoiceByIdController,
  getInvoicePdfDataController,
  updateInvoicePaymentStatusController,
  getPendingAmountSummaryController,
  deleteInvoiceController,
  updateInvoiceController,
} from '../controllers/billing.controller.js'

const router = Router()

router.use(requireAuth)
router.use(requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE))

// 1. Dynamic Catalogues & Patterns for Billing
router.get('/catalogues', listBillingCataloguesController)
router.get('/catalogues/:catalogueId/patterns', listCataloguePatternsController)
router.get('/pattern/:patternId/stock', getPatternStockController)

// 2. Create Bill + Atomic Stock Deduction Transaction
router.post('/create', createBillController)

// 3. Invoice History, Search, Details, Update, Delete & PDF Metadata
router.get('/invoices', listInvoicesController)
router.get('/invoices/search', searchInvoicesController)
router.get('/invoices/:invoiceId', getInvoiceByIdController)
router.get('/invoices/:invoiceId/pdf', getInvoicePdfDataController)
router.put('/invoices/:invoiceId', updateInvoiceController)
router.delete('/invoices/:invoiceId', deleteInvoiceController)

export default router

// 4. Payment Status & Pending Amount
router.get('/pending-summary', getPendingAmountSummaryController)
router.patch('/invoices/:invoiceId/payment-status', updateInvoicePaymentStatusController)
