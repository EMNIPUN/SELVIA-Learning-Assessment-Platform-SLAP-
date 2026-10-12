import prisma, { DELETE_TRANSACTION_OPTIONS } from '../database/postgres/prisma.js'
import { COURSE_ACCESS_SELECT } from './course.repository.js'

const MODULE_SELECT = {
  id: true,
  courseId: true,
  title: true,
  description: true,
  sequenceOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}

// Exported so topic and concept repositories can select the same ancestor chain.
export const MODULE_ACCESS_SELECT = {
  id: true,
  status: true,
  course: { select: COURSE_ACCESS_SELECT },
}

export function findModuleById(id) {
  return prisma.module.findUnique({
    where: { id },
    select: { ...MODULE_SELECT, course: { select: COURSE_ACCESS_SELECT } },
  })
}

export function findModulesByCourse(courseId, filter = {}) {
  return prisma.module.findMany({
    where: { courseId, ...filter },
    select: MODULE_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(courseId) {
  const { _max } = await prisma.module.aggregate({ where: { courseId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createModule(data) {
  return prisma.module.create({ data, select: MODULE_SELECT })
}

export function updateModule(id, data) {
  return prisma.module.update({ where: { id }, data, select: MODULE_SELECT })
}

// Deletes the module with its topics and concepts in one transaction.
export async function deleteModuleTree(moduleId) {
  const [concepts, topics] = await prisma.$transaction([
    prisma.concept.deleteMany({ where: { topic: { moduleId } } }),
    prisma.topic.deleteMany({ where: { moduleId } }),
    prisma.module.delete({ where: { id: moduleId }, select: { id: true } }),
  ], DELETE_TRANSACTION_OPTIONS)
  return { topics: topics.count, concepts: concepts.count }
}
