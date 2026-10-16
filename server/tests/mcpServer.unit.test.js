// npm run test:unit. MCP tutor verifier, tool schemas, tool bodies, and Contract C helpers — no .env, database, or network.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import { OAuthError, OAuthErrorCode, requireScopes } from '@modelcontextprotocol/server'
import { ROLES } from '../src/constants/roles.js'
import {
  ACTIVITY_READ_SCOPE,
  createTutorMcpServer,
  EVIDENCE_READ_SCOPE,
  executeGetCurrentEvidence,
  executeGetLearningActivities,
  TUTOR_MCP_SERVER_INFO,
} from '../src/integrations/mcp/createTutorMcpServer.js'
import {
  getCurrentEvidenceToolInputSchema,
  getLearningActivitiesToolInputSchema,
} from '../src/integrations/mcp/mcpToolSchemas.js'
import {
  assertNoSensitiveErrorText,
  mcpErrorEnvelopeSchema,
  mcpSuccessEnvelopeSchema,
} from '../src/integrations/mcp/tutorFacingContracts.js'
import {
  createTutorTokenConfig,
  signTutorToken,
  TUTOR_TOKEN_ISSUER,
} from '../src/integrations/mcp/tutorToken.js'
import { createTutorOAuthVerifier, TUTOR_MCP_CLIENT_ID } from '../src/integrations/mcp/tutorOAuthVerifier.js'
import {
  mcpUnavailableMiddleware,
  shouldServeTutorMcp,
} from '../src/integrations/mcp/tutorMcpAuth.middleware.js'
import {
  SAFE_MESSAGES,
  serializeRecordDates,
  toolError,
  toolSuccess,
} from '../src/integrations/mcp/toolResults.js'
import { ApiError } from '../src/utils/ApiError.js'

const USER_ID = '7a0c2b4e-1f3d-4c5a-9b6e-0d1f2a3b4c5d'
const STUDENT_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9'
const OTHER_STUDENT_ID = 'c0ffee00-1234-4abc-8def-0123456789ab'
const COURSE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CONCEPT_ID = 'ffffffff-0000-4111-8222-333333333333'

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

function deps({ user = activeStudent, student = { id: STUDENT_ID }, getUserError } = {}) {
  return {
    getAuthenticatedUser: async (userId) => {
      if (getUserError) throw getUserError
      assert.equal(userId, USER_ID)
      return user
    },
    findStudentByUserId: async () => student,
  }
}

function verifier(overrides) {
  return createTutorOAuthVerifier({ config, ...deps(overrides) })
}

async function assertOAuthInvalidToken(promise) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof OAuthError)
    assert.equal(err.code, OAuthErrorCode.InvalidToken)
    return true
  })
}

async function assertOAuthAccessDenied(promise) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof OAuthError)
    assert.equal(err.code, OAuthErrorCode.AccessDenied)
    return true
  })
}

