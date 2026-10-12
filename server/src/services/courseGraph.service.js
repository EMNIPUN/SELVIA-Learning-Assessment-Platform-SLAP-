import {
  ACYCLIC_CONCEPT_RELATIONSHIPS,
  CONCEPT_RELATIONSHIP_TYPES,
  CONCEPT_RELATIONSHIPS,
  GRAPH_LABELS,
  HIERARCHY,
} from '../constants/courseGraph.js'
import { findCourseById } from '../repositories/course.repository.js'
import * as courseGraphRepository from '../repositories/courseGraph.repository.js'
import { findCourseHierarchy, findExistingIds } from '../repositories/courseHierarchy.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { translateNeo4jError } from '../utils/neo4jErrors.js'
import { getOwnedConcept } from './concept.service.js'
import { assertCourseOwner } from './courseAccess.service.js'
import { getOwnedCourse } from './course.service.js'
import { getOwnedLesson } from './lesson.service.js'
import { getOwnedModule } from './module.service.js'
import { getOwnedTopic } from './topic.service.js'

// Explicit synchronization of the PostgreSQL hierarchy into the Course Knowledge Graph. PostgreSQL is
// the source of every node and property; concept knowledge relationships exist only in Neo4j and are
// never created, replaced or removed by hierarchy synchronization.

// The PostgreSQL fields mirrored on each node.
const NODE_PROPERTIES = {
  [GRAPH_LABELS.COURSE]: ({ id, code, title }) => ({ id, code, title }),
  [GRAPH_LABELS.MODULE]: ({ id, title }) => ({ id, title }),
  [GRAPH_LABELS.TOPIC]: ({ id, title }) => ({ id, title }),
  [GRAPH_LABELS.CONCEPT]: ({ id, code, name }) => ({ id, code, name }),
  [GRAPH_LABELS.LESSON]: ({ id, title }) => ({ id, title }),
}

function graphOperation(operation) {
  return async (...args) => {
    try {
      return await operation(...args)
    } catch (err) {
      throw translateNeo4jError(err)
    }
  }
}

function toNode(label, entity) {
  return { label, ...NODE_PROPERTIES[label](entity) }
}

async function syncChild(label, parentId, entity) {
  const linked = await courseGraphRepository.upsertChildNode(label, parentId, NODE_PROPERTIES[label](entity))
  if (!linked) {
    const parent = HIERARCHY[label].parent
    throw ApiError.conflict(`${parent} ${parentId} is not in the knowledge graph. Sync the ${parent.toLowerCase()} first.`)
  }
  return toNode(label, entity)
}

// Single-node sync. Children require their parent node to exist already; missing parents are never created.

export const syncCourse = graphOperation(async (user, courseId) => {
  const course = await getOwnedCourse(user, courseId)
  await courseGraphRepository.upsertCourseNode(NODE_PROPERTIES[GRAPH_LABELS.COURSE](course))
  return toNode(GRAPH_LABELS.COURSE, course)
})

export const syncModule = graphOperation(async (user, moduleId) => {
  const module = await getOwnedModule(user, moduleId)
  return syncChild(GRAPH_LABELS.MODULE, module.courseId, module)
})

export const syncTopic = graphOperation(async (user, topicId) => {
  const topic = await getOwnedTopic(user, topicId)
  return syncChild(GRAPH_LABELS.TOPIC, topic.moduleId, topic)
})

export const syncConcept = graphOperation(async (user, conceptId) => {
  const concept = await getOwnedConcept(user, conceptId)
  return syncChild(GRAPH_LABELS.CONCEPT, concept.topicId, concept)
})

export const syncLesson = graphOperation(async (user, lessonId) => {
  const lesson = await getOwnedLesson(user, lessonId)
  return syncChild(GRAPH_LABELS.LESSON, lesson.conceptId, lesson)
})

