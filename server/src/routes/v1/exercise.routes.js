import { Router } from 'express'
import { ROLES } from '../../constants/roles.js'
import {
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  listMyAttempts,
  submitAttempt,
  updateExercise,
} from '../../controllers/exercise.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/requireRole.js'
import { validateBody, validateParams } from '../../middleware/validate.js'
import {
  createExerciseSchema,
  exerciseIdParams,
  submitExerciseAttemptSchema,
  updateExerciseSchema,
} from '../../schemas/exercise.schemas.js'
import { lessonIdParams } from '../../schemas/learningContent.schemas.js'

const router = Router()
const lecturerOnly = [authenticate, requireRole(ROLES.LECTURER)]
const studentOnly = [authenticate, requireRole(ROLES.STUDENT)]

// Body: title, instructions (Markdown), exerciseType (MULTIPLE_CHOICE or SHORT_ANSWER), difficulty, bloomLevel,
// answerConfig, optional solutionExplanation (feedback shown after an answer), maxScore (default 1),
// estimatedDurationMinutes, sequenceOrder, status, sourceId, sourceReference.
// answerConfig for MULTIPLE_CHOICE: { options: [{ id, text }], correct_option_ids: [id] }
// answerConfig for SHORT_ANSWER: { accepted_answers: [text], case_sensitive (default false) }
router.post('/lessons/:lessonId/exercises', lecturerOnly, validateParams(lessonIdParams), validateBody(createExerciseSchema), createExercise)
// The course owner receives the full exercise. Everyone else receives published exercises without
// answerConfig or solutionExplanation; multiple-choice exercises list their options instead.
router.get('/lessons/:lessonId/exercises', authenticate, validateParams(lessonIdParams), listExercises)
router.get('/exercises/:exerciseId', authenticate, validateParams(exerciseIdParams), getExercise)
router.patch('/exercises/:exerciseId', lecturerOnly, validateParams(exerciseIdParams), validateBody(updateExerciseSchema), updateExercise)
// 409 once students have attempted it; archive it instead.
router.delete('/exercises/:exerciseId', lecturerOnly, validateParams(exerciseIdParams), deleteExercise)

// Attempts of the authenticated student; the student comes from the token, never the body.
// Body: selectedOptionId (MULTIPLE_CHOICE) or answerText (SHORT_ANSWER). The server evaluates the answer and
// returns the result with the exercise's explanation as feedback.
router.post('/exercises/:exerciseId/attempts', studentOnly, validateParams(exerciseIdParams), validateBody(submitExerciseAttemptSchema), submitAttempt)
// Newest first, at most 50.
router.get('/exercises/:exerciseId/attempts/me', studentOnly, validateParams(exerciseIdParams), listMyAttempts)

export default router
