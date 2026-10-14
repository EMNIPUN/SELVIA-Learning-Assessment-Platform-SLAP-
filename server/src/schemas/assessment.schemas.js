import { ContentStatus } from '@prisma/client'
import { z } from 'zod'
import { QUIZ_STATUSES } from '../constants/assessment.js'
import {
  atLeastOneField,
  hasAtMostTwoDecimals,
  idParams,
  MAX_DESCRIPTION_LENGTH,
  optionalText,
  paginationFields,
  points,
  requiredText,
  sequenceOrder,
  statusOf,
  unexpectedFields,
} from './common.schemas.js'

const MAX_TIME_LIMIT_MINUTES = 1440
const MAX_ATTEMPTS = 100
const MAX_SEARCH_LENGTH = 200

export const assessmentIdParams = idParams('assessmentId', 'Assessment id')

export const assessmentQuestionParams = z.object({
  assessmentId: z.uuid({ error: 'Assessment id must be a valid UUID' }),
  assessmentQuestionId: z.uuid({ error: 'Assessment question id must be a valid UUID' }),
})

const optionalDateTime = (label) =>
  z.iso
    .datetime({ offset: true, error: `${label} must be an ISO 8601 date-time` })
    .transform((value) => new Date(value))
    .nullable()
    .optional()

// The type, release policy, course, author and publication fields are set by the server; bodies that name
// them are rejected. A null clears an optional setting (no time limit, unlimited attempts, no pass mark).
const quizFields = {
  title: requiredText('Title', 200),
  description: optionalText('Description', MAX_DESCRIPTION_LENGTH),
  instructions: optionalText('Instructions', 20_000),
  timeLimitMinutes: z
    .int({ error: 'Time limit must be a whole number of minutes' })
    .min(1, 'Time limit must be at least 1 minute')
    .max(MAX_TIME_LIMIT_MINUTES, `Time limit must be at most ${MAX_TIME_LIMIT_MINUTES} minutes`)
    .nullable()
    .optional(),
  maxAttempts: z
    .int({ error: 'Maximum attempts must be a whole number' })
    .min(1, 'Maximum attempts must be at least 1')
    .max(MAX_ATTEMPTS, `Maximum attempts must be at most ${MAX_ATTEMPTS}`)
    .nullable()
    .optional(),
  passPercentage: z
    .number({ error: 'Pass percentage must be a number' })
    .min(0, 'Pass percentage must be at least 0')
    .max(100, 'Pass percentage must be at most 100')
    .refine(hasAtMostTwoDecimals, 'Pass percentage can have at most 2 decimal places')
    .nullable()
    .optional(),
  shuffleQuestions: z.boolean({ error: 'shuffleQuestions must be true or false' }).optional(),
  availableFrom: optionalDateTime('Available from'),
  availableUntil: optionalDateTime('Available until'),
}

// When only one end of the window is sent, the service checks it against the stored other end.
const windowIsValid = ({ availableFrom, availableUntil }) =>
  !availableFrom || !availableUntil || availableUntil > availableFrom
const WINDOW_ISSUE = { path: ['availableUntil'], message: 'Available until must be later than available from' }

export const createQuizSchema = z
  .strictObject(
    {
      ...quizFields,
      status: z
        .literal(ContentStatus.DRAFT, { error: 'New quizzes start as DRAFT; publish the quiz once it has questions' })
        .optional(),
    },
    unexpectedFields,
  )
  .refine(windowIsValid, WINDOW_ISSUE)

export const updateQuizSchema = atLeastOneField(
  z.strictObject({ ...quizFields, status: statusOf(QUIZ_STATUSES) }, unexpectedFields).partial(),
).refine(windowIsValid, WINDOW_ISSUE)

export const listQuizzesQuerySchema = z.object({
  search: z
    .string({ error: 'Search must be text' })
    .trim()
    .max(MAX_SEARCH_LENGTH, `Search must be at most ${MAX_SEARCH_LENGTH} characters`)
    .optional()
    .transform((value) => value || undefined),
  status: statusOf(QUIZ_STATUSES).optional(),
  ...paginationFields,
})

// Quiz questions. points defaults to the question's default points and sequenceOrder to the next free position.

const quizQuestionFields = {
  points: points('Points'),
  sequenceOrder,
  sectionLabel: optionalText('Section label', 100),
}

export const addQuizQuestionSchema = z.strictObject(
  {
    questionId: z.uuid({ error: 'Question id must be a valid UUID' }),
    points: quizQuestionFields.points.optional(),
    sequenceOrder: quizQuestionFields.sequenceOrder.optional(),
    sectionLabel: quizQuestionFields.sectionLabel,
  },
  unexpectedFields,
)

export const updateQuizQuestionSchema = atLeastOneField(z.strictObject(quizQuestionFields, unexpectedFields).partial())
