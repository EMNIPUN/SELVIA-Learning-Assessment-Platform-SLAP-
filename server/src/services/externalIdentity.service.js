/**
 * External identity link foundation (Keycloak issuer+subject → platform User).
 *
 * This module is an **internal** service API only: it does not mount HTTP routes and does not
 * implement an end-user verification ceremony. Callers must already have completed a trusted
 * administrative verification step before invoking create. Browser-supplied platform UUIDs are
 * never treated as proof of ownership; the admin actor is loaded from the database and must be
 * an active ADMIN. Email and student-number matching are intentionally not link keys.
 *
 * Tutor-token minting is out of scope for this step.
 */
import { ExternalIdentityLinkMethod } from '@prisma/client'
import { ROLES } from '../constants/roles.js'
import {
  ADMIN_VERIFIED_LINK_METHOD,
  MAX_ISSUER_LENGTH,
  MAX_SUBJECT_LENGTH,
} from '../constants/externalIdentity.js'
import {
  createExternalIdentity,
  EXTERNAL_IDENTITY_ACTIVE_UNIQUE_INDEXES,
  findActiveExternalIdentityByIssuerSubject,
  findActiveExternalIdentityByUserIssuer,
  findExternalIdentityById,
  revokeExternalIdentity,
} from '../repositories/externalIdentity.repository.js'
import { findStudentByUserId } from '../repositories/student.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { isUniqueViolation, translatePrismaError } from '../utils/prismaErrors.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const USER_LOOKUP_SELECT = Object.freeze({
  id: true,
  role: true,
  isActive: true,
  email: true,
})

const UNIQUE_CONFLICTS = Object.freeze({
  external_identities_issuer_subject_active_key: {
    field: 'issuer_subject',
    message: 'This external identity is already linked to a platform account',
  },
  external_identities_user_issuer_active_key: {
    field: 'user_issuer',
    message: 'This platform account already has an active identity for this issuer',
  },
})

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw ApiError.badRequest(`Invalid ${label}`)
  }
}

function normalizeIssuerSubject({ issuer, subject }) {
  if (typeof issuer !== 'string' || typeof subject !== 'string') {
    throw ApiError.badRequest('issuer and subject are required')
  }
  const normalizedIssuer = issuer.trim()
  const normalizedSubject = subject.trim()
  if (normalizedIssuer.length === 0 || normalizedSubject.length === 0) {
    throw ApiError.badRequest('issuer and subject must be non-empty')
  }
  if (normalizedIssuer.length > MAX_ISSUER_LENGTH) {
    throw ApiError.badRequest(`issuer must be at most ${MAX_ISSUER_LENGTH} characters`)
  }
  if (normalizedSubject.length > MAX_SUBJECT_LENGTH) {
    throw ApiError.badRequest(`subject must be at most ${MAX_SUBJECT_LENGTH} characters`)
  }
  return { issuer: normalizedIssuer, subject: normalizedSubject }
}

function rejectAttributeMatchingKeys(input) {
  // Defence in depth: these attributes must never be treated as identity-link keys.
  if (input && (Object.hasOwn(input, 'email') || Object.hasOwn(input, 'studentNumber'))) {
    throw ApiError.badRequest(
      'External identity links cannot be created from email or student number',
    )
  }
}

async function requireActiveAdmin(userId, findUserById) {
  assertUuid(userId, 'admin user id')
  const admin = await findUserById(userId)
  if (!admin) {
    throw ApiError.forbidden('A trusted administrative actor is required')
  }
  if (!admin.isActive || admin.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('A trusted administrative actor is required')
  }
  return admin
}

async function requireActiveUser(userId, findUserById) {
  assertUuid(userId, 'user id')
  const user = await findUserById(userId)
  if (!user) {
    throw ApiError.notFound('Platform user not found')
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated')
  }
  return user
}

function createDefaultDeps() {
  // Lazy import keeps this module offline-testable when deps are injected.
  return {
    async findUserById(userId) {
      const { default: prisma } = await import('../database/postgres/prisma.js')
      return prisma.user.findUnique({ where: { id: userId }, select: USER_LOOKUP_SELECT })
    },
    findStudentByUserId,
    createExternalIdentity,
    findActiveExternalIdentityByIssuerSubject,
    findActiveExternalIdentityByUserIssuer,
    findExternalIdentityById,
    revokeExternalIdentity,
  }
}

