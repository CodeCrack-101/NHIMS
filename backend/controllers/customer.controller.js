import {
  getCustomersSummary,
  getCustomerBills,
} from '../services/customer.service.js'

export const listCustomersController = async (req, res, next) => {
  try {
    const {
      search,
      sort,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      page,
      limit,
    } = req.query

    const result = await getCustomersSummary({
      search,
      sort,
      startDate,
      endDate,
      minAmount,
      maxAmount,
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

export const getCustomerBillsController = async (req, res, next) => {
  try {
    const { mobileNumber } = req.params
    const {
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sort,
      page,
      limit,
    } = req.query

    const result = await getCustomerBills({
      mobileNumber,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sort,
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
