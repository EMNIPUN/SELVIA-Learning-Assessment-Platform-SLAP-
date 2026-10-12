import prisma from '../database/postgres/prisma.js'
import { SOURCE_SUMMARY_SELECT } from './contentSource.repository.js'
import { LESSON_ACCESS_SELECT } from './lesson.repository.js'

const EXAMPLE_SELECT = {
  id: true,
  lessonId: true,
  title: true,
  exampleType: true,
  problemStatement: true,
  content: true,
  explanation: true,
  codeSnippet: true,
  programmingLanguage: true,
  sequenceOrder: true,
  status: true,
  sourceReference: true,
  reviewedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  source: { select: SOURCE_SUMMARY_SELECT },
}

export function findExampleById(id) {
  return prisma.example.findUnique({
    where: { id },
    select: { ...EXAMPLE_SELECT, lesson: { select: LESSON_ACCESS_SELECT } },
  })
}

export function findExamplesByLesson(lessonId, filter = {}) {
  return prisma.example.findMany({
    where: { lessonId, ...filter },
    select: EXAMPLE_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(lessonId) {
  const { _max } = await prisma.example.aggregate({ where: { lessonId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createExample(data) {
  return prisma.example.create({ data, select: EXAMPLE_SELECT })
}

export function updateExample(id, data) {
  return prisma.example.update({ where: { id }, data, select: EXAMPLE_SELECT })
}

export function deleteExample(id) {
  return prisma.example.delete({ where: { id }, select: { id: true } })
}
