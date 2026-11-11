import {
  getBillingCatalogues,
  getPatternsByCatalogue,
  getPatternStockById,
  createBillTransaction,
  searchAndListInvoices,
  getInvoiceById,
  generateNextInvoiceNumber,
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
      mobileNumber,
      items,
      discountType,
      discountValue,
      taxRate,
      idempotencyKey,
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
    const { search, date, startDate, endDate, catalogue, minPrice, maxPrice, page, limit } = req.query
    const data = await searchAndListInvoices({
      search,
      date,
      startDate,
      endDate,
      catalogue,
      minPrice,
      maxPrice,
      page,
      limit,
    })
    res.status(200).json({
      success: true,
      data,
    })
  } catch (err) {
    next(err)
  }
}

export const searchInvoicesController = async (req, res, next) => {
  try {
    const { q, search, date, startDate, endDate, catalogue, minPrice, maxPrice, page, limit } = req.query
    const data = await searchAndListInvoices({
      search: q || search || '',
      date,
      startDate,
      endDate,
      catalogue,
      minPrice,
      maxPrice,
      page,
      limit,
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
