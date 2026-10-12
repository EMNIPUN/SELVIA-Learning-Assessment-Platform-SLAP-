import { ApiError } from '../utils/ApiError.js'

function parseOrThrow(schema, input) {
  const result = schema.safeParse(input)

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
    throw ApiError.badRequest('Validation failed', details)
  }

  return result.data
}

export function validateBody(schema) {
  return (req, res, next) => {
    req.body = parseOrThrow(schema, req.body ?? {})
    next()
  }
}

export function validateParams(schema) {
  return (req, res, next) => {
    parseOrThrow(schema, req.params)
    next()
  }
}

// Express 5 makes req.query read-only, so the parsed query is exposed as req.validatedQuery.
export function validateQuery(schema) {
  return (req, res, next) => {
    req.validatedQuery = parseOrThrow(schema, req.query)
    next()
  }
}
