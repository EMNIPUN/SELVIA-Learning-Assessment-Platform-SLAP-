import { getAuthenticatedUser } from '../services/auth.service.js'
import { ApiError } from '../utils/ApiError.js'
import { verifyAccessToken } from '../utils/token.js'

export async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ')

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw ApiError.unauthorized('Authentication required')
  }

  const payload = verifyAccessToken(token)
  req.user = await getAuthenticatedUser(payload.sub)
  next()
}
