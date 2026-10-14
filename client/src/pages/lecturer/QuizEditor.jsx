import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import EmptyState from '../../components/EmptyState.jsx'
import ErrorState from '../../components/ErrorState.jsx'
import LoadingState from '../../components/LoadingState.jsx'
import MarkdownContent from '../../components/MarkdownContent.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import FormDialog from '../../components/lecturer/FormDialog.jsx'
import QuizForm from '../../components/lecturer/QuizForm.jsx'
import { ConfirmDeleteQuizDialog } from '../../components/lecturer/QuizList.jsx'
import QuizQuestionPicker from '../../components/lecturer/QuizQuestionPicker.jsx'
import QuizQuestions from '../../components/lecturer/QuizQuestions.jsx'
import QuizStatusDialog from '../../components/lecturer/QuizStatusDialog.jsx'
import {
  FROZEN_EXPLANATION,
  attemptsText,
  availabilityText,
  passMarkText,
  pointsText,
  questionCountText,
  quizStatusTargets,
  timeLimitText,
} from '../../components/lecturer/quizSummary.js'
import { STATUS_ACTIONS } from '../../components/lecturer/statusChange.js'
import { ROUTES } from '../../constants/routes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { createQuiz, getQuiz, updateQuiz } from '../../services/api/assessment.api.js'
import { getCourse, listCourses } from '../../services/api/course.api.js'
import { getErrorMessage } from '../../utils/errorMessages.js'
import { formatDateTime, formatEnumLabel } from '../../utils/formatters.js'

// As on the course page, only the course's owner is offered changes; the API refuses everyone else (403).
// A quiz that does not exist, or belongs to another course, is reported as not found.
async function loadQuizPage(courseId, assessmentId, signal) {
  const [course, ownCourses, quiz] = await Promise.all([
    getCourse(courseId, { signal }),
    listCourses({ signal, mine: true }),
    assessmentId &&
      getQuiz(assessmentId, { signal }).catch((err) => {
        if (err.status === 404 || err.status === 400) return null
        throw err
      }),
  ])
  return {
    course,
    owned: ownCourses.some((own) => own.id === course.id),
    quiz: quiz && quiz.courseId !== course.id ? null : quiz,
  }
}

function BackLink({ course }) {
  if (!course) {
    return (
      <Link to={ROUTES.LECTURER_COURSES} className="back-link">
        ← Back to Courses
      </Link>
    )
  }
  return (
    <Link to={ROUTES.lecturerCourse(course.id)} className="back-link">
      ← Back to {course.title}
    </Link>
  )
}

function PageMessage({ course, children }) {
  return (
    <section className="page">
      <BackLink course={course} />
      {children}
    </section>
  )
}

// Creates a quiz (/quizzes/new) or manages one: its settings, status, questions and deletion. New quizzes start
// as drafts and open here once created, ready for questions.
export default function QuizEditor() {
  const { courseId, assessmentId } = useParams()
  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => loadQuizPage(courseId, assessmentId, signal),
    [courseId, assessmentId],
  )

  if (loading && !data) {
    return (
      <PageMessage>
        <LoadingState message={assessmentId ? 'Loading quiz…' : 'Loading course…'} />
      </PageMessage>
    )
  }

  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <PageMessage>
        <EmptyState title="Course not found">
          <p>This course does not exist or is not one of your courses.</p>
        </EmptyState>
      </PageMessage>
    )
  }

  if ((error && error.status === 403) || (data && !data.owned)) {
    return (
      <PageMessage>
        <EmptyState title="Access denied">
          <p>You can only manage the quizzes of courses that you own.</p>
        </EmptyState>
      </PageMessage>
    )
  }

  if (error) {
    return (
      <PageMessage>
        <ErrorState error={error} title={assessmentId ? 'Could not load this quiz' : 'Could not load this course'} onRetry={reload} />
      </PageMessage>
    )
  }

  if (!assessmentId) return <CreateQuiz course={data.course} />

  if (!data.quiz) {
    return (
      <PageMessage course={data.course}>
        <EmptyState title="Quiz not found">
          <p>This quiz does not exist or has been deleted.</p>
        </EmptyState>
      </PageMessage>
    )
  }

  return <ManageQuiz course={data.course} quiz={data.quiz} updateData={updateData} reload={reload} />
}

