import { ExerciseType } from '@prisma/client'
import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as exerciseRepository from '../repositories/exercise.repository.js'
import { parseAnswerConfig } from '../schemas/exercise.schemas.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'
import { lifecycleChanges, NEW_CONTENT } from './contentLifecycle.service.js'
import { resolveSourceReference } from './contentSource.service.js'
import { assertCourseOwner, canView, isCourseOwner, visibleChildrenFilter } from './courseAccess.service.js'
import { assertNoDependents } from './deletionGuard.service.js'
import { getOwnedLesson, getVisibleLesson } from './lesson.service.js'

const NOT_FOUND = 'Exercise not found'

// An evaluated exercise is either right or wrong, so without a lecturer-defined score it is worth one point.
const DEFAULT_MAX_SCORE = 1

const EXERCISE_CONFLICTS = {
  exercises_lesson_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another exercise in this lesson already uses this sequence order',
  },
}

// maxScore is a Decimal column; JSON would serialise it as a string.
function toOwnerView({ lesson, maxScore, ...exercise }) {
  return { ...exercise, maxScore: maxScore === null ? null : Number(maxScore) }
}

// Students see the question but nothing that gives the answer away: the correct option, accepted answers
// and explanation stay on the server until an attempt has been evaluated.
function toStudentView(exercise) {
  const { answerConfig, solutionExplanation, ...view } = toOwnerView(exercise)
  if (exercise.exerciseType === ExerciseType.MULTIPLE_CHOICE) {
    view.options = answerConfig.options.map(({ id, text }) => ({ id, text }))
  }
  return view
}

const viewFor = (user, course) => (isCourseOwner(user, course) ? toOwnerView : toStudentView)

function assertValidAnswerConfig(exerciseType, answerConfig) {
  const result = parseAnswerConfig(exerciseType, answerConfig)
  if (!result.success) {
    throw ApiError.badRequest(
      'Validation failed',
      result.error.issues.map((issue) => ({ field: ['answerConfig', ...issue.path].join('.'), message: issue.message })),
    )
  }
  return result.data
}

async function findExercise(exerciseId) {
  const exercise = await exerciseRepository.findExerciseById(exerciseId)
  if (!exercise) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return exercise
}

async function getOwnedExercise(user, exerciseId) {
  const exercise = await findExercise(exerciseId)
  assertCourseOwner(user, exercise.lesson.concept.topic.module.course)
  return exercise
}

export async function createExercise(user, lessonId, input) {
  await getOwnedLesson(user, lessonId)
  const { sourceId, status, ...fields } = input
  const answerConfig = assertValidAnswerConfig(fields.exerciseType, fields.answerConfig)
  const source = await resolveSourceReference(sourceId)
  const sequenceOrder = fields.sequenceOrder ?? (await exerciseRepository.findMaxSequenceOrder(lessonId)) + 1

  try {
    const exercise = await exerciseRepository.createExercise({
      ...fields,
      answerConfig,
      maxScore: fields.maxScore ?? DEFAULT_MAX_SCORE,
      lessonId,
      sequenceOrder,
      sourceId: source?.id ?? null,
      createdByUserId: user.id,
      ...lifecycleChanges(user, status, NEW_CONTENT, source?.sourceType),
    })
    return toOwnerView(exercise)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: EXERCISE_CONFLICTS })
  }
}

export async function listExercises(user, lessonId) {
  const lesson = await getVisibleLesson(user, lessonId)
  const course = lesson.concept.topic.module.course
  const exercises = await exerciseRepository.findExercisesByLesson(lessonId, visibleChildrenFilter(user, course))
  return exercises.map(viewFor(user, course))
}

// Returns the exercise with its lesson ancestry and answer configuration; hidden exercises are reported as
// missing. For use inside the server only: responses go through the student or owner view.
export async function getVisibleExercise(user, exerciseId) {
  const exercise = await findExercise(exerciseId)
  const { lesson } = exercise
  const { concept } = lesson
  if (!canView(user, concept.topic.module.course, concept.topic.module, concept.topic, concept, lesson, exercise)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return exercise
}

export async function getExercise(user, exerciseId) {
  const exercise = await getVisibleExercise(user, exerciseId)
  return viewFor(user, exercise.lesson.concept.topic.module.course)(exercise)
}

export async function updateExercise(user, exerciseId, input) {
  const exercise = await getOwnedExercise(user, exerciseId)
  const { sourceId, status, ...fields } = input
  // A new type needs an answer configuration of that type, so both are checked together.
  if (fields.exerciseType !== undefined || fields.answerConfig !== undefined) {
    fields.answerConfig = assertValidAnswerConfig(
      fields.exerciseType ?? exercise.exerciseType,
      fields.answerConfig ?? exercise.answerConfig,
    )
  }
  const source = await resolveSourceReference(sourceId)
  const sourceType = source === undefined ? exercise.source?.sourceType : source?.sourceType

  try {
    const updated = await exerciseRepository.updateExercise(exerciseId, {
      ...fields,
      ...(source !== undefined && { sourceId: source?.id ?? null }),
      ...lifecycleChanges(user, status, exercise, sourceType),
    })
    return toOwnerView(updated)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: EXERCISE_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteExercise(user, exerciseId) {
  await getOwnedExercise(user, exerciseId)
  assertNoDependents('exercise', await dependencyRepository.countExerciseDependents(exerciseId))

  try {
    await exerciseRepository.deleteExercise(exerciseId)
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
