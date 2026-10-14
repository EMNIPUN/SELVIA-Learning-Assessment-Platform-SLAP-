// The quiz API's availability and attempt status values (server/src/constants/assessment.js), with the
// wording students see for them.

export const QUIZ_AVAILABILITY = Object.freeze({ UPCOMING: 'UPCOMING', OPEN: 'OPEN', CLOSED: 'CLOSED' })

const AVAILABILITY_BADGES = {
  [QUIZ_AVAILABILITY.UPCOMING]: { label: 'Not open yet', className: 'badge-quiz-upcoming' },
  [QUIZ_AVAILABILITY.OPEN]: { label: 'Open', className: 'badge-quiz-open' },
  [QUIZ_AVAILABILITY.CLOSED]: { label: 'Closed', className: 'badge-quiz-closed' },
}

export const availabilityBadge = (availability) => AVAILABILITY_BADGES[availability] ?? null

export const ATTEMPT_STATUS = Object.freeze({
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  AUTO_SUBMITTED: 'AUTO_SUBMITTED',
})

const ATTEMPT_STATUS_LABELS = {
  [ATTEMPT_STATUS.IN_PROGRESS]: 'In progress',
  [ATTEMPT_STATUS.SUBMITTED]: 'Submitted',
  [ATTEMPT_STATUS.AUTO_SUBMITTED]: 'Submitted automatically',
}

export const attemptStatusLabel = (status) => ATTEMPT_STATUS_LABELS[status] ?? status

// Why a quiz without an attempt in progress cannot be started now.
export function unavailableText({ availability, myAttempts }) {
  if (availability === QUIZ_AVAILABILITY.UPCOMING) return 'This quiz is not open yet.'
  if (availability === QUIZ_AVAILABILITY.CLOSED) return 'This quiz has closed.'
  if (myAttempts.remaining === 0) return 'You have used all your attempts.'
  return 'This quiz cannot be started right now.'
}

export const canStartQuiz = (quiz) =>
  !quiz.myAttempts.inProgressAttemptId && quiz.availability === QUIZ_AVAILABILITY.OPEN && quiz.myAttempts.canStart
