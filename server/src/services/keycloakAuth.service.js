/**
 * Exchanges a verified Keycloak access token for a SLAP session JWT.
 * Provisions User + Student/Lecturer profile and KEYCLOAK_OIDC ExternalIdentity on first login.
 *
 * SELVIA student/lecturer is chosen in Core onboarding (not Keycloak realm roles). When
 * SELVIA_CORE_BASE_URL is set, we read GET /api/v1/me with the same access token.
 */
import { createHash } from 'node:crypto'
import { ExternalIdentityLinkMethod } from '@prisma/client'
import env from '../config/env.js'
import { ROLES } from '../constants/roles.js'
import prisma from '../database/postgres/prisma.js'
import { exchangeKeycloakAuthorizationCode } from '../integrations/keycloak/exchangeAuthorizationCode.js'
import { verifyKeycloakAccessToken } from '../integrations/keycloak/verifyAccessToken.js'
import { fetchSelviaAccountRole } from '../integrations/selvia/fetchAccountRole.js'
import { findActiveExternalIdentityByIssuerSubject } from '../repositories/externalIdentity.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { signAccessToken } from '../utils/token.js'

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  student: { select: { id: true, studentNumber: true } },
  lecturer: { select: { id: true, staffNumber: true } },
}

const PROVISION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 }

export function mapKeycloakRolesToPlatformRole(realmRoles) {
  const roles = new Set((realmRoles ?? []).map((role) => String(role).toLowerCase()))
  if (roles.has('admin')) return ROLES.ADMIN
  if (roles.has('lecturer') || roles.has('instructor')) return ROLES.LECTURER
  return ROLES.STUDENT
}

/** Keycloak admin realm role wins; otherwise prefer SELVIA Core onboarding role. */
export function resolvePlatformRole({ realmRoles, selviaAccountRole }) {
  const fromRealm = mapKeycloakRolesToPlatformRole(realmRoles)
  if (fromRealm === ROLES.ADMIN) return ROLES.ADMIN
  if (selviaAccountRole === ROLES.ADMIN || selviaAccountRole === ROLES.LECTURER || selviaAccountRole === ROLES.STUDENT) {
    return selviaAccountRole
  }
  return fromRealm
}

export function studentNumberFromSubject(subject) {
  const digest = createHash('sha256').update(subject).digest('hex').slice(0, 12).toUpperCase()
  return `KC-${digest}`
}

export function staffNumberFromSubject(subject) {
  const digest = createHash('sha256').update(subject).digest('hex').slice(0, 12).toUpperCase()
  return `KC-LEC-${digest}`
}

async function ensureRoleProfile(tx, { userId, role, subject, firstName, lastName }) {
  await tx.user.update({
    where: { id: userId },
    data: { role, firstName, lastName },
  })

  if (role === ROLES.STUDENT) {
    const student = await tx.student.findUnique({ where: { userId } })
    if (!student) {
      await tx.student.create({
        data: { userId, studentNumber: studentNumberFromSubject(subject) },
      })
    }
  } else if (role === ROLES.LECTURER) {
    const lecturer = await tx.lecturer.findUnique({ where: { userId } })
    if (!lecturer) {
      await tx.lecturer.create({
        data: { userId, staffNumber: staffNumberFromSubject(subject) },
      })
    }
  }
}

function createDefaultDeps() {
  return {
    keycloakConfigured: env.keycloak.configured === true,
    getKeycloakConfig: () => env.keycloak,
    exchangeKeycloakAuthorizationCode,
    verifyKeycloakAccessToken,
    fetchSelviaAccountRole: (accessToken) =>
      fetchSelviaAccountRole(accessToken, { baseUrl: env.selviaCoreBaseUrl }),
    findActiveExternalIdentityByIssuerSubject,
    prisma,
    signAccessToken,
  }
}

async function loadSafeUser(userId, client = prisma) {
  return client.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT })
}

/**
 * @param {{ accessToken?: string, code?: string, redirectUri?: string, codeVerifier?: string }} input
 * @param {object} [deps]
 */
export async function loginWithKeycloakAccessToken(input, deps = createDefaultDeps()) {
  if (!deps.keycloakConfigured) {
    throw ApiError.serviceUnavailable('Keycloak authentication is not configured')
  }

  const keycloakConfig = deps.getKeycloakConfig()
  let accessToken = typeof input.accessToken === 'string' ? input.accessToken.trim() : ''
  if (!accessToken && input.code) {
    accessToken = await deps.exchangeKeycloakAuthorizationCode(
      {
        code: input.code,
        redirectUri: input.redirectUri,
        codeVerifier: input.codeVerifier,
      },
      keycloakConfig,
    )
  }

  const claims = await deps.verifyKeycloakAccessToken(accessToken, keycloakConfig)
  const selviaAccountRole = deps.fetchSelviaAccountRole
    ? await deps.fetchSelviaAccountRole(accessToken)
    : null
  const role = resolvePlatformRole({
    realmRoles: claims.realmRoles,
    selviaAccountRole,
  })

  const existingLink = await deps.findActiveExternalIdentityByIssuerSubject({
    issuer: claims.issuer,
    subject: claims.subject,
  })

  let userId
  if (existingLink) {
    userId = existingLink.userId
    await deps.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
      })
      if (!user || !user.isActive) {
        throw ApiError.forbidden('This account has been deactivated')
      }
      await ensureRoleProfile(tx, {
        userId,
        role,
        subject: claims.subject,
        firstName: claims.firstName,
        lastName: claims.lastName,
      })
    }, PROVISION_TRANSACTION_OPTIONS)
  } else {
    userId = await deps.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email: claims.email },
        select: { id: true, role: true, isActive: true },
      })

      if (user && !user.isActive) {
        throw ApiError.forbidden('This account has been deactivated')
      }

      if (!user) {
        const createData = {
          email: claims.email,
          firstName: claims.firstName,
          lastName: claims.lastName,
          role,
          passwordHash: null,
        }
        if (role === ROLES.STUDENT) {
          createData.student = { create: { studentNumber: studentNumberFromSubject(claims.subject) } }
        } else if (role === ROLES.LECTURER) {
          createData.lecturer = { create: { staffNumber: staffNumberFromSubject(claims.subject) } }
        }
        user = await tx.user.create({
          data: createData,
          select: { id: true, role: true, isActive: true },
        })
      } else {
        await ensureRoleProfile(tx, {
          userId: user.id,
          role,
          subject: claims.subject,
          firstName: claims.firstName,
          lastName: claims.lastName,
        })
      }

      const otherLink = await tx.externalIdentity.findFirst({
        where: { userId: user.id, issuer: claims.issuer, revokedAt: null },
      })
      if (otherLink && otherLink.subject !== claims.subject) {
        throw ApiError.conflict('This platform account already has an active identity for this issuer')
      }

      if (!otherLink) {
        await tx.externalIdentity.create({
          data: {
            issuer: claims.issuer,
            subject: claims.subject,
            userId: user.id,
            linkMethod: ExternalIdentityLinkMethod.KEYCLOAK_OIDC,
            linkedByUserId: user.id,
          },
        })
      }

      return user.id
    }, PROVISION_TRANSACTION_OPTIONS)
  }

  const user = await loadSafeUser(userId, deps.prisma)
  if (!user || !user.isActive) {
    throw ApiError.forbidden('This account has been deactivated')
  }

  const loggedInUser = await deps.prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: SAFE_USER_SELECT,
  })

  return {
    user: loggedInUser,
    token: deps.signAccessToken(loggedInUser),
    expiresIn: env.jwtExpiresIn,
  }
}
