/**
 * Browser OIDC helpers for slap-frontend.
 * Only full-page redirects to Keycloak are used here. The authorization code is
 * exchanged on the SLAP API (server-side) so the browser never hits Keycloak's
 * token endpoint — avoiding Web-origins / CORS issues on localhost.
 */

const PKCE_VERIFIER_KEY = 'slap.oidc.code_verifier'
const OIDC_STATE_KEY = 'slap.oidc.state'

const keycloakConfig = {
  url: (import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8000/auth').replace(/\/+$/, ''),
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'mentor',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'slap-frontend',
}

function base64UrlEncode(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

export function loginRedirectUri() {
  return `${window.location.origin}/login`
}

export function isKeycloakConfigured() {
  return Boolean(keycloakConfig.url && keycloakConfig.realm && keycloakConfig.clientId)
}

export function getKeycloakConfig() {
  return { ...keycloakConfig }
}

/** Start the Keycloak authorization-code + PKCE redirect. */
export async function beginKeycloakLogin() {
  if (!isKeycloakConfigured()) {
    throw new Error('Keycloak is not configured for this app')
  }

  const verifier = randomString(32)
  const state = randomString(16)
  const challenge = await sha256Base64Url(verifier)

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(OIDC_STATE_KEY, state)

  const redirectUri = loginRedirectUri()
  const params = new URLSearchParams({
    client_id: keycloakConfig.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  window.location.assign(
    `${keycloakConfig.url}/realms/${encodeURIComponent(keycloakConfig.realm)}/protocol/openid-connect/auth?${params}`,
  )
}

/**
 * Read the OIDC callback query. Returns null when this navigation is not a callback.
 * @returns {{ code: string, redirectUri: string, codeVerifier: string } | null}
 */
export function takeKeycloakAuthCode() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')

  if (error) {
    const description = params.get('error_description') || error
    sessionStorage.removeItem(PKCE_VERIFIER_KEY)
    sessionStorage.removeItem(OIDC_STATE_KEY)
    throw new Error(description)
  }

  if (!code) return null

  const expectedState = sessionStorage.getItem(OIDC_STATE_KEY)
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(OIDC_STATE_KEY)

  if (!expectedState || !state || state !== expectedState) {
    throw new Error('Invalid OIDC state. Please try signing in again.')
  }
  if (!codeVerifier) {
    throw new Error('Missing PKCE verifier. Please try signing in again.')
  }

  // Drop code/state from the address bar without a full reload.
  const cleanUrl = `${window.location.origin}${window.location.pathname}`
  window.history.replaceState({}, document.title, cleanUrl)

  return {
    code,
    redirectUri: loginRedirectUri(),
    codeVerifier,
  }
}

export function keycloakLogoutUrl() {
  const params = new URLSearchParams({
    client_id: keycloakConfig.clientId,
    post_logout_redirect_uri: loginRedirectUri(),
  })
  return `${keycloakConfig.url}/realms/${encodeURIComponent(keycloakConfig.realm)}/protocol/openid-connect/logout?${params}`
}
