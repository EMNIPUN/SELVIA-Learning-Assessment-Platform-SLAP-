import prisma from '../database/postgres/prisma.js'
import { ACTIVITY_SELECT, studentActivitiesQuery } from './learningActivity.query.js'

// learning_activities is append-only (enforced by a database trigger), so there is no update or delete.

export function createActivity(data) {
  return prisma.learningActivity.create({ data, select: ACTIVITY_SELECT })
}

// `filters` must already be validated (studentActivitiesFiltersSchema). Always scoped to one studentId.
export function findActivitiesByStudent(filters) {
  return prisma.learningActivity.findMany(studentActivitiesQuery(filters))
}
