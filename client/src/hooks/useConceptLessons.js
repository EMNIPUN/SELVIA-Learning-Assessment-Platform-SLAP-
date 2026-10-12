import { useContext } from 'react'
import { LessonListCacheContext } from '../context/LessonListCache.js'
import { listLessons } from '../services/api/lesson.api.js'
import { useApiRequest } from './useApiRequest.js'

// The published lessons of a concept, in sequence order, shared through the lesson page's cache when there
// is one. Without a concept id the result is null.
export function useConceptLessons(conceptId) {
  const cache = useContext(LessonListCacheContext)
  return useApiRequest((signal) => {
    if (!conceptId) return Promise.resolve(null)
    return cache ? cache.load(conceptId, signal) : listLessons(conceptId, { signal })
  }, [conceptId, cache])
}
