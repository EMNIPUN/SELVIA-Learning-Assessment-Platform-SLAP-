/**
 * Reads the SELVIA Core account role for a Keycloak access token.
 * SELVIA stores student/lecturer in Core after onboarding — not as Keycloak realm roles.
 */
import { ROLES } from '../../constants/roles.js'

export function mapSelviaAccountRole(role) {
  if (typeof role !== 'string') return null
  const normalized = role.trim().toLowerCase()
  if (normalized === 'admin') return ROLES.ADMIN
  if (normalized === 'lecturer' || normalized === 'instructor') return ROLES.LECTURER
  if (normalized === 'student') return ROLES.STUDENT
  return null
}

/**
 * @param {string} accessToken
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<string | null>} SLAP role constant, or null when unavailable
 */
export async function fetchSelviaAccountRole(accessToken, options = {}) {
  const baseUrl = (options.baseUrl || '').trim().replace(/\/+$/, '')
  if (!baseUrl || typeof accessToken !== 'string' || !accessToken.trim()) {
    return null
  }

  const fetchImpl = options.fetchImpl || fetch
  let response
  try {
    response = await fetchImpl(`${baseUrl}/api/v1/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    })
  } catch (err) {
    console.warn('SELVIA Core role lookup failed (network):', err?.message || err)
    return null
  }

  if (!response.ok) {
    console.warn(`SELVIA Core role lookup failed: HTTP ${response.status} from ${baseUrl}/api/v1/me`)
    return null
  }
  const payload = await response.json().catch(() => null)
  return mapSelviaAccountRole(payload?.role)
}
