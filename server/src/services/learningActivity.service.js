import { ActivityTargetType } from '@prisma/client'
import { REPORTABLE_ACTIVITY_TARGETS } from '../constants/learningActivity.js'
import { parseOrThrow } from '../middleware/validate.js'
import * as activityRepository from '../repositories/learningActivity.repository.js'
import { findStudentByUserId } from '../repositories/student.repository.js'
import { studentActivitiesFiltersSchema } from '../schemas/learningActivity.schemas.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'
import { getVisibleExample } from './example.service.js'
import { getVisibleLesson } from './lesson.service.js'
import { getVisibleMaterial } from './learningMaterial.service.js'

// Records and reads observable behaviour only. Interpreting it (mastery, gaps, recommendations) is the
// Adaptive AI Tutor's job, never this service's.

// Each resolver returns the lesson the target belongs to, with its concept → topic → module → course
// chain. Targets the student cannot see are reported as not found, exactly as the content endpoints do.
const TARGET_LESSON_RESOLVERS = {
  [ActivityTargetType.LESSON]: (user, id) => getVisibleLesson(user, id),
  [ActivityTargetType.LEARNING_MATERIAL]: async (user, id) => (await getVisibleMaterial(user, id)).lesson,
  [ActivityTargetType.EXAMPLE]: async (user, id) => (await getVisibleExample(user, id)).lesson,
}

async function getStudentProfile(user) {
  const student = await findStudentByUserId(user.id)
  if (!student) {
    throw ApiError.forbidden('A student profile is required to access learning activity')
  }
  return student
}

export async function recordActivity(user, { activityType, targetId, ...details }) {
  const student = await getStudentProfile(user)
  const targetType = REPORTABLE_ACTIVITY_TARGETS[activityType]
  const { concept } = await TARGET_LESSON_RESOLVERS[targetType](user, targetId)

  try {
    return await activityRepository.createActivity({
      ...details,
      studentId: student.id,
      activityType,
      targetType,
      targetId,
      courseId: concept.topic.module.course.id,
      conceptId: concept.id,
      occurredAt: new Date(),
    })
  } catch (err) {
    throw translatePrismaError(err)
  }
}

// { studentId, courseId?, activityType?, targetType?, occurredFrom?, occurredTo?, limit? }. The caller must
// already have authorized studentId. Invalid input is a 400. Newest first.
export async function getStudentActivities(filters) {
  return activityRepository.findActivitiesByStudent(parseOrThrow(studentActivitiesFiltersSchema, filters))
}

// Always scopes the query to the authenticated student's profile id. Query params never supply or override it.
export async function listMyActivities(user, query) {
  const student = await getStudentProfile(user)
  return getStudentActivities({ ...query, studentId: student.id })
}
