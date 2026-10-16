// npm run test:unit. Reading a student's learning activities: the query, input validation and selected fields.
// Imports only modules that load no configuration and no database client, so nothing here connects to anything.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { parseOrThrow } from '../src/middleware/validate.js'
import {
  ACTIVITY_SELECT,
  STUDENT_ACTIVITIES_ORDER,
  studentActivitiesQuery,
} from '../src/repositories/learningActivity.query.js'
import {
  listMyActivitiesQuerySchema,
  studentActivitiesFiltersSchema,
} from '../src/schemas/learningActivity.schemas.js'
import { ApiError } from '../src/utils/ApiError.js'

const STUDENT_ID = '7a0c2b4e-1f3d-4c5a-9b6e-0d1f2a3b4c5d'
const OTHER_STUDENT_ID = '8b1d3c5f-2e4e-4d6b-0c7f-1e2f3a4b5c6e'
const COURSE_ID = '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9'
const FROM = new Date('2026-10-01T00:00:00.000Z')
const TO = new Date('2026-10-07T23:59:59.000Z')

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const refused = (schema, input, field) =>
  assert.throws(
    () => parseOrThrow(schema, input),
    (err) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.statusCode, 400)
      assert.ok(err.details.some((detail) => detail.field === field), JSON.stringify(err.details))
      return true
    },
  )

describe('studentActivitiesQuery', () => {
  it("reads only the student's activities when no filter is given", () => {
    const { where, take } = studentActivitiesQuery({ studentId: STUDENT_ID, limit: 50 })
    assert.deepEqual(where, { studentId: STUDENT_ID })
    assert.equal(take, 50)
  })

  it('adds each optional filter on its own', () => {
    assert.deepEqual(studentActivitiesQuery({ studentId: STUDENT_ID, courseId: COURSE_ID, limit: 10 }).where, {
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
    })
    assert.deepEqual(
      studentActivitiesQuery({ studentId: STUDENT_ID, activityType: 'MATERIAL_VIEWED', limit: 10 }).where,
      { studentId: STUDENT_ID, activityType: 'MATERIAL_VIEWED' },
    )
    assert.deepEqual(
      studentActivitiesQuery({ studentId: STUDENT_ID, targetType: 'LEARNING_MATERIAL', limit: 10 }).where,
      { studentId: STUDENT_ID, targetType: 'LEARNING_MATERIAL' },
    )
    assert.deepEqual(studentActivitiesQuery({ studentId: STUDENT_ID, occurredFrom: FROM, limit: 10 }).where, {
      studentId: STUDENT_ID,
      occurredAt: { gte: FROM },
    })
    assert.deepEqual(studentActivitiesQuery({ studentId: STUDENT_ID, occurredTo: TO, limit: 10 }).where, {
      studentId: STUDENT_ID,
      occurredAt: { lte: TO },
    })
  })

  it('combines filters and inclusive date bounds', () => {
    assert.deepEqual(
      studentActivitiesQuery({
        studentId: STUDENT_ID,
        courseId: COURSE_ID,
        activityType: 'LESSON_VIEWED',
        targetType: 'LESSON',
        occurredFrom: FROM,
        occurredTo: TO,
        limit: 25,
      }).where,
      {
        studentId: STUDENT_ID,
        courseId: COURSE_ID,
        activityType: 'LESSON_VIEWED',
        targetType: 'LESSON',
        occurredAt: { gte: FROM, lte: TO },
      },
    )
  })

  it('orders newest first, with the id breaking ties', () => {
    assert.deepEqual(studentActivitiesQuery({ studentId: STUDENT_ID, limit: 50 }).orderBy, [
      { occurredAt: 'desc' },
      { id: 'desc' },
    ])
    assert.deepEqual(STUDENT_ACTIVITIES_ORDER, [{ occurredAt: 'desc' }, { id: 'desc' }])
  })

  it('selects the activity fields and nothing about the student', () => {
    const { select } = studentActivitiesQuery({ studentId: STUDENT_ID, limit: 50 })
    assert.deepEqual(select, ACTIVITY_SELECT)
    assert.deepEqual(Object.keys(select).sort(), [
      'activityType',
      'conceptId',
      'courseId',
      'createdAt',
      'durationSeconds',
      'endedAt',
      'id',
      'metadata',
      'occurredAt',
      'startedAt',
      'targetId',
      'targetType',
    ])
    assert.equal(Object.hasOwn(select, 'studentId'), false)
    assert.ok(Object.values(select).every((value) => value === true), 'no relation is selected')
  })

  it('never puts another student id into the where clause from filters alone', () => {
    const { where } = studentActivitiesQuery({ studentId: STUDENT_ID, courseId: COURSE_ID, limit: 5 })
    assert.equal(where.studentId, STUDENT_ID)
    assert.notEqual(where.studentId, OTHER_STUDENT_ID)
  })
})

