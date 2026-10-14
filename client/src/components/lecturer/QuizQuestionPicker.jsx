import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CONTENT_STATUSES } from '../../constants/contentStatus.js'
import { BLOOM_LEVELS, DIFFICULTY_LEVELS } from '../../constants/exerciseTypes.js'
import { QUIZ_QUESTION_STATUSES, QUIZ_QUESTION_TYPES, isQuizEligible } from '../../constants/quiz.js'
import { BANK_QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../../constants/questionTypes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { addQuizQuestion } from '../../services/api/assessment.api.js'
import { listCourseQuestions } from '../../services/api/question.api.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import { questionExcerpt } from '../../utils/questionText.js'
import ErrorState from '../ErrorState.jsx'
import LoadingState from '../LoadingState.jsx'
import StatusBadge from '../StatusBadge.jsx'
import FilterSelect from './FilterSelect.jsx'
import FormDialog from './FormDialog.jsx'
import QuizQuestionForm from './QuizQuestionForm.jsx'
import { explainFrozen, isFrozenError, pointsText } from './quizSummary.js'

const PAGE_SIZE = 10
const SEARCH_MAX_LENGTH = 200
const NO_FILTERS = Object.freeze({ search: '', status: '', questionType: '', difficulty: '', bloomLevel: '' })

const nameOf = (question) => questionExcerpt(question.questionText, 80)

// Why a question of the bank cannot be added; the API checks this again when it is added.
function ineligibleReason(question) {
  if (!QUIZ_QUESTION_STATUSES.includes(question.status)) return 'Only approved or published questions can be added'
  if (!QUIZ_QUESTION_TYPES.includes(question.questionType)) return 'Quizzes cannot grade this type of question'
  return null
}

// The course's question bank, searchable and filtered as in the question bank, from which approved or published
// questions are added to the quiz. Questions already in the quiz are marked and cannot be added twice. After an
// addition `refresh()` loads the quiz again; `notify({ type, message })` reports the outcome on the page.
export default function QuizQuestionPicker({ quiz, refresh, notify }) {
  const [filters, setFilters] = useState(NO_FILTERS)
  const [searchText, setSearchText] = useState('')
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState(null)
  // Questions added since the quiz was last loaded, so they are marked before the refresh completes; they are
  // forgotten once the quiz is loaded again.
  const [added, setAdded] = useState({ questions: null, ids: [] })
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const focusResultsRef = useRef(false)
  const addedRefs = useRef({})
  const headingId = useId()
  const filterId = useId()

  const { data, error, loading, reload } = useApiRequest(
    (signal) => listCourseQuestions(quiz.courseId, { ...filters, limit: PAGE_SIZE, offset }, { signal }),
    [quiz.courseId, filters, offset],
  )

  const recentlyAdded = added.questions === quiz.questions ? added.ids : []
  const inQuiz = new Set([...quiz.questions.map((entry) => entry.questionId), ...recentlyAdded])
  const questions = data?.questions ?? []
  const total = data?.pagination.total ?? 0
  const filtersActive = Object.values(filters).some(Boolean)

  useEffect(() => {
    if (loading || !focusResultsRef.current) return
    focusResultsRef.current = false
    resultsRef.current?.focus()
  }, [loading])

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

  function openAdd(question) {
    notify(null)
    setAdding(question)
  }

  // The Add button is replaced by "In this quiz", which receives focus so the lecturer can carry on from here.
  function handleAdded(entry) {
    const question = adding
    flushSync(() => {
      setAdding(null)
      setAdded({ questions: quiz.questions, ids: [...recentlyAdded, question.id] })
      notify({
        type: 'success',
        message: `Question "${nameOf(question)}" was added to the quiz at position ${entry.sequenceOrder}.`,
      })
    })
    addedRefs.current[question.id]?.focus()
    refresh()
  }

  const first = offset + 1
  const last = offset + questions.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const matching = filtersActive ? ' matching the search and filters' : ''
  const summary =
    loading || error || !data || total === 0
      ? ''
      : total <= PAGE_SIZE
        ? `${total} question${total === 1 ? '' : 's'} in the question bank${matching}.`
        : `Showing ${first}–${last} of ${total} questions in the question bank${matching}.`

  return (
    <section className="structure-list quiz-picker" aria-labelledby={headingId}>
      <div className="structure-list-header">
        <div className="structure-list-heading">
          <h2 id={headingId} className="structure-list-title">
            Add questions
          </h2>
          <p className="muted structure-list-intro">
            Approved or published single-choice and short-answer questions from this course&apos;s question bank can be
            added. Questions are written and approved under their concepts on the course page.
          </p>
        </div>
      </div>

      <form
        className="question-filters"
        role="search"
        aria-label="Search and filter the course's question bank"
        onSubmit={applySearch}
      >
        <div className="form-field question-filter-search">
          <label className="form-label" htmlFor={`${filterId}-search`}>
            Search question text
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
          values={CONTENT_STATUSES}
          labelOf={formatEnumLabel}
          value={filters.status}
          onChange={(value) => applyFilter('status', value)}
        />
        <FilterSelect
          id={`${filterId}-type`}
          label="Question type"
          allLabel="All types"
          values={BANK_QUESTION_TYPES}
          labelOf={(value) => QUESTION_TYPE_LABELS[value]}
          value={filters.questionType}
          onChange={(value) => applyFilter('questionType', value)}
        />
        <FilterSelect
          id={`${filterId}-difficulty`}
          label="Difficulty"
          allLabel="All difficulties"
          values={DIFFICULTY_LEVELS}
          labelOf={formatEnumLabel}
          value={filters.difficulty}
          onChange={(value) => applyFilter('difficulty', value)}
        />
        <FilterSelect
          id={`${filterId}-bloom`}
          label="Bloom level"
          allLabel="All Bloom levels"
          values={BLOOM_LEVELS}
          labelOf={formatEnumLabel}
          value={filters.bloomLevel}
          onChange={(value) => applyFilter('bloomLevel', value)}
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

      <p ref={resultsRef} className="structure-status-summary question-results" role="status" tabIndex={-1}>
        {summary}
      </p>

      {loading && <LoadingState message="Loading questions…" />}
      {!loading && error && <ErrorState error={error} title="Could not load the question bank" onRetry={reload} />}
      {!loading && !error && data && total === 0 && (
        <p className="structure-empty">
          {filtersActive
            ? 'No questions match the search and filters. Use Clear filters to see them all.'
            : 'This course has no questions yet. Write them under a concept on the course page, then approve them.'}
        </p>
      )}
      {!loading && !error && questions.length > 0 && (
        <ul className="structure-items">
          {questions.map((question) => (
            <li key={question.id}>
              <PickerItem
                question={question}
                inQuiz={inQuiz.has(question.id)}
                addedRef={(element) => {
                  addedRefs.current[question.id] = element
                }}
                onAdd={() => openAdd(question)}
              />
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && total > PAGE_SIZE && (
        <nav className="question-pagination" aria-label="Pages of the question bank">
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

      {adding && (
        <FormDialog
          title="Add question to quiz"
          noun="question"
          size="narrow"
          save={(fields) =>
            addQuizQuestion(quiz.id, fields).catch((err) => {
              if (isFrozenError(err)) refresh()
              throw explainFrozen(err)
            })
          }
          onSaved={handleAdded}
          onClose={() => setAdding(null)}
          renderForm={(_, formProps) => (
            <>
              <p className="quiz-question-context">
                <span className="muted">Question</span> <strong>{nameOf(adding)}</strong>
              </p>
              <p className="form-hint">It is added after the last question; you can move it afterwards.</p>
              <QuizQuestionForm
                questionId={adding.id}
                defaultPoints={adding.defaultPoints}
                submitLabel="Add Question"
                submittingLabel="Adding…"
                {...formProps}
              />
            </>
          )}
        />
      )}
    </section>
  )
}

// One question of the bank with its type, concept, levels, default points and status, and whether it can be added.
function PickerItem({ question, inQuiz, addedRef, onAdd }) {
  const name = nameOf(question)
  const reason = ineligibleReason(question)
  return (
    <article className="structure-item structure-item-question">
      <div className="structure-item-header">
        <h3 className="structure-item-title">
          <span className="structure-item-name">{questionExcerpt(question.questionText)}</span>
        </h3>
        <div className="structure-item-actions">
          {inQuiz ? (
            <span ref={addedRef} className="quiz-picker-state" tabIndex={-1}>
              In this quiz<span className="visually-hidden">: {name}</span>
            </span>
          ) : isQuizEligible(question) ? (
            <button type="button" className="button button-secondary button-small" onClick={onAdd}>
              <span aria-hidden="true">+</span> Add<span className="visually-hidden"> question {name}</span>
            </button>
          ) : (
            <span className="quiz-picker-state muted">{reason}</span>
          )}
        </div>
      </div>

      <div className="structure-item-meta">
        <span className="content-type">
          {QUESTION_TYPE_LABELS[question.questionType] ?? formatEnumLabel(question.questionType)}
        </span>
        {question.concept && (
          <span>
            Concept {question.concept.code} {question.concept.name}
          </span>
        )}
        <span>Difficulty {formatEnumLabel(question.difficulty)}</span>
        <span>Bloom level {formatEnumLabel(question.bloomLevel)}</span>
        <span>{pointsText(question.defaultPoints)} by default</span>
        <StatusBadge status={question.status} />
      </div>
    </article>
  )
}
