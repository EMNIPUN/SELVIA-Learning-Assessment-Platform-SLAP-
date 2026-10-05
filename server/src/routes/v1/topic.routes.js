import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import { createTopic, deleteTopic, getTopic, listTopics, updateTopic } from '../../controllers/topic.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  createTopicSchema,
  moduleIdParams,
  topicIdParams,
  updateTopicSchema,
} from '../../schemas/courseStructure.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: title, optional description, sequenceOrder (defaults to the next position), status.
router.post('/modules/:moduleId/topics', lecturerOnly, validateParams(moduleIdParams), validateBody(createTopicSchema), createTopic)
router.get('/modules/:moduleId/topics', authenticate, validateParams(moduleIdParams), listTopics)
router.get('/topics/:topicId', authenticate, validateParams(topicIdParams), getTopic)
router.patch('/topics/:topicId', lecturerOnly, validateParams(topicIdParams), validateBody(updateTopicSchema), updateTopic)
// Also deletes the topic's concepts; 409 if anything else depends on them.
router.delete('/topics/:topicId', lecturerOnly, validateParams(topicIdParams), deleteTopic)

export default router
