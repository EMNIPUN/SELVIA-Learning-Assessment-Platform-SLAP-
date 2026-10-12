import { ContentSourceType } from '@prisma/client'
import { CONTENT_STATUS } from '../constants/contentStatus.js'
import { ApiError } from '../utils/ApiError.js'

const { DRAFT, UNDER_REVIEW, APPROVED, PUBLISHED } = CONTENT_STATUS

// The stored lifecycle state of content that does not exist yet.
export const NEW_CONTENT = { status: DRAFT, reviewedAt: null, publishedAt: null }

// Returns the lifecycle columns to write when the owner changes a content item's status.
//
// The database requires a reviewer and review time for APPROVED and PUBLISHED content. Until a separate
// review workflow exists, the owning lecturer who approves or publishes is recorded as the reviewer.
// Returning to DRAFT or UNDER_REVIEW clears the review, so the content must be approved again.
// publishedAt records the first publication and is kept afterwards.
export function lifecycleChanges(user, nextStatus, current, sourceType) {
  if (nextStatus === undefined || nextStatus === current.status) {
    return {}
  }

  const isReviewedStatus = nextStatus === APPROVED || nextStatus === PUBLISHED
  const hasBeenReviewed = Boolean(current.reviewedAt)

  // Design rule: AI-generated content must pass through UNDER_REVIEW before it can be approved.
  if (isReviewedStatus && sourceType === ContentSourceType.AI_GENERATED && !hasBeenReviewed && current.status !== UNDER_REVIEW) {
    throw ApiError.conflict('AI-generated content must be set to UNDER_REVIEW before it can be approved or published')
  }

  const now = new Date()
  const changes = { status: nextStatus }

  if (isReviewedStatus && !hasBeenReviewed) {
    changes.reviewedByUserId = user.id
    changes.reviewedAt = now
  }
  if (nextStatus === DRAFT || nextStatus === UNDER_REVIEW) {
    changes.reviewedByUserId = null
    changes.reviewedAt = null
  }
  if (nextStatus === PUBLISHED && !current.publishedAt) {
    changes.publishedAt = now
  }

  return changes
}
