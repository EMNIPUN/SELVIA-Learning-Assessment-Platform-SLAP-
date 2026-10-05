import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import { createExample, deleteExample, getExample, listExamples, updateExample } from '../../controllers/example.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  createExampleSchema,
  exampleIdParams,
  lessonIdParams,
  updateExampleSchema,
} from '../../schemas/learningContent.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: title, exampleType, content (Markdown), optional problemStatement, explanation, codeSnippet
// (requires programmingLanguage), sequenceOrder, status, sourceId, sourceReference.
router.post('/lessons/:lessonId/examples', lecturerOnly, validateParams(lessonIdParams), validateBody(createExampleSchema), createExample)
router.get('/lessons/:lessonId/examples', authenticate, validateParams(lessonIdParams), listExamples)
router.get('/examples/:exampleId', authenticate, validateParams(exampleIdParams), getExample)
router.patch('/examples/:exampleId', lecturerOnly, validateParams(exampleIdParams), validateBody(updateExampleSchema), updateExample)
router.delete('/examples/:exampleId', lecturerOnly, validateParams(exampleIdParams), deleteExample)

export default router
