// npm run test:unit — offline internal tutor-access-token mint tests (no DB, no real secrets logged).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  loadInternalTutorMintAuth,
  MIN_INTERNAL_TUTOR_MINT_TOKEN_LENGTH,
} from '../src/config/internalTutorMintAuth.js'
import { createAuthenticateInternalTutorMint } from '../src/middleware/authenticateInternalTutorMint.js'
import { parseOrThrow } from '../src/middleware/validate.js'
import {
  createTutorTokenConfig,
  signTutorToken,
  TUTOR_TOKEN_MAX_LIFETIME_SECONDS,
  verifyTutorToken,
} from '../src/integrations/mcp/tutorToken.js'
import {
  DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS,
  issueTutorAccessTokenSchema,
} from '../src/schemas/tutorAccessToken.schemas.js'
import {
  issueTutorAccessToken,
  TUTOR_ACCESS_TOKEN_SCOPES,
} from '../src/services/tutorAccessToken.service.js'
import { ApiError } from '../src/utils/ApiError.js'
import { secretsEqual } from '../src/utils/secretCompare.js'

const USER_ID = '7a0c2b4e-1f3d-4c5a-9b6e-0d1f2a3b4c5d'
const STUDENT_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9'
const ISSUER = 'http://localhost:8080/realms/mentor'
const SUBJECT = 'keycloak-sub-001'
const AUDIENCE = 'http://127.0.0.1:5000/mcp'
const TUTOR_SECRET = 'unit-test-tutor-secret-value-at-least-32-chars'
const MINT_SECRET = 'unit-test-mint-secret-value-at-least-32-chars'
const JWT_SECRET = 'unit-test-login-secret-value-at-least-32-chars'

const tutorConfig = createTutorTokenConfig({
  secret: TUTOR_SECRET,
  audience: AUDIENCE,
  issuer: 'selvia-platform',
})

function resolvedStudent() {
  return {
    link: {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      issuer: ISSUER,
      subject: SUBJECT,
      userId: USER_ID,
    },
    user: { id: USER_ID, role: 'STUDENT', isActive: true },
    student: { id: STUDENT_ID },
  }
}

function mintDeps(overrides = {}) {
  const resolveCalls = []
  const deps = {
    mcpTutorConfigured: true,
    getTutorTokenConfig: () => tutorConfig,
    async resolveActiveExternalIdentity(input) {
      resolveCalls.push(input)
      return resolvedStudent()
    },
    signTutorToken,
    verifyTutorToken,
    ...overrides,
  }
  return { deps, resolveCalls }
}

async function assertRejectsStatus(promise, statusCode) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.statusCode, statusCode)
    return true
  })
}

function mockReq(authorization) {
  return {
    get(name) {
      return name.toLowerCase() === 'authorization' ? authorization : undefined
    },
  }
}

describe('loadInternalTutorMintAuth', () => {
  it('accepts a strong secret distinct from JWT and MCP secrets', () => {
    const loaded = loadInternalTutorMintAuth({
      token: MINT_SECRET,
      jwtSecret: JWT_SECRET,
      mcpTutorSecret: TUTOR_SECRET,
    })
    assert.equal(loaded.configured, true)
    assert.equal(loaded.token, MINT_SECRET)
  })

  it('is unavailable when the secret is missing', () => {
    assert.equal(loadInternalTutorMintAuth({}).configured, false)
  })

  it('is unavailable when the secret is too short', () => {
    const short = 'x'.repeat(MIN_INTERNAL_TUTOR_MINT_TOKEN_LENGTH - 1)
    assert.equal(loadInternalTutorMintAuth({ token: short }).configured, false)
  })

  it('rejects secrets that conflict with JWT_SECRET or MCP_TUTOR_TOKEN_SECRET', () => {
    assert.equal(
      loadInternalTutorMintAuth({ token: JWT_SECRET, jwtSecret: JWT_SECRET }).configured,
      false,
    )
    assert.equal(
      loadInternalTutorMintAuth({
        token: TUTOR_SECRET,
        mcpTutorSecret: TUTOR_SECRET,
      }).configured,
      false,
    )
  })
})

describe('secretsEqual', () => {
  it('compares equal and unequal secrets without throwing on length mismatch', () => {
    assert.equal(secretsEqual(MINT_SECRET, MINT_SECRET), true)
    assert.equal(secretsEqual(MINT_SECRET, `${MINT_SECRET}x`), false)
    assert.equal(secretsEqual('short', MINT_SECRET), false)
  })
})

describe('authenticateInternalTutorMint', () => {
  it('allows a valid service credential', () => {
    const middleware = createAuthenticateInternalTutorMint({
      getConfig: () => ({ configured: true, token: MINT_SECRET }),
    })
    let called = false
    middleware(mockReq(`Bearer ${MINT_SECRET}`), {}, () => {
      called = true
    })
    assert.equal(called, true)
  })

  it('returns 503 when the service credential is not configured', () => {
    const middleware = createAuthenticateInternalTutorMint({
      getConfig: () => ({ configured: false, token: undefined }),
    })
    assert.throws(
      () => middleware(mockReq(`Bearer ${MINT_SECRET}`), {}, () => {}),
      (err) => err instanceof ApiError && err.statusCode === 503,
    )
  })

  it('returns 401 for missing or incorrect credentials', () => {
    const middleware = createAuthenticateInternalTutorMint({
      getConfig: () => ({ configured: true, token: MINT_SECRET }),
    })
    assert.throws(
      () => middleware(mockReq(undefined), {}, () => {}),
      (err) => err instanceof ApiError && err.statusCode === 401,
    )
    assert.throws(
      () => middleware(mockReq('Bearer wrong-secret-value-at-least-32-characters!!'), {}, () => {}),
      (err) => err instanceof ApiError && err.statusCode === 401,
    )
  })
})

