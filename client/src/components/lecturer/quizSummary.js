import { CONTENT_STATUS } from '../../constants/contentStatus.js'
import { ApiRequestError } from '../../services/api/client.js'
import { formatDateTime } from '../../utils/formatters.js'

const { DRAFT, PUBLISHED, ARCHIVED } = CONTENT_STATUS

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

export const questionCountText = (count) => plural(count, 'question')
export const pointsText = (points) => plural(points, 'point')

export const timeLimitText = (minutes) => (minutes == null ? 'No time limit' : `Time limit ${plural(minutes, 'minute')}`)

export const attemptsText = (maxAttempts) =>
  maxAttempts == null ? 'Unlimited attempts' : `${plural(maxAttempts, 'attempt')} allowed`

export const passMarkText = (percentage) => (percentage == null ? 'No pass mark' : `Pass mark ${percentage}%`)

export function availabilityText({ availableFrom, availableUntil }) {
  if (availableFrom && availableUntil) {
    return `Available ${formatDateTime(availableFrom)} – ${formatDateTime(availableUntil)}`
  }
  if (availableFrom) return `Opens ${formatDateTime(availableFrom)}`
  if (availableUntil) return `Closes ${formatDateTime(availableUntil)}`
  return 'No availability window'
}

// The status changes offered for each status. The API accepts any of them; publishing is checked there.
const STATUS_TARGETS = {
  [DRAFT]: [PUBLISHED, ARCHIVED],
  [PUBLISHED]: [DRAFT, ARCHIVED],
  [ARCHIVED]: [PUBLISHED, DRAFT],
}

export const quizStatusTargets = (status) => STATUS_TARGETS[status] ?? []

// Attempts keep the answers and scores of the questions as they were, so the API freezes the question set.
export const FROZEN_EXPLANATION =
  'Once students have started attempting a quiz, its questions cannot be added, removed, re-weighted or reordered, so that their answers and scores keep their meaning. Section labels and the quiz settings can still be changed.'

// A 409 because the quiz has attempts gets the explanation added to the API's message.
export function explainFrozen(err) {
  if (err?.status !== 409 || !err.details?.some((detail) => detail.resource === 'attempts')) return err
  return new ApiRequestError(err.status, `${err.message}. ${FROZEN_EXPLANATION}`, err.details)
}

export const isFrozenError = (err) => err?.status === 409 && err.details?.some((detail) => detail.resource === 'attempts')
