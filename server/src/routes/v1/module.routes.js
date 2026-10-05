import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import { createModule, deleteModule, getModule, listModules, updateModule } from '../../controllers/module.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  courseIdParams,
  createModuleSchema,
  moduleIdParams,
  updateModuleSchema,
} from '../../schemas/courseStructure.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: title, optional description, sequenceOrder (defaults to the next position), status.
router.post('/courses/:courseId/modules', lecturerOnly, validateParams(courseIdParams), validateBody(createModuleSchema), createModule)
router.get('/courses/:courseId/modules', authenticate, validateParams(courseIdParams), listModules)
router.get('/modules/:moduleId', authenticate, validateParams(moduleIdParams), getModule)
router.patch('/modules/:moduleId', lecturerOnly, validateParams(moduleIdParams), validateBody(updateModuleSchema), updateModule)
// Also deletes the module's topics and concepts; 409 if anything else depends on them.
router.delete('/modules/:moduleId', lecturerOnly, validateParams(moduleIdParams), deleteModule)

export default router
