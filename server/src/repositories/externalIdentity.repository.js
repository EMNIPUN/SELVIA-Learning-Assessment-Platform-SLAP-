import prisma from '../database/postgres/prisma.js'

export const EXTERNAL_IDENTITY_ACTIVE_UNIQUE_INDEXES = Object.freeze([
  'external_identities_issuer_subject_active_key',
  'external_identities_user_issuer_active_key',
])

const DEFAULT_SELECT = Object.freeze({
  id: true,
  issuer: true,
  subject: true,
  userId: true,
  linkMethod: true,
  linkedAt: true,
  linkedByUserId: true,
  revokedAt: true,
  revokedByUserId: true,
  createdAt: true,
  updatedAt: true,
})

export function createExternalIdentity(
  { issuer, subject, userId, linkMethod, linkedByUserId },
  client = prisma,
) {
  return client.externalIdentity.create({
    data: { issuer, subject, userId, linkMethod, linkedByUserId },
    select: DEFAULT_SELECT,
  })
}

export function findActiveExternalIdentityByIssuerSubject({ issuer, subject }, client = prisma) {
  return client.externalIdentity.findFirst({
    where: { issuer, subject, revokedAt: null },
    select: DEFAULT_SELECT,
  })
}

export function findActiveExternalIdentityByUserIssuer({ userId, issuer }, client = prisma) {
  return client.externalIdentity.findFirst({
    where: { userId, issuer, revokedAt: null },
    select: DEFAULT_SELECT,
  })
}

export function findExternalIdentityById(id, client = prisma) {
  return client.externalIdentity.findUnique({
    where: { id },
    select: DEFAULT_SELECT,
  })
}

export function revokeExternalIdentity(
  { id, revokedAt, revokedByUserId },
  client = prisma,
) {
  return client.externalIdentity.update({
    where: { id },
    data: { revokedAt, revokedByUserId },
    select: DEFAULT_SELECT,
  })
}
