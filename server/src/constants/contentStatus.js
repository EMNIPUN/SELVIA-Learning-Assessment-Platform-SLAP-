import { ContentStatus } from '@prisma/client'

export const CONTENT_STATUS = ContentStatus

// Learning content (lessons, materials, examples) uses the full lifecycle.
export const CONTENT_STATUSES = Object.values(ContentStatus)

// UNDER_REVIEW and APPROVED belong to the content review workflow, which is not implemented yet.
export const STRUCTURE_STATUSES = [ContentStatus.DRAFT, ContentStatus.PUBLISHED, ContentStatus.ARCHIVED]
