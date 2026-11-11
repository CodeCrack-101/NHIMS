import { Router } from 'express'
import {
  listCataloguesController,
  getCatalogueBySlugController,
  createCatalogueController,
} from '../controllers/catalogue.controller.js'
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js'
import { csrfProtection } from '../middleware/csrf.middleware.js'
import { ROLES } from '../models/User.js'

const router = Router()

router.get('/', requireAuth, listCataloguesController)
router.get('/:slug', requireAuth, getCatalogueBySlugController)
router.post(
  '/',
  requireAuth,
  requireRoles(ROLES.ADMIN),
  csrfProtection,
  createCatalogueController
)

export default router
