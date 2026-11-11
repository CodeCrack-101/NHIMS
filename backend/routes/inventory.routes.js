import { Router } from 'express'
import {
  getInventoryByCatalogueController,
  getSinglePatternController,
  searchGlobalRollsController,
  updatePatternQuantityController,
  seedInventoryController,
  getInventoryLogsController,
  streamInventoryEventsController,
} from '../controllers/inventory.controller.js'
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js'
import { csrfProtection } from '../middleware/csrf.middleware.js'
import { ROLES } from '../models/User.js'

const router = Router()

// Real-time Server-Sent Events stream for instant multi-user stock sync
router.get('/stream', requireAuth, streamInventoryEventsController)

// Safe seed/sync endpoint
router.post(
  '/seed',
  requireAuth,
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  csrfProtection,
  seedInventoryController
)

// Global Roll Search by pattern number across all catalogues
router.get('/search', requireAuth, searchGlobalRollsController)

// Catalogue inventory & logs routes
router.get('/:catalogueId', requireAuth, getInventoryByCatalogueController)
router.get(
  '/:catalogueId/logs',
  requireAuth,
  requireRoles(ROLES.ADMIN, ROLES.MANAGER),
  getInventoryLogsController
)
router.get('/:catalogueId/:patternNumber', requireAuth, getSinglePatternController)

// Atomic quantity adjustment (+ / -)
router.patch(
  '/:catalogueId/:patternNumber/quantity',
  requireAuth,
  requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  csrfProtection,
  updatePatternQuantityController
)

export default router
