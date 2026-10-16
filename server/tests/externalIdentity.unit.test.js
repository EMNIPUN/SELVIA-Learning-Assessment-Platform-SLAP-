// npm run test:unit — offline external-identity service tests (injected deps; no .env, DB, or network).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ROLES } from '../src/constants/roles.js'
import { ADMIN_VERIFIED_LINK_METHOD } from '../src/constants/externalIdentity.js'
import {
  createAdminVerifiedExternalIdentityLink,
  resolveActiveExternalIdentity,
  revokeExternalIdentityLink,
} from '../src/services/externalIdentity.service.js'
import { ApiError } from '../src/utils/ApiError.js'

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const STUDENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const LINK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ISSUER = 'http://localhost:8080/realms/mentor'
const SUBJECT = 'keycloak-sub-student-001'

const adminUser = {
  id: ADMIN_ID,
  role: ROLES.ADMIN,
  isActive: true,
  email: 'admin@example.test',
}

const studentUser = {
  id: USER_ID,
  role: ROLES.STUDENT,
  isActive: true,
  email: 'student@example.test',
}

function activeLink(overrides = {}) {
  return {
    id: LINK_ID,
    issuer: ISSUER,
    subject: SUBJECT,
    userId: USER_ID,
    linkMethod: ADMIN_VERIFIED_LINK_METHOD,
    linkedAt: new Date('2026-10-16T12:00:00.000Z'),
    linkedByUserId: ADMIN_ID,
    revokedAt: null,
    revokedByUserId: null,
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
    updatedAt: new Date('2026-10-16T12:00:00.000Z'),
    ...overrides,
  }
}

function createDeps(overrides = {}) {
  const users = new Map([
    [ADMIN_ID, adminUser],
    [USER_ID, studentUser],
  ])
  const linksById = new Map()
  let created = []

  const deps = {
    async findUserById(id) {
      return users.get(id) ?? null
    },
    async findStudentByUserId(userId) {
      if (userId === USER_ID) return { id: STUDENT_ID }
      return null
    },
    async findActiveExternalIdentityByIssuerSubject({ issuer, subject }) {
      return (
        created.find(
          (row) => row.issuer === issuer && row.subject === subject && row.revokedAt == null,
        ) ?? null
      )
    },
    async findActiveExternalIdentityByUserIssuer({ userId, issuer }) {
      return (
        created.find(
          (row) => row.userId === userId && row.issuer === issuer && row.revokedAt == null,
        ) ?? null
      )
    },
    async findExternalIdentityById(id) {
      return linksById.get(id) ?? created.find((row) => row.id === id) ?? null
    },
    async createExternalIdentity(data) {
      const row = activeLink({
        id: `00000000-0000-4000-8000-${String(created.length + 1).padStart(12, '0')}`,
        ...data,
      })
      created.push(row)
      linksById.set(row.id, row)
      return row
    },
    async revokeExternalIdentity({ id, revokedAt, revokedByUserId }) {
      const row = linksById.get(id) ?? created.find((entry) => entry.id === id)
      if (!row) throw new Error('missing link')
      const updated = { ...row, revokedAt, revokedByUserId }
      linksById.set(id, updated)
      created = created.map((entry) => (entry.id === id ? updated : entry))
      return updated
    },
    ...overrides,
  }

  return { deps, users, getCreated: () => created }
}

async function assertRejectsStatus(promise, statusCode) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.statusCode, statusCode)
    return true
  })
}

