// npm run test:unit — offline Keycloak exchange tests (injected deps; no .env, DB, or network).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ExternalIdentityLinkMethod } from '@prisma/client'
import { ROLES } from '../src/constants/roles.js'
import {
  loginWithKeycloakAccessToken,
  mapKeycloakRolesToPlatformRole,
  resolvePlatformRole,
  studentNumberFromSubject,
} from '../src/services/keycloakAuth.service.js'
import { ApiError } from '../src/utils/ApiError.js'

const ISSUER = 'https://auth-mentor.duckdns.org/auth/realms/mentor'
const SUBJECT = 'kc-sub-student-001'
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LINK_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

function claims(overrides = {}) {
  return {
    issuer: ISSUER,
    subject: SUBJECT,
    email: 'student@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    clientId: 'slap-frontend',
    realmRoles: ['student'],
    ...overrides,
  }
}

function safeUser(overrides = {}) {
  return {
    id: USER_ID,
    email: 'student@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: ROLES.STUDENT,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date('2026-10-16T12:00:00.000Z'),
    updatedAt: new Date('2026-10-16T12:00:00.000Z'),
    student: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', studentNumber: studentNumberFromSubject(SUBJECT) },
    lecturer: null,
    ...overrides,
  }
}

function createDeps(overrides = {}) {
  const usersByEmail = new Map()
  const usersById = new Map()
  const links = []
  let createdUsers = 0

  const prisma = {
    async $transaction(fn) {
      return fn({
        user: {
          async findUnique({ where }) {
            if (where.email) return usersByEmail.get(where.email) ?? null
            if (where.id) return usersById.get(where.id) ?? null
            return null
          },
          async create({ data, select }) {
            createdUsers += 1
            const id = `created-user-${createdUsers}`
            const row = {
              id,
              email: data.email,
              firstName: data.firstName,
              lastName: data.lastName,
              role: data.role,
              isActive: true,
              passwordHash: data.passwordHash ?? null,
              student: data.student?.create
                ? { id: `student-${createdUsers}`, studentNumber: data.student.create.studentNumber }
                : null,
              lecturer: data.lecturer?.create
                ? { id: `lecturer-${createdUsers}`, staffNumber: data.lecturer.create.staffNumber }
                : null,
            }
            usersByEmail.set(row.email, row)
            usersById.set(row.id, row)
            return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))
          },
          async update({ where, data }) {
            const row = usersById.get(where.id)
            Object.assign(row, data)
            return row
          },
        },
        student: {
          async findUnique({ where }) {
            const user = usersById.get(where.userId)
            return user?.student ?? null
          },
          async create({ data }) {
            const user = usersById.get(data.userId)
            user.student = { id: `student-${data.userId}`, studentNumber: data.studentNumber }
            return user.student
          },
        },
        lecturer: {
          async findUnique({ where }) {
            const user = usersById.get(where.userId)
            return user?.lecturer ?? null
          },
          async create({ data }) {
            const user = usersById.get(data.userId)
            user.lecturer = { id: `lecturer-${data.userId}`, staffNumber: data.staffNumber }
            return user.lecturer
          },
        },
        externalIdentity: {
          async findFirst({ where }) {
            return (
              links.find(
                (row) =>
                  row.userId === where.userId &&
                  row.issuer === where.issuer &&
                  row.revokedAt == null,
              ) ?? null
            )
          },
          async create({ data }) {
            const row = {
              id: LINK_ID,
              revokedAt: null,
              ...data,
            }
            links.push(row)
            return row
          },
        },
      })
    },
    user: {
      async findUnique({ where, select }) {
        const row = usersById.get(where.id)
        if (!row) return null
        const out = {}
        for (const key of Object.keys(select)) {
          if (typeof select[key] === 'object' && select[key] !== null) {
            out[key] = row[key]
          } else {
            out[key] = row[key]
          }
        }
        return out
      },
      async update({ where, data, select }) {
        const row = usersById.get(where.id)
        Object.assign(row, data)
        const out = {}
        for (const key of Object.keys(select)) {
          out[key] = row[key]
        }
        return out
      },
    },
  }

  const deps = {
    keycloakConfigured: true,
    getKeycloakConfig: () => ({
      configured: true,
      issuer: ISSUER,
      jwksUrl: `${ISSUER}/protocol/openid-connect/certs`,
      allowedClients: ['slap-frontend'],
    }),
    async verifyKeycloakAccessToken() {
      return claims()
    },
    async fetchSelviaAccountRole() {
      return null
    },
    async findActiveExternalIdentityByIssuerSubject() {
      return null
    },
    prisma,
    signAccessToken(user) {
      return `slap-jwt-for-${user.id}`
    },
    ...overrides,
  }

  return { deps, usersByEmail, usersById, links }
}

describe('mapKeycloakRolesToPlatformRole', () => {
  it('maps admin, lecturer/instructor, and default student', () => {
    assert.equal(mapKeycloakRolesToPlatformRole(['admin']), ROLES.ADMIN)
    assert.equal(mapKeycloakRolesToPlatformRole(['lecturer']), ROLES.LECTURER)
    assert.equal(mapKeycloakRolesToPlatformRole(['instructor']), ROLES.LECTURER)
    assert.equal(mapKeycloakRolesToPlatformRole(['student']), ROLES.STUDENT)
    assert.equal(mapKeycloakRolesToPlatformRole([]), ROLES.STUDENT)
  })
})

