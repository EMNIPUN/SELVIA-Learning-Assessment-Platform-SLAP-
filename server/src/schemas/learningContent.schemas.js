import { ContentSourceType, ExampleType, MaterialType } from '@prisma/client'
import { z } from 'zod'
import { CONTENT_STATUSES } from '../constants/contentStatus.js'
import {
  atLeastOneField,
  httpUrl,
  idParams,
  MAX_DESCRIPTION_LENGTH,
  optionalText,
  optionalUuid,
  requiredRichText,
  requiredText,
  sequenceOrder,
  statusOf,
} from './common.schemas.js'

const MATERIAL_TYPES = Object.values(MaterialType)
const EXAMPLE_TYPES = Object.values(ExampleType)
const SOURCE_TYPES = Object.values(ContentSourceType)

const status = statusOf(CONTENT_STATUSES)

// Every content item can cite a ContentSource plus where in it the content comes from.
const provenance = {
  sourceId: optionalUuid('Source id'),
  sourceReference: optionalText('Source reference', 1000),
}

// Lessons

export const lessonIdParams = idParams('lessonId', 'Lesson id')

export const createLessonSchema = z.object({
  title: requiredText('Title', 200),
  summary: optionalText('Summary', 2000),
  body: requiredRichText('Body', 100_000),
  estimatedDurationMinutes: z
    .int({ error: 'Estimated duration must be a whole number of minutes' })
    .min(1, 'Estimated duration must be at least 1 minute')
    .max(600, 'Estimated duration must be at most 600 minutes')
    .nullable()
    .optional(),
  sequenceOrder: sequenceOrder.optional(),
  status: status.optional(),
  ...provenance,
})

export const updateLessonSchema = atLeastOneField(createLessonSchema.partial())

// Learning materials. Files are stored outside the database: a material holds either an external URL
// or a storage key. The "exactly one" rule is checked in the service against the stored values too.

export const materialIdParams = idParams('materialId', 'Material id')

export const createMaterialSchema = z.object({
  title: requiredText('Title', 200),
  description: optionalText('Description', MAX_DESCRIPTION_LENGTH),
  materialType: z.enum(MATERIAL_TYPES, { error: `Material type must be one of: ${MATERIAL_TYPES.join(', ')}` }),
  externalUrl: httpUrl('External URL').nullable().optional(),
  fileStorageKey: optionalText('File storage key', 1024),
  mimeType: z
    .string({ error: 'MIME type must be text' })
    .trim()
    .toLowerCase()
    .max(100, 'MIME type must be at most 100 characters')
    .regex(/^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/, 'MIME type must look like type/subtype, for example application/pdf')
    .nullable()
    .optional(),
  fileSizeBytes: z
    .int({ error: 'File size must be a whole number of bytes' })
    .min(0, 'File size cannot be negative')
    .max(Number.MAX_SAFE_INTEGER, 'File size is too large')
    .nullable()
    .optional(),
  sequenceOrder: sequenceOrder.optional(),
  status: status.optional(),
  ...provenance,
})

export const updateMaterialSchema = atLeastOneField(createMaterialSchema.partial())

// Examples

export const exampleIdParams = idParams('exampleId', 'Example id')

export const createExampleSchema = z.object({
  title: requiredText('Title', 200),
  exampleType: z.enum(EXAMPLE_TYPES, { error: `Example type must be one of: ${EXAMPLE_TYPES.join(', ')}` }),
  problemStatement: optionalText('Problem statement', 10_000),
  content: requiredRichText('Content', 50_000),
  explanation: optionalText('Explanation', 20_000),
  codeSnippet: optionalText('Code snippet', 20_000, { trim: false }),
  programmingLanguage: optionalText('Programming language', 50),
  sequenceOrder: sequenceOrder.optional(),
  status: status.optional(),
  ...provenance,
})

export const updateExampleSchema = atLeastOneField(createExampleSchema.partial())

// Content sources (provenance records). Type-specific rules are checked in the service.

export const sourceIdParams = idParams('sourceId', 'Source id')

export const createContentSourceSchema = z.object({
  sourceType: z.enum(SOURCE_TYPES, { error: `Source type must be one of: ${SOURCE_TYPES.join(', ')}` }),
  title: requiredText('Title', 300),
  authors: optionalText('Authors', 1000),
  publisher: optionalText('Publisher', 200),
  publicationYear: z
    .int({ error: 'Publication year must be a whole number' })
    .min(1450, 'Publication year must be 1450 or later')
    .max(new Date().getFullYear() + 1, 'Publication year cannot be in the future')
    .nullable()
    .optional(),
  edition: optionalText('Edition', 50),
  url: httpUrl('URL').nullable().optional(),
  isbnOrDoi: optionalText('ISBN or DOI', 100),
  license: optionalText('License', 100),
  citation: optionalText('Citation', 5000),
  generationMetadata: z
    .record(z.string(), z.unknown(), { error: 'Generation metadata must be a JSON object' })
    .refine((value) => JSON.stringify(value).length <= 10_000, 'Generation metadata is too large')
    .nullable()
    .optional(),
  accessedAt: z.iso
    .datetime({ offset: true, error: 'Accessed at must be an ISO 8601 date-time' })
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
  notes: optionalText('Notes', 5000),
})

export const updateContentSourceSchema = atLeastOneField(createContentSourceSchema.partial())

export const listContentSourcesQuerySchema = z.object({
  sourceType: z.enum(SOURCE_TYPES, { error: `Source type must be one of: ${SOURCE_TYPES.join(', ')}` }).optional(),
})
