// npm run test:unit. Tutor-facing JSON contracts: validates real DTO helpers and proposed MCP envelopes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { Prisma } from '@prisma/client'
import {
  ACTIVITY_DTO_KEYS,
  ACTIVITY_TYPES,
  assertNoSensitiveErrorText,
  EVIDENCE_DTO_KEYS,
  EVIDENCE_METADATA_KEYS as CONTRACT_META_KEYS,
  FORBIDDEN_TUTOR_FIELDS,
  learningActivityRecordSchema,
  mcpEnvelopeSchema,
  mcpErrorEnvelopeSchema,
  mcpSuccessEnvelopeSchema,
  performanceEvidenceRecordSchema,
} from '../src/integrations/mcp/tutorFacingContracts.js'
import { parseOrThrow } from '../src/middleware/validate.js'
import {
  ACTIVITY_SELECT,
  STUDENT_ACTIVITIES_ORDER,
  studentActivitiesQuery,
} from '../src/repositories/learningActivity.query.js'
import {
  currentEvidenceQuery,
  EVIDENCE_METADATA_KEYS,
  toEvidenceView,
} from '../src/repositories/studentEvidence.query.js'
import { listMyActivitiesQuerySchema, studentActivitiesFiltersSchema } from '../src/schemas/learningActivity.schemas.js'
import { currentEvidenceFiltersSchema } from '../src/schemas/studentEvidence.schemas.js'
import { ApiError } from '../src/utils/ApiError.js'

const STUDENT_ID = '7a0c2b4e-1f3d-4c5a-9b6e-0d1f2a3b4c5d'
const COURSE_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9'
const CONCEPT_ID = 'c0ffee00-1234-4abc-8def-0123456789ab'
const SOURCE_ID = 'e1d2c3b4-a596-4877-9665-544332211000'
const OBSERVED_AT = new Date('2026-10-07T01:20:00.000Z')

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')

function evidenceRow(overrides = {}) {
  return {
    id: '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f',
    courseId: COURSE_ID,
    conceptId: CONCEPT_ID,
    sourceType: 'EXERCISE_SUBMISSION',
    sourceId: SOURCE_ID,
    score: new Prisma.Decimal('1.50'),
    maxScore: new Prisma.Decimal('2.00'),
    percentage: new Prisma.Decimal('75.00'),
    attemptNumber: 1,
    timeSpentSeconds: null,
    hintsUsed: null,
    errorsCount: null,
    status: 'COMPLETED',
    metadata: {},
    observedAt: OBSERVED_AT,
    ...overrides,
  }
}

function activityRecord(overrides = {}) {
  return {
    id: '77777777-8888-4999-8aaa-bbbbbbbbbbbb',
    activityType: 'MATERIAL_VIEWED',
    targetType: 'LEARNING_MATERIAL',
    targetId: '88888888-9999-4aaa-8bbb-cccccccccccc',
    courseId: COURSE_ID,
    conceptId: CONCEPT_ID,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    metadata: {},
    occurredAt: OBSERVED_AT,
    createdAt: new Date('2026-10-07T01:20:00.120Z'),
    ...overrides,
  }
}

