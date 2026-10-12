import { ApiRequestError } from './api/client.js'
import { recordLearningActivity } from './api/learningActivity.api.js'

// Activity is secondary to learning: it is sent in the background and a failure never reaches the UI.
// Rejected or unreachable requests are expected now and then; anything else is a bug and is logged as one.
// Resolves to whether the activity was recorded, for callers that reflect it in the page.
export function trackActivity(activityType, targetId) {
  return recordLearningActivity({ activityType, targetId }).then(
    () => true,
    (error) => {
      if (error instanceof ApiRequestError) {
        if (import.meta.env.DEV) console.warn(`${activityType} activity was not recorded: ${error.message}`)
        return false
      }
      console.error(`${activityType} activity tracking failed`, error)
      return false
    },
  )
}
