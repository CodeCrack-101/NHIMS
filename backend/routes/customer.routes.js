import { Router } from 'express'
import {
  requireAuth,
  requireRoles,
} from '../middleware/auth.middleware.js'
import { ROLES } from '../models/User.js'
import {
  listCustomersController,
  getCustomerBillsController,
} from '../controllers/customer.controller.js'

const router = Router()

router.use(requireAuth)
router.use(requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE))

// 1. List all customers who have billed with spend/quantity stats and filters
router.get('/', listCustomersController)

// 2. Get customer's bills with custom date range and price filters
router.get('/:mobileNumber/bills', getCustomerBillsController)

export default router
