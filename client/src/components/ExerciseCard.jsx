import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { exerciseTitleId } from '../constants/lessonSections.js'
import { submitExerciseAttempt } from '../services/api/exercise.api.js'
import { getErrorMessage } from '../utils/errorMessages.js'
import { focusById } from '../utils/focus.js'
import { formatEnumLabel } from '../utils/formatters.js'
import AttemptHistory from './AttemptHistory.jsx'
import MarkdownContent from './MarkdownContent.jsx'

// `next` is where Continue leads: { targetId, label }, either the next exercise or the end of the lesson.
function AttemptResult({ attempt, next, onTryAgain }) {
  return (
    <div className={`exercise-result ${attempt.isCorrect ? 'exercise-result-correct' : 'exercise-result-incorrect'}`}>
      <p className="exercise-result-title">
        <span aria-hidden="true">{attempt.isCorrect ? '✓' : '✗'}</span> {attempt.isCorrect ? 'Correct' : 'Not quite'}
      </p>
      <p className="exercise-result-meta">
        Attempt {attempt.attemptNumber}
        {attempt.maxScore != null && ` · Score ${attempt.score} / ${attempt.maxScore}`}
      </p>
      {attempt.feedback && (
        <div className="example-part">
          <h4 className="example-part-title">Explanation</h4>
          <MarkdownContent source={attempt.feedback} />
        </div>
      )}
      <div className="exercise-actions">
        {!attempt.isCorrect && (
          <button type="button" className="button button-secondary button-small" onClick={onTryAgain}>
            Try again
          </button>
        )}
        {next && (
          <button type="button" className="button button-primary button-small" onClick={() => focusById(next.targetId)}>
            {next.label}
          </button>
        )}
      </div>
    </div>
  )
}

// Collects one answer and shows the result the server returns. The server holds the correct answer and
// evaluates every submission, so the card never decides whether an answer is right.
// `onAnswered(exerciseId)` reports that the student has submitted at least one answer, on this visit or before.
export default function ExerciseCard({ exercise, position, next, onAnswered }) {
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attempt, setAttempt] = useState(null)
  const [submittedAttempts, setSubmittedAttempts] = useState([])
  const [error, setError] = useState(null)
  const answerName = useId()
  const formRef = useRef(null)

  const isMultipleChoice = exercise.exerciseType === 'MULTIPLE_CHOICE'
  const locked = submitting || attempt !== null

  // A wrong option is cleared so it is not resubmitted by accident; a typed answer is kept and selected so
  // it can be corrected or replaced. The Try again button disappears, so focus moves to the answer.
  function tryAgain() {
    flushSync(() => {
      setAttempt(null)
      if (isMultipleChoice) setAnswer('')
    })
    const input = formRef.current?.querySelector('input')
    input?.focus()
    if (!isMultipleChoice) input?.select()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const body = isMultipleChoice ? { selectedOptionId: answer } : { answerText: answer.trim() }
      const result = await submitExerciseAttempt(exercise.id, body)
      setAttempt(result)
      setSubmittedAttempts((previous) => [...previous, result])
      onAnswered?.(exercise.id)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="card content-card exercise-card">
      <div className="course-card-header">
        <span className="lesson-label">Exercise {position}</span>
        <span className="content-type">{formatEnumLabel(exercise.exerciseType)}</span>
      </div>
      <h3 id={exerciseTitleId(exercise.id)} className="content-card-title" tabIndex={-1}>
        {exercise.title}
      </h3>
      <MarkdownContent source={exercise.instructions} />

      <form ref={formRef} className="exercise-form" onSubmit={handleSubmit} noValidate>
        {isMultipleChoice ? (
          <fieldset className="exercise-options" disabled={locked}>
            <legend className="visually-hidden">Choose one answer</legend>
            {exercise.options.map((option) => (
              <label key={option.id} className="exercise-option">
                <input
                  type="radio"
                  name={answerName}
                  value={option.id}
                  checked={answer === option.id}
                  onChange={() => setAnswer(option.id)}
                />
                <span>{option.text}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="form-field">
            <span className="form-label">Your answer</span>
            <input
              type="text"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={locked}
              maxLength={1000}
              autoComplete="off"
            />
          </label>
        )}

        {error && (
          <p className="alert alert-error" role="alert">
            Your answer was not submitted. {getErrorMessage(error)}
          </p>
        )}

        {!attempt && (
          <button type="submit" className="button button-primary" disabled={submitting || !answer.trim()}>
            {submitting ? 'Checking…' : 'Submit answer'}
          </button>
        )}
      </form>

      <div role="status" aria-live="polite">
        {attempt && <AttemptResult attempt={attempt} next={next} onTryAgain={tryAgain} />}
      </div>

      <AttemptHistory exerciseId={exercise.id} submittedAttempts={submittedAttempts} onAnswered={onAnswered} />
    </article>
  )
}
