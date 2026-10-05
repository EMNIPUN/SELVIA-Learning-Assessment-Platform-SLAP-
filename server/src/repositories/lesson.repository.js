import prisma, { DELETE_TRANSACTION_OPTIONS } from '../database/postgres/prisma.js'
import { CONCEPT_ACCESS_SELECT } from './concept.repository.js'
import { SOURCE_SUMMARY_SELECT } from './contentSource.repository.js'

const LESSON_SELECT = {
  id: true,
  conceptId: true,
  title: true,
  summary: true,
  body: true,
  estimatedDurationMinutes: true,
  sequenceOrder: true,
  status: true,
  sourceReference: true,
  reviewedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  source: { select: SOURCE_SUMMARY_SELECT },
}

// Exported so material and example repositories can select the same ancestor chain.
export const LESSON_ACCESS_SELECT = {
  id: true,
  status: true,
  concept: { select: CONCEPT_ACCESS_SELECT },
}

export function findLessonById(id) {
  return prisma.lesson.findUnique({
    where: { id },
    select: { ...LESSON_SELECT, concept: { select: CONCEPT_ACCESS_SELECT } },
  })
}

export function findLessonsByConcept(conceptId, filter = {}) {
  return prisma.lesson.findMany({
    where: { conceptId, ...filter },
    select: LESSON_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(conceptId) {
  const { _max } = await prisma.lesson.aggregate({ where: { conceptId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createLesson(data) {
  return prisma.lesson.create({ data, select: LESSON_SELECT })
}

export function updateLesson(id, data) {
  return prisma.lesson.update({ where: { id }, data, select: LESSON_SELECT })
}

// Deletes the lesson with its learning materials and examples in one transaction.
export async function deleteLessonTree(lessonId) {
  const [materials, examples] = await prisma.$transaction([
    prisma.learningMaterial.deleteMany({ where: { lessonId } }),
    prisma.example.deleteMany({ where: { lessonId } }),
    prisma.lesson.delete({ where: { id: lessonId }, select: { id: true } }),
  ], DELETE_TRANSACTION_OPTIONS)
  return { materials: materials.count, examples: examples.count }
}
