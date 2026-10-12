import prisma, { DELETE_TRANSACTION_OPTIONS } from '../database/postgres/prisma.js'

// What child repositories select from the parent course to check ownership and visibility.
export const COURSE_ACCESS_SELECT = {
  id: true,
  status: true,
  lecturer: { select: { userId: true } },
}

const COURSE_SELECT = {
  id: true,
  code: true,
  title: true,
  description: true,
  credits: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  lecturer: {
    select: { id: true, userId: true, user: { select: { firstName: true, lastName: true } } },
  },
}

export function findCourseById(id) {
  return prisma.course.findUnique({ where: { id }, select: COURSE_SELECT })
}

export function findCourses(where) {
  return prisma.course.findMany({ where, select: COURSE_SELECT, orderBy: { createdAt: 'desc' } })
}

export function createCourse(data) {
  return prisma.course.create({ data, select: COURSE_SELECT })
}

export function updateCourse(id, data) {
  return prisma.course.update({ where: { id }, data, select: COURSE_SELECT })
}

// Deletes the course and its whole module/topic/concept tree in one transaction.
export async function deleteCourseTree(courseId) {
  const [concepts, topics, modules] = await prisma.$transaction([
    prisma.concept.deleteMany({ where: { topic: { module: { courseId } } } }),
    prisma.topic.deleteMany({ where: { module: { courseId } } }),
    prisma.module.deleteMany({ where: { courseId } }),
    prisma.course.delete({ where: { id: courseId }, select: { id: true } }),
  ], DELETE_TRANSACTION_OPTIONS)
  return { modules: modules.count, topics: topics.count, concepts: concepts.count }
}