describe('issueTutorAccessTokenSchema', () => {
  it('defaults lifetime to 300 and rejects unknown identity fields', () => {
    const parsed = parseOrThrow(issueTutorAccessTokenSchema, {
      issuer: ISSUER,
      subject: SUBJECT,
    })
    assert.equal(parsed.expiresInSeconds, DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS)

    assert.throws(
      () =>
        parseOrThrow(issueTutorAccessTokenSchema, {
          issuer: ISSUER,
          subject: SUBJECT,
          userId: USER_ID,
        }),
      (err) => err instanceof ApiError && err.statusCode === 400,
    )
    assert.throws(
      () =>
        parseOrThrow(issueTutorAccessTokenSchema, {
          issuer: ISSUER,
          subject: SUBJECT,
          scopes: ['tutor:evidence.read'],
        }),
      (err) => err instanceof ApiError && err.statusCode === 400,
    )
    assert.throws(
      () =>
        parseOrThrow(issueTutorAccessTokenSchema, {
          issuer: ISSUER,
          subject: SUBJECT,
          expiresInSeconds: 0,
        }),
      (err) => err instanceof ApiError && err.statusCode === 400,
    )
    assert.throws(
      () =>
        parseOrThrow(issueTutorAccessTokenSchema, {
          issuer: ISSUER,
          subject: SUBJECT,
          expiresInSeconds: TUTOR_TOKEN_MAX_LIFETIME_SECONDS + 1,
        }),
      (err) => err instanceof ApiError && err.statusCode === 400,
    )
  })
})

describe('issueTutorAccessToken', () => {
  it('issues a verifiable token with fixed scopes and default lifetime', async () => {
    const { deps, resolveCalls } = mintDeps()
    const result = await issueTutorAccessToken({ issuer: ISSUER, subject: SUBJECT }, deps)

    assert.equal(result.tokenType, 'Bearer')
    assert.equal(result.expiresIn, DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS)
    assert.equal(result.resource, AUDIENCE)
    assert.equal(typeof result.accessToken, 'string')
    assert.equal(typeof result.expiresAt, 'number')

    const claims = verifyTutorToken(result.accessToken, tutorConfig)
    assert.equal(claims.userId, USER_ID)
    assert.equal(claims.studentId, STUDENT_ID)
    assert.deepEqual([...claims.scopes].sort(), [...TUTOR_ACCESS_TOKEN_SCOPES].sort())
    assert.equal(claims.expiresAt - Math.floor(Date.now() / 1000) <= 300 + 5, true)

    assert.deepEqual(resolveCalls, [
      { issuer: ISSUER, subject: SUBJECT, requireStudentProfile: true },
    ])

    // Response must not include platform UUIDs as top-level data fields.
    assert.equal(Object.hasOwn(result, 'userId'), false)
    assert.equal(Object.hasOwn(result, 'studentId'), false)
  })

  it('respects a requested lifetime within the allowed range', async () => {
    const { deps } = mintDeps()
    const result = await issueTutorAccessToken(
      { issuer: ISSUER, subject: SUBJECT, expiresInSeconds: 120 },
      deps,
    )
    assert.equal(result.expiresIn, 120)
    const claims = verifyTutorToken(result.accessToken, tutorConfig)
    assert.ok(claims.expiresAt - Math.floor(Date.now() / 1000) <= 120 + 5)
  })

  it('returns 404 when the identity is missing or revoked', async () => {
    const { deps } = mintDeps({
      async resolveActiveExternalIdentity() {
        return null
      },
    })
    await assertRejectsStatus(
      issueTutorAccessToken({ issuer: ISSUER, subject: SUBJECT }, deps),
      404,
    )
  })

  it('propagates forbidden errors for inactive, non-student, or missing profile', async () => {
    const { deps } = mintDeps({
      async resolveActiveExternalIdentity() {
        throw ApiError.forbidden('A student profile is required')
      },
    })
    await assertRejectsStatus(
      issueTutorAccessToken({ issuer: ISSUER, subject: SUBJECT }, deps),
      403,
    )
  })

  it('returns 503 when tutor MCP auth is not configured', async () => {
    const { deps } = mintDeps({ mcpTutorConfigured: false })
    await assertRejectsStatus(
      issueTutorAccessToken({ issuer: ISSUER, subject: SUBJECT }, deps),
      503,
    )
  })

  it('does not create identity links or match email/student number', async () => {
    let createCalled = false
    const { deps } = mintDeps({
      async createAdminVerifiedExternalIdentityLink() {
        createCalled = true
      },
    })
    await issueTutorAccessToken({ issuer: ISSUER, subject: SUBJECT }, deps)
    assert.equal(createCalled, false)

    const source = readFileSync(
      new URL('../src/services/tutorAccessToken.service.js', import.meta.url),
      'utf8',
    )
    assert.equal(source.includes('createAdminVerifiedExternalIdentityLink'), false)
    assert.equal(source.includes('studentNumber'), false)
    assert.equal(source.includes('findUnique({ where: { email'), false)
  })
})

describe('existing tutor-token verification remains available', () => {
  it('still verifies tokens signed with signTutorToken', () => {
    const token = signTutorToken(
      {
        userId: USER_ID,
        studentId: STUDENT_ID,
        scopes: TUTOR_ACCESS_TOKEN_SCOPES,
      },
      tutorConfig,
      { expiresInSeconds: 60 },
    )
    const claims = verifyTutorToken(token, tutorConfig)
    assert.equal(claims.userId, USER_ID)
    assert.equal(claims.studentId, STUDENT_ID)
  })
})
