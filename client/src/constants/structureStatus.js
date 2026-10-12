// The statuses the API accepts for courses, modules, topics and concepts. Students see an item only when it
// and everything above it in the course are PUBLISHED.
export const STRUCTURE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
})

export const STRUCTURE_STATUSES = Object.values(STRUCTURE_STATUS)
