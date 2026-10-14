// The query that reads a student's current evidence, and the shape each row is returned in. Pure: it imports no
// database client or configuration, so it can be tested without loading server/.env.
//
// Evidence is returned as observed. Nothing here, or in its callers, turns it into mastery, competency, gaps or
// recommendations; that is the Adaptive AI Tutor's job. NULL means "not measured" and stays NULL.

// studentId is the caller's own input, and supersededByEvidenceId is always null for current evidence.
const CURRENT_EVIDENCE_SELECT = {
  id: true,
  courseId: true,
  conceptId: true,
  sourceType: true,
  sourceId: true,
  score: true,
  maxScore: true,
  percentage: true,
  attemptNumber: true,
  timeSpentSeconds: true,
  hintsUsed: true,
  errorsCount: true,
  status: true,
  metadata: true,
  observedAt: true,
}

// Oldest first. Evidence can share an observation time (every unanswered question of a submitted quiz is observed
// at the submission), so the id breaks ties and the order is the same on every read.
const CURRENT_EVIDENCE_ORDER = [{ observedAt: 'asc' }, { id: 'asc' }]

// The context keys the evidence writers record (exerciseAttempt.repository.js createAttempt, and answerEvidence in
// assessmentAttempt.service.js). Only these are returned, so a key added to the metadata later is not exposed until
// it is listed here. None of them is an answer key or a response.
export const EVIDENCE_METADATA_KEYS = Object.freeze([
  'exercise_id',
  'lesson_id',
  'exercise_type',
  'assessment_id',
  'assessment_type',
  'assessment_question_id',
  'attempt_id',
  'question_id',
  'question_version',
  'question_type',
  'difficulty',
  'bloom_level',
  'is_correct',
])

// `filters` must already be validated (currentEvidenceFiltersSchema). A filter left out does not restrict.
export function currentEvidenceQuery({ studentId, courseId, conceptId }) {
  return {
    where: {
      studentId,
      supersededByEvidenceId: null,
      ...(courseId !== undefined && { courseId }),
      ...(conceptId !== undefined && { conceptId }),
    },
    select: CURRENT_EVIDENCE_SELECT,
    orderBy: CURRENT_EVIDENCE_ORDER,
  }
}

// Decimal columns would serialise as strings.
const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

// A key the writer left out stays out: an unanswered question has no is_correct because it was not judged.
function listedMetadata(metadata) {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {}
  }
  return Object.fromEntries(EVIDENCE_METADATA_KEYS.filter((key) => Object.hasOwn(metadata, key)).map((key) => [key, metadata[key]]))
}

export function toEvidenceView(row) {
  return {
    id: row.id,
    courseId: row.courseId,
    conceptId: row.conceptId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    score: toNumber(row.score),
    maxScore: toNumber(row.maxScore),
    percentage: toNumber(row.percentage),
    attemptNumber: row.attemptNumber,
    timeSpentSeconds: row.timeSpentSeconds,
    hintsUsed: row.hintsUsed,
    errorsCount: row.errorsCount,
    status: row.status,
    metadata: listedMetadata(row.metadata),
    observedAt: row.observedAt,
  }
}
