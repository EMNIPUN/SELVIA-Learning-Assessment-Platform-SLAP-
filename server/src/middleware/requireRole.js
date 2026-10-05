import { ROLES } from '../constants/roles.js'
import { ApiError } from '../utils/ApiError.js'

// Must run after `authenticate`.
export function requireRole(...allowedRoles) {
  const unknownRoles = allowedRoles.filter((role) => !Object.values(ROLES).includes(role))
  if (allowedRoles.length === 0 || unknownRoles.length > 0) {
    throw new Error(`requireRole: expected one or more of ${Object.values(ROLES).join(', ')}; got ${allowedRoles.join(', ') || 'nothing'}`)
  }

  return (req, res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized()
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden()
    }
    next()
  }
}
