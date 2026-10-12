import * as conceptRepository from '../repositories/concept.repository.js'
import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { isForeignKeyViolation, translatePrismaError } from '../utils/prismaErrors.js'
import { assertCourseOwner, canView, visibleChildrenFilter } from './courseAccess.service.js'
import { assertNoDependents, deletionBlocked } from './deletionGuard.service.js'
import { getOwnedTopic, getVisibleTopic } from './topic.service.js'

const NOT_FOUND = 'Concept not found'

const CONCEPT_CONFLICTS = {
  concepts_code_key: { field: 'code', message: 'A concept with this code already exists' },
  concepts_topic_id_name_key: { field: 'name', message: 'This topic already has a concept with this name' },
  concepts_topic_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another concept in this topic already uses this sequence order',
  },
}

const toConceptResponse = ({ topic, ...concept }) => concept

async function findConcept(conceptId) {
  const concept = await conceptRepository.findConceptById(conceptId)
  if (!concept) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return concept
}

export async function getVisibleConcept(user, conceptId) {
  const concept = await findConcept(conceptId)
  const { topic } = concept
  if (!canView(user, topic.module.course, topic.module, topic, concept)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return concept
}

export async function getOwnedConcept(user, conceptId) {
  const concept = await findConcept(conceptId)
  assertCourseOwner(user, concept.topic.module.course)
  return concept
}

export async function createConcept(user, topicId, input) {
  await getOwnedTopic(user, topicId)
  const sequenceOrder = input.sequenceOrder ?? (await conceptRepository.findMaxSequenceOrder(topicId)) + 1

  try {
    return await conceptRepository.createConcept({ ...input, topicId, sequenceOrder })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: CONCEPT_CONFLICTS })
  }
}

export async function listConcepts(user, topicId) {
  const topic = await getVisibleTopic(user, topicId)
  return conceptRepository.findConceptsByTopic(topicId, visibleChildrenFilter(user, topic.module.course))
}

export async function getConcept(user, conceptId) {
  return toConceptResponse(await getVisibleConcept(user, conceptId))
}

export async function updateConcept(user, conceptId, input) {
  await getOwnedConcept(user, conceptId)

  try {
    return await conceptRepository.updateConcept(conceptId, input)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: CONCEPT_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteConcept(user, conceptId) {
  await getOwnedConcept(user, conceptId)
  assertNoDependents('concept', await dependencyRepository.countConceptDependents(conceptId))

  try {
    await conceptRepository.deleteConcept(conceptId)
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw deletionBlocked('concept')
    }
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
