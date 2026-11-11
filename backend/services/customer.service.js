import { Invoice } from '../models/Invoice.js'
import { AppError } from '../utils/AppError.js'

/**
 * List unique customers with aggregated billing summary:
 * - totalInvoices
 * - totalSpend
 * - totalQuantity
 * - lastPurchaseDate
 * - firstPurchaseDate
 * Supports search (customerName, mobileNumber)
 * Supports sorting: 'spend_desc' (who bought most), 'spend_asc' (who bought least), 'quantity_desc', 'invoices_desc', 'latest'
 * Supports date range filtering on invoices
 */
export const getCustomersSummary = async ({
  search = '',
  sort = 'spend_desc',
  startDate,
  endDate,
  minAmount,
  maxAmount,
  page = 1,
  limit = 50,
} = {}) => {
  const matchStage = {}

  if (startDate || endDate) {
    matchStage.invoiceDate = {}
    if (startDate) {
      const s = new Date(`${startDate}T00:00:00.000Z`)
      if (!Number.isNaN(s.getTime())) matchStage.invoiceDate.$gte = s
    }
    if (endDate) {
      const e = new Date(`${endDate}T23:59:59.999Z`)
      if (!Number.isNaN(e.getTime())) matchStage.invoiceDate.$lte = e
    }
    if (Object.keys(matchStage.invoiceDate).length === 0) {
      delete matchStage.invoiceDate
    }
  }

  const pipeline = []

  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage })
  }

  pipeline.push({
    $group: {
      _id: '$mobileNumber',
      customerName: { $last: '$customerName' },
      mobileNumber: { $first: '$mobileNumber' },
      totalInvoices: { $sum: 1 },
      totalSpend: { $sum: '$finalTotal' },
      totalQuantity: { $sum: '$totalQuantity' },
      firstPurchaseDate: { $min: '$invoiceDate' },
      lastPurchaseDate: { $max: '$invoiceDate' },
    },
  })

  // Filter by search (name or mobile)
  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'i')
    pipeline.push({
      $match: {
        $or: [{ customerName: regex }, { mobileNumber: regex }],
      },
    })
  }

  // Filter by min/max spend
  if (minAmount !== undefined && minAmount !== null && minAmount !== '') {
    const minVal = Number(minAmount)
    if (!Number.isNaN(minVal)) {
      pipeline.push({ $match: { totalSpend: { $gte: minVal } } })
    }
  }
  if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '') {
    const maxVal = Number(maxAmount)
    if (!Number.isNaN(maxVal)) {
      pipeline.push({ $match: { totalSpend: { $lte: maxVal } } })
    }
  }

  // Sorting
  let sortStage = { totalSpend: -1 }
  switch (sort) {
    case 'spend_asc':
      sortStage = { totalSpend: 1 }
      break
    case 'quantity_desc':
      sortStage = { totalQuantity: -1 }
      break
    case 'quantity_asc':
      sortStage = { totalQuantity: 1 }
      break
    case 'invoices_desc':
      sortStage = { totalInvoices: -1 }
      break
    case 'latest':
      sortStage = { lastPurchaseDate: -1 }
      break
    case 'name_asc':
      sortStage = { customerName: 1 }
      break
    case 'spend_desc':
    default:
      sortStage = { totalSpend: -1 }
      break
  }
  pipeline.push({ $sort: sortStage })

  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 50))
  const safePage = Math.max(1, Number(page) || 1)
  const skip = (safePage - 1) * safeLimit

  // Facet to get total customer count and paginated list
  const facetPipeline = [
    ...pipeline,
    {
      $facet: {
        customers: [{ $skip: skip }, { $limit: safeLimit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]

  const aggResult = await Invoice.aggregate(facetPipeline)
  const customers = aggResult[0]?.customers || []
  const totalCount = aggResult[0]?.totalCount[0]?.count || 0

  return {
    customers,
    totalCount,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(totalCount / safeLimit) || 1,
  }
}

/**
 * Get all bills for a specific customer by mobile number (or name)
 * Supports custom date range filter and price min/max filter
 */
export const getCustomerBills = async ({
  mobileNumber,
  startDate,
  endDate,
  minAmount,
  maxAmount,
  sort = 'latest',
  page = 1,
  limit = 100,
} = {}) => {
  if (!mobileNumber) {
    throw new AppError('Mobile number is required to fetch customer bills.', 400)
  }

  const filter = {
    mobileNumber: String(mobileNumber).trim(),
  }

  if (startDate || endDate) {
    filter.invoiceDate = {}
    if (startDate) {
      const s = new Date(`${startDate}T00:00:00.000Z`)
      if (!Number.isNaN(s.getTime())) filter.invoiceDate.$gte = s
    }
    if (endDate) {
      const e = new Date(`${endDate}T23:59:59.999Z`)
      if (!Number.isNaN(e.getTime())) filter.invoiceDate.$lte = e
    }
    if (Object.keys(filter.invoiceDate).length === 0) {
      delete filter.invoiceDate
    }
  }

  if (minAmount !== undefined && minAmount !== null && minAmount !== '') {
    const minVal = Number(minAmount)
    if (!Number.isNaN(minVal)) {
      filter.finalTotal = filter.finalTotal || {}
      filter.finalTotal.$gte = minVal
    }
  }

  if (maxAmount !== undefined && maxAmount !== null && maxAmount !== '') {
    const maxVal = Number(maxAmount)
    if (!Number.isNaN(maxVal)) {
      filter.finalTotal = filter.finalTotal || {}
      filter.finalTotal.$lte = maxVal
    }
  }

  let sortOption = { invoiceDate: -1, createdAt: -1 }
  if (sort === 'oldest') {
    sortOption = { invoiceDate: 1, createdAt: 1 }
  } else if (sort === 'price_desc') {
    sortOption = { finalTotal: -1 }
  } else if (sort === 'price_asc') {
    sortOption = { finalTotal: 1 }
  } else if (sort === 'qty_desc') {
    sortOption = { totalQuantity: -1 }
  }

  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100))
  const safePage = Math.max(1, Number(page) || 1)
  const skip = (safePage - 1) * safeLimit

  const [invoices, totalCount, customerSummary] = await Promise.all([
    Invoice.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(safeLimit)
      .populate('createdBy', 'fullName email')
      .lean(),
    Invoice.countDocuments(filter),
    Invoice.aggregate([
      { $match: { mobileNumber: String(mobileNumber).trim() } },
      {
        $group: {
          _id: '$mobileNumber',
          customerName: { $last: '$customerName' },
          mobileNumber: { $first: '$mobileNumber' },
          totalInvoices: { $sum: 1 },
          lifetimeSpend: { $sum: '$finalTotal' },
          lifetimeQuantity: { $sum: '$totalQuantity' },
        },
      },
    ]),
  ])

  return {
    customer: customerSummary[0] || {
      customerName: invoices[0]?.customerName || 'Customer',
      mobileNumber,
      totalInvoices: totalCount,
      lifetimeSpend: 0,
      lifetimeQuantity: 0,
    },
    invoices,
    totalCount,
    page: safePage,
    limit: safeLimit,
  }
}
