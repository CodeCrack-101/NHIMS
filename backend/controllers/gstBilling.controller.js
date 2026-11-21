import {
  createGstInvoice,
  listGstInvoices,
  getGstInvoiceById,
  updateGstPaymentStatus,
  generateNextGstInvoiceNumber,
} from '../services/gstBilling.service.js'

export const createGstInvoiceController = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id
    const invoice = await createGstInvoice(req.body, userId, req)
    res.status(201).json({
      success: true,
      message: 'GST Tax Invoice created successfully.',
      data: { invoice },
    })
  } catch (err) {
    next(err)
  }
}

export const listGstInvoicesController = async (req, res, next) => {
  try {
    const { search, startDate, endDate, paymentStatus, page, limit } = req.query
    const result = await listGstInvoices({
      search,
      startDate,
      endDate,
      paymentStatus,
      page,
      limit,
    })
    res.status(200).json({
      success: true,
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

export const getGstInvoiceByIdController = async (req, res, next) => {
  try {
    const { id } = req.params
    const invoice = await getGstInvoiceById(id)
    res.status(200).json({
      success: true,
      data: { invoice },
    })
  } catch (err) {
    next(err)
  }
}

export const updateGstPaymentStatusController = async (req, res, next) => {
  try {
    const { id } = req.params
    const { paymentStatus } = req.body
    const invoice = await updateGstPaymentStatus(id, paymentStatus)
    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully.',
      data: { invoice },
    })
  } catch (err) {
    next(err)
  }
}

export const getNextGstInvoiceNumberController = async (req, res, next) => {
  try {
    const nextNumber = await generateNextGstInvoiceNumber()
    res.status(200).json({
      success: true,
      data: { nextInvoiceNumber: nextNumber },
    })
  } catch (err) {
    next(err)
  }
}