describe('Contract A — performance evidence DTO', () => {
  it('accepts a numeric score from toEvidenceView', () => {
    const view = toEvidenceView(evidenceRow())
    assert.deepEqual(parseOrThrow(performanceEvidenceRecordSchema, view), view)
    assert.equal(view.score, 1.5)
  })

  it('accepts score null and keeps zero as zero', () => {
    const missing = toEvidenceView(evidenceRow({ score: null, percentage: null, status: 'SKIPPED' }))
    assert.equal(missing.score, null)
    parseOrThrow(performanceEvidenceRecordSchema, missing)

    const zero = toEvidenceView(evidenceRow({ score: new Prisma.Decimal('0'), percentage: new Prisma.Decimal('0') }))
    assert.equal(zero.score, 0)
    parseOrThrow(performanceEvidenceRecordSchema, zero)
  })

  it('allows nullable course and concept and supported enums', () => {
    const view = toEvidenceView(
      evidenceRow({
        courseId: null,
        conceptId: null,
        sourceType: 'ASSESSMENT_ANSWER',
        status: 'TIMED_OUT',
        score: null,
        percentage: null,
      }),
    )
    parseOrThrow(performanceEvidenceRecordSchema, view)
  })

  it('allowlists metadata and strips unknown keys before the contract sees them', () => {
    assert.deepEqual(EVIDENCE_METADATA_KEYS, CONTRACT_META_KEYS)
    const view = toEvidenceView(
      evidenceRow({
        metadata: {
          is_correct: true,
          answer_text: 'secret',
          exercise_id: '11111111-1111-4111-8111-111111111111',
        },
      }),
    )
    assert.deepEqual(view.metadata, {
      is_correct: true,
      exercise_id: '11111111-1111-4111-8111-111111111111',
    })
    parseOrThrow(performanceEvidenceRecordSchema, view)
  })

  it('exposes exactly the documented DTO keys and no forbidden tutor fields', () => {
    const view = toEvidenceView(evidenceRow())
    assert.deepEqual(Object.keys(view).sort(), [...EVIDENCE_DTO_KEYS].sort())
    for (const key of FORBIDDEN_TUTOR_FIELDS) {
      assert.equal(Object.hasOwn(view, key), false, key)
    }
  })

  it('treats an empty result set as a valid success payload for the proposed envelope', () => {
    const envelope = { ok: true, data: { records: [] } }
    parseOrThrow(mcpSuccessEnvelopeSchema, envelope)
  })

  it('documents current-only filtering and oldest-first order from the real query', () => {
    const { where, orderBy } = currentEvidenceQuery({ studentId: STUDENT_ID, courseId: COURSE_ID })
    assert.equal(where.supersededByEvidenceId, null)
    assert.equal(where.studentId, STUDENT_ID)
    assert.equal(where.courseId, COURSE_ID)
    assert.deepEqual(orderBy, [{ observedAt: 'asc' }, { id: 'asc' }])
  })

  it('rejects a forged studentId on the evidence DTO', () => {
    const view = { ...toEvidenceView(evidenceRow()), studentId: STUDENT_ID }
    assert.throws(() => parseOrThrow(performanceEvidenceRecordSchema, view), ApiError)
  })
})

describe('Contract B — learning activity DTO', () => {
  it('accepts a valid activity record with supported enums', () => {
    for (const activityType of ['LESSON_VIEWED', 'MATERIAL_VIEWED', 'EXAMPLE_VIEWED', 'EXERCISE_SUBMITTED']) {
      assert.ok(ACTIVITY_TYPES.includes(activityType))
      parseOrThrow(learningActivityRecordSchema, activityRecord({ activityType }))
    }
  })

  it('allows nullable duration fields and matches ACTIVITY_SELECT keys', () => {
    const record = activityRecord()
    parseOrThrow(learningActivityRecordSchema, record)
    assert.deepEqual(Object.keys(ACTIVITY_SELECT).sort(), ACTIVITY_DTO_KEYS)
    assert.deepEqual(Object.keys(record).sort(), ACTIVITY_DTO_KEYS)
    assert.equal(Object.hasOwn(ACTIVITY_SELECT, 'studentId'), false)
  })

  it('validates course, activity-type, target-type and inclusive date filters', () => {
    const from = new Date('2026-10-01T00:00:00.000Z')
    const to = new Date('2026-10-07T23:59:59.000Z')
    const { where, take, orderBy } = studentActivitiesQuery({
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
      activityType: 'MATERIAL_VIEWED',
      targetType: 'LEARNING_MATERIAL',
      occurredFrom: from,
      occurredTo: to,
      limit: 25,
    })
    assert.deepEqual(where.occurredAt, { gte: from, lte: to })
    assert.equal(take, 25)
    assert.deepEqual(orderBy, STUDENT_ACTIVITIES_ORDER)

    const http = parseOrThrow(listMyActivitiesQuerySchema, {
      courseId: COURSE_ID,
      activityType: 'LESSON_VIEWED',
      targetType: 'LESSON',
      occurredFrom: '2026-10-01T00:00:00.000Z',
      occurredTo: '2026-10-07T23:59:59.000Z',
      limit: '50',
    })
    assert.equal(http.limit, 50)
    assert.throws(() => parseOrThrow(listMyActivitiesQuerySchema, { studentId: STUDENT_ID }), ApiError)
    assert.throws(
      () =>
        parseOrThrow(listMyActivitiesQuerySchema, {
          occurredFrom: '2026-10-07T00:00:00.000Z',
          occurredTo: '2026-10-01T00:00:00.000Z',
        }),
      ApiError,
    )
    assert.throws(() => parseOrThrow(listMyActivitiesQuerySchema, { limit: '201' }), ApiError)
    assert.equal(parseOrThrow(studentActivitiesFiltersSchema, { studentId: STUDENT_ID }).limit, 50)
  })

  it('uses deterministic newest-first ordering for identical timestamps', () => {
    assert.deepEqual(STUDENT_ACTIVITIES_ORDER, [{ occurredAt: 'desc' }, { id: 'desc' }])
  })

  it('rejects forbidden inferred fields on activity records', () => {
    assert.throws(
      () => parseOrThrow(learningActivityRecordSchema, { ...activityRecord(), mastery: 0.9 }),
      ApiError,
    )
    assert.throws(
      () => parseOrThrow(learningActivityRecordSchema, { ...activityRecord(), studentId: STUDENT_ID }),
      ApiError,
    )
  })
})

