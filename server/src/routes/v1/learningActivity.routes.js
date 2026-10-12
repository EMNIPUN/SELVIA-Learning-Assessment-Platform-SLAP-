import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import { listMyActivities, recordActivity } from '../../controllers/learningActivity.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateQuery } from '../../middleware/validate.js'
import { createLearningActivitySchema, listMyActivitiesQuerySchema } from '../../schemas/learningActivity.schemas.js'

const router = Router()
const studentOnly = [authenticate, requireRole(ROLES.STUDENT)]

// Observable activity of the authenticated student; the student comes from the token, never the body.
// Body: activityType (LESSON_VIEWED, LESSON_COMPLETED, MATERIAL_VIEWED, MATERIAL_DOWNLOADED, EXAMPLE_VIEWED),
// targetId (the lesson, material or example), optional startedAt, endedAt, durationSeconds, metadata.
// The target must be visible to the student (404 otherwise); course, concept and occurredAt are set
// by the server.
router.post('/learning-activities', studentOnly, validateBody(createLearningActivitySchema), recordActivity)
// Newest first. Query: optional limit (1–200, default 50).
router.get('/learning-activities/me', studentOnly, validateQuery(listMyActivitiesQuerySchema), listMyActivities)

export default router
