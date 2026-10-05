import prisma from '../database/postgres/prisma.js'
import { TOPIC_ACCESS_SELECT } from './topic.repository.js'

const CONCEPT_SELECT = {
  id: true,
  topicId: true,
  code: true,
  name: true,
  description: true,
  sequenceOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}

// Exported so the lesson repository can select the same ancestor chain.
export const CONCEPT_ACCESS_SELECT = {
  id: true,
  status: true,
  topic: { select: TOPIC_ACCESS_SELECT },
}

export function findConceptById(id) {
  return prisma.concept.findUnique({
    where: { id },
    select: { ...CONCEPT_SELECT, topic: { select: TOPIC_ACCESS_SELECT } },
  })
}

export function findConceptsByTopic(topicId, filter = {}) {
  return prisma.concept.findMany({
    where: { topicId, ...filter },
    select: CONCEPT_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(topicId) {
  const { _max } = await prisma.concept.aggregate({ where: { topicId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createConcept(data) {
  return prisma.concept.create({ data, select: CONCEPT_SELECT })
}

export function updateConcept(id, data) {
  return prisma.concept.update({ where: { id }, data, select: CONCEPT_SELECT })
}

export function deleteConcept(id) {
  return prisma.concept.delete({ where: { id }, select: { id: true } })
}
