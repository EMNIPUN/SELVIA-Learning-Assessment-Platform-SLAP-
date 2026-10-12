import { z } from 'zod'
import { STRUCTURE_STATUSES } from '../constants/contentStatus.js'
import {
  atLeastOneField,
  idParams,
  MAX_DESCRIPTION_LENGTH,
  optionalText,
  requiredText,
  sequenceOrder,
  statusOf,
} from './common.schemas.js'

// Stored uppercase so "se3010" and "SE3010" are the same code.
const code = (label, max) =>
  requiredText(label, max)
    .toUpperCase()
    .regex(/^[A-Z0-9-]+$/, `${label} may only contain letters, numbers and hyphens`)

const description = optionalText('Description', MAX_DESCRIPTION_LENGTH)

const status = statusOf(STRUCTURE_STATUSES)

// Courses

export const courseIdParams = idParams('courseId', 'Course id')

export const createCourseSchema = z.object({
  code: code('Course code', 20),
  title: requiredText('Title', 200),
  description,
  credits: z
    .int({ error: 'Credits must be a whole number' })
    .min(1, 'Credits must be at least 1')
    .max(60, 'Credits must be at most 60')
    .nullable()
    .optional(),
  status: status.optional(),
})

export const updateCourseSchema = atLeastOneField(createCourseSchema.partial())

export const listCoursesQuerySchema = z.object({
  mine: z
    .enum(['true', 'false'], { error: 'mine must be true or false' })
    .optional()
    .transform((value) => value === 'true'),
  status: status.optional(),
})

// Modules and topics share the same editable fields; sequenceOrder defaults to the next free position.

const sectionSchema = z.object({
  title: requiredText('Title', 200),
  description,
  sequenceOrder: sequenceOrder.optional(),
  status: status.optional(),
})

export const moduleIdParams = idParams('moduleId', 'Module id')
export const createModuleSchema = sectionSchema
export const updateModuleSchema = atLeastOneField(sectionSchema.partial())

export const topicIdParams = idParams('topicId', 'Topic id')
export const createTopicSchema = sectionSchema
export const updateTopicSchema = atLeastOneField(sectionSchema.partial())

// Concepts

export const conceptIdParams = idParams('conceptId', 'Concept id')

export const createConceptSchema = z.object({
  code: code('Concept code', 100),
  name: requiredText('Name', 200),
  description,
  sequenceOrder: sequenceOrder.optional(),
  status: status.optional(),
})

export const updateConceptSchema = atLeastOneField(createConceptSchema.partial())
