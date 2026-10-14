import { BloomLevel, DifficultyLevel, QuestionType } from '@prisma/client'
import { z } from 'zod'
import { CONTENT_STATUSES } from '../constants/contentStatus.js'
import { BANK_QUESTION_TYPES } from '../constants/question.js'
import {
  atLeastOneField,
  idParams,
  optionalText,
  optionalUuid,
  paginationFields,
  points,
  requiredRichText,
  requiredText,
  statusOf,
  unexpectedFields,
} from './common.schemas.js'

const QUESTION_TYPES = Object.values(QuestionType)
const DIFFICULTY_LEVELS = Object.values(DifficultyLevel)
const BLOOM_LEVELS = Object.values(BloomLevel)
const MAX_OPTION_ID_LENGTH = 20
const MAX_SEARCH_LENGTH = 200

export const questionIdParams = idParams('questionId', 'Question id')

// Answer configuration, stored in questions.answer_config with the documented keys (docs/database-design.md,
// section 5.14). Its shape depends on the question type, so the service validates it against the question's
// final type with parseAnswerConfig. The limits match those of practice exercises.

export const optionId = z
  .string({ error: 'Option id must be text' })
  .trim()
  .min(1, 'Option id is required')
  .max(MAX_OPTION_ID_LENGTH, `Option id must be at most ${MAX_OPTION_ID_LENGTH} characters`)
  .regex(/^[A-Za-z0-9_-]+$/, 'Option id may only contain letters, digits, hyphens and underscores')

const multipleChoiceSingleConfig = z
  .strictObject(
    {
      options: z
        .array(z.strictObject({ id: optionId, text: requiredText('Option text', 1000) }, unexpectedFields), {
          error: 'Options must be a list',
        })
        .min(2, 'Provide at least 2 options')
        .max(10, 'Provide at most 10 options')
        .refine((options) => new Set(options.map((option) => option.id)).size === options.length, 'Option ids must be unique'),
      correct_option_ids: z
        .array(optionId, { error: 'Correct option ids must be a list' })
        .length(1, 'Mark exactly one option as correct'),
      shuffle_options: z.boolean({ error: 'shuffle_options must be true or false' }).default(false),
    },
    unexpectedFields,
  )
  .refine((config) => config.options.some((option) => option.id === config.correct_option_ids[0]), {
    path: ['correct_option_ids'],
    message: 'The correct option must be one of the options',
  })

const shortAnswerConfig = z.strictObject(
  {
    accepted_answers: z
      .array(requiredText('Accepted answer', 200), { error: 'Accepted answers must be a list' })
      .min(1, 'Provide at least one accepted answer')
      .max(20, 'Provide at most 20 accepted answers'),
    case_sensitive: z.boolean({ error: 'case_sensitive must be true or false' }).default(false),
    // Answers are always graded automatically: the platform has no manual grading workflow.
    requires_manual_grading: z
      .literal(false, { error: 'requires_manual_grading must be false: manual grading is not available' })
      .default(false),
  },
  unexpectedFields,
)

const ANSWER_CONFIG_SCHEMAS = {
  [QuestionType.MULTIPLE_CHOICE_SINGLE]: multipleChoiceSingleConfig,
  [QuestionType.SHORT_ANSWER]: shortAnswerConfig,
}

const unsupportedTypeConfig = z.unknown().refine(() => false, 'This question type is not supported by the question bank')

export function parseAnswerConfig(questionType, answerConfig) {
  return (ANSWER_CONFIG_SCHEMAS[questionType] ?? unsupportedTypeConfig).safeParse(answerConfig)
}

// Lecturer authoring. The concept comes from the URL and the author, reviewer, version and publication fields
// are set by the server, so any such field in the body is dropped.

export const createQuestionSchema = z.object({
  questionText: requiredRichText('Question text', 20_000),
  questionType: z.enum(BANK_QUESTION_TYPES, {
    error: `Question type must be one of: ${BANK_QUESTION_TYPES.join(', ')}`,
  }),
  difficulty: z.enum(DIFFICULTY_LEVELS, { error: `Difficulty must be one of: ${DIFFICULTY_LEVELS.join(', ')}` }),
  bloomLevel: z.enum(BLOOM_LEVELS, { error: `Bloom level must be one of: ${BLOOM_LEVELS.join(', ')}` }),
  answerConfig: z
    .record(z.string(), z.unknown(), { error: 'Answer config must be a JSON object' })
    .refine((value) => JSON.stringify(value).length <= 20_000, 'Answer config is too large'),
  explanation: optionalText('Explanation', 20_000),
  defaultPoints: points('Default points').optional(),
  status: statusOf(CONTENT_STATUSES).optional(),
  sourceId: optionalUuid('Source id'),
  sourceReference: optionalText('Source reference', 1000),
})

export const updateQuestionSchema = atLeastOneField(createQuestionSchema.partial())

// Listing. An empty search is the same as no search.

const listFilters = {
  search: z
    .string({ error: 'Search must be text' })
    .trim()
    .max(MAX_SEARCH_LENGTH, `Search must be at most ${MAX_SEARCH_LENGTH} characters`)
    .optional()
    .transform((value) => value || undefined),
  status: statusOf(CONTENT_STATUSES).optional(),
  questionType: z.enum(QUESTION_TYPES, { error: `Question type must be one of: ${QUESTION_TYPES.join(', ')}` }).optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS, { error: `Difficulty must be one of: ${DIFFICULTY_LEVELS.join(', ')}` }).optional(),
  bloomLevel: z.enum(BLOOM_LEVELS, { error: `Bloom level must be one of: ${BLOOM_LEVELS.join(', ')}` }).optional(),
  ...paginationFields,
}

export const listQuestionsQuerySchema = z.object(listFilters)

export const listCourseQuestionsQuerySchema = z.object({
  ...listFilters,
  conceptId: z.uuid({ error: 'Concept id must be a valid UUID' }).optional(),
})
