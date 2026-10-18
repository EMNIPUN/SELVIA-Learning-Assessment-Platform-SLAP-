import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  removeConcept,
  removeCourse,
  removeLesson,
  removeModule,
  removeTopic,
  syncConcept,
  syncCourse,
  syncCourseHierarchy,
  syncLesson,
  syncModule,
  syncTopic,
} from '../../controllers/courseGraph.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateParams } from '../../middleware/validate.js'
import { conceptIdParams, courseIdParams, moduleIdParams, topicIdParams } from '../../schemas/courseStructure.schemas.js'
import { lessonIdParams } from '../../schemas/learningContent.schemas.js'

// Course Knowledge Graph sync/repair (mounted at /graph). Hierarchy writes also auto-sync best-effort
// via graphAutoSync.service.js; these routes remain for manual repair. Lecturer-only; sync requires owning
// the course. 404: record not in PostgreSQL; 409: parent missing from the graph; 503: Neo4j unavailable.
const router = Router()
router.use(authenticate, requireRole(ROLES.LECTURER))

router.post('/courses/:courseId/sync', validateParams(courseIdParams), syncCourse)
// Course plus every module, topic, concept and lesson; reports graph nodes no longer in PostgreSQL.
router.post('/courses/:courseId/sync-hierarchy', validateParams(courseIdParams), syncCourseHierarchy)
router.post('/modules/:moduleId/sync', validateParams(moduleIdParams), syncModule)
router.post('/topics/:topicId/sync', validateParams(topicIdParams), syncTopic)
router.post('/concepts/:conceptId/sync', validateParams(conceptIdParams), syncConcept)
router.post('/lessons/:lessonId/sync', validateParams(lessonIdParams), syncLesson)

// Removes a node whose PostgreSQL record has been deleted, with its hierarchy descendants
// (409 while the record still exists in PostgreSQL).
router.delete('/courses/:courseId', validateParams(courseIdParams), removeCourse)
router.delete('/modules/:moduleId', validateParams(moduleIdParams), removeModule)
router.delete('/topics/:topicId', validateParams(topicIdParams), removeTopic)
router.delete('/concepts/:conceptId', validateParams(conceptIdParams), removeConcept)
router.delete('/lessons/:lessonId', validateParams(lessonIdParams), removeLesson)

export default router
