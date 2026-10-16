// The query that reads a student's learning activities. Pure: it imports no database client or configuration,
// so it can be tested without loading server/.env.
//
// Activities are returned as recorded behaviour. Nothing here turns them into mastery, competency, gaps or
// recommendations; that is the Adaptive AI Tutor's job. studentId is required and is never inferred here.

// studentId is left out of the select: activities are only returned to the student who performed them (or to a
// caller that already resolved that student server-side).
export const ACTIVITY_SELECT = Object.freeze({
  id: true,
  activityType: true,
  targetType: true,
  targetId: true,
  courseId: true,
  conceptId: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  metadata: true,
  occurredAt: true,
  createdAt: true,
})

// Newest first. Activities can share an occurrence time, so the id breaks ties and the order is the same on every read.
export const STUDENT_ACTIVITIES_ORDER = Object.freeze([{ occurredAt: 'desc' }, { id: 'desc' }])

// `filters` must already be validated (studentActivitiesFiltersSchema). A filter left out does not restrict.
export function studentActivitiesQuery({
  studentId,
  courseId,
  activityType,
  targetType,
  occurredFrom,
  occurredTo,
  limit,
}) {
  return {
    where: {
      studentId,
      ...(courseId !== undefined && { courseId }),
      ...(activityType !== undefined && { activityType }),
      ...(targetType !== undefined && { targetType }),
      ...((occurredFrom !== undefined || occurredTo !== undefined) && {
        occurredAt: {
          ...(occurredFrom !== undefined && { gte: occurredFrom }),
          ...(occurredTo !== undefined && { lte: occurredTo }),
        },
      }),
    },
    select: ACTIVITY_SELECT,
    orderBy: STUDENT_ACTIVITIES_ORDER,
    take: limit,
  }
}
