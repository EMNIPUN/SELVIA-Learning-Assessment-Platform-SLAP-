import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router'
import Dialog from '../../components/Dialog.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import MarkdownContent from '../../components/MarkdownContent.jsx'
import QuizAvailabilityBadge from '../../components/QuizAvailabilityBadge.jsx'
import QuizResult from '../../components/QuizResult.jsx'
import {
  attemptsText as allowedAttemptsText,
  availabilityText,
  passMarkText,
  pointsText,
  questionCountText,
  timeLimitText,
} from '../../components/lecturer/quizSummary.js'
import { ATTEMPT_STATUS, attemptStatusLabel, canStartQuiz, unavailableText } from '../../components/studentQuizStatus.js'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { getStudentQuiz, startQuizAttempt } from '../../services/api/studentQuiz.api.js'
import { getActionErrorMessage } from '../../utils/errorMessages.js'
import { formatDateTime } from '../../utils/formatters.js'

const HEADING_ID = 'quiz-details-heading'
const START_HEADING_ID = 'quiz-start-heading'
const INSTRUCTIONS_HEADING_ID = 'quiz-instructions-heading'
const ATTEMPTS_HEADING_ID = 'quiz-attempts-heading'

const minutesText = (minutes) => `${minutes} minute${minutes === 1 ? '' : 's'}`

// The course is known only once the quiz has loaded; until then the way back is My Courses.
function BackLink({ courseId }) {
  if (!courseId) {
    return (
      <Link to={ROUTES.STUDENT_COURSES} className="back-link">
        ← Back to My Courses
      </Link>
    )
  }
  return (
    <Link to={ROUTES.studentCourse(courseId)} className="back-link">
      ← Back to course
    </Link>
  )
}

function QuizSettings({ quiz }) {
  return (
    <ul className="quiz-settings-list" aria-label="Quiz settings">
      <li>{questionCountText(quiz.questionCount)}</li>
      <li>{pointsText(quiz.totalPoints)}</li>
      <li>{timeLimitText(quiz.timeLimitMinutes)}</li>
      <li>{allowedAttemptsText(quiz.maxAttempts)}</li>
      <li>{passMarkText(quiz.passPercentage)}</li>
      <li>{availabilityText(quiz)}</li>
    </ul>
  )
}

function attemptsUsedText({ maxAttempts, myAttempts }) {
  const { used } = myAttempts
  if (maxAttempts == null) return `You have used ${used} attempt${used === 1 ? '' : 's'}. There is no attempt limit.`
  return `You have used ${used} of ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}.`
}

// A result appears only once the attempt is closed and the API has released it; nothing is inferred here.
function AttemptRow({ attempt }) {
  const inProgress = attempt.status === ATTEMPT_STATUS.IN_PROGRESS

  return (
    <li className="quiz-attempt">
      <span className="quiz-attempt-number">Attempt {attempt.attemptNumber}</span>
      <span className="quiz-attempt-status">{attemptStatusLabel(attempt.status)}</span>
      <span className="quiz-attempt-time">
        {inProgress ? (
          <>
            Started <time dateTime={attempt.startedAt}>{formatDateTime(attempt.startedAt)}</time>
          </>
        ) : (
          attempt.submittedAt && (
            <>
              Submitted <time dateTime={attempt.submittedAt}>{formatDateTime(attempt.submittedAt)}</time>
            </>
          )
        )}
      </span>
      {!inProgress && (
        <span className="quiz-attempt-result">
          {attempt.result ? <QuizResult result={attempt.result} /> : <span className="muted">Result not available yet</span>}
        </span>
      )}
    </li>
  )
}

function AttemptList({ attempts }) {
  if (attempts.length === 0) return <EmptyState title="You have not attempted this quiz yet." />
  const newestFirst = [...attempts].sort((a, b) => b.attemptNumber - a.attemptNumber)

  return (
    <ul className="quiz-attempt-list">
      {newestFirst.map((attempt) => (
        <AttemptRow key={attempt.id} attempt={attempt} />
      ))}
    </ul>
  )
}

