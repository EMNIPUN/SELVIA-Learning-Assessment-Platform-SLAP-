import { createContext } from 'react'
import { listLessons } from '../services/api/lesson.api.js'

// A concept's lessons are needed by the course navigation, the lesson's position and the previous/next
// links. While a student moves between lessons they are requested once per concept and shared; a failed
// request is forgotten so it can be retried.
export function createLessonListCache() {
  const lessonsByConcept = new Map()

  return {
    load(conceptId, signal) {
      let lessons = lessonsByConcept.get(conceptId)
      if (!lessons) {
        lessons = listLessons(conceptId)
        lessonsByConcept.set(conceptId, lessons)
        lessons.catch(() => lessonsByConcept.delete(conceptId))
      }
      return untilAborted(lessons, signal)
    },
  }
}

// The shared request is never cancelled, but a caller that stops waiting for it is answered with the same
// AbortError a cancelled request would give, so it never receives a stale result.
function untilAborted(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The request was aborted', 'AbortError'))
    if (signal?.aborted) return abort()
    signal?.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject)
  })
}

export const LessonListCacheContext = createContext(null)
