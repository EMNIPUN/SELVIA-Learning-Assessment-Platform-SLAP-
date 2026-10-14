import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { Link, useParams } from 'react-router'
import AttemptCountdown from '../../components/AttemptCountdown.jsx'
import AttemptQuestion from '../../components/AttemptQuestion.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import QuizResult from '../../components/QuizResult.jsx'
import SubmitAttemptDialog from '../../components/SubmitAttemptDialog.jsx'
import { ATTEMPT_STATUS, attemptStatusLabel } from '../../components/studentQuizStatus.js'
import { QUESTION_TYPE } from '../../constants/questionTypes.js'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { useLeaveWarning } from '../../hooks/useLeaveWarning.js'
import { AnswerSaveQueue, HALT, SAVE_STATUS, waitForAnswerWrites } from '../../services/answerSaveQueue.js'
import { getQuizAttempt, submitQuizAttempt } from '../../services/api/studentQuiz.api.js'
import { anchorDeadline, reconcileDeadline } from '../../utils/countdown.js'
import { getErrorMessage } from '../../utils/errorMessages.js'
import { formatDateTime } from '../../utils/formatters.js'

const HEADING_ID = 'quiz-attempt-heading'
const QUESTIONS_HEADING_ID = 'quiz-attempt-questions-heading'
const SUMMARY_HEADING_ID = 'quiz-attempt-summary-heading'

// Typed answers are saved once the student pauses for this long, or leaves the field.
const TEXT_SAVE_DELAY_MS = 1000

// Once the local countdown runs out, the attempt is read again after at least this long, so that the server's
// deadline has certainly passed too and reading it closes the attempt there. Only one read is made each time.
const TIME_UP_CHECK_DELAY_MS = 2000
// Waiting for the last answer writes before that read never takes longer than this.
const TIME_UP_SAVE_WAIT_MS = 8000

