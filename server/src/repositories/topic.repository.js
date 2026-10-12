import prisma, { DELETE_TRANSACTION_OPTIONS } from '../database/postgres/prisma.js'
import { MODULE_ACCESS_SELECT } from './module.repository.js'

const TOPIC_SELECT = {
  id: true,
  moduleId: true,
  title: true,
  description: true,
  sequenceOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}

// Exported so the concept repository can select the same ancestor chain.
export const TOPIC_ACCESS_SELECT = {
  id: true,
  status: true,
  module: { select: MODULE_ACCESS_SELECT },
}

export function findTopicById(id) {
  return prisma.topic.findUnique({
    where: { id },
    select: { ...TOPIC_SELECT, module: { select: MODULE_ACCESS_SELECT } },
  })
}

export function findTopicsByModule(moduleId, filter = {}) {
  return prisma.topic.findMany({
    where: { moduleId, ...filter },
    select: TOPIC_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(moduleId) {
  const { _max } = await prisma.topic.aggregate({ where: { moduleId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createTopic(data) {
  return prisma.topic.create({ data, select: TOPIC_SELECT })
}

export function updateTopic(id, data) {
  return prisma.topic.update({ where: { id }, data, select: TOPIC_SELECT })
}

// Deletes the topic with its concepts in one transaction.
export async function deleteTopicTree(topicId) {
  const [concepts] = await prisma.$transaction([
    prisma.concept.deleteMany({ where: { topicId } }),
    prisma.topic.delete({ where: { id: topicId }, select: { id: true } }),
  ], DELETE_TRANSACTION_OPTIONS)
  return { concepts: concepts.count }
}
