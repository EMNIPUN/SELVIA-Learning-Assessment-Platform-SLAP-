import { z } from 'zod'
import { MAX_ISSUER_LENGTH, MAX_SUBJECT_LENGTH } from '../constants/externalIdentity.js'
import { TUTOR_TOKEN_MAX_LIFETIME_SECONDS } from '../integrations/mcp/tutorToken.js'
import { requiredText, unexpectedFields } from './common.schemas.js'

export const DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS = 300

export const issueTutorAccessTokenSchema = z.strictObject(
  {
    issuer: requiredText('Issuer', MAX_ISSUER_LENGTH),
    subject: requiredText('Subject', MAX_SUBJECT_LENGTH),
    expiresInSeconds: z
      .int({ error: 'expiresInSeconds must be a whole number' })
      .min(1, 'expiresInSeconds must be at least 1')
      .max(
        TUTOR_TOKEN_MAX_LIFETIME_SECONDS,
        `expiresInSeconds must be at most ${TUTOR_TOKEN_MAX_LIFETIME_SECONDS}`,
      )
      .optional()
      .default(DEFAULT_TUTOR_ACCESS_TOKEN_LIFETIME_SECONDS),
  },
  unexpectedFields,
)
