import { z } from 'zod'

export const MAX_DESCRIPTION_LENGTH = 5000
export const MAX_SEQUENCE_ORDER = 1000
const MAX_LIST_LIMIT = 100
const MAX_LIST_OFFSET = 100_000

// For z.strictObject: names the fields that are not accepted instead of silently dropping them.
export const unexpectedFields = {
  error: (issue) => (issue.code === 'unrecognized_keys' ? `Unexpected field(s): ${issue.keys.join(', ')}` : undefined),
}

export const idParams = (key, label) => z.object({ [key]: z.uuid({ error: `${label} must be a valid UUID` }) })

export const requiredText = (label, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`)

// Markdown and code keep their whitespace; they only have to contain something.
export const requiredRichText = (label, max) =>
  z
    .string({ error: `${label} is required` })
    .max(max, `${label} must be at most ${max} characters`)
    .refine((value) => value.trim().length > 0, `${label} is required`)

// Optional, clearable text: an empty string is stored as null.
export const optionalText = (label, max, { trim = true } = {}) => {
  const base = z.string({ error: `${label} must be text` })
  return (trim ? base.trim() : base)
    .max(max, `${label} must be at most ${max} characters`)
    .transform((value) => (value.trim() ? value : null))
    .nullable()
    .optional()
}

export const httpUrl = (label) =>
  z
    .url({ protocol: /^https?$/, error: `${label} must be a valid http or https URL` })
    .max(2048, `${label} must be at most 2048 characters`)

export const optionalUuid = (label) => z.uuid({ error: `${label} must be a valid UUID` }).nullable().optional()

export const sequenceOrder = z
  .int({ error: 'Sequence order must be a whole number' })
  .min(1, 'Sequence order must be at least 1')
  .max(MAX_SEQUENCE_ORDER, `Sequence order must be at most ${MAX_SEQUENCE_ORDER}`)

export const hasAtMostTwoDecimals = (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-9

// Points are stored as numeric(6,2).
export const points = (label) =>
  z
    .number({ error: `${label} must be a number` })
    .positive(`${label} must be greater than 0`)
    .max(1000, `${label} must be at most 1000`)
    .refine(hasAtMostTwoDecimals, `${label} can have at most 2 decimal places`)

export const paginationFields = {
  limit: z.coerce
    .number({ error: 'Limit must be a number' })
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .max(MAX_LIST_LIMIT, `Limit must be at most ${MAX_LIST_LIMIT}`)
    .default(50),
  offset: z.coerce
    .number({ error: 'Offset must be a number' })
    .int('Offset must be a whole number')
    .min(0, 'Offset cannot be negative')
    .max(MAX_LIST_OFFSET, `Offset must be at most ${MAX_LIST_OFFSET}`)
    .default(0),
}

export const statusOf = (values) => z.enum(values, { error: `Status must be one of: ${values.join(', ')}` })

export const atLeastOneField = (schema) =>
  schema.refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })
