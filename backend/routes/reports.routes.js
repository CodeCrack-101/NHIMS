import { Router } from 'express'
import {
  requireAuth,
  requireRoles,
} from '../middleware/auth.middleware.js'
import { ROLES } from '../models/User.js'
import {
  getReportsOverviewController,
  getFilteredInvoicesController,
  prepareQuarterlyArchiveController,
  verifyArchiveController,
  cleanupActiveDatabaseController,
  listArchiveHistoryController,
  searchArchivedInvoicesController,
  restoreArchiveController,
} from '../controllers/reports.controller.js'

const router = Router()

// All reports routes require authentication
router.use(requireAuth)

// 1. Overview & General Invoices Table (Admin, Manager, Employee)
router.get(
  '/overview',
  requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  getReportsOverviewController
)

router.get(
  '/invoices',
  requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  getFilteredInvoicesController
)

// 2. Historical Archived Invoices Search
router.get(
  '/archives/invoices',
  requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  searchArchivedInvoicesController
)

// 3. Quarterly Archive Management & History (Admin Only)
router.get(
  '/archives/history',
  requireRoles(ROLES.ADMIN),
  listArchiveHistoryController
)

router.post(
  '/archives/prepare',
  requireRoles(ROLES.ADMIN),
  prepareQuarterlyArchiveController
)

router.post(
  '/archives/verify',
  requireRoles(ROLES.ADMIN),
  verifyArchiveController
)

router.post(
  '/archives/cleanup',
  requireRoles(ROLES.ADMIN),
  cleanupActiveDatabaseController
)

router.post(
  '/archives/restore',
  requireRoles(ROLES.ADMIN),
  restoreArchiveController
)

export default router
