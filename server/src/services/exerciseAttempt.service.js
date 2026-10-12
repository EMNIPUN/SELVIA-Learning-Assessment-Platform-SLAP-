import * as attemptRepository from '../repositories/exerciseAttempt.repository.js'
import { findStudentByUserId } from '../repositories/student.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'
import { getVisibleExercise } from './exercise.service.js'
import { evaluateAnswer } from './exerciseEvaluation.service.js'

// Evaluates practice answers and records what was observed: the answer, whether it was correct, the score
// and the attempt number. Interpreting attempts (mastery, gaps, recommendations) is the Adaptive AI Tutor's job.

const MAX_LISTED_ATTEMPTS = 50

async function getStudentProfile(user) {
  const student = await findStudentByUserId(user.id)
  if (!student) {
    throw ApiError.forbidden('A student profile is required to answer exercises')
  }
  return student
}

// The feedback is the explanation from the exercise definition, sent only with an evaluated attempt.
function toAttemptView({ id, targetId, metadata, occurredAt }, exercise) {
  return {
    id,
    exerciseId: targetId,
    attemptNumber: metadata.attempt_number,
    response: { selectedOptionId: metadata.selected_option_id, answerText: metadata.answer_text },
    isCorrect: metadata.is_correct,
    score: metadata.score,
    maxScore: metadata.max_score,
    feedback: exercise.solutionExplanation ?? null,
    submittedAt: occurredAt,
  }
}

export async function submitAttempt(user, exerciseId, submission) {
  const student = await getStudentProfile(user)
  const exercise = await getVisibleExercise(user, exerciseId)
  const { response, isCorrect } = evaluateAnswer(exercise, submission)
  const maxScore = exercise.maxScore === null ? null : Number(exercise.maxScore)
  const score = maxScore === null ? null : isCorrect ? maxScore : 0
  const { concept } = exercise.lesson

  try {
    const attempt = await attemptRepository.createAttempt({
      studentId: student.id,
      exerciseId: exercise.id,
      courseId: concept.topic.module.course.id,
      conceptId: concept.id,
      submittedAt: new Date(),
      response,
      isCorrect,
      score,
      maxScore,
      evidenceContext: {
        exercise_id: exercise.id,
        lesson_id: exercise.lessonId,
        exercise_type: exercise.exerciseType,
        difficulty: exercise.difficulty,
        bloom_level: exercise.bloomLevel,
      },
    })
    return toAttemptView(attempt, exercise)
  } catch (err) {
    throw translatePrismaError(err)
  }
}

// Newest first. Only the authenticated student's own attempts exist in this query.
export async function listMyAttempts(user, exerciseId) {
  const student = await getStudentProfile(user)
  const exercise = await getVisibleExercise(user, exerciseId)
  const attempts = await attemptRepository.findAttempts(student.id, exercise.id, { limit: MAX_LISTED_ATTEMPTS })
  return attempts.map((attempt) => toAttemptView(attempt, exercise))
}
