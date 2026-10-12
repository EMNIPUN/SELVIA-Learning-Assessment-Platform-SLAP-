import { ActivityTargetType, ActivityType } from '@prisma/client'

// Activities students can currently report, each with the kind of content it targets. EXERCISE_SUBMITTED is
// recorded by the exercise attempt workflow, and assessment activities will be recorded by theirs.
export const REPORTABLE_ACTIVITY_TARGETS = {
  [ActivityType.LESSON_VIEWED]: ActivityTargetType.LESSON,
  [ActivityType.LESSON_COMPLETED]: ActivityTargetType.LESSON,
  [ActivityType.MATERIAL_VIEWED]: ActivityTargetType.LEARNING_MATERIAL,
  [ActivityType.MATERIAL_DOWNLOADED]: ActivityTargetType.LEARNING_MATERIAL,
  [ActivityType.EXAMPLE_VIEWED]: ActivityTargetType.EXAMPLE,
}

export const REPORTABLE_ACTIVITY_TYPES = Object.keys(REPORTABLE_ACTIVITY_TARGETS)
