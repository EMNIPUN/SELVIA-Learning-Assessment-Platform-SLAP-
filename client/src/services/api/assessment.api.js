import { apiRequest, queryString } from './client.js'

// Lecturer quiz management. Every endpoint is limited to the lecturer who owns the course. Quiz details include
// the questions' correct answers; attempts are only counted, and student answers and results are never returned.
// Once students have attempted a quiz, adding, removing, re-weighting and reordering its questions, and deleting
// it, are refused (409).

// `filters`: search (in the title), status, limit (1–100, default 50) and offset. Newest first.
// Returns { assessments, pagination: { total, limit, offset } }; each quiz has questionCount and attemptCount.
export function listCourseQuizzes(courseId, filters = {}, { signal } = {}) {
  return apiRequest(`/courses/${encodeURIComponent(courseId)}/assessments${queryString(filters)}`, { signal })
}

// The quiz with totalPoints and its questions in sequence order: { id, questionId, sequenceOrder, points,
// sectionLabel, question: { questionText, questionType, difficulty, bloomLevel, defaultPoints, status, concept, … } }.
export async function getQuiz(assessmentId, { signal } = {}) {
  const { assessment } = await apiRequest(`/assessments/${encodeURIComponent(assessmentId)}`, { signal })
  return assessment
}

// `fields`: title, description, instructions (Markdown), timeLimitMinutes, maxAttempts, passPercentage,
// shuffleQuestions, availableFrom, availableUntil (ISO date-times). The API sets the type (QUIZ), the release
// policy, the course, the author and the publication date, and starts every quiz as a draft.
export async function createQuiz(courseId, fields) {
  const { assessment } = await apiRequest(`/courses/${encodeURIComponent(courseId)}/assessments`, {
    method: 'POST',
    body: fields,
  })
  return assessment
}

// `changes`: any of the createQuiz fields, or status (DRAFT, PUBLISHED or ARCHIVED). Publishing is refused (400)
// unless the quiz has questions that are all still approved or published, gradable and in the course.
// Returns the quiz without its questions.
export async function updateQuiz(assessmentId, changes) {
  const { assessment } = await apiRequest(`/assessments/${encodeURIComponent(assessmentId)}`, {
    method: 'PATCH',
    body: changes,
  })
  return assessment
}

export async function deleteQuiz(assessmentId) {
  await apiRequest(`/assessments/${encodeURIComponent(assessmentId)}`, { method: 'DELETE' })
}

const questionsPath = (assessmentId) => `/assessments/${encodeURIComponent(assessmentId)}/questions`

// `fields`: questionId, optional points (default: the question's default points), sequenceOrder (default: after
// the last question) and sectionLabel. Refused when the question is not an approved or published question of the
// course (400), or is already in the quiz or the position is taken (409).
export async function addQuizQuestion(assessmentId, fields) {
  const { assessmentQuestion } = await apiRequest(questionsPath(assessmentId), { method: 'POST', body: fields })
  return assessmentQuestion
}

// `changes`: points, sequenceOrder and/or sectionLabel. A position in use by another question is refused (409).
export async function updateQuizQuestion(assessmentId, assessmentQuestionId, changes) {
  const { assessmentQuestion } = await apiRequest(
    `${questionsPath(assessmentId)}/${encodeURIComponent(assessmentQuestionId)}`,
    { method: 'PATCH', body: changes },
  )
  return assessmentQuestion
}

export async function removeQuizQuestion(assessmentId, assessmentQuestionId) {
  await apiRequest(`${questionsPath(assessmentId)}/${encodeURIComponent(assessmentQuestionId)}`, { method: 'DELETE' })
}
