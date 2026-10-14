import { apiRequest, queryString } from './client.js'

// The question bank. Every endpoint is limited to the lecturer who owns the course: questions include their
// correct answers (answerConfig) and explanation, and students never receive them from the bank.

// `filters`: search (in the question text), status, questionType, difficulty, bloomLevel, limit (1–100, default
// 50) and offset; course listings also accept conceptId. Empty values are not sent.
// Newest first. Returns { questions, pagination: { total, limit, offset } }.
export function listConceptQuestions(conceptId, filters = {}, { signal } = {}) {
  return apiRequest(`/concepts/${encodeURIComponent(conceptId)}/questions${queryString(filters)}`, { signal })
}

// Like listConceptQuestions for the whole course; each question also includes its concept { id, code, name }.
// A conceptId outside the course is refused (400).
export function listCourseQuestions(courseId, filters = {}, { signal } = {}) {
  return apiRequest(`/courses/${encodeURIComponent(courseId)}/questions${queryString(filters)}`, { signal })
}

export async function getQuestion(questionId, { signal } = {}) {
  const { question } = await apiRequest(`/questions/${encodeURIComponent(questionId)}`, { signal })
  return question
}

// `fields`: questionText (Markdown), questionType, answerConfig (its shape depends on the type), explanation,
// difficulty, bloomLevel, defaultPoints (default 1). The API sets the author, review and publication fields and
// starts every question as a draft; statuses change through updateQuestion with { status }.
export async function createQuestion(conceptId, fields) {
  const { question } = await apiRequest(`/concepts/${encodeURIComponent(conceptId)}/questions`, {
    method: 'POST',
    body: fields,
  })
  return question
}

// `changes`: any of the createQuestion fields, or status; at least one is required. A new questionType must come
// with an answerConfig of that type. Refused (409) when the text, type or answers change while an assessment
// uses the question.
export async function updateQuestion(questionId, changes) {
  const { question } = await apiRequest(`/questions/${encodeURIComponent(questionId)}`, {
    method: 'PATCH',
    body: changes,
  })
  return question
}

// Refused (409) while an assessment, a learning activity or a later version of the question refers to it.
export async function deleteQuestion(questionId) {
  await apiRequest(`/questions/${encodeURIComponent(questionId)}`, { method: 'DELETE' })
}
