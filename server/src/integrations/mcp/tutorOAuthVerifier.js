import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'
import { ApiError } from '../../utils/ApiError.js'
import { authorizeTutorToken } from './tutorToken.js'

// Adapts authorizeTutorToken to the MCP Express OAuthTokenVerifier interface. Does not mint tokens or load env.

export const TUTOR_MCP_CLIENT_ID = 'selvia-adaptive-tutor'

function toOAuthError(err) {
  if (err instanceof OAuthError) {
    return err
  }

  if (err instanceof ApiError) {
    if (err.statusCode === 403) {
      return new OAuthError(OAuthErrorCode.AccessDenied, 'Access denied')
    }
    return new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid token')
  }

  return new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid token')
}

/**
 * @param {{ config: object, getAuthenticatedUser: Function, findStudentByUserId: Function }} deps
 * @returns {{ verifyAccessToken: (token: string) => Promise<object> }}
 */
export function createTutorOAuthVerifier({ config, getAuthenticatedUser, findStudentByUserId }) {
  if (!config) {
    throw new Error('Tutor OAuth verifier requires a tutor token config')
  }
  if (typeof getAuthenticatedUser !== 'function' || typeof findStudentByUserId !== 'function') {
    throw new Error('Tutor OAuth verifier requires getAuthenticatedUser and findStudentByUserId')
  }

  return {
    async verifyAccessToken(token) {
      try {
        const auth = await authorizeTutorToken(token, config, { getAuthenticatedUser, findStudentByUserId })

        return {
          token,
          clientId: TUTOR_MCP_CLIENT_ID,
          scopes: [...auth.scopes],
          // SDK AuthInfo.expiresAt is seconds since epoch (same unit as JWT exp).
          expiresAt: auth.expiresAt,
          resource: new URL(config.audience),
          extra: {
            userId: auth.userId,
            studentId: auth.studentId,
          },
        }
      } catch (err) {
        throw toOAuthError(err)
      }
    },
  }
}