function CreateQuiz({ course }) {
  const navigate = useNavigate()

  async function handleSubmit(fields) {
    const quiz = await createQuiz(course.id, fields)
    navigate(ROUTES.lecturerQuiz(course.id, quiz.id), { replace: true, state: { created: true } })
  }

  return (
    <section className="page">
      <BackLink course={course} />
      <header className="page-header">
        <span className="course-code">{course.code}</span>
        <h1>Create quiz</h1>
        <p className="page-subtitle">
          New quizzes start as drafts that students cannot see. Once it is created, add questions from the question
          bank, then publish it.
        </p>
      </header>
      <div className="card quiz-form-card">
        <QuizForm
          submitLabel="Create Quiz"
          submittingLabel="Creating…"
          onSubmit={handleSubmit}
          onCancel={() => navigate(ROUTES.lecturerCourse(course.id))}
        />
      </div>
    </section>
  )
}

function ManageQuiz({ course, quiz, updateData, reload }) {
  const navigate = useNavigate()
  const location = useLocation()
  // { type: 'settings' } | { type: 'status', status } | { type: 'delete' }
  const [dialog, setDialog] = useState(null)
  // { type: 'success' | 'error', message }
  const [feedback, setFeedback] = useState(() =>
    location.state?.created
      ? { type: 'success', message: `Quiz "${quiz.title}" was created as a draft. Add its questions, then publish it.` }
      : null,
  )
  const refreshCount = useRef(0)
  const headingRef = useRef(null)
  const settingsHeadingId = useId()
  const frozen = quiz.attemptCount > 0

  // The creation message is shown once, not again when the page is reloaded or revisited.
  useEffect(() => {
    if (location.state?.created) navigate(location.pathname, { replace: true, state: null })
  }, [])

  function replaceQuiz(update) {
    updateData((previous) => previous && { ...previous, quiz: update(previous.quiz) })
  }

  // Loads the quiz again after a change to its questions. Only the latest request is applied, so overlapping
  // refreshes never show an older state. Never throws: a failure is reported on the page.
  async function refresh() {
    refreshCount.current += 1
    const current = refreshCount.current
    try {
      const next = await getQuiz(quiz.id)
      if (current === refreshCount.current) replaceQuiz(() => next)
    } catch (err) {
      if (current !== refreshCount.current) return
      if (err.status === 404) {
        reload()
        return
      }
      setFeedback({
        type: 'error',
        message: `The quiz could not be reloaded, so this page may be out of date. ${getErrorMessage(err)}`,
      })
    }
  }

  function openDialog(next) {
    setFeedback(null)
    setDialog(next)
  }

  // A settings or status change returns the quiz without its questions, which are kept as loaded.
  function mergeQuiz(saved) {
    replaceQuiz((current) => ({ ...current, ...saved }))
  }

  function handleSettingsSaved(saved) {
    mergeQuiz(saved)
    setDialog(null)
    setFeedback({ type: 'success', message: `The settings of quiz "${saved.title}" were saved.` })
  }

  // The button that opened the dialog is replaced by those for the new status, so focus moves to the title.
  function handleStatusChanged(saved) {
    flushSync(() => {
      mergeQuiz(saved)
      setDialog(null)
      setFeedback({ type: 'success', message: `Quiz "${saved.title}" is now ${formatEnumLabel(saved.status)}.` })
    })
    headingRef.current?.focus()
  }

  function handleMissing() {
    setDialog(null)
    reload()
  }

  return (
    <section className="page quiz-page">
      <BackLink course={course} />

      <header className="page-header course-header">
        <div className="course-card-header">
          <span className="course-code">Quiz in {course.code}</span>
          <span className="course-status">
            <StatusBadge status={quiz.status} />
            {quizStatusTargets(quiz.status).map((status) => (
              <button
                key={status}
                type="button"
                className="button button-secondary button-small"
                onClick={() => openDialog({ type: 'status', status })}
              >
                {STATUS_ACTIONS[status]}
                <span className="visually-hidden"> quiz {quiz.title}</span>
              </button>
            ))}
            <button
              type="button"
              className="button button-danger-outline button-small"
              onClick={() => openDialog({ type: 'delete' })}
            >
              Delete<span className="visually-hidden"> quiz {quiz.title}</span>
            </button>
          </span>
        </div>
        <h1 ref={headingRef} className="course-title" tabIndex={-1}>
          {quiz.title}
        </h1>
        {quiz.description && <p className="page-subtitle course-description">{quiz.description}</p>}
      </header>

      <div role="status" aria-live="polite">
        {feedback?.type === 'success' && <p className="alert alert-success">{feedback.message}</p>}
      </div>
      <div role="alert">{feedback?.type === 'error' && <p className="alert alert-error">{feedback.message}</p>}</div>

      {frozen && (
        <p className="alert alert-warning">
          Students have attempted this quiz {quiz.attemptCount === 1 ? 'once' : `${quiz.attemptCount} times`}.{' '}
          {FROZEN_EXPLANATION}
        </p>
      )}

      <section className="card quiz-settings" aria-labelledby={settingsHeadingId}>
        <div className="structure-list-header">
          <h2 id={settingsHeadingId} className="structure-list-title">
            Settings
          </h2>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => openDialog({ type: 'settings' })}
          >
            Edit settings<span className="visually-hidden"> of quiz {quiz.title}</span>
          </button>
        </div>
        <dl className="course-meta quiz-meta">
          <div>
            <dt>Questions</dt>
            <dd>
              {questionCountText(quiz.questions.length)}, {pointsText(quiz.totalPoints)}
            </dd>
          </div>
          <div>
            <dt>Time limit</dt>
            <dd>{timeLimitText(quiz.timeLimitMinutes)}</dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{attemptsText(quiz.maxAttempts)}</dd>
          </div>
          <div>
            <dt>Pass mark</dt>
            <dd>{passMarkText(quiz.passPercentage)}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>{availabilityText(quiz)}</dd>
          </div>
          <div>
            <dt>Question order</dt>
            <dd>{quiz.shuffleQuestions ? 'Shuffled for each attempt' : 'As listed'}</dd>
          </div>
          {quiz.publishedAt && (
            <div>
              <dt>First published</dt>
              <dd>{formatDateTime(quiz.publishedAt)}</dd>
            </div>
          )}
        </dl>
        <h3 className="quiz-instructions-title">Instructions</h3>
        {quiz.instructions ? (
          <MarkdownContent source={quiz.instructions} className="quiz-instructions" />
        ) : (
          <p className="muted">No instructions. Students see only the title and description before they start.</p>
        )}
      </section>

      <QuizQuestions quiz={quiz} frozen={frozen} refresh={refresh} notify={setFeedback} />
      {!frozen && <QuizQuestionPicker quiz={quiz} refresh={refresh} notify={setFeedback} />}

      {dialog?.type === 'settings' && (
        <FormDialog
          title="Edit quiz settings"
          noun="quiz"
          size="wide"
          load={(signal) => getQuiz(quiz.id, { signal })}
          save={(changes) => updateQuiz(quiz.id, changes)}
          onSaved={handleSettingsSaved}
          onMissing={handleMissing}
          onClose={() => setDialog(null)}
          renderForm={(current, formProps) => (
            <QuizForm quiz={current} submitLabel="Save changes" submittingLabel="Saving…" {...formProps} />
          )}
        />
      )}
      {dialog?.type === 'status' && (
        <QuizStatusDialog
          quiz={quiz}
          status={dialog.status}
          course={course}
          onSaved={handleStatusChanged}
          onMissing={handleMissing}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDeleteQuizDialog
          quiz={quiz}
          onDeleted={() => navigate(ROUTES.lecturerCourse(course.id), { replace: true })}
          onMissing={() => navigate(ROUTES.lecturerCourse(course.id), { replace: true })}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}
