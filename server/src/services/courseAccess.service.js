import { CONTENT_STATUS } from '../constants/contentStatus.js'
import { ApiError } from '../utils/ApiError.js'

// `course` must include `lecturer.userId` (see COURSE_ACCESS_SELECT).
export function isCourseOwner(user, course) {
  return course.lecturer.userId === user.id
}

export function assertCourseOwner(user, course) {
  if (!isCourseOwner(user, course)) {
    throw ApiError.forbidden('Only the lecturer who owns this course can modify it')
  }
}

// The owner sees everything; anyone else only sees an item when it and all of its ancestors are published.
export function canView(user, course, ...items) {
  return isCourseOwner(user, course) || [course, ...items].every((item) => item.status === CONTENT_STATUS.PUBLISHED)
}

// Prisma filter for listing children of a parent the user can already see.
export function visibleChildrenFilter(user, course) {
  return isCourseOwner(user, course) ? {} : { status: CONTENT_STATUS.PUBLISHED }
}
