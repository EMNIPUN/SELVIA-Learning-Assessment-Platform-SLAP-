import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  clearAnswer,
  getAttempt,
  getQuiz,
  listCourseQuizzes,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from '../../controllers/assessmentAttempt.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  assessmentIdParams,
  attemptAnswerParams,
  attemptIdParams,
  clearAnswerSchema,
  saveAnswerSchema,
  startAttemptSchema,
  submitAttemptSchema,
} from '../../schemas/assessmentAttempt.schemas.js'
import { courseIdParams } from '../../schemas/courseStructure.schemas.js'

const router = Router()
const studentOnly = [authenticate, requireRole(ROLES.STUDENT)]

// Students taking quizzes; the student always comes from the token. Students see the published quizzes of
// published courses; anything else, and other students' attempts, are not found. Their own paths keep them apart
// from the lecturer's /assessments routes. Questions are shown only inside an open attempt, and nothing reveals
// correct answers: a closed attempt shows only its released result.

router.get('/courses/:courseId/quizzes', studentOnly, validateParams(courseIdParams), listCourseQuizzes)
// The quiz's settings, availability and the student's own attempts.
router.get('/quizzes/:assessmentId', studentOnly, validateParams(assessmentIdParams), getQuiz)
// No body. Resumes the student's open attempt (200) or starts the next one (201); 409 when the quiz is not open,
// the attempts are used up or the quiz cannot be attempted.
router.post('/quizzes/:assessmentId/attempts', studentOnly, validateParams(assessmentIdParams), validateBody(startAttemptSchema), startAttempt)
router.get('/assessment-attempts/:attemptId', studentOnly, validateParams(attemptIdParams), getAttempt)
// Body: selectedOptionId (MULTIPLE_CHOICE_SINGLE) or answerText (SHORT_ANSWER). Saving or clearing an answer of a
// closed attempt answers 409, as does one whose time is up, which is submitted automatically.
router.put(
  '/assessment-attempts/:attemptId/answers/:assessmentQuestionId',
  studentOnly,
  validateParams(attemptAnswerParams),
  validateBody(saveAnswerSchema),
  saveAnswer,
)
router.delete(
  '/assessment-attempts/:attemptId/answers/:assessmentQuestionId',
  studentOnly,
  validateParams(attemptAnswerParams),
  validateBody(clearAnswerSchema),
  clearAnswer,
)
// No body. Submitting again changes nothing and returns the attempt as it is.
router.post('/assessment-attempts/:attemptId/submit', studentOnly, validateParams(attemptIdParams), validateBody(submitAttemptSchema), submitAttempt)

export default router
