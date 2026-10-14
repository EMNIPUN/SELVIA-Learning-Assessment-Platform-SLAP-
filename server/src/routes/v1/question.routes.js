import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listConceptQuestions,
  listCourseQuestions,
  updateQuestion,
} from '../../controllers/question.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js'
import { conceptIdParams, courseIdParams } from '../../schemas/courseStructure.schemas.js'
import {
  createQuestionSchema,
  listCourseQuestionsQuerySchema,
  listQuestionsQuerySchema,
  questionIdParams,
  updateQuestionSchema,
} from '../../schemas/question.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]

// The question bank holds correct answers, so every route is limited to the lecturer who owns the course.
// Students will receive questions only through assessments.

// Body: questionText (Markdown), questionType (MULTIPLE_CHOICE_SINGLE or SHORT_ANSWER), difficulty, bloomLevel,
// answerConfig, optional explanation, defaultPoints (default 1), status, sourceId, sourceReference.
// answerConfig for MULTIPLE_CHOICE_SINGLE: { options: [{ id, text }], correct_option_ids: [id], shuffle_options (default false) }
// answerConfig for SHORT_ANSWER: { accepted_answers: [text], case_sensitive (default false), requires_manual_grading (false only) }
router.post('/concepts/:conceptId/questions', lecturerOnly, validateParams(conceptIdParams), validateBody(createQuestionSchema), createQuestion)
// Query: optional search (in the question text), status, questionType, difficulty, bloomLevel, limit (1–100,
// default 50), offset (default 0). Newest first; the response includes { total, limit, offset }.
router.get('/concepts/:conceptId/questions', lecturerOnly, validateParams(conceptIdParams), validateQuery(listQuestionsQuerySchema), listConceptQuestions)
// The same query, plus an optional conceptId that must belong to the course. Each question includes its concept.
router.get('/courses/:courseId/questions', lecturerOnly, validateParams(courseIdParams), validateQuery(listCourseQuestionsQuerySchema), listCourseQuestions)
router.get('/questions/:questionId', lecturerOnly, validateParams(questionIdParams), getQuestion)
// 409 when the text, type or answers change while the question is used in an assessment.
router.patch('/questions/:questionId', lecturerOnly, validateParams(questionIdParams), validateBody(updateQuestionSchema), updateQuestion)
// 409 once assessments, activity or later versions refer to it; archive it instead.
router.delete('/questions/:questionId', lecturerOnly, validateParams(questionIdParams), deleteQuestion)

export default router
