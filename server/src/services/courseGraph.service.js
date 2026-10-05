import {
  ACYCLIC_CONCEPT_RELATIONSHIPS,
  CONCEPT_RELATIONSHIP_TYPES,
  CONCEPT_RELATIONSHIPS,
  GRAPH_LABELS,
  HIERARCHY,
} from '../constants/courseGraph.js'
import { findConceptById } from '../repositories/concept.repository.js'
import { findCourseById } from '../repositories/course.repository.js'
import * as courseGraphRepository from '../repositories/courseGraph.repository.js'
import { findLessonById } from '../repositories/lesson.repository.js'
import { findModuleById } from '../repositories/module.repository.js'
import { findTopicById } from '../repositories/topic.repository.js'
import { ApiError } from '../utils/ApiError.js'

// Internal service: not exposed through any route. PostgreSQL is the source of every node's
// properties, so each sync reads the entity by id and writes only the fields mirrored in the graph.
// Parents must be synced before their children.

async function loadOrThrow(find, id, entityName) {
  const entity = await find(id)
  if (!entity) {
    throw ApiError.notFound(`${entityName} not found`)
  }
  return entity
}

async function syncChild(label, parentId, id, properties) {
  const linked = await courseGraphRepository.upsertChildNode(label, parentId, id, properties)
  if (!linked) {
    const parent = HIERARCHY[label].parent
    throw ApiError.conflict(`${parent} ${parentId} is not in the knowledge graph. Sync the ${parent.toLowerCase()} first.`)
  }
  return { label, id }
}

export async function syncCourse(courseId) {
  const course = await loadOrThrow(findCourseById, courseId, 'Course')
  await courseGraphRepository.upsertCourseNode(course.id, { code: course.code, title: course.title })
  return { label: GRAPH_LABELS.COURSE, id: course.id }
}

export async function syncModule(moduleId) {
  const module = await loadOrThrow(findModuleById, moduleId, 'Module')
  return syncChild(GRAPH_LABELS.MODULE, module.courseId, module.id, { title: module.title })
}

export async function syncTopic(topicId) {
  const topic = await loadOrThrow(findTopicById, topicId, 'Topic')
  return syncChild(GRAPH_LABELS.TOPIC, topic.moduleId, topic.id, { title: topic.title })
}

export async function syncConcept(conceptId) {
  const concept = await loadOrThrow(findConceptById, conceptId, 'Concept')
  return syncChild(GRAPH_LABELS.CONCEPT, concept.topicId, concept.id, { code: concept.code, name: concept.name })
}

export async function syncLesson(lessonId) {
  const lesson = await loadOrThrow(findLessonById, lessonId, 'Lesson')
  return syncChild(GRAPH_LABELS.LESSON, lesson.conceptId, lesson.id, { title: lesson.title })
}

export async function linkConcepts(type, fromConceptId, toConceptId) {
  if (!CONCEPT_RELATIONSHIP_TYPES.includes(type)) {
    throw ApiError.badRequest(`Relationship type must be one of: ${CONCEPT_RELATIONSHIP_TYPES.join(', ')}`)
  }
  if (fromConceptId === toConceptId) {
    throw ApiError.badRequest('A concept cannot be related to itself')
  }

  const found = await courseGraphRepository.findConceptNodeIds([fromConceptId, toConceptId])
  const missing = [fromConceptId, toConceptId].filter((id) => !found.includes(id))
  if (missing.length > 0) {
    throw ApiError.notFound(`Concept not found in the knowledge graph: ${missing.join(', ')}`)
  }

  if (
    ACYCLIC_CONCEPT_RELATIONSHIPS.includes(type) &&
    (await courseGraphRepository.hasConceptPath(type, toConceptId, fromConceptId))
  ) {
    throw ApiError.conflict(`This ${type} relationship would create a cycle`)
  }

  await courseGraphRepository.mergeConceptRelationship(type, fromConceptId, toConceptId)
  return { type, fromConceptId, toConceptId }
}

export function addPrerequisite(prerequisiteConceptId, conceptId) {
  return linkConcepts(CONCEPT_RELATIONSHIPS.PREREQUISITE_OF, prerequisiteConceptId, conceptId)
}

export function addRelatedConcept(conceptId, relatedConceptId) {
  return linkConcepts(CONCEPT_RELATIONSHIPS.RELATED_TO, conceptId, relatedConceptId)
}

export function addRequirement(conceptId, requiredConceptId) {
  return linkConcepts(CONCEPT_RELATIONSHIPS.REQUIRES, conceptId, requiredConceptId)
}
