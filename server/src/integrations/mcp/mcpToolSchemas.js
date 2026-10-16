import { z } from 'zod'
import { listMyActivitiesQuerySchema } from '../../schemas/learningActivity.schemas.js'
import { unexpectedFields } from '../../schemas/common.schemas.js'

// Tutor-facing MCP tool inputs. Identity fields are never accepted; studentId is injected from AuthInfo.

export const getCurrentEvidenceToolInputSchema = z.strictObject(
  {
    courseId: z.uuid({ error: 'Course id must be a valid UUID' }).optional(),
    conceptId: z.uuid({ error: 'Concept id must be a valid UUID' }).optional(),
  },
  unexpectedFields,
)

// Same filters as GET /learning-activities/me (defaults, limits, inclusive date bounds, no studentId).
export const getLearningActivitiesToolInputSchema = listMyActivitiesQuerySchema
