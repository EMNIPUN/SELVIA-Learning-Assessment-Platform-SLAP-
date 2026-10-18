import { GRAPH_LABELS } from '../constants/courseGraph.js'
import { isNeo4jConfigured } from '../database/neo4j/driver.js'
import * as courseGraphRepository from '../repositories/courseGraph.repository.js'

// Best-effort Neo4j mirroring after PostgreSQL hierarchy writes.
// Failures are logged and never thrown: Postgres remains the system of record, and the explicit
// /api/v1/graph sync endpoints remain available for repair.

const defaultDeps = {
  isNeo4jConfigured,
  upsertCourseNode: (...args) => courseGraphRepository.upsertCourseNode(...args),
  upsertChildNode: (...args) => courseGraphRepository.upsertChildNode(...args),
  findSubtree: (...args) => courseGraphRepository.findSubtree(...args),
  removeNodes: (...args) => courseGraphRepository.removeNodes(...args),
  warn: (message) => console.warn(message),
  error: (label, err) => console.error(`Neo4j auto-sync failed (${label}):`, err?.message ?? err),
}

function createGraphAutoSync(deps = {}) {
  const {
    isNeo4jConfigured: isConfigured,
    upsertCourseNode,
    upsertChildNode,
    findSubtree,
    removeNodes,
    warn,
    error,
  } = { ...defaultDeps, ...deps }

  async function syncCourseNode(course) {
    if (!isConfigured()) return { skipped: true }
    try {
      await upsertCourseNode({
        id: course.id,
        code: course.code,
        title: course.title,
      })
      return { synced: true }
    } catch (err) {
      error(GRAPH_LABELS.COURSE, err)
      return { synced: false, reason: 'error' }
    }
  }

  async function syncChildNode(label, parentId, properties) {
    if (!isConfigured()) return { skipped: true }
    try {
      const linked = await upsertChildNode(label, parentId, properties)
      if (!linked) {
        warn(
          `Neo4j auto-sync: ${label} ${properties.id} skipped — parent ${parentId} is not in the graph. ` +
            'Sync the parent (or call sync-hierarchy) to repair.',
        )
        return { synced: false, reason: 'parent_missing' }
      }
      return { synced: true }
    } catch (err) {
      error(label, err)
      return { synced: false, reason: 'error' }
    }
  }

  async function removeNode(label, id) {
    if (!isConfigured()) return { skipped: true }
    try {
      const subtree = await findSubtree(label, id)
      if (!subtree) {
        return { synced: true, reason: 'already_absent' }
      }
      await removeNodes([{ label, id }, ...subtree.descendants])
      return { synced: true }
    } catch (err) {
      error(`remove ${label}`, err)
      return { synced: false, reason: 'error' }
    }
  }

  return {
    syncCourseToGraph: (course) => syncCourseNode(course),
    syncModuleToGraph: (module) =>
      syncChildNode(GRAPH_LABELS.MODULE, module.courseId, {
        id: module.id,
        title: module.title,
      }),
    syncTopicToGraph: (topic) =>
      syncChildNode(GRAPH_LABELS.TOPIC, topic.moduleId, {
        id: topic.id,
        title: topic.title,
      }),
    syncConceptToGraph: (concept) =>
      syncChildNode(GRAPH_LABELS.CONCEPT, concept.topicId, {
        id: concept.id,
        code: concept.code,
        name: concept.name,
      }),
    syncLessonToGraph: (lesson) =>
      syncChildNode(GRAPH_LABELS.LESSON, lesson.conceptId, {
        id: lesson.id,
        title: lesson.title,
      }),
    removeCourseFromGraph: (courseId) => removeNode(GRAPH_LABELS.COURSE, courseId),
    removeModuleFromGraph: (moduleId) => removeNode(GRAPH_LABELS.MODULE, moduleId),
    removeTopicFromGraph: (topicId) => removeNode(GRAPH_LABELS.TOPIC, topicId),
    removeConceptFromGraph: (conceptId) => removeNode(GRAPH_LABELS.CONCEPT, conceptId),
    removeLessonFromGraph: (lessonId) => removeNode(GRAPH_LABELS.LESSON, lessonId),
  }
}

const defaultAutoSync = createGraphAutoSync()

export { createGraphAutoSync }

export const syncCourseToGraph = (...args) => defaultAutoSync.syncCourseToGraph(...args)
export const syncModuleToGraph = (...args) => defaultAutoSync.syncModuleToGraph(...args)
export const syncTopicToGraph = (...args) => defaultAutoSync.syncTopicToGraph(...args)
export const syncConceptToGraph = (...args) => defaultAutoSync.syncConceptToGraph(...args)
export const syncLessonToGraph = (...args) => defaultAutoSync.syncLessonToGraph(...args)
export const removeCourseFromGraph = (...args) => defaultAutoSync.removeCourseFromGraph(...args)
export const removeModuleFromGraph = (...args) => defaultAutoSync.removeModuleFromGraph(...args)
export const removeTopicFromGraph = (...args) => defaultAutoSync.removeTopicFromGraph(...args)
export const removeConceptFromGraph = (...args) => defaultAutoSync.removeConceptFromGraph(...args)
export const removeLessonFromGraph = (...args) => defaultAutoSync.removeLessonFromGraph(...args)
