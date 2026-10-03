import env from '../config/env.js'

// Express only treats middleware with exactly four parameters as an error handler.
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode ?? err.status ?? 500
  const isServerError = statusCode >= 500

  if (isServerError) {
    console.error(err)
  }

  res.status(statusCode).json({
    success: false,
    message: isServerError && env.isProduction ? 'Internal server error' : err.message,
    ...(!env.isProduction && isServerError && { stack: err.stack }),
  })
}
