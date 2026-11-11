import {
  getAggregatedReports,
  getFilteredInvoicesList,
} from '../services/reports.service.js'
import {
  prepareQuarterlyArchiveData,
  verifyArchiveIntegrity,
  performManualActiveCleanup,
  getArchiveHistoryList,
  searchHistoricalArchivedInvoices,
  restoreArchivedInvoices,
} from '../services/archive.service.js'

export const getReportsOverviewController = async (req, res, next) => {
  try {
    const { filterType, customStart, customEnd, catalogue, patternNumber } = req.query
    const data = await getAggregatedReports({
      filterType,
      customStart,
      customEnd,
      catalogue,
      patternNumber,
    })
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export const getFilteredInvoicesController = async (req, res, next) => {
  try {
    const {
      filterType,
      customStart,
      customEnd,
      catalogue,
      patternNumber,
      page,
      limit,
    } = req.query

    const data = await getFilteredInvoicesList({
      filterType,
      customStart,
      customEnd,
      catalogue,
      patternNumber,
      page,
      limit,
    })
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export const prepareQuarterlyArchiveController = async (req, res, next) => {
  try {
    const { startDate, endDate, quarterLabel } = req.body
    const userId = req.user._id

    const archivePackage = await prepareQuarterlyArchiveData({
      startDate,
      endDate,
      quarterLabel,
      userId,
    })

    res.status(200).json({
      success: true,
      message: 'Quarterly archive data package prepared successfully.',
      data: archivePackage,
    })
  } catch (err) {
    next(err)
  }
}

export const verifyArchiveController = async (req, res, next) => {
  try {
    const { archiveId, manifest } = req.body
    const userId = req.user._id

    const result = await verifyArchiveIntegrity({
      archiveId,
      manifest,
      userId,
    })

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

export const cleanupActiveDatabaseController = async (req, res, next) => {
  try {
    const { archiveId, adminConfirmation } = req.body
    const userId = req.user._id

    const result = await performManualActiveCleanup({
      archiveId,
      adminConfirmation,
      userId,
    })

    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

export const listArchiveHistoryController = async (_req, res, next) => {
  try {
    const history = await getArchiveHistoryList()
    res.status(200).json({ success: true, data: history })
  } catch (err) {
    next(err)
  }
}

export const searchArchivedInvoicesController = async (req, res, next) => {
  try {
    const data = await searchHistoricalArchivedInvoices(req.query)
    res.status(200).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export const restoreArchiveController = async (req, res, next) => {
  try {
    const { archiveId } = req.body
    const userId = req.user._id

    const result = await restoreArchivedInvoices({
      archiveId,
      userId,
    })

    res.status(200).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}