describe('resolvePlatformRole', () => {
  it('prefers SELVIA Core onboarding role over default student realm roles', () => {
    assert.equal(
      resolvePlatformRole({ realmRoles: ['default-roles-mentor'], selviaAccountRole: ROLES.LECTURER }),
      ROLES.LECTURER,
    )
    assert.equal(
      resolvePlatformRole({ realmRoles: [], selviaAccountRole: ROLES.STUDENT }),
      ROLES.STUDENT,
    )
  })

  it('keeps Keycloak admin above Core role', () => {
    assert.equal(
      resolvePlatformRole({ realmRoles: ['admin'], selviaAccountRole: ROLES.STUDENT }),
      ROLES.ADMIN,
    )
  })
})

describe('loginWithKeycloakAccessToken', () => {
  it('rejects when Keycloak is not configured', async () => {
    const { deps } = createDeps({ keycloakConfigured: false })
    await assert.rejects(
      () => loginWithKeycloakAccessToken({ accessToken: 'tok' }, deps),
      (err) => err instanceof ApiError && err.statusCode === 503,
    )
  })

  it('propagates token verification failures', async () => {
    const { deps } = createDeps({
      async verifyKeycloakAccessToken() {
        throw ApiError.unauthorized('Invalid token')
      },
    })
    await assert.rejects(
      () => loginWithKeycloakAccessToken({ accessToken: 'bad' }, deps),
      (err) => err instanceof ApiError && err.statusCode === 401,
    )
  })

  it('provisions a new student user and KEYCLOAK_OIDC link on first login', async () => {
    const { deps, usersById, links } = createDeps()
    const result = await loginWithKeycloakAccessToken({ accessToken: 'kc-token' }, deps)

    assert.equal(result.user.email, 'student@example.test')
    assert.equal(result.user.role, ROLES.STUDENT)
    assert.ok(result.user.student?.studentNumber?.startsWith('KC-'))
    assert.equal(result.token, `slap-jwt-for-${result.user.id}`)
    assert.equal(links.length, 1)
    assert.equal(links[0].linkMethod, ExternalIdentityLinkMethod.KEYCLOAK_OIDC)
    assert.equal(links[0].subject, SUBJECT)
    assert.equal(links[0].linkedByUserId, result.user.id)
    assert.ok(usersById.has(result.user.id))
  })

  it('reuses an existing ExternalIdentity on second login without creating another user', async () => {
    const existing = safeUser()
    let userCreates = 0
    const { deps } = createDeps({
      async findActiveExternalIdentityByIssuerSubject() {
        return {
          id: LINK_ID,
          issuer: ISSUER,
          subject: SUBJECT,
          userId: USER_ID,
          linkMethod: ExternalIdentityLinkMethod.KEYCLOAK_OIDC,
          revokedAt: null,
        }
      },
      prisma: {
        async $transaction(fn) {
          return fn({
            user: {
              async findUnique() {
                return { id: USER_ID, isActive: true, role: ROLES.STUDENT }
              },
              async update({ data }) {
                Object.assign(existing, data)
                return existing
              },
              async create() {
                userCreates += 1
                throw new Error('should not create another user')
              },
            },
            student: {
              async findUnique() {
                return existing.student
              },
              async create() {
                throw new Error('should not recreate student')
              },
            },
            lecturer: {
              async findUnique() {
                return null
              },
              async create() {
                throw new Error('should not create lecturer')
              },
            },
          })
        },
        user: {
          async findUnique() {
            return existing
          },
          async update({ data, select }) {
            Object.assign(existing, data)
            const out = {}
            for (const key of Object.keys(select)) out[key] = existing[key]
            return out
          },
        },
      },
    })

    const result = await loginWithKeycloakAccessToken({ accessToken: 'kc-token' }, deps)
    assert.equal(result.user.id, USER_ID)
    assert.equal(result.token, `slap-jwt-for-${USER_ID}`)
    assert.equal(userCreates, 0)
  })

  it('maps lecturer realm role on first login', async () => {
    const { deps, links } = createDeps({
      async verifyKeycloakAccessToken() {
        return claims({ realmRoles: ['lecturer'], email: 'lecturer@example.test', firstName: 'Grace' })
      },
    })
    const result = await loginWithKeycloakAccessToken({ accessToken: 'kc-token' }, deps)
    assert.equal(result.user.role, ROLES.LECTURER)
    assert.ok(result.user.lecturer?.staffNumber?.startsWith('KC-LEC-'))
    assert.equal(links[0].linkMethod, ExternalIdentityLinkMethod.KEYCLOAK_OIDC)
  })

  it('uses SELVIA Core lecturer role when Keycloak realm roles are default-only', async () => {
    const { deps } = createDeps({
      async fetchSelviaAccountRole() {
        return ROLES.LECTURER
      },
      async verifyKeycloakAccessToken() {
        return claims({ realmRoles: ['default-roles-mentor'], email: 'lec@example.test' })
      },
    })
    const result = await loginWithKeycloakAccessToken({ accessToken: 'kc-token' }, deps)
    assert.equal(result.user.role, ROLES.LECTURER)
    assert.ok(result.user.lecturer?.staffNumber?.startsWith('KC-LEC-'))
  })
})
