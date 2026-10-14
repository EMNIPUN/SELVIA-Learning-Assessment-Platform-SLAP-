import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import { ROUTES } from '../../constants/routes.js'
import { QUIZ_STATUSES } from '../../constants/quiz.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { deleteQuiz, listCourseQuizzes } from '../../services/api/assessment.api.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import ErrorState from '../ErrorState.jsx'
import LoadingState from '../LoadingState.jsx'
import StatusBadge from '../StatusBadge.jsx'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx'
import FilterSelect from './FilterSelect.jsx'
import QuizStatusDialog from './QuizStatusDialog.jsx'
import { STATUS_ACTIONS } from './statusChange.js'
import {
  attemptsText,
  availabilityText,
  pointsText,
  questionCountText,
  quizStatusTargets,
  timeLimitText,
} from './quizSummary.js'

const PAGE_SIZE = 20
const SEARCH_MAX_LENGTH = 200
const NO_FILTERS = Object.freeze({ search: '', status: '' })

// The quizzes of a course for its owner, with search, a status filter and pages, and their status changes and
// deletion; quizzes are created and edited on their own page. After every change the current page is loaded
// again, so the counts stay as the API reports them. Only the number of attempts is shown, never answers or
// results.
export default function QuizList({ course }) {
  const [filters, setFilters] = useState(NO_FILTERS)
  const [searchText, setSearchText] = useState('')
  const [offset, setOffset] = useState(0)
  // { type: 'status', item, status } | { type: 'delete', item }
  const [dialog, setDialog] = useState(null)
  // { type: 'success' | 'error', message }
  const [feedback, setFeedback] = useState(null)
  const createLinkRef = useRef(null)
  const titleRefs = useRef({})
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const focusResultsRef = useRef(false)
  const headingId = useId()
  const filterId = useId()

  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => listCourseQuizzes(course.id, { ...filters, limit: PAGE_SIZE, offset }, { signal }),
    [course.id, filters, offset],
  )

  const quizzes = data?.assessments ?? []
  const total = data?.pagination.total ?? 0
  const filtersActive = Object.values(filters).some(Boolean)
  // A reload keeps the loaded page on screen, so controls keep their focus after a change.
  const showLoading = loading && !data

  // Changing the page hides the page buttons while it loads, so focus moves to the new page's summary.
  useEffect(() => {
    if (loading || !focusResultsRef.current) return
    focusResultsRef.current = false
    resultsRef.current?.focus()
  }, [loading])

  // Quizzes deleted elsewhere can leave the current page past the end of the list.
  useEffect(() => {
    if (!loading && data && data.assessments.length === 0 && offset > 0) {
      setOffset(Math.max(0, Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE))
    }
  }, [loading, data, offset, total])

  function openDialog(next) {
    setFeedback(null)
    setDialog(next)
  }

  function applyFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }))
    setOffset(0)
  }

  function applySearch(event) {
    event.preventDefault()
    applyFilter('search', searchText.trim())
  }

  function clearFilters() {
    setFilters(NO_FILTERS)
    setSearchText('')
    setOffset(0)
    searchRef.current?.focus()
  }

  function goTo(nextOffset) {
    focusResultsRef.current = true
    setOffset(nextOffset)
  }

  // The button that opened the dialog is replaced by those for the new status, so focus moves to the quiz's
  // title, or to Create Quiz when the status filter will hide the quiz.
  function handleStatusChanged(quiz) {
    const hidden = filters.status && filters.status !== quiz.status
    flushSync(() => {
      updateData(
        (current) =>
          current && {
            ...current,
            assessments: current.assessments.map((existing) => (existing.id === quiz.id ? { ...existing, ...quiz } : existing)),
          },
      )
      setDialog(null)
      setFeedback({ type: 'success', message: `Quiz "${quiz.title}" is now ${formatEnumLabel(quiz.status)}.` })
    })
    ;(hidden ? createLinkRef.current : titleRefs.current[quiz.id])?.focus()
    reload()
  }

  // The quiz disappears with the control that opened the dialog, so focus moves to Create Quiz.
  function removeQuiz(type, message) {
    flushSync(() => {
      setDialog(null)
      setFeedback({ type, message })
      if (quizzes.length === 1 && offset > 0) setOffset(offset - PAGE_SIZE)
      else reload()
    })
    createLinkRef.current?.focus()
  }

  const first = offset + 1
  const last = offset + quizzes.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const matching = filtersActive ? ' matching the search and filter' : ''
  const summary =
    showLoading || error || !data || total === 0
      ? ''
      : total <= PAGE_SIZE
        ? `${total} quiz${total === 1 ? '' : 'zes'}${matching}.`
        : `Showing ${first}–${last} of ${total} quizzes${matching}.`

  return (
    <section className="structure-list quiz-list" aria-labelledby={headingId}>
      <div className="structure-list-header">
        <div className="structure-list-heading">
          <h2 id={headingId} className="structure-list-title">
            Quizzes
          </h2>
          <p className="muted structure-list-intro">
            Quizzes assess this course with questions from its question bank. Students see a quiz only while both the
            quiz and the course are published.
          </p>
        </div>
        <Link ref={createLinkRef} to={ROUTES.lecturerNewQuiz(course.id)} className="button button-primary button-small">
          <span aria-hidden="true">+</span> Create Quiz
        </Link>
      </div>

      <div role="status" aria-live="polite">
        {feedback?.type === 'success' && <p className="alert alert-success">{feedback.message}</p>}
      </div>
      <div role="alert">{feedback?.type === 'error' && <p className="alert alert-error">{feedback.message}</p>}</div>

      {(filtersActive || total > 0) && (
        <form
          className="question-filters quiz-filters"
          role="search"
          aria-label={`Search and filter the quizzes of ${course.title}`}
          onSubmit={applySearch}
        >
          <div className="form-field question-filter-search">
            <label className="form-label" htmlFor={`${filterId}-search`}>
              Search quiz titles
            </label>
            <div className="question-search-control">
              <input
                ref={searchRef}
                id={`${filterId}-search`}
                type="search"
                autoComplete="off"
                maxLength={SEARCH_MAX_LENGTH}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <button type="submit" className="button button-secondary">
                Search
              </button>
            </div>
          </div>
          <FilterSelect
            id={`${filterId}-status`}
            label="Status"
            allLabel="All statuses"
            values={QUIZ_STATUSES}
            labelOf={formatEnumLabel}
            value={filters.status}
            onChange={(value) => applyFilter('status', value)}
          />
          <div className="question-filter-reset">
            <button
              type="button"
              className="button button-secondary"
              onClick={clearFilters}
              disabled={!filtersActive && !searchText}
            >
              Clear filters
            </button>
          </div>
        </form>
      )}

      <p ref={resultsRef} className="structure-status-summary question-results" role="status" tabIndex={-1}>
        {summary}
      </p>

      {showLoading && <LoadingState message="Loading quizzes…" />}
      {!showLoading && error && <ErrorState error={error} title="Could not load the quizzes" onRetry={reload} />}
      {!showLoading && !error && data && total === 0 && (
        <p className="structure-empty">
          {filtersActive
            ? 'No quizzes match the search and filter. Use Clear filters to see them all.'
            : 'This course has no quizzes yet. Use Create Quiz to add the first one.'}
        </p>
      )}
      {!error && quizzes.length > 0 && (
        <ul className="structure-items" aria-busy={loading}>
          {quizzes.map((quiz) => (
            <li key={quiz.id}>
              <QuizItem
                quiz={quiz}
                courseId={course.id}
                titleRef={(element) => {
                  titleRefs.current[quiz.id] = element
                }}
                onChangeStatus={(status) => openDialog({ type: 'status', item: quiz, status })}
                onDelete={() => openDialog({ type: 'delete', item: quiz })}
              />
            </li>
          ))}
        </ul>
      )}

      {!showLoading && !error && total > PAGE_SIZE && (
        <nav className="question-pagination" aria-label={`Pages of quizzes of ${course.title}`}>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => goTo(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
          >
            Previous<span className="visually-hidden"> page</span>
          </button>
          <span className="question-pagination-page">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => goTo(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
          >
            Next<span className="visually-hidden"> page</span>
          </button>
        </nav>
      )}

      {dialog?.type === 'status' && (
        <QuizStatusDialog
          quiz={dialog.item}
          status={dialog.status}
          course={course}
          onSaved={handleStatusChanged}
          onMissing={() => removeQuiz('error', `Quiz "${dialog.item.title}" no longer exists, so it was removed from the list.`)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDeleteQuizDialog
          quiz={dialog.item}
          onDeleted={() => removeQuiz('success', `Quiz "${dialog.item.title}" was deleted.`)}
          onMissing={() => removeQuiz('error', `Quiz "${dialog.item.title}" no longer exists, so it was removed from the list.`)}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}

// Deleting a quiz deletes its question list, never the questions. The API refuses (409) once it has attempts.
export function ConfirmDeleteQuizDialog({ quiz, onDeleted, onMissing, onClose }) {
  return (
    <ConfirmDeleteDialog
      noun="quiz"
      confirmLabel="Delete Quiz"
      remove={() => deleteQuiz(quiz.id)}
      onDeleted={onDeleted}
      onMissing={onMissing}
      onClose={onClose}
    >
      <p>
        You are about to permanently delete the quiz <strong>{quiz.title}</strong> and its list of questions. The
        questions stay in the question bank. This cannot be undone.
      </p>
      {quiz.attemptCount > 0 ? (
        <p className="alert alert-warning">
          Students have already attempted this quiz, so it cannot be deleted: its attempts must be kept. Archive it
          instead to retire it.
        </p>
      ) : (
        <p className="muted">A quiz cannot be deleted once students have attempted it. Archive it instead to retire it.</p>
      )}
    </ConfirmDeleteDialog>
  )
}

// One quiz with its settings summary and its edit, status and delete actions.
function QuizItem({ quiz, courseId, titleRef, onChangeStatus, onDelete }) {
  const to = ROUTES.lecturerQuiz(courseId, quiz.id)
  return (
    <article className="structure-item structure-item-quiz">
      <div className="structure-item-header">
        <h3 className="structure-item-title">
          <Link ref={titleRef} to={to} className="structure-item-link structure-item-name">
            {quiz.title}
          </Link>
        </h3>
        <div className="structure-item-actions">
          <Link to={to} className="button button-secondary button-small">
            Edit<span className="visually-hidden"> quiz {quiz.title}</span>
          </Link>
          {quizStatusTargets(quiz.status).map((status) => (
            <button
              key={status}
              type="button"
              className="button button-secondary button-small"
              onClick={() => onChangeStatus(status)}
            >
              {STATUS_ACTIONS[status]}
              <span className="visually-hidden"> quiz {quiz.title}</span>
            </button>
          ))}
          <button type="button" className="button button-danger-outline button-small" onClick={onDelete}>
            Delete<span className="visually-hidden"> quiz {quiz.title}</span>
          </button>
        </div>
      </div>

      {quiz.description && <p className="structure-item-description">{quiz.description}</p>}

      <div className="structure-item-meta">
        <StatusBadge status={quiz.status} />
        <span>{questionCountText(quiz.questionCount)}</span>
        {quiz.totalPoints != null && <span>{pointsText(quiz.totalPoints)}</span>}
        <span>{timeLimitText(quiz.timeLimitMinutes)}</span>
        <span>{attemptsText(quiz.maxAttempts)}</span>
        <span>{availabilityText(quiz)}</span>
        {quiz.attemptCount > 0 && <span>Attempted {quiz.attemptCount === 1 ? 'once' : `${quiz.attemptCount} times`}</span>}
      </div>
    </article>
  )
}
