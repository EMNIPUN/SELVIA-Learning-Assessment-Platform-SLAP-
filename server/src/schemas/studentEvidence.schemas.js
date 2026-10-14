import { z } from 'zod'
import { unexpectedFields } from './common.schemas.js'

// Reading a student's current evidence. Filters are optional; null is refused rather than read as "evidence with
// no course" or "no concept", so leaving a filter out is the only way not to filter.
export const currentEvidenceFiltersSchema = z.strictObject(
  {
    studentId: z.uuid({ error: 'Student id must be a valid UUID' }),
    courseId: z.uuid({ error: 'Course id must be a valid UUID' }).optional(),
    conceptId: z.uuid({ error: 'Concept id must be a valid UUID' }).optional(),
  },
  unexpectedFields,
)
