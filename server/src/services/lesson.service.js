import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as lessonRepository from '../repositories/lesson.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'
import { getOwnedConcept, getVisibleConcept } from './concept.service.js'
import { lifecycleChanges, NEW_CONTENT } from './contentLifecycle.service.js'
import { resolveSourceReference } from './contentSource.service.js'
import { assertCourseOwner, canView, visibleChildrenFilter } from './courseAccess.service.js'
import { assertNoDependents } from './deletionGuard.service.js'

const NOT_FOUND = 'Lesson not found'

const LESSON_CONFLICTS = {
  lessons_concept_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another lesson for this concept already uses this sequence order',
  },
}

const toLessonResponse = ({ concept, ...lesson }) => lesson

async function findLesson(lessonId) {
  const lesson = await lessonRepository.findLessonById(lessonId)
  if (!lesson) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return lesson
}

// Unpublished lessons, or lessons under unpublished structure, are hidden from everyone but the owner.
export async function getVisibleLesson(user, lessonId) {
  const lesson = await findLesson(lessonId)
  const { concept } = lesson
  if (!canView(user, concept.topic.module.course, concept.topic.module, concept.topic, concept, lesson)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return lesson
}

export async function getOwnedLesson(user, lessonId) {
  const lesson = await findLesson(lessonId)
  assertCourseOwner(user, lesson.concept.topic.module.course)
  return lesson
}

export async function createLesson(user, conceptId, input) {
  await getOwnedConcept(user, conceptId)
  const { sourceId, status, ...fields } = input
  const source = await resolveSourceReference(sourceId)
  const sequenceOrder = fields.sequenceOrder ?? (await lessonRepository.findMaxSequenceOrder(conceptId)) + 1

  try {
    return await lessonRepository.createLesson({
      ...fields,
      conceptId,
      sequenceOrder,
      sourceId: source?.id ?? null,
      createdByUserId: user.id,
      ...lifecycleChanges(user, status, NEW_CONTENT, source?.sourceType),
    })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: LESSON_CONFLICTS })
  }
}

export async function listLessons(user, conceptId) {
  const concept = await getVisibleConcept(user, conceptId)
  return lessonRepository.findLessonsByConcept(conceptId, visibleChildrenFilter(user, concept.topic.module.course))
}

export async function getLesson(user, lessonId) {
  return toLessonResponse(await getVisibleLesson(user, lessonId))
}

export async function updateLesson(user, lessonId, input) {
  const lesson = await getOwnedLesson(user, lessonId)
  const { sourceId, status, ...fields } = input
  const source = await resolveSourceReference(sourceId)
  const sourceType = source === undefined ? lesson.source?.sourceType : source?.sourceType

  try {
    return await lessonRepository.updateLesson(lessonId, {
      ...fields,
      ...(source !== undefined && { sourceId: source?.id ?? null }),
      ...lifecycleChanges(user, status, lesson, sourceType),
    })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: LESSON_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteLesson(user, lessonId) {
  await getOwnedLesson(user, lessonId)
  assertNoDependents('lesson', await dependencyRepository.countLessonDependents(lessonId))

  try {
    return await lessonRepository.deleteLessonTree(lessonId)
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