/**
 * Creates an ADMIN_VERIFIED link after the caller has completed a trusted verification step.
 * Does not expose HTTP; does not mint tutor tokens; does not auto-link by email/student number.
 *
 * @param {{ issuer: string, subject: string, userId: string, verifiedByUserId: string }} input
 * @param {object} [deps] injectable collaborators for unit tests
 */
export async function createAdminVerifiedExternalIdentityLink(input, deps = createDefaultDeps()) {
  rejectAttributeMatchingKeys(input)
  const { issuer, subject } = normalizeIssuerSubject(input)
  assertUuid(input.userId, 'user id')
  assertUuid(input.verifiedByUserId, 'admin user id')

  await requireActiveAdmin(input.verifiedByUserId, deps.findUserById)
  await requireActiveUser(input.userId, deps.findUserById)

  const existingSubject = await deps.findActiveExternalIdentityByIssuerSubject({
    issuer,
    subject,
  })
  if (existingSubject) {
    throw ApiError.conflict(UNIQUE_CONFLICTS.external_identities_issuer_subject_active_key.message, [
      UNIQUE_CONFLICTS.external_identities_issuer_subject_active_key,
    ])
  }

  const existingUserIssuer = await deps.findActiveExternalIdentityByUserIssuer({
    userId: input.userId,
    issuer,
  })
  if (existingUserIssuer) {
    throw ApiError.conflict(UNIQUE_CONFLICTS.external_identities_user_issuer_active_key.message, [
      UNIQUE_CONFLICTS.external_identities_user_issuer_active_key,
    ])
  }

  try {
    return await deps.createExternalIdentity({
      issuer,
      subject,
      userId: input.userId,
      linkMethod: ADMIN_VERIFIED_LINK_METHOD,
      linkedByUserId: input.verifiedByUserId,
    })
  } catch (err) {
    if (isUniqueViolation(err, EXTERNAL_IDENTITY_ACTIVE_UNIQUE_INDEXES)) {
      throw translatePrismaError(err, { conflicts: UNIQUE_CONFLICTS })
    }
    throw err
  }
}

/**
 * Resolves the active (non-revoked) link for an issuer + subject pair.
 * Returns null when unknown or revoked. Optionally requires an active student profile.
 *
 * @param {{ issuer: string, subject: string, requireStudentProfile?: boolean }} input
 */
export async function resolveActiveExternalIdentity(input, deps = createDefaultDeps()) {
  rejectAttributeMatchingKeys(input)
  const { issuer, subject } = normalizeIssuerSubject(input)

  const link = await deps.findActiveExternalIdentityByIssuerSubject({ issuer, subject })
  if (!link) {
    return null
  }

  const user = await deps.findUserById(link.userId)
  if (!user || !user.isActive) {
    throw ApiError.forbidden('This account has been deactivated')
  }

  let student = null
  if (input.requireStudentProfile) {
    if (user.role !== ROLES.STUDENT) {
      throw ApiError.forbidden('A student account is required')
    }
    student = await deps.findStudentByUserId(user.id)
    if (!student) {
      throw ApiError.forbidden('A student profile is required')
    }
  }

  return {
    link,
    user: { id: user.id, role: user.role, isActive: user.isActive },
    student,
  }
}

/**
 * Soft-revokes an active link. Retains the row for audit; re-linking creates a new row.
 *
 * @param {{ id: string, revokedByUserId: string }} input
 */
export async function revokeExternalIdentityLink(input, deps = createDefaultDeps()) {
  rejectAttributeMatchingKeys(input)
  assertUuid(input.id, 'external identity id')
  assertUuid(input.revokedByUserId, 'admin user id')

  await requireActiveAdmin(input.revokedByUserId, deps.findUserById)

  const existing = await deps.findExternalIdentityById(input.id)
  if (!existing) {
    throw ApiError.notFound('External identity link not found')
  }
  if (existing.revokedAt != null) {
    throw ApiError.conflict('This external identity link is already revoked')
  }

  return deps.revokeExternalIdentity({
    id: existing.id,
    revokedAt: new Date(),
    revokedByUserId: input.revokedByUserId,
  })
}

export const EXTERNAL_IDENTITY_SERVICE_LINK_METHOD = ExternalIdentityLinkMethod.ADMIN_VERIFIED
