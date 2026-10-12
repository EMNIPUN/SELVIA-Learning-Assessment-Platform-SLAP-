import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import { createCourse, deleteCourse, getCourse, listCourses, updateCourse } from '../../controllers/course.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js'
import {
  courseIdParams,
  createCourseSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from '../../schemas/courseStructure.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Body: code, title, optional description, credits, status (DRAFT | PUBLISHED | ARCHIVED).
router.post('/courses', lecturerOnly, validateBody(createCourseSchema), createCourse)
// Query: optional mine=true (lecturer's own courses only) and status.
router.get('/courses', authenticate, validateQuery(listCoursesQuerySchema), listCourses)
router.get('/courses/:courseId', authenticate, validateParams(courseIdParams), getCourse)
router.patch('/courses/:courseId', lecturerOnly, validateParams(courseIdParams), validateBody(updateCourseSchema), updateCourse)
// Also deletes the course's modules, topics, and concepts; 409 if anything else depends on them.
router.delete('/courses/:courseId', lecturerOnly, validateParams(courseIdParams), deleteCourse)

export default router
