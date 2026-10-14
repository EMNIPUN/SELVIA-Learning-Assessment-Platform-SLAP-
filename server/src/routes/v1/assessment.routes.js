import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  addQuizQuestion,
  createQuiz,
  deleteQuiz,
  getQuiz,
  listCourseQuizzes,
  removeQuizQuestion,
  updateQuiz,
  updateQuizQuestion,
} from '../../controllers/assessment.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js'
import {
  addQuizQuestionSchema,
  assessmentIdParams,
  assessmentQuestionParams,
  createQuizSchema,
  listQuizzesQuerySchema,
  updateQuizQuestionSchema,
  updateQuizSchema,
} from '../../schemas/assessment.schemas.js'
import { courseIdParams } from '../../schemas/courseStructure.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// Lecturer quiz management, limited to the lecturer who owns the course. Quiz details include the questions'
// correct answers; attempts are only counted, never returned. Unknown body fields are rejected.

// Body: title, optional description, instructions (Markdown), timeLimitMinutes, maxAttempts, passPercentage,
// shuffleQuestions, availableFrom, availableUntil. Quizzes start as DRAFT and release results immediately.
router.post('/courses/:courseId/assessments', lecturerOnly, validateParams(courseIdParams), validateBody(createQuizSchema), createQuiz)
// Query: optional search (in the title), status, limit (1–100, default 50), offset (default 0). Newest first.
router.get('/courses/:courseId/assessments', lecturerOnly, validateParams(courseIdParams), validateQuery(listQuizzesQuerySchema), listCourseQuizzes)
router.get('/assessments/:assessmentId', lecturerOnly, validateParams(assessmentIdParams), getQuiz)
// The same fields plus status (DRAFT, PUBLISHED or ARCHIVED). Publishing needs at least one question, and every
// question must still be APPROVED or PUBLISHED, gradable and in the quiz's course.
router.patch('/assessments/:assessmentId', lecturerOnly, validateParams(assessmentIdParams), validateBody(updateQuizSchema), updateQuiz)
// 409 once students have attempted the quiz; archive it instead.
router.delete('/assessments/:assessmentId', lecturerOnly, validateParams(assessmentIdParams), deleteQuiz)

// Body: questionId (an APPROVED or PUBLISHED question of the same course), optional points (default: the
// question's default points), sequenceOrder (default: after the last question), sectionLabel.
// Adding, removing, re-weighting and reordering answer 409 once students have attempted the quiz.
router.post('/assessments/:assessmentId/questions', lecturerOnly, validateParams(assessmentIdParams), validateBody(addQuizQuestionSchema), addQuizQuestion)
// Body: points, sequenceOrder and/or sectionLabel. A sequenceOrder in use by another question answers 409.
router.patch(
  '/assessments/:assessmentId/questions/:assessmentQuestionId',
  lecturerOnly,
  validateParams(assessmentQuestionParams),
  validateBody(updateQuizQuestionSchema),
  updateQuizQuestion,
)
router.delete('/assessments/:assessmentId/questions/:assessmentQuestionId', lecturerOnly, validateParams(assessmentQuestionParams), removeQuizQuestion)

export default router
