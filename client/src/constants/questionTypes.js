// The question types the question bank API accepts (BANK_QUESTION_TYPES on the server). Other QuestionType values
// need grading the platform does not offer yet and cannot be created.
export const QUESTION_TYPE = Object.freeze({
  MULTIPLE_CHOICE_SINGLE: 'MULTIPLE_CHOICE_SINGLE',
  SHORT_ANSWER: 'SHORT_ANSWER',
})

export const BANK_QUESTION_TYPES = Object.values(QUESTION_TYPE)

export const QUESTION_TYPE_LABELS = Object.freeze({
  [QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE]: 'Multiple choice (one correct answer)',
  [QUESTION_TYPE.SHORT_ANSWER]: 'Short answer',
})
