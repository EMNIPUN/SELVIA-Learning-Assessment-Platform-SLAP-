/**
 * Issues short-lived tutor MCP access tokens for the trusted J26 Core API.
 *
 * Identity is resolved only from Keycloak issuer + subject via ExternalIdentity.
 * Does not create or modify identity links. Does not accept platform user/student IDs,
 * email, student number, or caller-selected scopes. Does not log tokens or secrets.
 */
import env from '../config/env.js'
import { resolveActiveExternalIdentity } from './externalIdentity.service.js'
import {
  createTutorTokenConfig,
  signTutorToken,
  verifyTutorToken,
} from '../integrations/mcp/tutorToken.js'
import { DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS } from '../schemas/tutorAccessToken.schemas.js'
import { ApiError } from '../utils/ApiError.js'

/** Fixed scopes for minted tutor tokens. Not caller-selectable. */
export const TUTOR_ACCESS_TOKEN_SCOPES = Object.freeze([
  'tutor:evidence.read',
  'tutor:activity.read',
])

function createDefaultDeps() {
  const tutor = env.mcp.tutor
  return {
    mcpTutorConfigured: tutor.configured === true,
    getTutorTokenConfig() {
      if (!tutor.configured) {
        throw ApiError.serviceUnavailable('Tutor MCP authentication is not configured')
      }
      return createTutorTokenConfig({
        secret: tutor.secret,
        audience: tutor.audience,
        issuer: tutor.issuer,
      })
    },
    resolveActiveExternalIdentity,
    signTutorToken,
    verifyTutorToken,
  }
}

/**
 * @param {{ issuer: string, subject: string, expiresInSeconds?: number }} input
 * @param {object} [deps]
 */
export async function issueTutorAccessToken(input, deps = createDefaultDeps()) {
  if (!deps.mcpTutorConfigured) {
    throw ApiError.serviceUnavailable('Tutor MCP authentication is not configured')
  }

  const expiresInSeconds =
    input.expiresInSeconds ?? DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS

  const resolved = await deps.resolveActiveExternalIdentity({
    issuer: input.issuer,
    subject: input.subject,
    requireStudentProfile: true,
  })

  if (!resolved) {
    throw ApiError.notFound('External identity link not found')
  }

  const userId = resolved.user?.id
  const studentId = resolved.student?.id
  if (typeof userId !== 'string' || typeof studentId !== 'string') {
    throw ApiError.forbidden('A student profile is required')
  }

  const tutorTokenConfig = deps.getTutorTokenConfig()
  const accessToken = deps.signTutorToken(
    {
      userId,
      studentId,
      scopes: TUTOR_ACCESS_TOKEN_SCOPES,
    },
    tutorTokenConfig,
    { expiresInSeconds },
  )

  // Derive expiresAt from the signed token (never log accessToken).
  const claims = deps.verifyTutorToken(accessToken, tutorTokenConfig)

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: expiresInSeconds,
    expiresAt: claims.expiresAt,
    resource: tutorTokenConfig.audience,
  }
}
