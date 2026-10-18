import { apiRequest } from './client.js'

// Returns { user, token, tokenType, expiresIn }.
export function login(email, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { email, password }, authenticated: false })
}

/** Exchange a Keycloak access token for a SLAP session JWT. */
export function loginWithKeycloakToken(accessToken) {
  return apiRequest('/auth/keycloak', {
    method: 'POST',
    body: { accessToken },
    authenticated: false,
  })
}

/** Exchange an OIDC authorization code (+ PKCE) via the SLAP API (server talks to Keycloak). */
export function loginWithKeycloakCode({ code, redirectUri, codeVerifier }) {
  return apiRequest('/auth/keycloak', {
    method: 'POST',
    body: { code, redirectUri, codeVerifier },
    authenticated: false,
  })
}

export async function getCurrentUser({ signal } = {}) {
  const { user } = await apiRequest('/auth/me', { signal })
  return user
}
