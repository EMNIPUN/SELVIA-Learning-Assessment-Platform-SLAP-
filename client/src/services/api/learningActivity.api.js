import { apiRequest } from './client.js'

// The backend identifies the student from the token and derives the target type, course, concept and time,
// so the body only names what was done and to which lesson, material or example.
export async function recordLearningActivity({ activityType, targetId }) {
  const { activity } = await apiRequest('/learning-activities', { method: 'POST', body: { activityType, targetId } })
  return activity
}

// The signed-in student's own activity, newest first. `limit`: 1–200 (the API's default is 50).
export async function listMyActivities({ limit, signal } = {}) {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : ''
  const { activities } = await apiRequest(`/learning-activities/me${query}`, { signal })
  return activities
}
