import {
  getBillingCatalogues,
  getPatternsByCatalogue,
  getPatternStockById,
  createBillTransaction,
  searchAndListInvoices,
  getInvoiceById,
  generateNextInvoiceNumber,
  getDistinctBillers,
  updateInvoicePaymentStatus,
  getPendingAmountSummary,
  deleteInvoiceAndRestoreStock,
  updateInvoiceAndAdjustStock,
} from '../services/billing.service.js'

export const listBillingCataloguesController = async (_req, res, next) => {
  try {
    const [catalogues, nextInvoiceNumber] = await Promise.all([
      getBillingCatalogues(),
      generateNextInvoiceNumber(),
    ])
    res.status(200).json({
      success: true,
      data: {
        catalogues,
        nextInvoiceNumber,
      },
    })
  } catch (err) {
    next(err)
  }
}

export const listCataloguePatternsController = async (req, res, next) => {
  try {
    const { catalogueId } = req.params
    const data = await getPatternsByCatalogue(catalogueId)
    res.status(200).json({
      success: true,
      data,
    })
  } catch (err) {
    next(err)
  }
}

export const getPatternStockController = async (req, res, next) => {
  try {
    const { patternId } = req.params
    const pattern = await getPatternStockById(patternId)
    res.status(200).json({
      success: true,
      data: { pattern },
    })
  } catch (err) {
    next(err)
  }
}

export const createBillController = async (req, res, next) => {
  try {
    const {
      customerName,
      paymentStatus,
      paymentMode,
      mobileNumber,
      items,
      discountType,
      discountValue,
      taxRate,
      idempotencyKey,
      billerName,
    } = req.body

    const headerIdempotencyKey = req.headers['x-idempotency-key']

    const result = await createBillTransaction({
      customerName,
      mobileNumber,
      items,
      discountType,
      discountValue,
      taxRate: Number(taxRate) || 0,
      idempotencyKey: idempotencyKey || headerIdempotencyKey || null,
      paymentStatus: paymentStatus || 'PAID',
      paymentMode: paymentMode || 'Cash',
      billerName: billerName || (req.user?.fullName ? req.user.fullName : ''),
      userId: req.user.id,
      req,
    })

    const nextInvoiceNumber = await generateNextInvoiceNumber()

    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate
        ? 'Invoice already processed.'
        : `Invoice ${result.invoice.invoiceNumber} generated and stock deducted successfully.`,
      data: {
        invoice: result.invoice,
        nextInvoiceNumber,
      },
    })
  } catch (err) {
    next(err)
  }
}

export const listInvoicesController = async (req, res, next) => {
  try {
    const { search, date, startDate, endDate, catalogue, minPrice, maxPrice, billerName, paymentStatus, page, limit } = req.query
    const [data, billers] = await Promise.all([
      searchAndListInvoices({
        search,
        date,
        startDate,
        endDate,
        catalogue,
        minPrice,
        maxPrice,
        billerName,
        paymentStatus,
        page,
        limit,
      }),
      getDistinctBillers(),
    ])
    res.status(200).json({
      success: true,
      data: {
        ...data,
        billers,
      },
    })
  } catch (err) {
    next(err)
  }
}

export const searchInvoicesController = async (req, res, next) => {
  try {
    const { q, search, date, startDate, endDate, catalogue, minPrice, maxPrice, billerName, page, limit } = req.query
    const [data, billers] = await Promise.all([
      searchAndListInvoices({
        search: q || search || '',
        date,
        startDate,
        endDate,
        catalogue,
        minPrice,
        maxPrice,
        billerName,
        page,
        limit,
      }),
      getDistinctBillers(),
    ])
    res.status(200).json({
      success: true,
      data: {
        ...data,
        billers,
      },
    })
    res.status(200).json({
      success: true,
      data,
    })
  } catch (err) {
    next(err)
  }
}

export const getInvoiceByIdController = async (req, res, next) => {
  try {
    const { invoiceId } = req.params
    const invoice = await getInvoiceById(invoiceId)
    res.status(200).json({
      success: true,
      data: { invoice },
    })
  } catch (err) {
    next(err)
  }
}

export const getInvoicePdfDataController = async (req, res, next) => {
  try {
    const { invoiceId } = req.params
    const invoice = await getInvoiceById(invoiceId)
    res.status(200).json({
      success: true,
      data: {
        company: {
          name: 'NH Wallpaper',
          subtitle: 'Premium Wallpaper & Roll Collections',
          logoPath: '/Logo.png',
        },
        invoice,
      },
    })
  } catch (err) {
    next(err)
  }
}


export const updateInvoicePaymentStatusController = async (req, res, next) => {
  try {
    const { invoiceId } = req.params
    const { paymentStatus } = req.body
    const updatedInvoice = await updateInvoicePaymentStatus(
      invoiceId,
      paymentStatus,
      req.user.id,
      req
    )
    res.status(200).json({
      success: true,
      message: `Invoice payment status updated to ${paymentStatus}.`,
      data: { invoice: updatedInvoice },
    })
  } catch (err) {
    next(err)
  }
}

export const deleteInvoiceController = async (req, res, next) => {
  try {
    const { invoiceId } = req.params
    const result = await deleteInvoiceAndRestoreStock(invoiceId, req.user.id, req)
    res.status(200).json({
      success: true,
      message: `Invoice ${result.invoiceNumber} deleted and ${result.restoredQuantity} rolls restored back to inventory stock.`,
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

export const updateInvoiceController = async (req, res, next) => {
  try {
    const { invoiceId } = req.params
    const updatedInvoice = await updateInvoiceAndAdjustStock(
      invoiceId,
      req.body,
      req.user.id,
      req
    )
    res.status(200).json({
      success: true,
      message: `Invoice ${updatedInvoice.invoiceNumber} updated and stock adjusted successfully.`,
      data: { invoice: updatedInvoice },
    })
  } catch (err) {
    next(err)
  }
}

export const getPendingAmountSummaryController = async (_req, res, next) => {
  try {
    const data = await getPendingAmountSummary()
    res.status(200).json({
      success: true,
      data,
    })
  } catch (err) {
    next(err)
  }
}
