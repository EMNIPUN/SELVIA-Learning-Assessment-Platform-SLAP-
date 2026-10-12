// The statuses the API accepts for learning content (lessons, materials, examples). Students see an item only
// when it is PUBLISHED and everything above it in the course is published too.
export const CONTENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
})

export const CONTENT_STATUSES = Object.values(CONTENT_STATUS)
