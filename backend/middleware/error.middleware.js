export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.isOperational ? err.statusCode : 500
  let code = err.isOperational ? err.code : 'INTERNAL_ERROR'
  let message = err.isOperational
    ? err.message
    : err.message || 'An unexpected error occurred. Please try again later.'

  if (err.name === 'ValidationError') {
    statusCode = 400
    code = 'VALIDATION_ERROR'
    message = Object.values(err.errors || {})
      .map((e) => e.message)
      .join(', ')
  } else if (err.code === 11000) {
    statusCode = 409
    code = 'DUPLICATE_KEY'
    message = 'A record with this unique identifier already exists.'
  }

  if (!err.isOperational) {
    console.error('[ServerError]', err)
  }

  res.status(statusCode).json({
    success: false,
    code,
    message,
  })
}
