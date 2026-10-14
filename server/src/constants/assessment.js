import { AssessmentType, ContentStatus, ResultsReleasePolicy } from '@prisma/client'
import { STRUCTURE_STATUSES } from './contentStatus.js'
import { BANK_QUESTION_TYPES } from './question.js'

// The first version of the assessment system manages quizzes only, with results released immediately.
export const QUIZ_TYPE = AssessmentType.QUIZ
export const QUIZ_RELEASE_POLICY = ResultsReleasePolicy.IMMEDIATE

// Assessments have no reviewer columns, so they use the structure lifecycle rather than the review workflow.
export const QUIZ_STATUSES = STRUCTURE_STATUSES

// Only reviewed questions may be assessed (docs/database-design.md, section 5.14), and only the types the
// question bank creates can be graded.
export const QUIZ_QUESTION_STATUSES = [ContentStatus.APPROVED, ContentStatus.PUBLISHED]
export const QUIZ_QUESTION_TYPES = BANK_QUESTION_TYPES

// Where now falls relative to a quiz's availability window, as students are told.
export const QUIZ_AVAILABILITY = Object.freeze({ UPCOMING: 'UPCOMING', OPEN: 'OPEN', CLOSED: 'CLOSED' })
