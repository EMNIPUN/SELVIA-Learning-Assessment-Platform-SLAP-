import { z } from 'zod'
import { REPORTABLE_ACTIVITY_TYPES } from '../constants/learningActivity.js'

const MAX_DURATION_SECONDS = 24 * 60 * 60
const MAX_METADATA_LENGTH = 5000
// Allows for client clocks running slightly ahead of the server.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const MAX_LIST_LIMIT = 200

const pastDateTime = (label) =>
  z.iso
    .datetime({ offset: true, error: `${label} must be an ISO 8601 date-time` })
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, `${label} cannot be in the future`)
    .optional()

// Strict: the student, course and concept are never taken from the client, so any extra field
// (for example studentId) is rejected rather than silently ignored.
export const createLearningActivitySchema = z
  .strictObject(
    {
      activityType: z.enum(REPORTABLE_ACTIVITY_TYPES, {
        error: `Activity type must be one of: ${REPORTABLE_ACTIVITY_TYPES.join(', ')}`,
      }),
      targetId: z.uuid({ error: 'Target id must be a valid UUID' }),
      startedAt: pastDateTime('Started at'),
      endedAt: pastDateTime('Ended at'),
      durationSeconds: z
        .int({ error: 'Duration must be a whole number of seconds' })
        .min(0, 'Duration cannot be negative')
        .max(MAX_DURATION_SECONDS, `Duration must be at most ${MAX_DURATION_SECONDS} seconds`)
        .optional(),
      metadata: z
        .record(z.string(), z.unknown(), { error: 'Metadata must be a JSON object' })
        .refine((value) => JSON.stringify(value).length <= MAX_METADATA_LENGTH, 'Metadata is too large')
        .optional(),
    },
    {
      error: (issue) =>
        issue.code === 'unrecognized_keys' ? `Unexpected field(s): ${issue.keys.join(', ')}` : undefined,
    },
  )
  .refine((data) => !data.startedAt || !data.endedAt || data.endedAt >= data.startedAt, {
    path: ['endedAt'],
    message: 'Ended at cannot be before started at',
  })

export const listMyActivitiesQuerySchema = z.object({
  limit: z.coerce
    .number({ error: 'Limit must be a number' })
    .int('Limit must be a whole number')
    .min(1, 'Limit must be at least 1')
    .max(MAX_LIST_LIMIT, `Limit must be at most ${MAX_LIST_LIMIT}`)
    .default(50),
})
