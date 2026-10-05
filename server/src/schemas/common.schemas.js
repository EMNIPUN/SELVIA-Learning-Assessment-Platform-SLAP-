import { z } from 'zod'

export const MAX_DESCRIPTION_LENGTH = 5000
const MAX_SEQUENCE_ORDER = 1000

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

export const statusOf = (values) => z.enum(values, { error: `Status must be one of: ${values.join(', ')}` })

export const atLeastOneField = (schema) =>
  schema.refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  })
