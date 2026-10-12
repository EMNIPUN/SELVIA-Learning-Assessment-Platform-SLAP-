import prisma from '../database/postgres/prisma.js'
import { SOURCE_SUMMARY_SELECT } from './contentSource.repository.js'
import { LESSON_ACCESS_SELECT } from './lesson.repository.js'

const MATERIAL_SELECT = {
  id: true,
  lessonId: true,
  title: true,
  description: true,
  materialType: true,
  externalUrl: true,
  fileStorageKey: true,
  mimeType: true,
  fileSizeBytes: true,
  sequenceOrder: true,
  status: true,
  sourceReference: true,
  reviewedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  source: { select: SOURCE_SUMMARY_SELECT },
}

export function findMaterialById(id) {
  return prisma.learningMaterial.findUnique({
    where: { id },
    select: { ...MATERIAL_SELECT, lesson: { select: LESSON_ACCESS_SELECT } },
  })
}

export function findMaterialsByLesson(lessonId, filter = {}) {
  return prisma.learningMaterial.findMany({
    where: { lessonId, ...filter },
    select: MATERIAL_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(lessonId) {
  const { _max } = await prisma.learningMaterial.aggregate({ where: { lessonId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createMaterial(data) {
  return prisma.learningMaterial.create({ data, select: MATERIAL_SELECT })
}

export function updateMaterial(id, data) {
  return prisma.learningMaterial.update({ where: { id }, data, select: MATERIAL_SELECT })
}

export function deleteMaterial(id) {
  return prisma.learningMaterial.delete({ where: { id }, select: { id: true } })
}
