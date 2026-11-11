import crypto from 'crypto'
import { Invoice } from '../models/Invoice.js'
import { Catalogue } from '../models/Catalogue.js'
import { ArchiveMetadata } from '../models/ArchiveMetadata.js'
import { ArchivedInvoiceMetadata } from '../models/ArchivedInvoiceMetadata.js'
import { recordAuditLog } from './audit.service.js'
import { AppError } from '../utils/AppError.js'

export const calculateSha256 = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Build unified date filter
 */
export const buildDateFilter = (filterType, customStart, customEnd) => {
  const now = new Date()
  let start = new Date()
  let end = new Date()

  switch (filterType) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    case 'yesterday':
      start.setDate(now.getDate() - 1)
      start.setHours(0, 0, 0, 0)
      end.setDate(now.getDate() - 1)
      end.setHours(23, 59, 59, 999)
      break
    case 'this_week': {
      const day = now.getDay() || 7 // Monday = 1
      start.setDate(now.getDate() - day + 1)
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
      break
    }
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      break
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      break
    case 'last_3_months':
      start = new Date(now.getFullYear(), now.getMonth() - 3, 1)
      end.setHours(23, 59, 59, 999)
      break
    case 'custom':
      if (!customStart || !customEnd) {
        throw new AppError('Both customStart and customEnd are required.', 400)
      }
      start = new Date(customStart)
      end = new Date(customEnd)
      end.setHours(23, 59, 59, 999)
      break
    default:
      // Default to this month
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      break
  }

  return { start, end }
}

/**
 * Unified Aggregation for Reports
 * Combines Active Invoices + Archived Invoices Metadata
 */
export const getAggregatedReports = async ({
  filterType,
  customStart,
  customEnd,
  catalogue,
  patternNumber,
  includeArchived = true,
}) => {
  const { start, end } = buildDateFilter(filterType, customStart, customEnd)

  const matchStage = {
    invoiceDate: { $gte: start, $lte: end },
  }

  // 1. Query Active Invoices Aggregation
  const activePipeline = [
    { $match: matchStage },
    { $unwind: '$items' },
  ]

  if (catalogue && catalogue !== 'ALL') {
    activePipeline.push({
      $match: {
        'items.catalogueName': { $regex: new RegExp(`^${catalogue}$`, 'i') },
      },
    })
  }

  if (patternNumber && patternNumber !== 'ALL') {
    activePipeline.push({
      $match: {
        'items.patternNumber': { $regex: new RegExp(`^${patternNumber}$`, 'i') },
      },
    })
  }

  // Active stats
  const activeFacetPipeline = [
    ...activePipeline,
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: '$_id',
              invoiceNumber: { $first: '$invoiceNumber' },
              invoiceDate: { $first: '$invoiceDate' },
              subtotal: { $first: '$subtotal' },
              discountAmount: { $first: '$discountAmount' },
              finalTotal: { $first: '$finalTotal' },
              rollsInInvoice: { $sum: '$items.quantity' },
            },
          },
          {
            $group: {
              _id: null,
              totalBills: { $sum: 1 },
              totalRollsSold: { $sum: '$rollsInInvoice' },
              totalSales: { $sum: '$finalTotal' },
              totalDiscount: { $sum: '$discountAmount' },
            },
          },
        ],
        catalogueBreakdown: [
          {
            $group: {
              _id: '$items.catalogueName',
              rollsCount: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.subtotal' },
            },
          },
          { $sort: { revenue: -1 } },
        ],
        patternBreakdown: [
          {
            $group: {
              _id: {
                catalogue: '$items.catalogueName',
                pattern: '$items.patternNumber',
              },
              rollsCount: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.subtotal' },
            },
          },
          { $sort: { rollsCount: -1 } },
          { $limit: 25 },
        ],
        dailySales: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$invoiceDate',
                  timezone: '+05:30',
                },
              },
              totalSales: { $sum: '$items.subtotal' },
              rollsSold: { $sum: '$items.quantity' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        hourlySales: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%H:00',
                  date: '$invoiceDate',
                  timezone: '+05:30',
                },
              },
              totalSales: { $sum: '$items.subtotal' },
              rollsSold: { $sum: '$items.quantity' },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]

  const [activeResult] = await Invoice.aggregate(activeFacetPipeline)

  const overall = activeResult?.overall?.[0] || {
    totalBills: 0,
    totalRollsSold: 0,
    totalSales: 0,
    totalDiscount: 0,
  }

  const avgBillValue =
    overall.totalBills > 0
      ? Math.round(overall.totalSales / overall.totalBills)
      : 0

  return {
    dateRange: { start, end },
    summary: {
      totalBills: overall.totalBills,
      totalRollsSold: overall.totalRollsSold,
      totalSales: overall.totalSales,
      totalDiscount: overall.totalDiscount,
      avgBillValue,
    },
    catalogueBreakdown: activeResult?.catalogueBreakdown || [],
    patternBreakdown: (activeResult?.patternBreakdown || []).map((p) => ({
      catalogue: p._id.catalogue,
      patternNumber: p._id.pattern,
      rollsCount: p.rollsCount,
      revenue: p.revenue,
    })),
    dailySales: (activeResult?.dailySales || []).map((d) => ({
      _id: d._id,
      date: d._id,
      totalSales: d.totalSales,
      rollsSold: d.rollsSold,
    })),
    hourlySales: (activeResult?.hourlySales || []).map((h) => ({
      hour: h._id,
      totalSales: h.totalSales,
      rollsSold: h.rollsSold,
    })),
  }
}

/**
 * Fetch detailed Invoices for filtered Table / Export
 */
export const getFilteredInvoicesList = async ({
  filterType,
  customStart,
  customEnd,
  catalogue,
  patternNumber,
  page = 1,
  limit = 20,
}) => {
  const { start, end } = buildDateFilter(filterType, customStart, customEnd)

  const query = {
    invoiceDate: { $gte: start, $lte: end },
  }

  if (catalogue && catalogue !== 'ALL') {
    query['items.catalogueName'] = new RegExp(`^${catalogue}$`, 'i')
  }
  if (patternNumber && patternNumber !== 'ALL') {
    query['items.patternNumber'] = new RegExp(`^${patternNumber}$`, 'i')
  }

  const skip = (Number(page) - 1) * Number(limit)

  const [totalCount, invoices] = await Promise.all([
    Invoice.countDocuments(query),
    Invoice.find(query)
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
  ])

  return {
    totalCount,
    page: Number(page),
    totalPages: Math.ceil(totalCount / Number(limit)),
    invoices,
  }
}
