import { ActivityTargetType, ActivityType, EvidenceSourceType, EvidenceStatus } from '@prisma/client'
import prisma from '../database/postgres/prisma.js'

// An exercise attempt is not a table of its own (docs/database-design.md, assumption 6). It is an
// EXERCISE_SUBMITTED learning activity, holding the response and result in its metadata, plus the
// EXERCISE_SUBMISSION evidence derived from it. Both tables are append-only.

// Prisma's 5-second default is too short for a multi-statement transaction against the hosted database.
const ATTEMPT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 }

const ATTEMPT_SELECT = {
  id: true,
  targetId: true,
  metadata: true,
  occurredAt: true,
}

const submissionsOf = (studentId, exerciseId) => ({
  studentId,
  activityType: ActivityType.EXERCISE_SUBMITTED,
  targetType: ActivityTargetType.EXERCISE,
  targetId: exerciseId,
})

// `response` holds the submitted answer; `evidenceContext` is the exercise snapshot kept with the evidence.
export function createAttempt({ studentId, exerciseId, courseId, conceptId, submittedAt, response, isCorrect, score, maxScore, evidenceContext }) {
  return prisma.$transaction(async (tx) => {
    // Serialises one student's submissions to one exercise, so attempt numbers stay consecutive.
    await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`exercise-attempt:${studentId}:${exerciseId}`}, 0))`
    const attemptNumber = (await tx.learningActivity.count({ where: submissionsOf(studentId, exerciseId) })) + 1

    const activity = await tx.learningActivity.create({
      data: {
        ...submissionsOf(studentId, exerciseId),
        courseId,
        conceptId,
        occurredAt: submittedAt,
        metadata: { attempt_number: attemptNumber, ...response, is_correct: isCorrect, score, max_score: maxScore },
      },
      select: ATTEMPT_SELECT,
    })

    await tx.studentEvidence.create({
      data: {
        studentId,
        courseId,
        conceptId,
        sourceType: EvidenceSourceType.EXERCISE_SUBMISSION,
        sourceId: activity.id,
        score,
        maxScore,
        attemptNumber,
        status: EvidenceStatus.COMPLETED,
        observedAt: submittedAt,
        metadata: { ...evidenceContext, is_correct: isCorrect },
      },
      select: { id: true },
    })

    return activity
  }, ATTEMPT_TRANSACTION_OPTIONS)
}

export function findAttempts(studentId, exerciseId, { limit }) {
  return prisma.learningActivity.findMany({
    where: submissionsOf(studentId, exerciseId),
    select: ATTEMPT_SELECT,
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
}