function StartError({ error, alertRef }) {
  return (
    <p ref={alertRef} className="alert alert-error" role="alert" tabIndex={-1}>
      The attempt was not started. {getActionErrorMessage(error)}
    </p>
  )
}

// Asked before a timed attempt starts, because its timer cannot be paused once it does.
function StartTimedAttemptDialog({ quiz, startable, starting, refreshing, error, alertRef, onConfirm, onClose }) {
  return (
    <Dialog title="Start this attempt?" onClose={onClose} busy={starting} size="narrow">
      <div className="dialog-body">
        <p>
          This quiz has a time limit of {minutesText(quiz.timeLimitMinutes)}. The timer starts as soon as the attempt
          starts and keeps running even if you leave the page.
        </p>
        <p>When the time is up, the attempt is submitted automatically with the answers you have saved.</p>
        {quiz.availableUntil && (
          <p>The attempt also ends when the quiz closes on {formatDateTime(quiz.availableUntil)}.</p>
        )}
        {quiz.maxAttempts != null && (
          <p>
            This will be attempt {quiz.myAttempts.used + 1} of {quiz.maxAttempts}.
          </p>
        )}
        {error && <StartError error={error} alertRef={alertRef} />}
      </div>

      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onClose} disabled={starting}>
          {startable ? 'Cancel' : 'Close'}
        </button>
        {startable && (
          <button type="button" className="button button-primary" onClick={onConfirm} disabled={starting || refreshing}>
            {starting ? 'Starting…' : 'Start attempt'}
          </button>
        )}
      </div>
    </Dialog>
  )
}

// Resume links to the attempt already in progress; only Start asks the API for an attempt, once per click.
// `refreshing` is true while the quiz is reloaded after a refusal, when its state may be out of date.
function QuizStart({ quiz, refreshing, onRefresh, headingRef }) {
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const startingRef = useRef(false)
  const mountedRef = useRef(false)
  const startButtonRef = useRef(null)
  const alertRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const { inProgressAttemptId } = quiz.myAttempts
  const inProgressAttempt = inProgressAttemptId && quiz.attempts.find((attempt) => attempt.id === inProgressAttemptId)
  const startable = canStartQuiz(quiz)
  const timed = quiz.timeLimitMinutes != null

  async function start() {
    if (startingRef.current) return
    startingRef.current = true
    setStarting(true)
    setError(null)
    let attempt
    try {
      ;({ attempt } = await startQuizAttempt(quiz.id))
    } catch (err) {
      startingRef.current = false
      if (!mountedRef.current) return
      flushSync(() => {
        setError(err)
        setStarting(false)
      })
      alertRef.current?.focus()
      // The quiz or the student's attempts changed since the page loaded: show them as they are now.
      if (err.status === 409 || err.status === 404) onRefresh()
      return
    }
    // A student who has already left the page finds the attempt under Resume instead.
    if (mountedRef.current) navigate(ROUTES.studentAttempt(attempt.id))
  }

  function requestStart() {
    if (!timed) {
      start()
      return
    }
    setError(null)
    setConfirming(true)
  }

  // Focus returns to the Start button when it is still there; otherwise it goes to the page title.
  function closeDialog() {
    flushSync(() => setConfirming(false))
    if (!startButtonRef.current) headingRef.current?.focus()
  }

  let body
  if (inProgressAttemptId) {
    body = (
      <>
        <p>
          You have an attempt in progress.
          {inProgressAttempt?.expiresAt && ` It must be finished by ${formatDateTime(inProgressAttempt.expiresAt)}.`}
        </p>
        <div className="quiz-start-actions">
          <Link to={ROUTES.studentAttempt(inProgressAttemptId)} className="button button-primary">
            Resume attempt
          </Link>
        </div>
      </>
    )
  } else if (startable) {
    body = (
      <>
        {timed && <p>The timer starts as soon as you start the attempt.</p>}
        {quiz.availableUntil && (
          <p className="muted">
            An attempt still open when the quiz closes on {formatDateTime(quiz.availableUntil)} is submitted
            automatically.
          </p>
        )}
        <div className="quiz-start-actions">
          <button
            ref={startButtonRef}
            type="button"
            className="button button-primary"
            onClick={requestStart}
            disabled={starting || refreshing}
          >
            {starting && !confirming ? 'Starting…' : 'Start attempt'}
          </button>
        </div>
      </>
    )
  } else {
    body = <p className="quiz-start-status">{unavailableText(quiz)}</p>
  }

  return (
    <section className="page-section quiz-start-panel" aria-labelledby={START_HEADING_ID}>
      <h2 id={START_HEADING_ID}>Take the quiz</h2>
      <p>{attemptsUsedText(quiz)}</p>
      {body}
      {error && !confirming && <StartError error={error} alertRef={alertRef} />}

      {confirming && (
        <StartTimedAttemptDialog
          quiz={quiz}
          startable={startable}
          starting={starting}
          refreshing={refreshing}
          error={error}
          alertRef={alertRef}
          onConfirm={start}
          onClose={closeDialog}
        />
      )}
    </section>
  )
}

