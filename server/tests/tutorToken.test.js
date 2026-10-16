// npm run test:unit. Tutor-token verification and authorization: no .env, database, or network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import { ROLES } from '../src/constants/roles.js'
import {
  authorizeTutorToken,
  createTutorTokenConfig,
  signTutorToken,
  TUTOR_READ_SCOPES,
  TUTOR_TOKEN_ISSUER,
  TUTOR_TOKEN_MAX_LIFETIME_SECONDS,
  verifyTutorToken,
} from '../src/integrations/mcp/tutorToken.js'
import { ApiError } from '../src/utils/ApiError.js'

const USER_ID = '7a0c2b4e-1f3d-4c5a-9b6e-0d1f2a3b4c5d'
const STUDENT_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9'
const OTHER_STUDENT_ID = 'c0ffee00-1234-4abc-8def-0123456789ab'

const LOGIN_SECRET = 'unit-test-login-secret-value-at-least-32-chars'
const TUTOR_SECRET = 'unit-test-tutor-secret-value-at-least-32-chars'
const AUDIENCE = 'http://localhost:5000/mcp'

const config = createTutorTokenConfig({
  secret: TUTOR_SECRET,
  audience: AUDIENCE,
  issuer: TUTOR_TOKEN_ISSUER,
})

const activeStudent = {
  id: USER_ID,
  role: ROLES.STUDENT,
  isActive: true,
  email: 'student@example.test',
}

function signRaw(payload, options, secret = TUTOR_SECRET) {
  return jwt.sign(payload, secret, { algorithm: 'HS256', ...options })
}

function assertUnauthorized(fn, message) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.statusCode, 401)
    if (message !== undefined) assert.equal(err.message, message)
    return true
  })
}

async function assertAsyncUnauthorized(promise, message) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.statusCode, 401)
    if (message !== undefined) assert.equal(err.message, message)
    return true
  })
}

async function assertAsyncForbidden(promise) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof ApiError)
    assert.equal(err.statusCode, 403)
    return true
  })
}

describe('createTutorTokenConfig', () => {
  it('requires a long secret and a non-empty audience', () => {
    assert.throws(() => createTutorTokenConfig({ secret: 'short', audience: AUDIENCE }))
    assert.throws(() => createTutorTokenConfig({ secret: TUTOR_SECRET, audience: '' }))
  })
})

