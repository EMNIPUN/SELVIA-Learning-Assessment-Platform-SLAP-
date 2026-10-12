import prisma from '../database/postgres/prisma.js'

// studentId is left out: activities are only ever returned to the student who performed them.
const ACTIVITY_SELECT = {
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
}

// learning_activities is append-only (enforced by a database trigger), so there is no update or delete.
export function createActivity(data) {
  return prisma.learningActivity.create({ data, select: ACTIVITY_SELECT })
}

export function findActivitiesByStudent(studentId, { limit }) {
  return prisma.learningActivity.findMany({
    where: { studentId },
    select: ACTIVITY_SELECT,
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  })
}
