/**
 * Verifies a Keycloak access token against the configured issuer JWKS.
 * Does not mint platform JWTs or mutate the database.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { ApiError } from '../../utils/ApiError.js'

const jwksByUrl = new Map()

function getJwks(jwksUrl) {
  let jwks = jwksByUrl.get(jwksUrl)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl))
    jwksByUrl.set(jwksUrl, jwks)
  }
  return jwks
}

function collectRealmRoles(payload) {
  const roles = payload?.realm_access?.roles
  if (!Array.isArray(roles)) return []
  return roles.filter((role) => typeof role === 'string' && role.length > 0)
}

/**
 * @param {string} accessToken
 * @param {{ issuer: string, jwksUrl: string, allowedClients: string[] }} config
 */
export async function verifyKeycloakAccessToken(accessToken, config) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw ApiError.unauthorized('Invalid token')
  }
  if (!config?.issuer || !config?.jwksUrl || !Array.isArray(config.allowedClients)) {
    throw ApiError.serviceUnavailable('Keycloak authentication is not configured')
  }

  let payload
  try {
    const verified = await jwtVerify(accessToken.trim(), getJwks(config.jwksUrl), {
      issuer: config.issuer,
      algorithms: ['RS256'],
    })
    payload = verified.payload
  } catch (err) {
    if (err?.code === 'ERR_JWT_EXPIRED') {
      throw ApiError.unauthorized('Token has expired')
    }
    throw ApiError.unauthorized('Invalid or unverifiable Keycloak token')
  }

  const azp = typeof payload.azp === 'string' ? payload.azp : null
  const audience = Array.isArray(payload.aud)
    ? payload.aud.find((value) => typeof value === 'string')
    : typeof payload.aud === 'string'
      ? payload.aud
      : null
  const clientId = azp || audience
  if (!clientId || !config.allowedClients.includes(clientId)) {
    throw ApiError.unauthorized('Keycloak client is not allowed for SLAP login')
  }

  const subject = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  const emailRaw = typeof payload.email === 'string' ? payload.email : payload.preferred_username
  const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : ''
  if (!subject) {
    throw ApiError.unauthorized('Keycloak token is missing a subject')
  }
  if (!email || !email.includes('@')) {
    throw ApiError.unauthorized('Keycloak token is missing an email claim')
  }

  const givenName =
    typeof payload.given_name === 'string' && payload.given_name.trim()
      ? payload.given_name.trim()
      : typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim().split(/\s+/)[0]
        : 'SELVIA'
  const familyName =
    typeof payload.family_name === 'string' && payload.family_name.trim()
      ? payload.family_name.trim()
      : 'User'

  return Object.freeze({
    issuer: config.issuer,
    subject,
    email,
    firstName: givenName.slice(0, 100),
    lastName: familyName.slice(0, 100),
    clientId,
    realmRoles: collectRealmRoles(payload),
  })
}

// Exported for unit tests that inject a stub verifier.
export const __testing = { getJwks, jwksByUrl }