const LEAVE_WARNING = 'Some of your answers are not saved yet and may be lost if you leave now. Leave this page?'
const SUBMITTING_WARNING = 'Your attempt is being submitted. Leave this page before it is confirmed?'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// 75 → "1 min 15 s", 3720 → "1 h 2 min".
function durationText(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  if (minutes > 0) return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`
  return `${seconds} s`
}

// What the student has entered: an option id or null for a choice question, text for a short answer.
function initialDraft(question) {
  if (question.questionType === QUESTION_TYPE.SHORT_ANSWER) return question.response?.answerText ?? ''
  return question.response?.selectedOptionId ?? null
}

// The API saves trimmed text; an answer left empty is cleared rather than saved.
function textResponse(text) {
  const answerText = text.trim()
  return answerText ? { answerText } : null
}

// The quiz is known only once the attempt has loaded; until then the way back is My Courses.
function BackLink({ quizId }) {
  if (!quizId) {
    return (
      <Link to={ROUTES.STUDENT_COURSES} className="back-link">
        ← Back to My Courses
      </Link>
    )
  }
  return (
    <Link to={ROUTES.studentQuiz(quizId)} className="back-link">
      ← Back to quiz
    </Link>
  )
}

// `progress` holds the server's counts after the latest saved change, when there is one.
function AttemptMeta({ attempt, progress }) {
  const inProgress = attempt.status === ATTEMPT_STATUS.IN_PROGRESS
  const { answeredCount, questionCount } = progress ?? attempt

  return (
    <dl className="course-meta">
      <div>
        <dt>Started</dt>
        <dd>
          <time dateTime={attempt.startedAt}>{formatDateTime(attempt.startedAt)}</time>
        </dd>
      </div>
      {inProgress && attempt.expiresAt && (
        <div>
          <dt>Ends</dt>
          <dd>
            <time dateTime={attempt.expiresAt}>{formatDateTime(attempt.expiresAt)}</time>
          </dd>
        </div>
      )}
      {attempt.submittedAt && (
        <div>
          <dt>Submitted</dt>
          <dd>
            <time dateTime={attempt.submittedAt}>{formatDateTime(attempt.submittedAt)}</time>
          </dd>
        </div>
      )}
      {attempt.timeSpentSeconds != null && (
        <div>
          <dt>Time spent</dt>
          <dd>{durationText(attempt.timeSpentSeconds)}</dd>
        </div>
      )}
      <div>
        <dt>Answered</dt>
        <dd>
          {answeredCount} of {questionCount}
        </dd>
      </div>
      <div>
        <dt>Total points</dt>
        <dd>{attempt.totalPoints}</dd>
      </div>
    </dl>
  )
}

// Shown after the server refused a change because the attempt had closed, or after time ran out while changes
// were still unsaved. `unsavedCount` questions had changes that were not saved.
function ClosedNotice({ notice }) {
  const { title, detail, unsavedCount } = notice
  return (
    <div className="alert alert-warning attempt-alert" role="alert">
      <p>
        <strong>{title}</strong>
        {detail && ` ${detail}`}
      </p>
      {unsavedCount > 0 && (
        <p>
          Your latest {unsavedCount === 1 ? 'change' : 'changes'} to {plural(unsavedCount, 'question')}{' '}
          {unsavedCount === 1 ? 'was' : 'were'} not saved.
        </p>
      )}
    </div>
  )
}

function AttemptLayout({ attempt, progress, notice, children }) {
  const inProgress = attempt.status === ATTEMPT_STATUS.IN_PROGRESS

  return (
    <section className="page quiz-attempt-page">
      <BackLink quizId={attempt.quiz.id} />

      <header className="page-header quiz-details-header">
        <div className="quiz-details-labels">
          <span className="lesson-label">Quiz attempt</span>
          <span className={`badge ${inProgress ? 'badge-quiz-in-progress' : 'badge-quiz-closed'}`}>
            {attemptStatusLabel(attempt.status)}
          </span>
        </div>
        <h1 id={HEADING_ID} tabIndex={-1}>
          {attempt.quiz.title}
        </h1>
        <p className="page-subtitle">Attempt {attempt.attemptNumber}</p>
        <AttemptMeta attempt={attempt} progress={progress} />
      </header>

      {notice && <ClosedNotice notice={notice} />}
      {children}
    </section>
  )
}

function saveSummary(save) {
  if (save.halt?.kind === HALT.CLOSED) return 'This attempt no longer accepts changes.'
  const statuses = Object.values(save.statuses)
  if (statuses.some((status) => status === SAVE_STATUS.WAITING || status === SAVE_STATUS.SAVING)) {
    return 'Saving your answers…'
  }
  if (statuses.includes(SAVE_STATUS.FAILED)) return 'Some answers have not been saved.'
  if (statuses.includes(SAVE_STATUS.SAVED)) return 'All changes saved.'
  return ''
}

// Answers are kept as drafts on this page and saved through the attempt's queue, which reports what the server
// has confirmed. A draft is never replaced by a server response, so a reply to an older change cannot undo a newer
// one. The loader's callbacks reload the attempt: `onClosed(error, unsavedCount)` when the server stops accepting
// changes, `onTimeUp(unsavedCount)` once the local countdown has run out, `onSubmitted()` after a submission and
// `onRefresh()` to check the attempt's status.
function OpenAttempt({ attempt, notice, onClosed, onTimeUp, onSubmitted, onRefresh }) {
  const [queue] = useState(() => new AnswerSaveQueue(attempt.id, attempt.questions))
  const save = useSyncExternalStore(queue.subscribe, queue.getSnapshot)
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(attempt.questions.map((question) => [question.id, initialDraft(question)])),
  )

  // Leaving the page hands the remaining changes to the queue to finish on its own.
  useEffect(() => {
    queue.attach(onClosed)
    return () => queue.detach()
  }, [queue, onClosed])

  useEffect(() => {
    const resume = () => queue.resume()
    window.addEventListener('online', resume)
    return () => window.removeEventListener('online', resume)
  }, [queue])

  // The deadline comes from the server's remaining time when the attempt was read, and is corrected by the time
  // each saved answer reports. Untimed attempts have none.
  const [deadline, setDeadline] = useState(() =>
    attempt.timeRemainingSeconds == null ? null : anchorDeadline(attempt.timeRemainingSeconds),
  )
  const { progress } = save
  useEffect(() => {
    if (progress?.timeRemainingSeconds == null) return
    const reported = anchorDeadline(progress.timeRemainingSeconds, progress.receivedAt)
    setDeadline((current) => (current == null ? current : reconcileDeadline(current, reported)))
  }, [progress])

  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const submittingRef = useRef(false)
  const submitAlertRef = useRef(null)

  // When the countdown runs out, editing stops and the last changes are sent; then the attempt is read once, which
  // makes the server close it if its deadline has passed. The page shows whatever the server then reports. A
  // submission under way is left to finish; if it fails, the attempt is read once it has.
  const [timeUp, setTimeUp] = useState(false)
  const handleTimeUp = useCallback(() => setTimeUp(true), [])
  useEffect(() => {
    if (!timeUp || submitting) return undefined
    let cancelled = false
    queue.flushAll()
    Promise.all([sleep(TIME_UP_CHECK_DELAY_MS), Promise.race([queue.whenIdle(), sleep(TIME_UP_SAVE_WAIT_MS)])]).then(() => {
      if (!cancelled && !submittingRef.current) onTimeUp(queue.getSnapshot().unsavedCount)
    })
    return () => {
      cancelled = true
    }
  }, [timeUp, submitting, queue, onTimeUp])

  useLeaveWarning(save.hasUnsaved || submitting, submitting ? SUBMITTING_WARNING : LEAVE_WARNING)

  const closed = save.halt?.kind === HALT.CLOSED
  const editingDisabled = closed || submitting || timeUp
  const retry = useCallback(() => queue.retry(), [queue])

  function openSubmit() {
    queue.flushAll()
    setSubmitError(null)
    setSubmitOpen(true)
  }

  // Submits once the queue has nothing left to send, and holds it so that no answer write can run alongside the
  // submission. Answers that could not be saved are only left behind when the student has agreed to that.
  async function submit(acknowledgedUnsaved) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)

    queue.flushAll()
    await queue.whenIdle()
    const current = queue.getSnapshot()
    if (current.halt?.kind === HALT.CLOSED || (current.unsavedCount > 0 && !acknowledgedUnsaved)) {
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    queue.hold()
    try {
      await submitQuizAttempt(attempt.id)
    } catch (err) {
      queue.release()
      submittingRef.current = false
      flushSync(() => {
        setSubmitting(false)
        setSubmitError(err)
      })
      submitAlertRef.current?.focus()
      // The attempt is gone or closed: show it as the server has it.
      if (err.status === 404 || err.status === 409) onRefresh()
      return
    }
    onSubmitted()
  }

  function closeSubmit() {
    if (!submittingRef.current) setSubmitOpen(false)
  }

  function selectOption(questionId, optionId) {
    setDrafts((previous) => ({ ...previous, [questionId]: optionId }))
    queue.change(questionId, optionId ? { selectedOptionId: optionId } : null)
  }

  function changeText(questionId, text) {
    setDrafts((previous) => ({ ...previous, [questionId]: text }))
    queue.change(questionId, textResponse(text), { delay: TEXT_SAVE_DELAY_MS })
  }

  return (
    <AttemptLayout attempt={attempt} progress={save.progress} notice={notice}>
      <section className="page-section" aria-labelledby={QUESTIONS_HEADING_ID}>
        <h2 id={QUESTIONS_HEADING_ID}>Questions</h2>
        {deadline != null && <AttemptCountdown deadline={deadline} onTimeUp={handleTimeUp} />}
        <p className="alert alert-info">
          Your answers are saved automatically as you work.
          {attempt.expiresAt && ' The time limit keeps running on the server, even if you leave this page.'}
        </p>
        {timeUp && (
          <p className="alert alert-warning attempt-alert" role="status">
            Time is up. Editing has stopped while the server confirms what happens to this attempt…
          </p>
        )}

        <p className="attempt-save-summary" role="status" aria-live="polite">
          {saveSummary(save)}
        </p>
        {save.halt?.kind === HALT.PAUSED && (
          <div className="alert alert-error attempt-alert" role="alert">
            <p>Your latest changes could not be saved. {getErrorMessage(save.halt.error)}</p>
            <p>They are kept on this page and are sent again when you retry or make another change.</p>
            <div>
              <button type="button" className="button button-secondary button-small" onClick={retry}>
                Retry now
              </button>
            </div>
          </div>
        )}

        {attempt.questions.length === 0 ? (
          <EmptyState title="This attempt has no questions." />
        ) : (
          <ol className="attempt-question-list">
            {attempt.questions.map((question) => (
              <AttemptQuestion
                key={question.id}
                question={question}
                draft={drafts[question.id]}
                status={save.statuses[question.id]}
                error={save.errors[question.id]}
                disabled={editingDisabled}
                onSelect={(optionId) => selectOption(question.id, optionId)}
                onTextChange={(text) => changeText(question.id, text)}
                onTextBlur={() => queue.flush(question.id)}
                onRetry={retry}
              />
            ))}
          </ol>
        )}

        <div className="attempt-submit">
          <p className="muted">When you have finished, submit the attempt. You cannot change your answers afterwards.</p>
          <button
            type="button"
            className="button button-primary"
            onClick={openSubmit}
            disabled={editingDisabled || attempt.questions.length === 0}
          >
            {submitting ? 'Submitting…' : 'Submit attempt'}
          </button>
        </div>
      </section>

      {submitOpen && (
        <SubmitAttemptDialog
          questionCount={save.progress?.questionCount ?? attempt.questionCount}
          answeredCount={save.progress?.answeredCount ?? attempt.answeredCount}
          save={save}
          submitting={submitting}
          error={submitError}
          alertRef={submitAlertRef}
          onRetrySaves={retry}
          onConfirm={submit}
          onRefresh={onRefresh}
          onClose={closeSubmit}
        />
      )}
    </AttemptLayout>
  )
}

// A closed attempt shows no questions; its score appears only once the API has released it. `justSubmitted` is
// true when the student's own submission on this page closed it.
function ClosedAttempt({ attempt, notice, justSubmitted }) {
  const autoSubmitted = attempt.status === ATTEMPT_STATUS.AUTO_SUBMITTED

  return (
    <AttemptLayout attempt={attempt} notice={notice}>
      <section className="page-section quiz-attempt-summary" aria-labelledby={SUMMARY_HEADING_ID}>
        <h2 id={SUMMARY_HEADING_ID}>Summary</h2>
        {justSubmitted && attempt.status === ATTEMPT_STATUS.SUBMITTED && (
          <p className="alert alert-success" role="status">
            Your attempt has been submitted.
          </p>
        )}
        {autoSubmitted ? (
          <p className="alert alert-warning">
            The time for this attempt ran out, so the server submitted it automatically with the answers saved by then.
          </p>
        ) : (
          attempt.submittedAt && <p>You submitted this attempt on {formatDateTime(attempt.submittedAt)}.</p>
        )}
        <p>
          You answered {attempt.answeredCount} of {plural(attempt.questionCount, 'question')}.
        </p>

        {attempt.result ? (
          <div className="quiz-attempt-result-box">
            <p className="quiz-attempt-result-label">Result</p>
            <p className="quiz-attempt-result-value">
              <QuizResult result={attempt.result} />
            </p>
            <p className="muted">Released {formatDateTime(attempt.result.releasedAt)}</p>
          </div>
        ) : (
          <p className="quiz-attempt-result-pending">
            Your result is not available yet. It will appear here once it has been released.
          </p>
        )}

        <div className="quiz-start-actions">
          <Link to={ROUTES.studentQuiz(attempt.quiz.id)} className="button button-secondary">
            Back to quiz
          </Link>
        </div>
      </section>
    </AttemptLayout>
  )
}

// Reading an attempt whose time is up makes the server submit it, so this page may show it closed. The attempt
// is read only after any changes still being saved from an earlier visit have finished.
function AttemptLoader({ attemptId }) {
  const { data: attempt, error, loading, reload } = useApiRequest(
    (signal) => waitForAnswerWrites(attemptId).then(() => getQuizAttempt(attemptId, { signal })),
    [attemptId],
  )
  const [closedNotice, setClosedNotice] = useState(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  // The server refused a change because the attempt has closed: reload it to show it as it is now.
  const handleClosed = useCallback(
    (closeError, unsavedCount) => {
      setClosedNotice({
        title: 'This attempt no longer accepts changes.',
        detail: `${getErrorMessage(closeError)}.`,
        unsavedCount,
      })
      reload()
    },
    [reload],
  )

  // The local countdown ran out. Reading the attempt again lets the server decide; it may still have a moment left.
  const handleTimeUp = useCallback(
    (unsavedCount) => {
      if (unsavedCount > 0) {
        setClosedNotice({ title: 'Time ran out before every change was saved.', detail: '', unsavedCount })
      }
      reload()
    },
    [reload],
  )

  const handleSubmitted = useCallback(() => {
    setJustSubmitted(true)
    reload()
  }, [reload])

  if (loading) {
    return (
      <section className="page">
        <BackLink />
        <LoadingState message="Loading attempt…" />
      </section>
    )
  }

  // The API answers 404 for another student's attempt or a quiz that is no longer visible, and 400 for a
  // malformed id.
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <section className="page">
        <BackLink />
        <EmptyState title="Attempt not found">
          <p>This attempt does not exist or is not available to you.</p>
        </EmptyState>
      </section>
    )
  }

  if (error) {
    return (
      <section className="page">
        <BackLink />
        {justSubmitted && (
          <p className="alert alert-success" role="status">
            Your attempt has been submitted, but it could not be loaded again.
          </p>
        )}
        {closedNotice && <ClosedNotice notice={closedNotice} />}
        <ErrorState error={error} title="Could not load this attempt" onRetry={reload} />
      </section>
    )
  }

  if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS && attempt.questions) {
    return (
      <OpenAttempt
        attempt={attempt}
        notice={closedNotice}
        onClosed={handleClosed}
        onTimeUp={handleTimeUp}
        onSubmitted={handleSubmitted}
        onRefresh={reload}
      />
    )
  }
  return <ClosedAttempt attempt={attempt} notice={closedNotice} justSubmitted={justSubmitted} />
}

// Keyed by attempt so moving to another attempt starts with fresh local state, and a new queue.
export default function QuizAttemptPage() {
  const { attemptId } = useParams()
  return <AttemptLoader key={attemptId} attemptId={attemptId} />
}
