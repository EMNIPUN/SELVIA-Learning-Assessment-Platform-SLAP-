import { CONTENT_STATUS } from './contentStatus.js'
import { BANK_QUESTION_TYPES } from './questionTypes.js'
import { STRUCTURE_STATUSES } from './structureStatus.js'

// The quiz API's statuses and limits (server/src/schemas/assessment.schemas.js).
export const QUIZ_STATUSES = STRUCTURE_STATUSES

export const QUIZ_LIMITS = Object.freeze({
  TITLE: 200,
  DESCRIPTION: 5000,
  INSTRUCTIONS: 20_000,
  TIME_LIMIT_MINUTES: 1440,
  ATTEMPTS: 100,
  SECTION_LABEL: 100,
  POINTS: 1000,
  SEQUENCE_ORDER: 1000,
})

// Only reviewed questions of the types quizzes can grade may be added; the API checks this again.
export const QUIZ_QUESTION_STATUSES = Object.freeze([CONTENT_STATUS.APPROVED, CONTENT_STATUS.PUBLISHED])
export const QUIZ_QUESTION_TYPES = BANK_QUESTION_TYPES

export const isQuizEligible = (question) =>
  QUIZ_QUESTION_STATUSES.includes(question.status) && QUIZ_QUESTION_TYPES.includes(question.questionType)
