import { CONTENT_STATUS } from '../constants/contentStatus.js'
import { ROLES } from '../constants/roles.js'
import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as courseRepository from '../repositories/course.repository.js'
import { findLecturerByUserId } from '../repositories/lecturer.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { isForeignKeyViolation, translatePrismaError } from '../utils/prismaErrors.js'
import { assertCourseOwner, canView } from './courseAccess.service.js'
import { assertNoDependents, deletionBlocked } from './deletionGuard.service.js'

const NOT_FOUND = 'Course not found'

const COURSE_CONFLICTS = {
  courses_code_key: { field: 'code', message: 'A course with this code already exists' },
}

function toCourseResponse({ lecturer, ...course }) {
  return {
    ...course,
    lecturer: { id: lecturer.id, firstName: lecturer.user.firstName, lastName: lecturer.user.lastName },
  }
}

// publishedAt records when a course was first published and is kept afterwards.
function publishedAtChange(status, currentPublishedAt) {
  return status === CONTENT_STATUS.PUBLISHED && !currentPublishedAt ? { publishedAt: new Date() } : {}
}

async function findCourse(courseId) {
  const course = await courseRepository.findCourseById(courseId)
  if (!course) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return course
}

// Courses the user may not see are reported as not found, so unpublished courses stay hidden.
export async function getVisibleCourse(user, courseId) {
  const course = await findCourse(courseId)
  if (!canView(user, course)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return course
}

export async function getOwnedCourse(user, courseId) {
  const course = await findCourse(courseId)
  assertCourseOwner(user, course)
  return course
}

export async function createCourse(user, input) {
  const lecturer = await findLecturerByUserId(user.id)
  if (!lecturer) {
    throw ApiError.forbidden('A lecturer profile is required to create courses')
  }

  try {
    const course = await courseRepository.createCourse({
      ...input,
      lecturerId: lecturer.id,
      ...publishedAtChange(input.status, null),
    })
    return toCourseResponse(course)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: COURSE_CONFLICTS })
  }
}

// Everyone sees published courses; lecturers also see their own. `mine` limits a lecturer to their own courses.
export async function listCourses(user, { mine, status }) {
  const isLecturer = user.role === ROLES.LECTURER
  if (mine && !isLecturer) {
    throw ApiError.forbidden('Only lecturers can list their own courses')
  }

  const ownCourses = { lecturer: { userId: user.id } }
  const published = { status: CONTENT_STATUS.PUBLISHED }
  const visible = mine ? ownCourses : isLecturer ? { OR: [published, ownCourses] } : published

  const courses = await courseRepository.findCourses(status ? { AND: [visible, { status }] } : visible)
  return courses.map(toCourseResponse)
}

export async function getCourse(user, courseId) {
  return toCourseResponse(await getVisibleCourse(user, courseId))
}

export async function updateCourse(user, courseId, input) {
  const course = await getOwnedCourse(user, courseId)

  try {
    const updated = await courseRepository.updateCourse(courseId, {
      ...input,
      ...publishedAtChange(input.status, course.publishedAt),
    })
    return toCourseResponse(updated)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: COURSE_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteCourse(user, courseId) {
  await getOwnedCourse(user, courseId)
  assertNoDependents('course', await dependencyRepository.countCourseDependents(courseId))

  try {
    return await courseRepository.deleteCourseTree(courseId)
  } catch (err) {
    // A dependent record was added after the check; RESTRICT foreign keys rolled the deletion back.
    if (isForeignKeyViolation(err)) {
      throw deletionBlocked('course')
    }
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
