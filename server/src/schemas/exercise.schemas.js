import { BloomLevel, DifficultyLevel, ExerciseType } from '@prisma/client'
import { z } from 'zod'
import { CONTENT_STATUSES } from '../constants/contentStatus.js'
import { PRACTICE_EXERCISE_TYPES } from '../constants/exercise.js'
import {
  atLeastOneField,
  idParams,
  optionalText,
  optionalUuid,
  requiredRichText,
  requiredText,
  sequenceOrder,
  statusOf,
} from './common.schemas.js'

const DIFFICULTY_LEVELS = Object.values(DifficultyLevel)
const BLOOM_LEVELS = Object.values(BloomLevel)
const MAX_OPTION_ID_LENGTH = 20
const MAX_ANSWER_LENGTH = 1000

const unexpectedFields = {
  error: (issue) => (issue.code === 'unrecognized_keys' ? `Unexpected field(s): ${issue.keys.join(', ')}` : undefined),
}

export const exerciseIdParams = idParams('exerciseId', 'Exercise id')

// Answer configuration, stored in exercises.answer_config with the keys used by questions.answer_config
// (docs/database-design.md). Its shape depends on the exercise type, so the service validates it against
// the exercise's final type with parseAnswerConfig.

const optionId = z
  .string({ error: 'Option id must be text' })
  .trim()
  .min(1, 'Option id is required')
  .max(MAX_OPTION_ID_LENGTH, `Option id must be at most ${MAX_OPTION_ID_LENGTH} characters`)
  .regex(/^[A-Za-z0-9_-]+$/, 'Option id may only contain letters, digits, hyphens and underscores')

const multipleChoiceConfig = z
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
  },
  unexpectedFields,
)

const ANSWER_CONFIG_SCHEMAS = {
  [ExerciseType.MULTIPLE_CHOICE]: multipleChoiceConfig,
  [ExerciseType.SHORT_ANSWER]: shortAnswerConfig,
}

const unsupportedTypeConfig = z.unknown().refine(() => false, 'This exercise type is not evaluated by the platform')

export function parseAnswerConfig(exerciseType, answerConfig) {
  return (ANSWER_CONFIG_SCHEMAS[exerciseType] ?? unsupportedTypeConfig).safeParse(answerConfig)
}

// Lecturer authoring

export const createExerciseSchema = z.object({
  title: requiredText('Title', 200),
  instructions: requiredRichText('Instructions', 20_000),
  exerciseType: z.enum(PRACTICE_EXERCISE_TYPES, {
    error: `Exercise type must be one of: ${PRACTICE_EXERCISE_TYPES.join(', ')}`,
  }),
  difficulty: z.enum(DIFFICULTY_LEVELS, { error: `Difficulty must be one of: ${DIFFICULTY_LEVELS.join(', ')}` }),
  bloomLevel: z.enum(BLOOM_LEVELS, { error: `Bloom level must be one of: ${BLOOM_LEVELS.join(', ')}` }),
  answerConfig: z
    .record(z.string(), z.unknown(), { error: 'Answer config must be a JSON object' })
    .refine((value) => JSON.stringify(value).length <= 20_000, 'Answer config is too large'),
  solutionExplanation: optionalText('Solution explanation', 20_000),
  maxScore: z
    .number({ error: 'Max score must be a number' })
    .positive('Max score must be greater than 0')
    .max(1000, 'Max score must be at most 1000')
    .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-9, 'Max score can have at most 2 decimal places')
    .optional(),
  estimatedDurationMinutes: z
    .int({ error: 'Estimated duration must be a whole number of minutes' })
    .min(1, 'Estimated duration must be at least 1 minute')
    .max(600, 'Estimated duration must be at most 600 minutes')
    .nullable()
    .optional(),
  sequenceOrder: sequenceOrder.optional(),
  status: statusOf(CONTENT_STATUSES).optional(),
  sourceId: optionalUuid('Source id'),
  sourceReference: optionalText('Source reference', 1000),
})

export const updateExerciseSchema = atLeastOneField(createExerciseSchema.partial())

// Student attempts. Strict: the student always comes from the token, so any extra field (for example
// studentId) is rejected rather than silently ignored.
export const submitExerciseAttemptSchema = z
  .strictObject(
    {
      selectedOptionId: z
        .string({ error: 'Selected option must be text' })
        .trim()
        .min(1, 'Choose one of the options')
        .max(MAX_OPTION_ID_LENGTH, 'Selected option is not valid')
        .optional(),
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
