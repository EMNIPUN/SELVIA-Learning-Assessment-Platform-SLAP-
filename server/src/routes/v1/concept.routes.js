import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  createConcept,
  deleteConcept,
  getConcept,
  listConcepts,
  updateConcept,
} from '../../controllers/concept.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  conceptIdParams,
  createConceptSchema,
  topicIdParams,
  updateConceptSchema,
} from '../../schemas/courseStructure.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: code (unique), name (unique within the topic), optional description, sequenceOrder, status.
router.post('/topics/:topicId/concepts', lecturerOnly, validateParams(topicIdParams), validateBody(createConceptSchema), createConcept)
router.get('/topics/:topicId/concepts', authenticate, validateParams(topicIdParams), listConcepts)
router.get('/concepts/:conceptId', authenticate, validateParams(conceptIdParams), getConcept)
router.patch('/concepts/:conceptId', lecturerOnly, validateParams(conceptIdParams), validateBody(updateConceptSchema), updateConcept)
// 409 if lessons, materials, questions, activity, or evidence reference the concept.
router.delete('/concepts/:conceptId', lecturerOnly, validateParams(conceptIdParams), deleteConcept)

export default router