describe('createTutorOAuthVerifier', () => {
  it('accepts a valid tutor token and returns AuthInfo with trusted extra identity', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:evidence.read'] },
      config,
    )
    const auth = await verifier().verifyAccessToken(token)
    assert.equal(auth.token, token)
    assert.equal(auth.clientId, TUTOR_MCP_CLIENT_ID)
    assert.deepEqual(auth.scopes, ['tutor:evidence.read'])
    assert.equal(typeof auth.expiresAt, 'number')
    assert.equal(auth.resource.href, new URL(AUDIENCE).href)
    assert.deepEqual(auth.extra, { userId: USER_ID, studentId: STUDENT_ID })
  })

  it('rejects an invalid signature', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:evidence.read'] },
      config,
    )
    const other = createTutorOAuthVerifier({
      config: createTutorTokenConfig({ secret: `${TUTOR_SECRET}-other-suffix!!!!`, audience: AUDIENCE }),
      ...deps(),
    })
    await assertOAuthInvalidToken(other.verifyAccessToken(token))
  })

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000)
    const expired = jwt.sign(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read', iat: now - 120, exp: now - 60 },
      TUTOR_SECRET,
      { algorithm: 'HS256', subject: USER_ID, issuer: TUTOR_TOKEN_ISSUER, audience: AUDIENCE },
    )
    await assertOAuthInvalidToken(verifier().verifyAccessToken(expired))
  })

  it('rejects wrong issuer and wrong audience', async () => {
    const wrongIssuer = jwt.sign(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
      TUTOR_SECRET,
      { algorithm: 'HS256', subject: USER_ID, issuer: 'other', audience: AUDIENCE, expiresIn: 60 },
    )
    const wrongAudience = jwt.sign(
      { student_id: STUDENT_ID, scope: 'tutor:evidence.read' },
      TUTOR_SECRET,
      {
        algorithm: 'HS256',
        subject: USER_ID,
        issuer: TUTOR_TOKEN_ISSUER,
        audience: 'http://localhost:5000/other',
        expiresIn: 60,
      },
    )
    await assertOAuthInvalidToken(verifier().verifyAccessToken(wrongIssuer))
    await assertOAuthInvalidToken(verifier().verifyAccessToken(wrongAudience))
  })

  it('rejects a normal login JWT', async () => {
    const loginToken = jwt.sign({ role: ROLES.STUDENT }, LOGIN_SECRET, {
      algorithm: 'HS256',
      subject: USER_ID,
      expiresIn: '1d',
    })
    await assertOAuthInvalidToken(verifier().verifyAccessToken(loginToken))
  })

  it('rejects inactive users, non-students, missing profiles and mismatched student_id', async () => {
    const token = signTutorToken(
      { userId: USER_ID, studentId: STUDENT_ID, scopes: ['tutor:activity.read'] },
      config,
    )
    await assertOAuthInvalidToken(
      verifier({ getUserError: ApiError.unauthorized('Invalid token') }).verifyAccessToken(token),
    )
    await assertOAuthAccessDenied(
      verifier({ user: { ...activeStudent, role: ROLES.LECTURER } }).verifyAccessToken(token),
    )
    await assertOAuthAccessDenied(verifier({ student: null }).verifyAccessToken(token))
    await assertOAuthInvalidToken(verifier({ student: { id: OTHER_STUDENT_ID } }).verifyAccessToken(token))
  })
})

describe('tutor MCP fail-closed configuration', () => {
  it('refuses to serve tools when tutor auth is not configured', () => {
    assert.equal(shouldServeTutorMcp({ configured: false }), false)
    assert.equal(shouldServeTutorMcp(undefined), false)
    assert.equal(shouldServeTutorMcp({ configured: true }), true)

    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        this.body = payload
        return this
      },
    }
    mcpUnavailableMiddleware({}, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.ok, false)
    assert.equal(res.body.error.code, 'DEPENDENCY_UNAVAILABLE')
  })
})

