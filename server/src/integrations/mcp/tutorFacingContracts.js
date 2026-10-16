import { z } from 'zod'
import { ACTIVITY_SELECT } from '../../repositories/learningActivity.query.js'
import { EVIDENCE_METADATA_KEYS } from '../../repositories/studentEvidence.query.js'

export { EVIDENCE_METADATA_KEYS }

// Shared tutor-facing contract validators. Pure enough for unit tests: no env, no database drivers.
// Contracts A & B match existing service DTOs. Contract C is the proposed MCP envelope.

export const CONTRACT_VERSION = '1.0.0'

export const EVIDENCE_SOURCE_TYPES = Object.freeze([
  'ASSESSMENT_ANSWER',
  'EXERCISE_SUBMISSION',
  'LEARNING_ACTIVITY',
])

export const EVIDENCE_STATUSES = Object.freeze(['COMPLETED', 'SKIPPED', 'ABANDONED', 'TIMED_OUT'])

export const ACTIVITY_TYPES = Object.freeze([
  'LESSON_VIEWED',
  'LESSON_COMPLETED',
  'MATERIAL_VIEWED',
  'MATERIAL_DOWNLOADED',
  'EXAMPLE_VIEWED',
  'EXERCISE_STARTED',
  'EXERCISE_HINT_REQUESTED',
  'EXERCISE_SUBMITTED',
  'ASSESSMENT_STARTED',
  'ASSESSMENT_SUBMITTED',
])

export const ACTIVITY_TARGET_TYPES = Object.freeze([
  'LESSON',
  'LEARNING_MATERIAL',
  'EXAMPLE',
  'EXERCISE',
  'ASSESSMENT',
  'QUESTION',
])

export const EVIDENCE_DTO_KEYS = Object.freeze([
  'id',
  'courseId',
  'conceptId',
  'sourceType',
  'sourceId',
  'score',
  'maxScore',
  'percentage',
  'attemptNumber',
  'timeSpentSeconds',
  'hintsUsed',
  'errorsCount',
  'status',
  'metadata',
  'observedAt',
])

export const ACTIVITY_DTO_KEYS = Object.freeze(Object.keys(ACTIVITY_SELECT).sort())

export const FORBIDDEN_TUTOR_FIELDS = Object.freeze([
  'studentId',
  'userId',
  'mastery',
  'competency',
  'knowledgeGap',
  'knowledge_gap',
  'recommendation',
  'intervention',
  'attention',
  'engagement',
  'motivation',
])

export const MCP_ERROR_CODES = Object.freeze([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
])

const uuid = z.uuid()
const nullableUuid = uuid.nullable()
const nullableNumber = z.number().nullable()
const nullableInt = z.number().int().nullable()

const evidenceMetadataSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  for (const key of Object.keys(value)) {
    if (!EVIDENCE_METADATA_KEYS.includes(key)) {
      ctx.addIssue({ code: 'custom', message: `Unexpected metadata key: ${key}`, path: [key] })
    }
  }
})

// Contract A — matches toEvidenceView output (observedAt may be a Date or ISO string after JSON).
export const performanceEvidenceRecordSchema = z
  .strictObject({
    id: uuid,
    courseId: nullableUuid,
    conceptId: nullableUuid,
    sourceType: z.enum(EVIDENCE_SOURCE_TYPES),
    sourceId: uuid,
    score: nullableNumber,
    maxScore: nullableNumber,
    percentage: nullableNumber,
    attemptNumber: nullableInt,
    timeSpentSeconds: nullableInt,
    hintsUsed: nullableInt,
    errorsCount: nullableInt,
    status: z.enum(EVIDENCE_STATUSES),
    metadata: evidenceMetadataSchema,
    observedAt: z.union([z.date(), z.iso.datetime({ offset: true })]),
  })
  .superRefine((record, ctx) => {
    for (const key of FORBIDDEN_TUTOR_FIELDS) {
      if (Object.hasOwn(record, key)) {
        ctx.addIssue({ code: 'custom', message: `Forbidden field: ${key}`, path: [key] })
      }
    }
  })

const nullableDateTime = z.union([z.date(), z.iso.datetime({ offset: true })]).nullable()

// Contract B — matches ACTIVITY_SELECT rows returned by findActivitiesByStudent.
export const learningActivityRecordSchema = z
  .strictObject({
    id: uuid,
    activityType: z.enum(ACTIVITY_TYPES),
    targetType: z.enum(ACTIVITY_TARGET_TYPES).nullable(),
    targetId: nullableUuid,
    courseId: nullableUuid,
    conceptId: nullableUuid,
    startedAt: nullableDateTime,
    endedAt: nullableDateTime,
    durationSeconds: nullableInt,
    metadata: z.record(z.string(), z.unknown()),
    occurredAt: z.union([z.date(), z.iso.datetime({ offset: true })]),
    createdAt: z.union([z.date(), z.iso.datetime({ offset: true })]),
  })
  .superRefine((record, ctx) => {
    for (const key of FORBIDDEN_TUTOR_FIELDS) {
      if (Object.hasOwn(record, key)) {
        ctx.addIssue({ code: 'custom', message: `Forbidden field: ${key}`, path: [key] })
      }
    }
  })

// Contract C — proposed MCP envelope (not Express { success, data } today).
export const mcpSuccessEnvelopeSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    records: z.array(z.unknown()),
  }),
})

export const mcpErrorEnvelopeSchema = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    code: z.enum(MCP_ERROR_CODES),
    message: z.string().min(1),
  }),
})

export const mcpEnvelopeSchema = z.union([mcpSuccessEnvelopeSchema, mcpErrorEnvelopeSchema])

export function assertNoSensitiveErrorText(message) {
  const forbidden = [/stack/i, /prisma/i, /ECONN/i, /password/i, /Bearer\s+\S+/i, /postgresql:\/\//i, /neo4j:\/\//i, /\\\\server\\/i]
  return !forbidden.some((pattern) => pattern.test(message))
}