describe('Contract C — proposed MCP envelope', () => {
  it('accepts success with data and success with an empty array', () => {
    parseOrThrow(mcpSuccessEnvelopeSchema, {
      ok: true,
      data: { records: [toEvidenceView(evidenceRow())] },
    })
    parseOrThrow(mcpEnvelopeSchema, { ok: true, data: { records: [] } })
  })

  it('accepts safe error envelopes for each documented category', () => {
    const examples = [
      { code: 'VALIDATION_ERROR', message: 'Validation failed' },
      { code: 'UNAUTHENTICATED', message: 'Invalid token' },
      { code: 'FORBIDDEN', message: 'A student account is required' },
      {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'The knowledge graph database is unavailable. Try again later.',
      },
      { code: 'INTERNAL_ERROR', message: 'Internal error' },
    ]
    for (const error of examples) {
      const envelope = { ok: false, error }
      parseOrThrow(mcpErrorEnvelopeSchema, envelope)
      assert.ok(assertNoSensitiveErrorText(error.message), error.code)
    }
  })

  it('rejects sensitive or malformed public errors', () => {
    assert.equal(assertNoSensitiveErrorText('prisma://secret'), false)
    assert.equal(assertNoSensitiveErrorText('Bearer abc.def.ghi'), false)
    assert.throws(
      () =>
        parseOrThrow(mcpErrorEnvelopeSchema, {
          ok: false,
          error: { code: 'NOT_A_CODE', message: 'x' },
        }),
      ApiError,
    )
    assert.throws(() => parseOrThrow(mcpSuccessEnvelopeSchema, { ok: true, success: true, data: { records: [] } }), ApiError)
  })

  it('keeps documentation examples as valid JSON matching the schemas', () => {
    const doc = source('../../docs/integration/tutor-facing-json-contract.md')
    const fence = /```json\r?\n([\s\S]*?)```/g
    const blocks = []
    for (const match of doc.matchAll(fence)) blocks.push(JSON.parse(match[1]))
    assert.ok(blocks.length >= 5, `expected documented JSON examples, found ${blocks.length}`)

    const exercise = blocks.find((b) => b.sourceType === 'EXERCISE_SUBMISSION')
    const activity = blocks.find((b) => b.activityType === 'MATERIAL_VIEWED')
    const emptyOk = blocks.find((b) => b.ok === true && Array.isArray(b.data?.records))
    const internalErr = blocks.find((b) => b.ok === false && b.error?.code === 'INTERNAL_ERROR')

    parseOrThrow(performanceEvidenceRecordSchema, { ...exercise, observedAt: new Date(exercise.observedAt) })
    parseOrThrow(learningActivityRecordSchema, {
      ...activity,
      occurredAt: new Date(activity.occurredAt),
      createdAt: new Date(activity.createdAt),
    })
    parseOrThrow(mcpSuccessEnvelopeSchema, emptyOk)
    parseOrThrow(mcpErrorEnvelopeSchema, internalErr)
  })
})