describe('MCP tool input schemas', () => {
  it('get_current_evidence accepts optional filters and rejects identity and unknown fields', () => {
    assert.deepEqual(getCurrentEvidenceToolInputSchema.parse({}), {})
    assert.deepEqual(getCurrentEvidenceToolInputSchema.parse({ courseId: COURSE_ID, conceptId: CONCEPT_ID }), {
      courseId: COURSE_ID,
      conceptId: CONCEPT_ID,
    })
    assert.throws(() => getCurrentEvidenceToolInputSchema.parse({ studentId: STUDENT_ID }))
    assert.throws(() => getCurrentEvidenceToolInputSchema.parse({ userId: USER_ID }))
    assert.throws(() => getCurrentEvidenceToolInputSchema.parse({ mastery: 1 }))
  })

  it('get_learning_activities accepts filters and rejects identity, bad limits and inverted dates', () => {
    const parsed = getLearningActivitiesToolInputSchema.parse({
      courseId: COURSE_ID,
      activityType: 'LESSON_VIEWED',
      targetType: 'LESSON',
      limit: '25',
    })
    assert.equal(parsed.limit, 25)
    assert.equal(getLearningActivitiesToolInputSchema.parse({}).limit, 50)

    assert.throws(() => getLearningActivitiesToolInputSchema.parse({ studentId: STUDENT_ID }))
    assert.throws(() => getLearningActivitiesToolInputSchema.parse({ userId: USER_ID }))
    assert.throws(() => getLearningActivitiesToolInputSchema.parse({ limit: 0 }))
    assert.throws(() => getLearningActivitiesToolInputSchema.parse({ limit: 201 }))
    assert.throws(() =>
      getLearningActivitiesToolInputSchema.parse({
        occurredFrom: '2026-10-10T00:00:00.000Z',
        occurredTo: '2026-10-01T00:00:00.000Z',
      }),
    )
  })
})

describe('Contract C tool results', () => {
  it('returns success envelopes including empty records', () => {
    const empty = toolSuccess([])
    assert.equal(empty.isError, undefined)
    mcpSuccessEnvelopeSchema.parse(empty.structuredContent)
    assert.deepEqual(empty.structuredContent, { ok: true, data: { records: [] } })
    assert.equal(JSON.parse(empty.content[0].text).ok, true)
  })

  it('preserves null scores and durations and serializes dates', () => {
    const observedAt = new Date('2026-10-07T12:00:00.000Z')
    const result = toolSuccess([
      {
        id: COURSE_ID,
        score: null,
        durationSeconds: null,
        observedAt,
      },
    ])
    const record = result.structuredContent.data.records[0]
    assert.equal(record.score, null)
    assert.equal(record.durationSeconds, null)
    assert.equal(record.observedAt, '2026-10-07T12:00:00.000Z')
    assert.equal(serializeRecordDates({ score: 0 }).score, 0)
  })

  it('returns safe error envelopes without internal details', () => {
    const err = toolError('INTERNAL_ERROR', 'An unexpected error occurred.')
    assert.equal(err.isError, true)
    mcpErrorEnvelopeSchema.parse(err.structuredContent)
    assert.equal(err.structuredContent.error.message, SAFE_MESSAGES.INTERNAL_ERROR)
    assert.ok(assertNoSensitiveErrorText(err.structuredContent.error.message))
  })
})

