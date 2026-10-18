/**
 * Creates or updates the public OIDC client `slap-frontend` in the SELVIA Keycloak realm.
 *
 * Requires admin credentials (never committed):
 *   KEYCLOAK_ADMIN_URL   e.g. https://auth-mentor.duckdns.org/auth
 *   KEYCLOAK_ADMIN_USER
 *   KEYCLOAK_ADMIN_PASSWORD
 *   KEYCLOAK_REALM       default mentor
 *   SLAP_ORIGIN          default http://localhost:5174
 *
 *   node scripts/ensure-slap-frontend-keycloak-client.js
 */
const adminUrl = (process.env.KEYCLOAK_ADMIN_URL || process.env.KEYCLOAK_URL || '').replace(/\/+$/, '')
const realm = process.env.KEYCLOAK_REALM || 'mentor'
const username = process.env.KEYCLOAK_ADMIN_USER || process.env.KEYCLOAK_ADMIN || ''
const password = process.env.KEYCLOAK_ADMIN_PASSWORD || ''
const origin = (process.env.SLAP_ORIGIN || 'http://localhost:5174').replace(/\/+$/, '')
const clientId = 'slap-frontend'

if (!adminUrl || !username || !password) {
  console.error(
    'Set KEYCLOAK_ADMIN_URL, KEYCLOAK_ADMIN_USER, and KEYCLOAK_ADMIN_PASSWORD to manage the slap-frontend client.',
  )
  process.exit(1)
}

async function getAdminToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username,
    password,
  })
  const res = await fetch(`${adminUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Admin token failed (${res.status}): ${json.error_description || json.error || res.statusText}`)
  }
  return json.access_token
}

function clientPayload() {
  return {
    clientId,
    name: 'SELVIA Learning Assessment Platform',
    enabled: true,
    publicClient: true,
    protocol: 'openid-connect',
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    rootUrl: origin,
    baseUrl: origin,
    redirectUris: [`${origin}/*`],
    webOrigins: [origin],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': `${origin}/*`,
    },
    defaultClientScopes: ['web-origins', 'acr', 'roles', 'profile', 'email'],
  }
}

async function main() {
  const token = await getAdminToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  const listRes = await fetch(
    `${adminUrl}/admin/realms/${encodeURIComponent(realm)}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
  )
  if (!listRes.ok) {
    throw new Error(`List clients failed: HTTP ${listRes.status}`)
  }
  const existing = await listRes.json()
  const payload = clientPayload()

  if (existing.length > 0) {
    const id = existing[0].id
    const putRes = await fetch(`${adminUrl}/admin/realms/${encodeURIComponent(realm)}/clients/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...existing[0], ...payload, id }),
    })
    if (!putRes.ok) {
      const text = await putRes.text()
      throw new Error(`Update client failed: HTTP ${putRes.status} ${text}`)
    }
    console.log(`Updated Keycloak client ${clientId} (${id}) for origin ${origin}`)
    return
  }

  const createRes = await fetch(`${adminUrl}/admin/realms/${encodeURIComponent(realm)}/clients`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Create client failed: HTTP ${createRes.status} ${text}`)
  }
  console.log(`Created Keycloak client ${clientId} for origin ${origin}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