describe('listMyActivitiesQuerySchema', () => {
  it('defaults the limit to 50 and accepts each optional filter', () => {
    assert.deepEqual(parseOrThrow(listMyActivitiesQuerySchema, {}), { limit: 50 })
    const parsed = parseOrThrow(listMyActivitiesQuerySchema, {
      courseId: COURSE_ID,
      activityType: 'EXAMPLE_VIEWED',
      targetType: 'EXAMPLE',
      occurredFrom: '2026-10-01T00:00:00.000Z',
      occurredTo: '2026-10-07T23:59:59.000Z',
      limit: '25',
    })
    assert.equal(parsed.courseId, COURSE_ID)
    assert.equal(parsed.activityType, 'EXAMPLE_VIEWED')
    assert.equal(parsed.targetType, 'EXAMPLE')
    assert.equal(parsed.limit, 25)
    assert.equal(parsed.occurredFrom.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.equal(parsed.occurredTo.toISOString(), '2026-10-07T23:59:59.000Z')
  })

  it('accepts the maximum limit and refuses limits outside 1–200', () => {
    assert.equal(parseOrThrow(listMyActivitiesQuerySchema, { limit: '200' }).limit, 200)
    refused(listMyActivitiesQuerySchema, { limit: '0' }, 'limit')
    refused(listMyActivitiesQuerySchema, { limit: '201' }, 'limit')
  })

  it('refuses studentId and any other unknown field', () => {
    refused(listMyActivitiesQuerySchema, { studentId: STUDENT_ID }, '')
    refused(listMyActivitiesQuerySchema, { includeMetadata: true }, '')
  })

  it('refuses invalid or null optional filters', () => {
    refused(listMyActivitiesQuerySchema, { courseId: 'not-a-uuid' }, 'courseId')
    refused(listMyActivitiesQuerySchema, { courseId: null }, 'courseId')
    refused(listMyActivitiesQuerySchema, { activityType: 'NOT_A_TYPE' }, 'activityType')
    refused(listMyActivitiesQuerySchema, { activityType: null }, 'activityType')
    refused(listMyActivitiesQuerySchema, { targetType: 'NOT_A_TARGET' }, 'targetType')
    refused(listMyActivitiesQuerySchema, { targetType: null }, 'targetType')
    refused(listMyActivitiesQuerySchema, { occurredFrom: 'yesterday' }, 'occurredFrom')
    refused(listMyActivitiesQuerySchema, { occurredFrom: null }, 'occurredFrom')
  })

  it('refuses a date range where occurredTo is before occurredFrom', () => {
    refused(
      listMyActivitiesQuerySchema,
      { occurredFrom: '2026-10-07T00:00:00.000Z', occurredTo: '2026-10-01T00:00:00.000Z' },
      'occurredTo',
    )
  })
})

describe('studentActivitiesFiltersSchema', () => {
  it('requires a valid student id and defaults the limit', () => {
    assert.deepEqual(parseOrThrow(studentActivitiesFiltersSchema, { studentId: STUDENT_ID }), {
      studentId: STUDENT_ID,
      limit: 50,
    })
    refused(studentActivitiesFiltersSchema, {}, 'studentId')
    refused(studentActivitiesFiltersSchema, { studentId: 'not-a-uuid' }, 'studentId')
  })

  it('accepts combined filters with Date bounds', () => {
    const parsed = parseOrThrow(studentActivitiesFiltersSchema, {
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
      activityType: 'ASSESSMENT_SUBMITTED',
      targetType: 'ASSESSMENT',
      occurredFrom: FROM,
      occurredTo: TO,
      limit: 10,
    })
    assert.deepEqual(parsed, {
      studentId: STUDENT_ID,
      courseId: COURSE_ID,
      activityType: 'ASSESSMENT_SUBMITTED',
      targetType: 'ASSESSMENT',
      occurredFrom: FROM,
      occurredTo: TO,
      limit: 10,
    })
  })

  it('refuses null optionals, invalid enums, unknown keys and inverted date ranges', () => {
    refused(studentActivitiesFiltersSchema, { studentId: STUDENT_ID, courseId: null }, 'courseId')
    refused(studentActivitiesFiltersSchema, { studentId: STUDENT_ID, activityType: 'WRONG' }, 'activityType')
    refused(studentActivitiesFiltersSchema, { studentId: STUDENT_ID, targetType: 'WRONG' }, 'targetType')
    refused(studentActivitiesFiltersSchema, { studentId: STUDENT_ID, extra: true }, '')
    refused(
      studentActivitiesFiltersSchema,
      { studentId: STUDENT_ID, occurredFrom: TO, occurredTo: FROM },
      'occurredTo',
    )
  })
})

describe('activity reading stays offline-testable and read-only', () => {
  it('the query module imports nothing', () => {
    assert.doesNotMatch(source('../src/repositories/learningActivity.query.js'), /^\s*import\b/m)
  })

  it('listMyActivities always injects studentId after the query filters', () => {
    const service = source('../src/services/learningActivity.service.js')
    assert.match(service, /export async function getStudentActivities/)
    assert.match(service, /getStudentActivities\(\{ \.\.\.query, studentId: student\.id \}\)/)
  })

  it('the filtered read path in the repository only reads', () => {
    const repository = source('../src/repositories/learningActivity.repository.js')
    assert.match(repository, /findMany\(studentActivitiesQuery/)
    assert.doesNotMatch(
      repository.slice(repository.indexOf('findActivitiesByStudent')),
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
    )
  })
})