describe('verifyTutorToken', () => {
  it('accepts a valid tutor token', () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: TUTOR_READ_SCOPES },
      config,
    )
    const claims = verifyTutorToken(token, config)
    assert.equal(claims.userId, USER_ID)
    assert.equal(claims.studentId, STUDENT_ID)
    assert.deepEqual(claims.scopes, [...TUTOR_READ_SCOPES])
    assert.equal(typeof claims.expiresAt, 'number')
  })

  it('rejects an invalid signature', () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:evidence.read'] },
      config,
    )
    const other = createTutorTokenConfig({ secret: `${TUTOR_SECRET}-other-suffix!!!!`, audience: AUDIENCE })
    assertUnauthorized(() => verifyTutorToken(token, other))
  })

  it('rejects an expired token', () => {
    const now = Math.floor(Date.now() / 1000)
    const expired = signRaw(
      {
        student_id: STUDENT_ID,
        scope: 'tutor:evidence.read',
        iat: now - 120,
        exp: now - 60,
      },
      { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE },
    )
    assertUnauthorized(() => verifyTutorToken(expired, config), 'Token has expired')
  })

  it('rejects a token with no expiry', () => {
    const token = signRaw(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
      { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE },
    )
    assertUnauthorized(() => verifyTutorToken(token, config))
  })

  it('rejects an incorrect issuer', () => {
    const token = signRaw(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
      {
        subject: USER_ID,
        issuer: 'other-issuer',
        audience: AUDIENCE,
        expiresIn: 60,
      },
    )
    assertUnauthorized(() => verifyTutorToken(token, config))
  })

  it('rejects an incorrect audience', () => {
    const token = signRaw(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
      {
        subject: USER_ID,
        issuer: TUTOR_TOKEN_ISSUER,
        audience: 'http://localhost:5000/other',
        expiresIn: 60,
      },
    )
    assertUnauthorized(() => verifyTutorToken(token, config))
  })

  it('rejects an unexpected algorithm', () => {
    const token = jwt.sign(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
      TUTOR_SECRET,
      {
        algorithm: 'HS384',
        subject: USER_ID,
        issuer: TUTOR_TOKEN_ISSUER,
        audience: AUDIENCE,
        expiresIn: 60,
      },
    )
    assertUnauthorized(() => verifyTutorToken(token, config))
  })

  it('rejects missing or malformed subject and student id', () => {
    assertUnauthorized(() =>
      verifyTutorToken(
        signRaw(
          { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
          { issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE, expiresIn: 60 },
        ),
        config,
      ),
    )
    assertUnauthorized(() =>
      verifyTutorToken(
        signRaw(
          { student_id: 'not-a-uuid', scope: 'tutor:evidence.read' },
          { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE, expiresIn: 60 },
        ),
        config,
      ),
    )
    assertUnauthorized(() =>
      verifyTutorToken(
        signRaw(
          { scope: 'tutor:evidence.read' },
          { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE, expiresIn: 60 },
        ),
        config,
      ),
    )
  })

  it('rejects missing or unsupported scopes', () => {
    assertUnauthorized(() =>
      verifyTutorToken(
        signRaw(
          { student_id: STUDENT_ID },
          { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE, expiresIn: 60 },
        ),
        config,
      ),
    )
    assertUnauthorized(() =>
      verifyTutorToken(
        signRaw(
          { student_id: STUDENT_ID, scope: 'tutor:admin.write' },
          { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE, expiresIn: 60 },
        ),
        config,
      ),
    )
  })

  it('rejects a token lifetime longer than the permitted maximum', () => {
    const now = Math.floor(Date.now() / 1000)
    const token = signRaw(
      {
        student_id: STUDENT_ID,
        scope: 'tutor:evidence.read',
        iat: now,
        exp: now + TUTOR_TOKEN_MAX_LIFETIME_SECONDS + 1,
      },
      { subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE },
    )
    assertUnauthorized(() => verifyTutorToken(token, config))
  })

  it('rejects a normal login JWT', () => {
    // Login-shaped token: role claim, long lifetime, no iss/aud/student_id/scope.
    const loginToken = jwt.sign({ role: ROLES.STUDENT }, LOGIN_SECRET, {
      algorithm: 'HS256',
      subject: USER_ID,
      expiresIn: '1d',
    })
    assertUnauthorized(() => verifyTutorToken(loginToken, config))

    // Even if the login secret were reused as the tutor secret, login claims still fail tutor rules.
    const sameSecretConfig = createTutorTokenConfig({
      secret: LOGIN_SECRET,
      audience: AUDIENCE,
      issuer: TUTOR_TOKEN_ISSUER,
    })
    assertUnauthorized(() => verifyTutorToken(loginToken, sameSecretConfig))
  })
})

describe('authorizeTutorToken', () => {
  const deps = ({
    user = activeStudent,
    student = { id: STUDENT_ID },
    getUserError,
  } = {}) => ({
    getAuthenticatedUser: async (userId) => {
      if (getUserError) throw getUserError
      assert.equal(userId, USER_ID)
      return user
    },
    findStudentByUserId: async () => student,
  })

  it('returns the server-resolved identity and validated scopes', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:evidence.read', 'tutor:activity.read'] },
      config,
    )
    const identity = await authorizeTutorToken(token, config, deps())
    assert.equal(identity.userId, USER_ID)
    assert.equal(identity.studentId, STUDENT_ID)
    assert.deepEqual(identity.scopes, ['tutor:evidence.read', 'tutor:activity.read'])
    assert.equal(typeof identity.expiresAt, 'number')
  })

  it('rejects a missing or inactive user', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:course.read'] },
      config,
    )
    await assertAsyncUnauthorized(
      authorizeTutorToken(token, config, deps({ getUserError: ApiError.unauthorized('Invalid token') })),
      'Invalid token',
    )
  })

  it('rejects a non-STUDENT user', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:course.read'] },
      config,
    )
    await assertAsyncForbidden(
      authorizeTutorToken(token, config, deps({ user: { ...activeStudent, role: ROLES.LECTURER } })),
    )
  })

  it('rejects a missing student profile', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:course.read'] },
      config,
    )
    await assertAsyncForbidden(authorizeTutorToken(token, config, deps({ student: null })))
  })

  it('rejects a mismatched student_id', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:course.read'] },
      config,
    )
    await assertAsyncUnauthorized(
      authorizeTutorToken(token, config, deps({ student: { id: OTHER_STUDENT_ID } })),
    )
  })
})

describe('tutor token module stays offline-testable', () => {
  it('does not import the environment loader, Prisma, or Neo4j', () => {
    const source = readFileSync(new URL('../src/integrations/mcp/tutorToken.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from ['"][^'"]*config\/env\.js['"]/)
    assert.doesNotMatch(source, /loadEnvFile/)
    assert.doesNotMatch(source, /from ['"][^'"]*prisma['"]|neo4j-driver/i)
  })
})