// Syncs the course and every module, topic, concept and lesson under it in one transaction. Graph nodes
// under the course that no longer exist in PostgreSQL are reported as `staleNodes`, not deleted; remove
// them explicitly.
export const syncCourseHierarchy = graphOperation(async (user, courseId) => {
  await getOwnedCourse(user, courseId)
  const course = await findCourseHierarchy(courseId)
  if (!course) {
    throw ApiError.notFound('Course not found')
  }

  const row = (label, parentId, entity) => ({ parentId, properties: NODE_PROPERTIES[label](entity) })
  const topics = course.modules.flatMap((module) => module.topics.map((topic) => ({ module, topic })))
  const concepts = topics.flatMap(({ topic }) => topic.concepts.map((concept) => ({ topic, concept })))
  const lessons = concepts.flatMap(({ concept }) => concept.lessons.map((lesson) => ({ concept, lesson })))
  const levels = [
    [GRAPH_LABELS.MODULE, course.modules.map((module) => row(GRAPH_LABELS.MODULE, course.id, module))],
    [GRAPH_LABELS.TOPIC, topics.map(({ module, topic }) => row(GRAPH_LABELS.TOPIC, module.id, topic))],
    [GRAPH_LABELS.CONCEPT, concepts.map(({ topic, concept }) => row(GRAPH_LABELS.CONCEPT, topic.id, concept))],
    [GRAPH_LABELS.LESSON, lessons.map(({ concept, lesson }) => row(GRAPH_LABELS.LESSON, concept.id, lesson))],
  ]

  await courseGraphRepository.upsertCourseTree(NODE_PROPERTIES[GRAPH_LABELS.COURSE](course), levels)

  const syncedIds = new Set(levels.flatMap(([, rows]) => rows.map((r) => r.properties.id)))
  const { descendants } = await courseGraphRepository.findSubtree(GRAPH_LABELS.COURSE, course.id)
  return {
    course: toNode(GRAPH_LABELS.COURSE, course),
    synced: {
      [GRAPH_LABELS.COURSE]: 1,
      ...Object.fromEntries(levels.map(([label, rows]) => [label, rows.length])),
    },
    staleNodes: descendants.filter((node) => !syncedIds.has(node.id)),
  }
})

// Removal of nodes whose PostgreSQL records have been deleted.

// Authorization uses the ancestor course: if it still exists in PostgreSQL only its owner may remove nodes
// under it. If the course itself has been deleted there is no owner left to check.
async function assertCanRemove(user, label, id) {
  const courseId = label === GRAPH_LABELS.COURSE ? null : await courseGraphRepository.findAncestorCourseId(label, id)
  const course = courseId ? await findCourseById(courseId) : null
  if (course) {
    assertCourseOwner(user, course)
  }
}

async function findStillInPostgres(nodes) {
  const byLabel = Object.groupBy(nodes, (node) => node.label)
  const found = await Promise.all(
    Object.entries(byLabel).map(async ([label, group]) =>
      (await findExistingIds(label, group.map((node) => node.id))).map((id) => ({ label, id }))),
  )
  return found.flat()
}

// Removes the node and its hierarchy descendants, with every relationship attached to them (including
// knowledge relationships of removed concepts). Nodes outside that subtree are never touched.
async function removeNode(user, label, id) {
  if ((await findExistingIds(label, [id])).length > 0) {
    throw ApiError.conflict(
      `This ${label.toLowerCase()} still exists in PostgreSQL. Delete it there first, or sync it to update the graph.`,
    )
  }

  const subtree = await courseGraphRepository.findSubtree(label, id)
  if (!subtree) {
    throw ApiError.notFound(`${label} is not in the knowledge graph`)
  }

  await assertCanRemove(user, label, id)

  const stillInPostgres = await findStillInPostgres(subtree.descendants)
  if (stillInPostgres.length > 0) {
    throw ApiError.conflict(
      `Some graph descendants still exist in PostgreSQL. Synchronize the course hierarchy before removing this ${label.toLowerCase()}.`,
      stillInPostgres.map(({ label: resource, id: resourceId }) => ({ resource, id: resourceId })),
    )
  }

  const removed = await courseGraphRepository.removeNodes([{ label, id }, ...subtree.descendants])
  return { label, id, removed }
}

export const removeCourse = graphOperation((user, courseId) => removeNode(user, GRAPH_LABELS.COURSE, courseId))
export const removeModule = graphOperation((user, moduleId) => removeNode(user, GRAPH_LABELS.MODULE, moduleId))
export const removeTopic = graphOperation((user, topicId) => removeNode(user, GRAPH_LABELS.TOPIC, topicId))
export const removeConcept = graphOperation((user, conceptId) => removeNode(user, GRAPH_LABELS.CONCEPT, conceptId))
export const removeLesson = graphOperation((user, lessonId) => removeNode(user, GRAPH_LABELS.LESSON, lessonId))

// Explicitly managed concept knowledge relationships (internal; no routes yet).

export const linkConcepts = graphOperation(async (type, fromConceptId, toConceptId) => {
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
})

export function addPrerequisite(prerequisiteConceptId, conceptId) {
  return linkConcepts(CONCEPT_RELATIONSHIPS.PREREQUISITE_OF, prerequisiteConceptId, conceptId)
}

export function addRelatedConcept(conceptId, relatedConceptId) {
  return linkConcepts(CONCEPT_RELATIONSHIPS.RELATED_TO, conceptId, relatedConceptId)
}

export function addRequirement(conceptId, requiredConceptId) {
  return linkConcepts(CONCEPT_RELATIONSHIPS.REQUIRES, conceptId, requiredConceptId)
}
