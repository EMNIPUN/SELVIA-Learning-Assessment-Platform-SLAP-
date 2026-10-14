// npm run test:unit. Reading current student evidence: the query, the returned shape and input validation. Imports
// only modules that load no configuration and no database client, so nothing here connects to anything.
import { Prisma } from '@prisma/client'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parseOrThrow } from '../src/middleware/validate.js'
import { currentEvidenceQuery, EVIDENCE_METADATA_KEYS, toEvidenceView } from '../src/repositories/studentEvidence.query.js'
import { currentEvidenceFiltersSchema } from '../src/schemas/studentEvidence.schemas.js'
import { ApiError } from '../src/utils/ApiError.js'

const STUDENT_ID = '7a0c2b4e-1f3d-4c5a-9b6e-0d1f2a3b4c5d'
const COURSE_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9'
const CONCEPT_ID = 'c0ffee00-1234-4abc-8def-0123456789ab'
const SOURCE_ID = 'e1d2c3b4-a596-4877-9665-544332211000'
const OBSERVED_AT = new Date('2026-10-01T09:30:00.000Z')

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

describe('currentEvidenceQuery', () => {
  it("reads only the student's current evidence when no filter is given", () => {
    const { where } = currentEvidenceQuery({ studentId: STUDENT_ID })
    assert.deepEqual(where, { studentId: STUDENT_ID, supersededByEvidenceId: null })
  })

  it('adds the course and concept filters that are given', () => {
    assert.deepEqual(currentEvidenceQuery({ studentId: STUDENT_ID, courseId: COURSE_ID }).where, {
      studentId: STUDENT_ID,
      supersededByEvidenceId: null,
      courseId: COURSE_ID,
    })
    assert.deepEqual(currentEvidenceQuery({ studentId: STUDENT_ID, conceptId: CONCEPT_ID }).where, {
      studentId: STUDENT_ID,
      supersededByEvidenceId: null,
      conceptId: CONCEPT_ID,
    })
    assert.deepEqual(currentEvidenceQuery({ studentId: STUDENT_ID, courseId: COURSE_ID, conceptId: CONCEPT_ID }).where, {
      studentId: STUDENT_ID,
      supersededByEvidenceId: null,
      courseId: COURSE_ID,
      conceptId: CONCEPT_ID,
    })
  })

  it('orders oldest first, with the id breaking ties', () => {
    assert.deepEqual(currentEvidenceQuery({ studentId: STUDENT_ID }).orderBy, [{ observedAt: 'asc' }, { id: 'asc' }])
  })

  it('selects the observation fields and nothing about the student or the supersession', () => {
    const { select } = currentEvidenceQuery({ studentId: STUDENT_ID })
    assert.deepEqual(Object.keys(select).sort(), [
      'attemptNumber',
      'conceptId',
      'courseId',
      'errorsCount',
      'hintsUsed',
      'id',
      'maxScore',
      'metadata',
      'observedAt',
      'percentage',
      'score',
      'sourceId',
      'sourceType',
      'status',
      'timeSpentSeconds',
    ])
    assert.ok(Object.values(select).every((value) => value === true), 'no relation is selected')
  })
})

