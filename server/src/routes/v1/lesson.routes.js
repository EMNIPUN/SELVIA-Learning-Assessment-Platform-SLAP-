import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import { createLesson, deleteLesson, getLesson, listLessons, updateLesson } from '../../controllers/lesson.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import { conceptIdParams } from '../../schemas/courseStructure.schemas.js'
import { createLessonSchema, lessonIdParams, updateLessonSchema } from '../../schemas/learningContent.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: title, body (Markdown), optional summary, estimatedDurationMinutes, sequenceOrder, status,
// sourceId, sourceReference.
router.post('/concepts/:conceptId/lessons', lecturerOnly, validateParams(conceptIdParams), validateBody(createLessonSchema), createLesson)
router.get('/concepts/:conceptId/lessons', authenticate, validateParams(conceptIdParams), listLessons)
router.get('/lessons/:lessonId', authenticate, validateParams(lessonIdParams), getLesson)
router.patch('/lessons/:lessonId', lecturerOnly, validateParams(lessonIdParams), validateBody(updateLessonSchema), updateLesson)
// Also deletes the lesson's materials and examples; 409 if learning activity references them.
router.delete('/lessons/:lessonId', lecturerOnly, validateParams(lessonIdParams), deleteLesson)

export default router