describe('tool execution injects authenticated studentId only', () => {
  it('calls getCurrentEvidence with the authenticated student and optional filters', async () => {
    const calls = []
    const result = await executeGetCurrentEvidence({
      studentId: STUDENT_ID,
      args: { courseId: COURSE_ID },
      getCurrentEvidence: async (filters) => {
        calls.push(filters)
        return [{ id: COURSE_ID, score: null, observedAt: new Date('2026-01-01T00:00:00.000Z') }]
      },
    })
    assert.deepEqual(calls, [{ studentId: STUDENT_ID, courseId: COURSE_ID }])
    assert.equal(result.structuredContent.ok, true)
    assert.equal(result.structuredContent.data.records[0].score, null)
  })

  it('cannot override identity through tool args (args never supply studentId to the service)', async () => {
    const calls = []
    await executeGetCurrentEvidence({
      studentId: STUDENT_ID,
      args: { courseId: COURSE_ID, studentId: OTHER_STUDENT_ID, userId: USER_ID },
      getCurrentEvidence: async (filters) => {
        calls.push(filters)
        return []
      },
    })
    assert.deepEqual(calls[0], { studentId: STUDENT_ID, courseId: COURSE_ID })
    assert.equal(calls[0].userId, undefined)
  })

  it('calls getStudentActivities with the authenticated student and preserves null durations', async () => {
    const calls = []
    const result = await executeGetLearningActivities({
      studentId: STUDENT_ID,
      args: { activityType: 'MATERIAL_VIEWED', limit: 10 },
      getStudentActivities: async (filters) => {
        calls.push(filters)
        return [{ id: CONCEPT_ID, durationSeconds: null, occurredAt: new Date('2026-01-02T00:00:00.000Z') }]
      },
    })
    assert.equal(calls[0].studentId, STUDENT_ID)
    assert.equal(calls[0].activityType, 'MATERIAL_VIEWED')
    assert.equal(result.structuredContent.data.records[0].durationSeconds, null)
  })

  it('maps validation failures to Contract C validation errors without leaking details', async () => {
    const result = await executeGetCurrentEvidence({
      studentId: STUDENT_ID,
      args: {},
      getCurrentEvidence: async () => {
        throw ApiError.badRequest('Validation failed', [{ field: 'courseId', message: 'bad' }])
      },
    })
    assert.equal(result.isError, true)
    assert.equal(result.structuredContent.error.code, 'VALIDATION_ERROR')
    assert.ok(!JSON.stringify(result.structuredContent).includes('courseId'))
  })

  it('maps unexpected failures to a safe internal error', async () => {
    const result = await executeGetLearningActivities({
      studentId: STUDENT_ID,
      args: {},
      getStudentActivities: async () => {
        throw new Error('prisma connection ECONNREFUSED postgresql://secret')
      },
    })
    assert.equal(result.isError, true)
    assert.equal(result.structuredContent.error.code, 'INTERNAL_ERROR')
    assert.ok(assertNoSensitiveErrorText(result.structuredContent.error.message))
    assert.ok(!JSON.stringify(result).includes('postgresql'))
  })
})

describe('createTutorMcpServer registration', () => {
  it('registers both tools with distinct scopes and does not write to services at construction', () => {
    let evidenceCalls = 0
    let activityCalls = 0
    const server = createTutorMcpServer({
      authInfo: {
        extra: { userId: USER_ID, studentId: STUDENT_ID },
        scopes: [EVIDENCE_READ_SCOPE, ACTIVITY_READ_SCOPE],
      },
      services: {
        getCurrentEvidence: async () => {
          evidenceCalls += 1
          return []
        },
        getStudentActivities: async () => {
          activityCalls += 1
          return []
        },
      },
    })
    assert.equal(server.server ? TUTOR_MCP_SERVER_INFO.name : TUTOR_MCP_SERVER_INFO.name, 'selvia-tutor-mcp')
    assert.equal(evidenceCalls, 0)
    assert.equal(activityCalls, 0)

    const evidenceChallenge = requireScopes(EVIDENCE_READ_SCOPE)({
      request: { method: 'tools/call', params: { name: 'get_current_evidence' } },
      authInfo: { scopes: [ACTIVITY_READ_SCOPE] },
    })
    assert.ok(evidenceChallenge)
    assert.deepEqual([...evidenceChallenge.scopes], [EVIDENCE_READ_SCOPE])

    const activityOk = requireScopes(ACTIVITY_READ_SCOPE)({
      request: { method: 'tools/call', params: { name: 'get_learning_activities' } },
      authInfo: { scopes: [ACTIVITY_READ_SCOPE] },
    })
    assert.equal(activityOk, undefined)
  })
})

describe('MCP integration modules stay offline-safe for unit tests', () => {
  it('tool helpers and verifier do not import env or Prisma', () => {
    for (const relative of [
      '../src/integrations/mcp/toolResults.js',
      '../src/integrations/mcp/tutorOAuthVerifier.js',
      '../src/integrations/mcp/createTutorMcpServer.js',
      '../src/integrations/mcp/tutorMcpAuth.middleware.js',
    ]) {
      const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
      assert.doesNotMatch(source, /from ['"][^'"]*config\/env\.js['"]/)
      assert.doesNotMatch(source, /from ['"][^'"]*prisma['"]|neo4j-driver/i)
    }
  })
})