describe('toEvidenceView', () => {
  it('returns Decimal columns as numbers', () => {
    const view = toEvidenceView(evidenceRow())
    assert.equal(view.score, 1.5)
    assert.equal(view.maxScore, 2)
    assert.equal(view.percentage, 75)
  })

  it('keeps a score of zero as zero', () => {
    const view = toEvidenceView(evidenceRow({ score: new Prisma.Decimal('0.00'), percentage: new Prisma.Decimal('0.00') }))
    assert.equal(view.score, 0)
    assert.equal(view.percentage, 0)
  })

  it('keeps every unmeasured field null rather than zero', () => {
    const view = toEvidenceView(
      evidenceRow({
        status: 'SKIPPED',
        score: null,
        percentage: null,
        attemptNumber: null,
        timeSpentSeconds: null,
        hintsUsed: null,
        errorsCount: null,
        courseId: null,
        conceptId: null,
      }),
    )
    for (const field of ['score', 'percentage', 'attemptNumber', 'timeSpentSeconds', 'hintsUsed', 'errorsCount', 'courseId', 'conceptId']) {
      assert.equal(view[field], null, field)
    }
    assert.equal(view.maxScore, 2)
    assert.equal(view.status, 'SKIPPED')

    const unscored = toEvidenceView(evidenceRow({ score: null, maxScore: null, percentage: null }))
    assert.equal(unscored.maxScore, null)
  })

  it('passes the identifiers, status, counts and observation time through unchanged', () => {
    const view = toEvidenceView(evidenceRow({ status: 'TIMED_OUT', attemptNumber: 3, timeSpentSeconds: 42, hintsUsed: 0, errorsCount: 2 }))
    assert.equal(view.id, '0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f')
    assert.equal(view.courseId, COURSE_ID)
    assert.equal(view.conceptId, CONCEPT_ID)
    assert.equal(view.sourceType, 'EXERCISE_SUBMISSION')
    assert.equal(view.sourceId, SOURCE_ID)
    assert.equal(view.status, 'TIMED_OUT')
    assert.equal(view.attemptNumber, 3)
    assert.equal(view.timeSpentSeconds, 42)
    assert.equal(view.hintsUsed, 0)
    assert.equal(view.errorsCount, 2)
    assert.equal(view.observedAt, OBSERVED_AT)
  })

  it('returns exactly the observation fields', () => {
    assert.deepEqual(Object.keys(toEvidenceView(evidenceRow())).sort(), [
      'attemptNumber',
      'conceptId',
      'courseId',
      'errorsCount',
      'hintsUsed',
      'id',
      'maxScore',
      'metadata',
      'observedAt',
      'percentage',
      'score',
      'sourceId',
      'sourceType',
      'status',
      'timeSpentSeconds',
    ])
  })

  it('keeps the metadata the exercise submission records', () => {
    const metadata = {
      exercise_id: '11111111-1111-4111-8111-111111111111',
      lesson_id: '22222222-2222-4222-8222-222222222222',
      exercise_type: 'MULTIPLE_CHOICE',
      difficulty: 'EASY',
      bloom_level: 'APPLY',
      is_correct: false,
    }
    assert.deepEqual(toEvidenceView(evidenceRow({ metadata })).metadata, metadata)
  })

  it('keeps the metadata a quiz answer records, leaving is_correct out when the question was not answered', () => {
    const metadata = {
      question_id: '33333333-3333-4333-8333-333333333333',
      question_version: 2,
      question_type: 'SHORT_ANSWER',
      difficulty: 'HARD',
      bloom_level: 'ANALYZE',
      assessment_id: '44444444-4444-4444-8444-444444444444',
      assessment_type: 'QUIZ',
      assessment_question_id: '55555555-5555-4555-8555-555555555555',
      attempt_id: '66666666-6666-4666-8666-666666666666',
    }
    const view = toEvidenceView(evidenceRow({ sourceType: 'ASSESSMENT_ANSWER', status: 'SKIPPED', score: null, metadata }))
    assert.deepEqual(view.metadata, metadata)
    assert.ok(!Object.hasOwn(view.metadata, 'is_correct'))
  })

  it('drops metadata keys that are not listed, such as answer keys and responses', () => {
    const view = toEvidenceView(
      evidenceRow({
        metadata: {
          is_correct: true,
          correct_option_ids: ['b'],
          accepted_answers: ['stack'],
          answer_config: { options: [] },
          selected_option_id: 'b',
          answer_text: 'stack',
          password: 'Synthetic-Password-1',
        },
      }),
    )
    assert.deepEqual(view.metadata, { is_correct: true })
  })

  it('returns empty metadata when the stored value is not an object', () => {
    for (const metadata of [null, [], 'text', 7]) {
      assert.deepEqual(toEvidenceView(evidenceRow({ metadata })).metadata, {}, JSON.stringify(metadata))
    }
  })

  it('lists no key that names an answer, a response or a secret', () => {
    for (const key of EVIDENCE_METADATA_KEYS) {
      assert.doesNotMatch(key, /correct_option|accepted|answer_config|answer_text|selected_option|response|password|token|secret/, key)
    }
  })
})

describe('currentEvidenceFiltersSchema', () => {
  const refused = (input, field) =>
    assert.throws(
      () => parseOrThrow(currentEvidenceFiltersSchema, input),
      (err) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.statusCode, 400)
        assert.ok(err.details.some((detail) => detail.field === field), JSON.stringify(err.details))
        return true
      },
    )

  it('accepts a student id with or without the course and concept filters', () => {
    assert.deepEqual(parseOrThrow(currentEvidenceFiltersSchema, { studentId: STUDENT_ID }), { studentId: STUDENT_ID })
    const all = { studentId: STUDENT_ID, courseId: COURSE_ID, conceptId: CONCEPT_ID }
    assert.deepEqual(parseOrThrow(currentEvidenceFiltersSchema, all), all)
  })

  it('requires a valid student id', () => {
    refused({}, 'studentId')
    refused({ studentId: 'not-a-uuid' }, 'studentId')
    refused(undefined, '')
  })

  it('refuses invalid or null filters', () => {
    refused({ studentId: STUDENT_ID, courseId: 'not-a-uuid' }, 'courseId')
    refused({ studentId: STUDENT_ID, conceptId: 'not-a-uuid' }, 'conceptId')
    refused({ studentId: STUDENT_ID, courseId: null }, 'courseId')
    refused({ studentId: STUDENT_ID, conceptId: null }, 'conceptId')
  })

  it('refuses any other field, such as a request for superseded evidence', () => {
    refused({ studentId: STUDENT_ID, includeSuperseded: true }, '')
    refused({ studentId: STUDENT_ID, supersededByEvidenceId: SOURCE_ID }, '')
  })
})

describe('evidence reading stays offline-testable and read-only', () => {
  it('the query module imports nothing', () => {
    assert.doesNotMatch(source('../src/repositories/studentEvidence.query.js'), /^\s*import\b/m)
  })

  it('the repository and service only read', () => {
    for (const file of ['../src/repositories/studentEvidence.repository.js', '../src/services/studentEvidence.service.js']) {
      assert.doesNotMatch(
        source(file),
        /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw|\$transaction/,
        file,
      )
    }
  })
})
