import { apiRequest } from './client.js'

// Students taking quizzes. The API identifies the student from the token, decides what each student may see and
// grades every answer, so requests carry only ids and the student's own response. Students see the published
// quizzes of published courses; anything else, and other students' attempts, answer 404. Nothing returned reveals
// correct answers: questions are listed only while an attempt is open, and a closed attempt shows only its result,
// once released.
//
// Reads take an AbortSignal. Starting, saving, clearing and submitting take none: a change the student made must
// still reach the server when the component that sent it unmounts.

// An empty id would build another endpoint's path, so it is refused before any request is made.
function requiredId(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} is required`)
  }
  return encodeURIComponent(value)
}

const quizPath = (assessmentId) => `/quizzes/${requiredId(assessmentId, 'Quiz id')}`
const attemptPath = (attemptId) => `/assessment-attempts/${requiredId(attemptId, 'Attempt id')}`
const answerPath = (attemptId, assessmentQuestionId) =>
  `${attemptPath(attemptId)}/answers/${requiredId(assessmentQuestionId, 'Question id')}`

// The body a save sends: exactly one of { selectedOptionId } (MULTIPLE_CHOICE_SINGLE) or { answerText }
// (SHORT_ANSWER), and nothing else. The API rejects any other field. An empty answer is cleared, not saved.
function toAnswerBody(response) {
  const { selectedOptionId, answerText } = response ?? {}
  const hasOption = selectedOptionId !== undefined
  const hasText = answerText !== undefined
  if (hasOption === hasText) {
    throw new TypeError('An answer needs either selectedOptionId or answerText')
  }
  if (hasOption) {
    if (typeof selectedOptionId !== 'string' || selectedOptionId === '') {
      throw new TypeError('selectedOptionId must be a non-empty string')
    }
    return { selectedOptionId }
  }
  if (typeof answerText !== 'string' || answerText.trim() === '') {
    throw new TypeError('answerText must contain text; use clearQuizAnswer to remove an answer')
  }
  return { answerText }
}

// The published quizzes of a published course, in creation order. Each quiz: { id, courseId, moduleId, topicId,
// title, description, instructions (Markdown), timeLimitMinutes, maxAttempts, passPercentage, availableFrom,
// availableUntil, availability (UPCOMING, OPEN or CLOSED), questionCount, totalPoints, myAttempts: { used,
// remaining, inProgressAttemptId, canStart, latestResult } }. latestResult is null or { attemptId, attemptNumber,
// submittedAt, totalScore, maxScore, percentage, passed, releasedAt }. 404 when the course is not available.
export async function listStudentCourseQuizzes(courseId, { signal } = {}) {
  const { quizzes } = await apiRequest(`/courses/${requiredId(courseId, 'Course id')}/quizzes`, { signal })
  return quizzes
}

// A quiz as listed above, plus `attempts`: the student's own attempts, newest first, each { id, attemptNumber,
// status, startedAt, expiresAt, submittedAt, timeSpentSeconds, result }. `result` is null until the attempt is
// closed and its result released, then { totalScore, maxScore, percentage, passed, releasedAt }.
export async function getStudentQuiz(assessmentId, { signal } = {}) {
  const { quiz } = await apiRequest(quizPath(assessmentId), { signal })
  return quiz
}

// Resumes the student's open attempt or starts the next one. Resolves to { attempt, resumed }, the attempt as
// getQuizAttempt returns it. Refused (409) when the quiz is not open yet (details field availableFrom), has closed
// (availableUntil), the attempts are used up (maxAttempts) or the quiz cannot be attempted (questions).
export async function startQuizAttempt(assessmentId) {
  const { attempt, resumed } = await apiRequest(`${quizPath(assessmentId)}/attempts`, { method: 'POST' })
  return { attempt, resumed }
}

// { id, attemptNumber, status (IN_PROGRESS, SUBMITTED or AUTO_SUBMITTED), startedAt, expiresAt (null when
// untimed), submittedAt, timeSpentSeconds, result, quiz: { id, title, timeLimitMinutes }, timeRemainingSeconds
// (null unless open and timed), questionCount, answeredCount, totalPoints, questions }. `questions` is null once
// the attempt is closed; while it is open, each is { id (the assessmentQuestionId used to save an answer),
// position, sectionLabel, points, questionType, questionText (Markdown), options (MULTIPLE_CHOICE_SINGLE only:
// [{ id, text }]), response: null, { selectedOptionId } or { answerText } }.
// An attempt whose time is up is submitted automatically when it is read.
export async function getQuizAttempt(attemptId, { signal } = {}) {
  const { attempt } = await apiRequest(attemptPath(attemptId), { signal })
  return attempt
}

// `response`: { selectedOptionId } or { answerText }. Resolves to { answer: { assessmentQuestionId, response,
// answeredAt }, progress: { attemptId, questionCount, answeredCount, expiresAt, timeRemainingSeconds } }; the
// server trims answer text, so `response` is what it stored. Saving the stored response again changes nothing.
// Refused with 400 for the wrong field or an option the question does not have, 404 for a question outside the
// attempt, and 409 when the attempt is closed (isAttemptClosedError) or its time is up (isAttemptTimedOutError).
export async function saveQuizAnswer(attemptId, assessmentQuestionId, response) {
  const path = answerPath(attemptId, assessmentQuestionId)
  return apiRequest(path, { method: 'PUT', body: toAnswerBody(response) })
}

// Removes the answer; clearing an unanswered question changes nothing. Same result and refusals as saveQuizAnswer.
export async function clearQuizAnswer(attemptId, assessmentQuestionId) {
  return apiRequest(answerPath(attemptId, assessmentQuestionId), { method: 'DELETE' })
}

// Submits the attempt and resolves to it as getQuizAttempt returns it, now closed. Submitting again changes
// nothing. An attempt whose time is up is closed as AUTO_SUBMITTED at its deadline instead.
export async function submitQuizAttempt(attemptId) {
  const { attempt } = await apiRequest(`${attemptPath(attemptId)}/submit`, { method: 'POST' })
  return attempt
}

// The 409 refusals of saving and clearing, told apart by the field the API names in their details.
const conflictField = (err) => (err?.status === 409 ? err.details?.[0]?.field : undefined)

export const isAttemptClosedError = (err) => conflictField(err) === 'attemptId'
export const isAttemptTimedOutError = (err) => conflictField(err) === 'expiresAt'
