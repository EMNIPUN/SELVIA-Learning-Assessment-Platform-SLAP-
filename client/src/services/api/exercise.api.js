import { apiRequest } from './client.js'

// The server identifies the student from the token, evaluates the answer and records the attempt.
// `answer` is { selectedOptionId } for a multiple-choice exercise or { answerText } for a short answer.
// Resolves to { attemptNumber, isCorrect, score, maxScore, feedback, ... }.
export async function submitExerciseAttempt(exerciseId, answer) {
  const { attempt } = await apiRequest(`/exercises/${encodeURIComponent(exerciseId)}/attempts`, {
    method: 'POST',
    body: answer,
  })
  return attempt
}

// The authenticated student's own attempts at one exercise, newest first (at most 50). Same shape as above.
export async function listMyExerciseAttempts(exerciseId, { signal } = {}) {
  const { attempts } = await apiRequest(`/exercises/${encodeURIComponent(exerciseId)}/attempts/me`, { signal })
  return attempts
}
