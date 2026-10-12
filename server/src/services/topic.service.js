import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as topicRepository from '../repositories/topic.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { isForeignKeyViolation, translatePrismaError } from '../utils/prismaErrors.js'
import { assertCourseOwner, canView, visibleChildrenFilter } from './courseAccess.service.js'
import { assertNoDependents, deletionBlocked } from './deletionGuard.service.js'
import { getOwnedModule, getVisibleModule } from './module.service.js'

const NOT_FOUND = 'Topic not found'

const TOPIC_CONFLICTS = {
  topics_module_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another topic in this module already uses this sequence order',
  },
}

const toTopicResponse = ({ module, ...topic }) => topic

async function findTopic(topicId) {
  const topic = await topicRepository.findTopicById(topicId)
  if (!topic) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return topic
}

export async function getVisibleTopic(user, topicId) {
  const topic = await findTopic(topicId)
  if (!canView(user, topic.module.course, topic.module, topic)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return topic
}

export async function getOwnedTopic(user, topicId) {
  const topic = await findTopic(topicId)
  assertCourseOwner(user, topic.module.course)
  return topic
}

export async function createTopic(user, moduleId, input) {
  await getOwnedModule(user, moduleId)
  const sequenceOrder = input.sequenceOrder ?? (await topicRepository.findMaxSequenceOrder(moduleId)) + 1

  try {
    return await topicRepository.createTopic({ ...input, moduleId, sequenceOrder })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: TOPIC_CONFLICTS })
  }
}

export async function listTopics(user, moduleId) {
  const module = await getVisibleModule(user, moduleId)
  return topicRepository.findTopicsByModule(moduleId, visibleChildrenFilter(user, module.course))
}

export async function getTopic(user, topicId) {
  return toTopicResponse(await getVisibleTopic(user, topicId))
}

export async function updateTopic(user, topicId, input) {
  await getOwnedTopic(user, topicId)

  try {
    return await topicRepository.updateTopic(topicId, input)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: TOPIC_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteTopic(user, topicId) {
  await getOwnedTopic(user, topicId)
  assertNoDependents('topic', await dependencyRepository.countTopicDependents(topicId))

  try {
    return await topicRepository.deleteTopicTree(topicId)
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw deletionBlocked('topic')
    }
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
