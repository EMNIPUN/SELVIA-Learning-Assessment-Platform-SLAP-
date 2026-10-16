import { ApiError } from '../utils/ApiError.js'
import { secretsEqual } from '../utils/secretCompare.js'

/**
 * Authenticates the trusted J26 Core API caller for tutor-token minting.
 * Not for student/browser login routes. Never logs Authorization headers or secrets.
 *
 * @param {{ getConfig: () => { configured: boolean, token?: string } }} options
 */
export function createAuthenticateInternalTutorMint({ getConfig }) {
  if (typeof getConfig !== 'function') {
    throw new Error('createAuthenticateInternalTutorMint requires getConfig')
  }

  return function authenticateInternalTutorMint(req, res, next) {
    const config = getConfig()

    if (!config?.configured || typeof config.token !== 'string' || config.token.length === 0) {
      throw ApiError.serviceUnavailable('Internal tutor token minting is not configured')
    }

    const [scheme, provided] = (req.get('authorization') ?? '').split(' ')

    if (scheme?.toLowerCase() !== 'bearer' || !provided) {
      throw ApiError.unauthorized('Authentication required')
    }

    if (!secretsEqual(provided, config.token)) {
      throw ApiError.unauthorized('Authentication required')
    }

    next()
  }
}
