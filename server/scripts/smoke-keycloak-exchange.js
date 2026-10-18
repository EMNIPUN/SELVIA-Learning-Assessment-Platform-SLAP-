/**
 * Offline/smoke checks for Keycloak exchange wiring (no browser).
 *
 *   node scripts/smoke-keycloak-exchange.js
 *
 * Verifies env load, JWKS reachability, and POST /api/v1/auth/keycloak rejects a bad token.
 * Set SMOKE_BASE_URL (default http://127.0.0.1:5000) when the API is already running.
 */
import env from '../src/config/env.js'

const baseUrl = (process.env.SMOKE_BASE_URL || `http://127.0.0.1:${env.port}`).replace(/\/+$/, '')

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

async function main() {
  console.log('Keycloak configured:', env.keycloak.configured)
  console.log('Issuer:', env.keycloak.issuer || '(unset)')
  console.log('Allowed clients:', env.keycloak.allowedClients.join(', ') || '(none)')

  if (!env.keycloak.configured) {
    fail('KEYCLOAK_ISSUER / KEYCLOAK_ALLOWED_CLIENTS are not set')
    return
  }

  const jwksRes = await fetch(env.keycloak.jwksUrl)
  if (!jwksRes.ok) {
    fail(`JWKS fetch HTTP ${jwksRes.status} from ${env.keycloak.jwksUrl}`)
    return
  }
  const jwks = await jwksRes.json()
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
    fail('JWKS response has no keys')
    return
  }
  console.log(`JWKS OK (${jwks.keys.length} keys)`)

  let exchangeRes
  try {
    exchangeRes = await fetch(`${baseUrl}/api/v1/auth/keycloak`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'not.a.real.token' }),
    })
  } catch (err) {
    fail(`API unreachable at ${baseUrl}: ${err.message}`)
    return
  }

  const body = await exchangeRes.json().catch(() => null)
  if (exchangeRes.status !== 401) {
    fail(`Expected 401 for bad token, got ${exchangeRes.status}: ${JSON.stringify(body)}`)
    return
  }
  console.log('Exchange rejects invalid token (401) OK')
  console.log('Smoke passed.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
