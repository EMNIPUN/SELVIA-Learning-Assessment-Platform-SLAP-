/**
 * Opt-in operator tool: create one ADMIN_VERIFIED ExternalIdentity link.
 *
 * Calls createAdminVerifiedExternalIdentityLink only. Does not mint tutor tokens,
 * does not print secrets, and does not expose an HTTP route.
 *
 * Required (process env; never commit these):
 *   SELVIA_PROVISION_EXTERNAL_IDENTITY=1
 *   SELVIA_EI_ISSUER=<Keycloak issuer, must match Core keycloak_issuer>
 *   SELVIA_EI_SUBJECT=<Keycloak sub>
 *   SELVIA_EI_USER_ID=<platform STUDENT user UUID>
 *   SELVIA_EI_ADMIN_USER_ID=<platform ADMIN user UUID who verified the link>
 *
 * Database safety:
 *   Prefers local DATABASE_URL / DIRECT_URL from server/.env (loaded via env.js).
 *   Remote / non-local hosts require SELVIA_ALLOW_REMOTE_APP_DB=1 (explicit approval).
 *
 * Usage (from server/):
 *   $env:SELVIA_PROVISION_EXTERNAL_IDENTITY="1"
 *   # set the four SELVIA_EI_* variables in the shell only
 *   node scripts/provision-admin-verified-external-identity.js
 */
import env from '../src/config/env.js'
import { createAdminVerifiedExternalIdentityLink } from '../src/services/externalIdentity.service.js'
import prisma from '../src/database/postgres/prisma.js'

function requiredEnv(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required env ${name}`)
  }
  return value.trim()
}

function databaseHostIsLocal(databaseUrl) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    return false
  }
  try {
    const normalized = databaseUrl.replace(/^postgresql\+[^:]+:/, 'postgresql:')
    const host = new URL(normalized).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

async function main() {
  if (process.env.SELVIA_PROVISION_EXTERNAL_IDENTITY !== '1') {
    console.error(
      'Disabled. Set SELVIA_PROVISION_EXTERNAL_IDENTITY=1 to run this operator tool.',
    )
    process.exitCode = 2
    return
  }

  const databaseUrl = process.env.DATABASE_URL || env.databaseUrl
  const allowRemote = process.env.SELVIA_ALLOW_REMOTE_APP_DB === '1'
  if (!databaseHostIsLocal(databaseUrl) && !allowRemote) {
    console.error(
      'Refusing non-local application database. Point DATABASE_URL at localhost, ' +
        'or set SELVIA_ALLOW_REMOTE_APP_DB=1 only for an explicitly approved dedicated instance.',
    )
    process.exitCode = 2
    return
  }

  const issuer = requiredEnv('SELVIA_EI_ISSUER')
  const subject = requiredEnv('SELVIA_EI_SUBJECT')
  const userId = requiredEnv('SELVIA_EI_USER_ID')
  const verifiedByUserId = requiredEnv('SELVIA_EI_ADMIN_USER_ID')

  const link = await createAdminVerifiedExternalIdentityLink({
    issuer,
    subject,
    userId,
    verifiedByUserId,
  })

  console.log(
    JSON.stringify({
      ok: true,
      linkId: link.id,
      linkMethod: link.linkMethod,
      userId: link.userId,
      // issuer/subject intentionally omitted from stdout to reduce accidental log leakage
    }),
  )
}

main()
  .catch((err) => {
    const status = err?.statusCode || err?.status
    const message = err?.message || 'Provisioning failed'
    console.error(status ? `${status}: ${message}` : message)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch {
      // ignore disconnect errors
    }
  })
