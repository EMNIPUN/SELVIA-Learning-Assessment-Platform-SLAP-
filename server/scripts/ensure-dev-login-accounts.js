/**
 * Opt-in operator tool: ensure one ADMIN and one STUDENT can log into SLAP locally.
 *
 * Required:
 *   SELVIA_ENSURE_DEV_ACCOUNTS=1
 *   SEED_DEV_PASSWORD=<password for both accounts, min length enforced by app>
 *
 * Database safety (same policy as ExternalIdentity provisioner):
 *   Prefers local DATABASE_URL. Remote hosts require SELVIA_ALLOW_REMOTE_APP_DB=1.
 *
 * Prints only emails, roles, and user UUIDs — never passwordHash. Password is not echoed.
 *
 * Usage (from server/):
 *   $env:SELVIA_ENSURE_DEV_ACCOUNTS="1"
 *   $env:SEED_DEV_PASSWORD="..."
 *   # optional when using approved remote app DB:
 *   $env:SELVIA_ALLOW_REMOTE_APP_DB="1"
 *   node scripts/ensure-dev-login-accounts.js
 */
import env from '../src/config/env.js'
import prisma from '../src/database/postgres/prisma.js'
import { ROLES } from '../src/constants/roles.js'
import { hashPassword } from '../src/utils/password.js'

const ADMIN_EMAIL = 'admin@selvia.local'
const STUDENT_EMAIL = 'student@selvia.local'
const STUDENT_NUMBER = 'DEV-STU-0001'

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

async function upsertUser({ email, firstName, lastName, role, passwordHash, studentNumber }) {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, student: { select: { id: true } } },
  })

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        firstName,
        lastName,
        role,
        isActive: true,
      },
      select: { id: true, email: true, role: true },
    })

    if (role === ROLES.STUDENT) {
      const student = await prisma.student.findUnique({ where: { userId: updated.id } })
      if (!student) {
        await prisma.student.create({
          data: { userId: updated.id, studentNumber },
        })
      }
    }

    return updated
  }

  if (role === ROLES.STUDENT) {
    return prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        student: { create: { studentNumber } },
      },
      select: { id: true, email: true, role: true },
    })
  }

  return prisma.user.create({
    data: { email, passwordHash, firstName, lastName, role },
    select: { id: true, email: true, role: true },
  })
}

async function main() {
  if (process.env.SELVIA_ENSURE_DEV_ACCOUNTS !== '1') {
    console.error('Disabled. Set SELVIA_ENSURE_DEV_ACCOUNTS=1 to run this operator tool.')
    process.exitCode = 2
    return
  }

  if (env.isProduction) {
    console.error('Refusing to create development login accounts in production.')
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

  const password = process.env.SEED_DEV_PASSWORD
  if (typeof password !== 'string' || password.trim().length < 8) {
    console.error('SEED_DEV_PASSWORD is required and must be at least 8 characters.')
    process.exitCode = 2
    return
  }

  const passwordHash = await hashPassword(password.trim())

  const admin = await upsertUser({
    email: ADMIN_EMAIL,
    firstName: 'Dev',
    lastName: 'Admin',
    role: ROLES.ADMIN,
    passwordHash,
  })

  const student = await upsertUser({
    email: STUDENT_EMAIL,
    firstName: 'Dev',
    lastName: 'Student',
    role: ROLES.STUDENT,
    passwordHash,
    studentNumber: STUDENT_NUMBER,
  })

  console.log(
    JSON.stringify({
      ok: true,
      accounts: [
        { email: admin.email, role: admin.role, userId: admin.id },
        { email: student.email, role: student.role, userId: student.id },
      ],
      note: 'Login with SEED_DEV_PASSWORD via POST /api/v1/auth/login. Password not printed.',
    }),
  )
}

main()
  .catch((err) => {
    console.error(err?.message || 'Failed to ensure development login accounts')
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch {
      // ignore
    }
  })
