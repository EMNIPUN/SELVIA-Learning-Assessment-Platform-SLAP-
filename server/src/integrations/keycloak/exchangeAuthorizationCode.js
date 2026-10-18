/**
 * Exchanges an OIDC authorization code (+ PKCE verifier) for Keycloak tokens.
 * Runs server-side so the browser never calls Keycloak's token endpoint (no CORS).
 */
import { ApiError } from '../../utils/ApiError.js'

/**
 * @param {{
 *   code: string,
 *   redirectUri: string,
 *   codeVerifier: string,
 * }} input
 * @param {{
 *   issuer: string,
 *   tokenUrl?: string,
 *   clientId: string,
 *   allowedRedirectUris: string[],
 * }} config
 * @returns {Promise<string>} access_token
 */
export async function exchangeKeycloakAuthorizationCode(input, config) {
  const code = typeof input.code === 'string' ? input.code.trim() : ''
  const redirectUri = typeof input.redirectUri === 'string' ? input.redirectUri.trim() : ''
  const codeVerifier = typeof input.codeVerifier === 'string' ? input.codeVerifier.trim() : ''

  if (!code || !redirectUri || !codeVerifier) {
    throw ApiError.badRequest('Authorization code exchange requires code, redirectUri, and codeVerifier')
  }
  if (!config?.allowedRedirectUris?.includes(redirectUri)) {
    throw ApiError.badRequest('redirectUri is not allowed')
  }

  const tokenUrl =
    config.tokenUrl ||
    (config.issuer ? `${config.issuer}/protocol/openid-connect/token` : null)
  if (!tokenUrl || !config.clientId) {
    throw ApiError.serviceUnavailable('Keycloak authentication is not configured')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })

  let response
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
  } catch {
    throw ApiError.serviceUnavailable('Unable to reach Keycloak token endpoint')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail =
      typeof payload.error_description === 'string'
        ? payload.error_description
        : typeof payload.error === 'string'
          ? payload.error
          : 'Authorization code exchange failed'
    throw ApiError.unauthorized(detail)
  }

  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : ''
  if (!accessToken) {
    throw ApiError.unauthorized('Keycloak did not return an access token')
  }
  return accessToken
}
