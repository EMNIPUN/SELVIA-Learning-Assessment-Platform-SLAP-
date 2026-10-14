import { z } from 'zod'
import { idParams, unexpectedFields } from './common.schemas.js'
import { optionId } from './question.schemas.js'

// Students taking quizzes. Bodies are strict: the student always comes from the token, and scores,
// correctness and grading are decided by the server, so any such field is rejected rather than ignored.

// The same limit as practice exercise answers.
const MAX_ANSWER_LENGTH = 1000

export { assessmentIdParams } from './assessment.schemas.js'

export const attemptIdParams = idParams('attemptId', 'Attempt id')

export const attemptAnswerParams = z.object({
  attemptId: z.uuid({ error: 'Attempt id must be a valid UUID' }),
  assessmentQuestionId: z.uuid({ error: 'Assessment question id must be a valid UUID' }),
})

// Starting, submitting and clearing an answer take no input.
export const startAttemptSchema = z.strictObject({}, unexpectedFields)
export const submitAttemptSchema = z.strictObject({}, unexpectedFields)
export const clearAnswerSchema = z.strictObject({}, unexpectedFields)

// selectedOptionId answers a MULTIPLE_CHOICE_SINGLE question and answerText a SHORT_ANSWER one; which applies
// to the question, and whether the option is one of its options, is checked against the question itself.
export const saveAnswerSchema = z
  .strictObject(
    {
      selectedOptionId: optionId.optional(),
      answerText: z
        .string({ error: 'Answer must be text' })
        .trim()
        .min(1, 'Enter an answer')
        .max(MAX_ANSWER_LENGTH, `Answer must be at most ${MAX_ANSWER_LENGTH} characters`)
        .optional(),
    },
    unexpectedFields,
  )
  .refine((data) => (data.selectedOptionId === undefined) !== (data.answerText === undefined), {
    message: 'Provide either selectedOptionId or answerText',
  })