function QuizView({ quiz, refreshing, onRefresh }) {
  const headingRef = useRef(null)
  const hasInstructions = Boolean(quiz.instructions?.trim())

  return (
    <section className="page quiz-details">
      <BackLink courseId={quiz.courseId} />

      <header className="page-header quiz-details-header">
        <div className="quiz-details-labels">
          <span className="lesson-label">Quiz</span>
          {quiz.myAttempts.inProgressAttemptId && <span className="badge badge-quiz-in-progress">In progress</span>}
          <QuizAvailabilityBadge availability={quiz.availability} />
        </div>
        <h1 id={HEADING_ID} ref={headingRef} tabIndex={-1}>
          {quiz.title}
        </h1>
        {quiz.description && <p className="page-subtitle">{quiz.description}</p>}
        <QuizSettings quiz={quiz} />
      </header>

      {hasInstructions && (
        <section className="page-section" aria-labelledby={INSTRUCTIONS_HEADING_ID}>
          <h2 id={INSTRUCTIONS_HEADING_ID}>Instructions</h2>
          <MarkdownContent source={quiz.instructions} className="quiz-details-instructions" />
        </section>
      )}

      <QuizStart quiz={quiz} refreshing={refreshing} onRefresh={onRefresh} headingRef={headingRef} />

      <section className="page-section" aria-labelledby={ATTEMPTS_HEADING_ID}>
        <h2 id={ATTEMPTS_HEADING_ID}>Previous attempts</h2>
        <AttemptList attempts={quiz.attempts} />
      </section>
    </section>
  )
}

function QuizDetailsView({ assessmentId }) {
  const { data: quiz, error, loading, reload } = useApiRequest(
    (signal) => getStudentQuiz(assessmentId, { signal }),
    [assessmentId],
  )

  // A reload keeps the quiz on screen, so a refusal shown beside it stays readable while the page catches up.
  if (loading && !quiz) {
    return (
      <section className="page">
        <BackLink />
        <LoadingState message="Loading quiz…" />
      </section>
    )
  }

  // The API answers 404 for missing, unpublished or hidden quizzes and 400 for a malformed id.
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <section className="page">
        <BackLink />
        <EmptyState title="Quiz not found">
          <p>This quiz does not exist or is not available to you.</p>
        </EmptyState>
      </section>
    )
  }

  if (error) {
    return (
      <section className="page">
        <BackLink />
        <ErrorState error={error} title="Could not load this quiz" onRetry={reload} />
      </section>
    )
  }

  return <QuizView quiz={quiz} refreshing={loading} onRefresh={reload} />
}

// Keyed by quiz so moving to another quiz starts with fresh local state.
export default function QuizDetails() {
  const { assessmentId } = useParams()
  return <QuizDetailsView key={assessmentId} assessmentId={assessmentId} />
}
