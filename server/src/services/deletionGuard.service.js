import { ApiError } from '../utils/ApiError.js'

// Course structure is hard-deleted only while nothing else refers to it. Once lessons, questions,
// assessments, enrollments, activity or evidence exist, it must be archived so that history is kept.

export function deletionBlocked(entityName, details) {
  return ApiError.conflict(
    `This ${entityName} cannot be deleted because other records depend on it. Set its status to ARCHIVED instead.`,
    details,
  )
}

export function assertNoDependents(entityName, counts) {
  const details = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([resource, count]) => ({ resource, count }))

  if (details.length > 0) {
    throw deletionBlocked(entityName, details)
  }
}
