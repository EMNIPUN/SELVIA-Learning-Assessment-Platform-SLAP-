import { useEffect, useId, useState } from 'react'
import { useApiRequest } from '../hooks/useApiRequest.js'
import { listMyExerciseAttempts } from '../services/api/exercise.api.js'
import { formatDateTime } from '../utils/formatters.js'

const COLLAPSED_COUNT = 5

// Attempts loaded from the server plus those submitted on this page, oldest first. Both lists can hold the
// same attempt when a submission finishes while the history is still loading.
function mergeAttempts(loaded, submitted) {
  const byId = new Map([...loaded, ...submitted].map((attempt) => [attempt.id, attempt]))
  return [...byId.values()].sort((a, b) => a.attemptNumber - b.attemptNumber)
}

function AttemptRow({ attempt }) {
  return (
    <li className="attempt-history-item">
      <span className="attempt-history-number">Attempt {attempt.attemptNumber}</span>
      <span className={`attempt-history-result ${attempt.isCorrect ? 'attempt-history-correct' : 'attempt-history-incorrect'}`}>
        <span aria-hidden="true">{attempt.isCorrect ? '✓' : '✗'}</span> {attempt.isCorrect ? 'Correct' : 'Incorrect'}
      </span>
      {attempt.maxScore != null && (
        <span className="attempt-history-score">
          <span className="visually-hidden">Score </span>
          {attempt.score} / {attempt.maxScore}
        </span>
      )}
      <time className="attempt-history-time" dateTime={attempt.submittedAt}>
        {formatDateTime(attempt.submittedAt)}
      </time>
    </li>
  )
}

// The student's own attempts at one exercise. Loading or failing here never blocks answering the exercise.
// `onAnswered(exerciseId)` is called when earlier attempts are found; it must be a stable function.
export default function AttemptHistory({ exerciseId, submittedAttempts, onAnswered }) {
  const { data, error, loading, reload } = useApiRequest(
    (signal) => listMyExerciseAttempts(exerciseId, { signal }),
    [exerciseId],
  )
  const [expanded, setExpanded] = useState(false)
  const headingId = useId()

  useEffect(() => {
    if (data?.length) onAnswered?.(exerciseId)
  }, [data, exerciseId, onAnswered])

  let body
  if (error) {
    body = (
      <div className="attempt-history-message">
        <span>Unable to load your attempt history.</span>
        <button type="button" className="button button-secondary button-small" onClick={reload}>
          Retry
        </button>
      </div>
    )
  } else if (loading && !data) {
    body = <p className="attempt-history-message">Loading your attempts…</p>
  } else {
    const attempts = mergeAttempts(data, submittedAttempts)
    if (attempts.length === 0) return null

    const hiddenCount = expanded ? 0 : Math.max(attempts.length - COLLAPSED_COUNT, 0)
    body = (
      <>
        <ol className="attempt-history-list">
          {attempts.slice(hiddenCount).map((attempt) => (
            <AttemptRow key={attempt.id} attempt={attempt} />
          ))}
        </ol>
        {attempts.length > COLLAPSED_COUNT && (
          <button
            type="button"
            className="button button-secondary button-small"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show recent attempts only' : `Show all ${attempts.length} attempts`}
          </button>
        )}
      </>
    )
  }

  return (
    <section className="attempt-history" aria-labelledby={headingId}>
      <h4 id={headingId} className="attempt-history-title">
        Your attempts
      </h4>
      {body}
    </section>
  )
}