describe('createAdminVerifiedExternalIdentityLink', () => {
  it('creates an ADMIN_VERIFIED link when the admin actor and target user are valid', async () => {
    const { deps, getCreated } = createDeps()
    const link = await createAdminVerifiedExternalIdentityLink(
      {
        issuer: `  ${ISSUER}  `,
        subject: ` ${SUBJECT} `,
        userId: USER_ID,
        verifiedByUserId: ADMIN_ID,
      },
      deps,
    )

    assert.equal(link.issuer, ISSUER)
    assert.equal(link.subject, SUBJECT)
    assert.equal(link.userId, USER_ID)
    assert.equal(link.linkMethod, ADMIN_VERIFIED_LINK_METHOD)
    assert.equal(link.linkedByUserId, ADMIN_ID)
    assert.equal(link.revokedAt, null)
    assert.equal(getCreated().length, 1)
  })

  it('rejects duplicate active issuer/subject', async () => {
    const { deps } = createDeps()
    await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )

    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        {
          issuer: ISSUER,
          subject: SUBJECT,
          userId: OTHER_USER_ID,
          verifiedByUserId: ADMIN_ID,
        },
        {
          ...deps,
          async findUserById(id) {
            if (id === OTHER_USER_ID) {
              return { id: OTHER_USER_ID, role: ROLES.STUDENT, isActive: true, email: 'other@example.test' }
            }
            return deps.findUserById(id)
          },
        },
      ),
      409,
    )
  })

  it('rejects duplicate active user/issuer', async () => {
    const { deps } = createDeps()
    await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )

    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        {
          issuer: ISSUER,
          subject: 'keycloak-sub-other',
          userId: USER_ID,
          verifiedByUserId: ADMIN_ID,
        },
        deps,
      ),
      409,
    )
  })

  it('allows re-linking the same issuer/subject after revocation', async () => {
    const { deps } = createDeps()
    const first = await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )
    await revokeExternalIdentityLink({ id: first.id, revokedByUserId: ADMIN_ID }, deps)

    const second = await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )

    assert.notEqual(second.id, first.id)
    assert.equal(second.revokedAt, null)
    assert.equal(second.subject, SUBJECT)
  })

  it('rejects unknown target users', async () => {
    const { deps } = createDeps()
    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        {
          issuer: ISSUER,
          subject: SUBJECT,
          userId: OTHER_USER_ID,
          verifiedByUserId: ADMIN_ID,
        },
        deps,
      ),
      404,
    )
  })

  it('rejects inactive target users', async () => {
    const { deps, users } = createDeps()
    users.set(USER_ID, { ...studentUser, isActive: false })
    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
        deps,
      ),
      403,
    )
  })

  it('rejects non-admin verification actors', async () => {
    const { deps } = createDeps()
    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: USER_ID },
        deps,
      ),
      403,
    )
  })

  it('never creates a link from email or student number fields', async () => {
    const { deps, getCreated } = createDeps()
    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        {
          issuer: ISSUER,
          subject: SUBJECT,
          userId: USER_ID,
          verifiedByUserId: ADMIN_ID,
          email: 'student@example.test',
        },
        deps,
      ),
      400,
    )
    await assertRejectsStatus(
      createAdminVerifiedExternalIdentityLink(
        {
          issuer: ISSUER,
          subject: SUBJECT,
          userId: USER_ID,
          verifiedByUserId: ADMIN_ID,
          studentNumber: 'IT21000001',
        },
        deps,
      ),
      400,
    )
    assert.equal(getCreated().length, 0)
  })
})

describe('resolveActiveExternalIdentity', () => {
  it('resolves an active link', async () => {
    const { deps } = createDeps()
    await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )

    const resolved = await resolveActiveExternalIdentity({ issuer: ISSUER, subject: SUBJECT }, deps)
    assert.equal(resolved.link.userId, USER_ID)
    assert.equal(resolved.user.id, USER_ID)
    assert.equal(resolved.student, null)
  })

  it('returns null for unknown identities', async () => {
    const { deps } = createDeps()
    const resolved = await resolveActiveExternalIdentity(
      { issuer: ISSUER, subject: 'missing-sub' },
      deps,
    )
    assert.equal(resolved, null)
  })

  it('returns null after revocation', async () => {
    const { deps } = createDeps()
    const link = await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )
    await revokeExternalIdentityLink({ id: link.id, revokedByUserId: ADMIN_ID }, deps)

    const resolved = await resolveActiveExternalIdentity({ issuer: ISSUER, subject: SUBJECT }, deps)
    assert.equal(resolved, null)
  })

  it('requires a student profile when requested', async () => {
    const { deps } = createDeps()
    await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )

    const withStudent = await resolveActiveExternalIdentity(
      { issuer: ISSUER, subject: SUBJECT, requireStudentProfile: true },
      deps,
    )
    assert.equal(withStudent.student.id, STUDENT_ID)

    await assertRejectsStatus(
      resolveActiveExternalIdentity(
        { issuer: ISSUER, subject: SUBJECT, requireStudentProfile: true },
        {
          ...deps,
          async findStudentByUserId() {
            return null
          },
        },
      ),
      403,
    )
  })

  it('rejects resolve when the linked user is inactive', async () => {
    const { deps, users } = createDeps()
    await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )
    users.set(USER_ID, { ...studentUser, isActive: false })

    await assertRejectsStatus(
      resolveActiveExternalIdentity({ issuer: ISSUER, subject: SUBJECT }, deps),
      403,
    )
  })
})

describe('revokeExternalIdentityLink', () => {
  it('revokes with audit fields', async () => {
    const { deps } = createDeps()
    const link = await createAdminVerifiedExternalIdentityLink(
      { issuer: ISSUER, subject: SUBJECT, userId: USER_ID, verifiedByUserId: ADMIN_ID },
      deps,
    )

    const revoked = await revokeExternalIdentityLink(
      { id: link.id, revokedByUserId: ADMIN_ID },
      deps,
    )

    assert.ok(revoked.revokedAt instanceof Date)
    assert.equal(revoked.revokedByUserId, ADMIN_ID)
  })

  it('rejects unknown link ids', async () => {
    const { deps } = createDeps()
    await assertRejectsStatus(
      revokeExternalIdentityLink({ id: LINK_ID, revokedByUserId: ADMIN_ID }, deps),
      404,
    )
  })
})

describe('external identity source hygiene', () => {
  it('does not implement email or student-number matching helpers', () => {
    const source = readFileSync(
      new URL('../src/services/externalIdentity.service.js', import.meta.url),
      'utf8',
    )
    assert.equal(source.includes('findUnique({ where: { email'), false)
    assert.equal(source.includes('studentNumber'), true) // rejected in rejectAttributeMatchingKeys only
    assert.match(source, /cannot be created from email or student number/)
    assert.equal(source.includes('registerUser'), false)
  })
})
