import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  createContentSource,
  getContentSource,
  listContentSources,
  updateContentSource,
} from '../../controllers/contentSource.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js'
import {
  createContentSourceSchema,
  listContentSourcesQuerySchema,
  sourceIdParams,
  updateContentSourceSchema,
} from '../../schemas/learningContent.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Provenance records shared by all lecturers; only the creator can edit one.
// Body: sourceType, title, optional authors, publisher, publicationYear, edition, url (required for
// WEBSITE and OPEN_EDUCATIONAL_RESOURCE), isbnOrDoi, license, citation, generationMetadata (required for
// AI_GENERATED), accessedAt, notes.
router.post('/content-sources', lecturerOnly, validateBody(createContentSourceSchema), createContentSource)
router.get('/content-sources', lecturerOnly, validateQuery(listContentSourcesQuerySchema), listContentSources)
router.get('/content-sources/:sourceId', lecturerOnly, validateParams(sourceIdParams), getContentSource)
router.patch('/content-sources/:sourceId', lecturerOnly, validateParams(sourceIdParams), validateBody(updateContentSourceSchema), updateContentSource)

export default router
