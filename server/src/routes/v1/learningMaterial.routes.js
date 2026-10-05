import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  createMaterial,
  deleteMaterial,
  getMaterial,
  listMaterials,
  updateMaterial,
} from '../../controllers/learningMaterial.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  createMaterialSchema,
  lessonIdParams,
  materialIdParams,
  updateMaterialSchema,
} from '../../schemas/learningContent.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: title, materialType, exactly one of externalUrl or fileStorageKey (files are stored outside
// the database), optional description, mimeType, fileSizeBytes, sequenceOrder, status, sourceId, sourceReference.
router.post('/lessons/:lessonId/materials', lecturerOnly, validateParams(lessonIdParams), validateBody(createMaterialSchema), createMaterial)
router.get('/lessons/:lessonId/materials', authenticate, validateParams(lessonIdParams), listMaterials)
router.get('/materials/:materialId', authenticate, validateParams(materialIdParams), getMaterial)
router.patch('/materials/:materialId', lecturerOnly, validateParams(materialIdParams), validateBody(updateMaterialSchema), updateMaterial)
router.delete('/materials/:materialId', lecturerOnly, validateParams(materialIdParams), deleteMaterial)

export default router
