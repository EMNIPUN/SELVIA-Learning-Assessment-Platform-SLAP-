import { useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { CONTENT_STATUS, CONTENT_STATUSES } from '../../constants/contentStatus.js'
import { BLOOM_LEVELS, DIFFICULTY_LEVELS } from '../../constants/exerciseTypes.js'
import { BANK_QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../../constants/questionTypes.js'
import { useApiRequest } from '../../hooks/useApiRequest.js'
import { ApiRequestError } from '../../services/api/client.js'
import {
  createQuestion,
  deleteQuestion,
  getQuestion,
  listConceptQuestions,
  updateQuestion,
} from '../../services/api/question.api.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import { questionExcerpt } from '../../utils/questionText.js'
import ErrorState from '../ErrorState.jsx'
import LoadingState from '../LoadingState.jsx'
import StatusBadge from '../StatusBadge.jsx'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx'
import FilterSelect from './FilterSelect.jsx'
import FormDialog from './FormDialog.jsx'
import LevelHeading from './LevelHeading.jsx'
import QuestionForm from './QuestionForm.jsx'
import StatusChangeDialog from './StatusChangeDialog.jsx'
import { useStructureFeedback } from './structureFeedback.js'

const PAGE_SIZE = 20
const SEARCH_MAX_LENGTH = 200
const NO_FILTERS = Object.freeze({ search: '', status: '', questionType: '', difficulty: '', bloomLevel: '' })

// Students never open the question bank: they meet a question only inside an assessment. Only approved or
// published questions are meant to be used in assessments (docs/database-design.md, section 5.14).
const STATUS_EFFECTS = {
  [CONTENT_STATUS.DRAFT]: 'Use this while the question is being written or revised. Any earlier approval is cleared.',
  [CONTENT_STATUS.UNDER_REVIEW]: 'Marks it as ready to be checked. Any earlier approval is cleared.',
  [CONTENT_STATUS.APPROVED]: 'Marks it as checked. Approved questions can be used in assessments.',
  [CONTENT_STATUS.PUBLISHED]:
    'Marks it as ready for use in assessments. Students still never open the question bank: they see a question only in an assessment.',
  [CONTENT_STATUS.ARCHIVED]: 'Retires it from use. Nothing is deleted, and its status can be changed again later.',
}

const PROTECTED_FIELDS = ['questionText', 'questionType', 'answerConfig']
const PROTECTED_EDIT_MESSAGE =
  'This question is already used in an assessment, so its text, type and answers can no longer be changed. You can still change its explanation, difficulty, Bloom level, default points and status. Undo the changes to the highlighted fields to save the rest.'

// A 409 for the text, type or answers of a question in use gets an explanation above the highlighted fields.
function explainProtectedEdit(err) {
  if (err.status !== 409 || !err.details?.some((detail) => PROTECTED_FIELDS.includes(detail.field))) return err
  return new ApiRequestError(err.status, err.message, [{ message: PROTECTED_EDIT_MESSAGE }, ...err.details])
}

const nameOf = (question) => questionExcerpt(question.questionText, 80)

// How many answers a question has, never the answers themselves.
function answerSummary({ answerConfig }) {
  const count = (number, word) => `${number} ${word}${number === 1 ? '' : 's'}`
  if (Array.isArray(answerConfig?.options)) {
    return `${count(answerConfig.options.length, 'option')}${answerConfig.shuffle_options ? ', shuffled' : ''}`
  }
  if (Array.isArray(answerConfig?.accepted_answers)) {
    return `${count(answerConfig.accepted_answers.length, 'accepted answer')}${answerConfig.case_sensitive ? ', case-sensitive' : ''}`
  }
  return null
}

// Whether a question appears under the current filters, as the API applies them.
function matchesFilters(question, filters) {
  return (
    (!filters.search || question.questionText.toLowerCase().includes(filters.search.toLowerCase())) &&
    ['status', 'questionType', 'difficulty', 'bloomLevel'].every((name) => !filters[name] || question[name] === filters[name])
  )
}

// The questions of a concept for the course's owner, with search, filters and pages, and add, edit, status and
// delete. Nothing is requested until the section is first opened; collapsing it keeps what was loaded. The API
// lists questions newest first, so after an addition or deletion the current page is loaded again; edits and
// status changes replace the question in place. New questions start as drafts; only the status dialog changes
// a status.
export default function QuestionBank({ concept, headingLevel }) {
  const { feedback, notify } = useStructureFeedback()
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [searchText, setSearchText] = useState('')
  // { type: 'create' } | { type: 'edit', item } | { type: 'status', item } | { type: 'delete', item }
  const [dialog, setDialog] = useState(null)
  const [offset, setOffset] = useState(0)
  const addButtonRef = useRef(null)
  const searchRef = useRef(null)
  const resultsRef = useRef(null)
  const focusResultsRef = useRef(false)
  const headingId = useId()
  const bodyId = useId()
  const filterId = useId()

  const { data, error, loading, reload, updateData } = useApiRequest(
    (signal) => listConceptQuestions(concept.id, { ...filters, limit: PAGE_SIZE, offset }, { signal }),
    [concept.id, filters, offset],
    { enabled: opened },
  )

  const questions = data?.questions ?? []
  const total = data?.pagination.total ?? 0
  const filtersActive = Object.values(filters).some(Boolean)
  const feedbackKey = `question:${concept.id}`
  const ownFeedback = feedback?.key === feedbackKey ? feedback : null

  // Changing the page hides the page buttons while it loads, so focus moves to the new page's summary.
  useEffect(() => {
    if (loading || !focusResultsRef.current) return
    focusResultsRef.current = false
    resultsRef.current?.focus()
  }, [loading])

  // Questions deleted elsewhere can leave the current page past the end of the list.
  useEffect(() => {
    if (!loading && data && data.questions.length === 0 && offset > 0) {
      setOffset(Math.max(0, Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE))
    }
  }, [loading, data, offset, total])

  function toggle() {
    setExpanded((value) => !value)
    setOpened(true)
  }

  function show(type, message) {
    notify({ key: feedbackKey, type, message })
  }

  function openDialog(next) {
    notify(null)
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

  function replaceQuestion(question) {
    updateData((current) =>
      current && { ...current, questions: current.questions.map((existing) => (existing.id === question.id ? question : existing)) },
    )
  }

  function handleCreated(question) {
    setDialog(null)
    setOffset(0)
    reload()
    const hidden = matchesFilters(question, filters) ? '' : ' It is not listed because of the current search or filters.'
    show('success', `Question "${nameOf(question)}" was added as a draft.${hidden}`)
  }

  function handleSaved(question) {
    replaceQuestion(question)
    setDialog(null)
    show('success', `Question "${nameOf(question)}" was updated.`)
  }

  function handleStatusChanged(question) {
    replaceQuestion(question)
    setDialog(null)
    show('success', `Question "${nameOf(question)}" is now ${formatEnumLabel(question.status)}.`)
  }

  // The question disappears with the control that opened the dialog, so focus moves to the add button. The page
  // is loaded again so the count and the following questions are up to date.
  function removeQuestion(type, message) {
    flushSync(() => {
      setDialog(null)
      show(type, message)
      if (questions.length === 1 && offset > 0) setOffset(offset - PAGE_SIZE)
      else reload()
    })
    addButtonRef.current?.focus()
  }

  function handleDeleted(item) {
    removeQuestion('success', `Question "${nameOf(item)}" was deleted.`)
  }

  function handleMissing(item) {
    removeQuestion('error', `Question "${nameOf(item)}" no longer exists, so it was removed from this page.`)
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
        ? `${total} question${total === 1 ? '' : 's'}${matching}.`
        : `Showing ${first}–${last} of ${total} questions${matching}.`

  return (
    <section className="structure-list structure-list-question" aria-labelledby={headingId}>
      <div className="structure-list-header">
        <div className="structure-list-heading">
          <LevelHeading level={headingLevel} className="structure-list-title">
            <button
              type="button"
              className="structure-toggle structure-list-toggle"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={toggle}
            >
              <span className="structure-toggle-icon" aria-hidden="true">
                ▸
              </span>
              <span id={headingId}>
                Questions<span className="visually-hidden"> for {concept.name}</span>
              </span>
            </button>
          </LevelHeading>
          {expanded && (
            <p className="muted structure-list-intro">
              Reusable questions that assess this concept, with their correct answers. Students never see the question
              bank.
            </p>
          )}
        </div>
        {expanded && (
          <button
            ref={addButtonRef}
            type="button"
            className="button button-secondary button-small"
            onClick={() => openDialog({ type: 'create' })}
            disabled={!data}
          >
            <span aria-hidden="true">+</span> Add Question
            <span className="visually-hidden"> to {concept.name}</span>
          </button>
        )}
      </div>

      <div id={bodyId} hidden={!expanded}>
        <div role="status" aria-live="polite">
          {ownFeedback?.type === 'success' && <p className="alert alert-success">{ownFeedback.message}</p>}
        </div>
        <div role="alert">
          {ownFeedback?.type === 'error' && <p className="alert alert-error">{ownFeedback.message}</p>}
        </div>

        {(filtersActive || total > 0) && (
          <form
            className="question-filters"
            role="search"
            aria-label={`Search and filter the questions for ${concept.name}`}
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
        )}

        <p ref={resultsRef} className="structure-status-summary question-results" role="status" tabIndex={-1}>
          {summary}
        </p>

        {loading && <LoadingState message="Loading questions…" />}
        {!loading && error && (
          <ErrorState error={error} title="Could not load the questions" onRetry={reload} />
        )}
        {!loading && !error && data && total === 0 && (
          <p className="structure-empty">
            {filtersActive
              ? 'No questions for this concept match the search and filters. Use Clear filters to see them all.'
              : 'This concept has no questions yet. Use Add Question to create the first one.'}
          </p>
        )}
        {!loading && !error && questions.length > 0 && (
          <ul className="structure-items">
            {questions.map((question) => (
              <li key={question.id}>
                <QuestionItem
                  question={question}
                  headingLevel={headingLevel + 1}
                  onEdit={() => openDialog({ type: 'edit', item: question })}
                  onChangeStatus={() => openDialog({ type: 'status', item: question })}
                  onDelete={() => openDialog({ type: 'delete', item: question })}
                />
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && total > PAGE_SIZE && (
          <nav className="question-pagination" aria-label={`Pages of questions for ${concept.name}`}>
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
      </div>

      {dialog?.type === 'create' && (
        <FormDialog
          title="Add question"
          noun="question"
          size="wide"
          save={(fields) => createQuestion(concept.id, fields)}
          onSaved={handleCreated}
          onClose={() => setDialog(null)}
          renderForm={(_, formProps) => (
            <QuestionForm submitLabel="Add Question" submittingLabel="Adding…" {...formProps} />
          )}
        />
      )}
      {dialog?.type === 'edit' && (
        <FormDialog
          title="Edit question"
          noun="question"
          size="wide"
          load={(signal) => getQuestion(dialog.item.id, { signal })}
          save={(changes) =>
            updateQuestion(dialog.item.id, changes).catch((err) => {
              throw explainProtectedEdit(err)
            })
          }
          onSaved={handleSaved}
          onMissing={() => handleMissing(dialog.item)}
          onClose={() => setDialog(null)}
          renderForm={(question, formProps) => (
            <QuestionForm question={question} submitLabel="Save changes" submittingLabel="Saving…" {...formProps} />
          )}
        />
      )}
      {dialog?.type === 'status' && (
        <StatusChangeDialog
          noun="question"
          nameOf={nameOf}
          statuses={CONTENT_STATUSES}
          scope={{ effects: STATUS_EFFECTS }}
          load={(signal) => getQuestion(dialog.item.id, { signal })}
          save={(status) => updateQuestion(dialog.item.id, { status })}
          onLoaded={replaceQuestion}
          onSaved={handleStatusChanged}
          onMissing={() => handleMissing(dialog.item)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDeleteDialog
          noun="question"
          confirmLabel="Delete Question"
          remove={() => deleteQuestion(dialog.item.id)}
          onDeleted={() => handleDeleted(dialog.item)}
          onMissing={() => handleMissing(dialog.item)}
          onClose={() => setDialog(null)}
        >
          <p>
            You are about to permanently delete the question <strong>{nameOf(dialog.item)}</strong>, with its answers
            and explanation. This cannot be undone.
          </p>
          <p className="muted">
            A question cannot be deleted while an assessment uses it, a learning activity refers to it, or a later
            version of it exists; nothing that refers to it is ever deleted with it. Use Change status to archive it
            instead.
          </p>
        </ConfirmDeleteDialog>
      )}
    </section>
  )
}

// One question with its type, levels, points and answer counts (never the answers), and its edit, status and
// delete actions.
function QuestionItem({ question, headingLevel, onEdit, onChangeStatus, onDelete }) {
  const name = nameOf(question)
  const answers = answerSummary(question)
  return (
    <article className="structure-item structure-item-question">
      <div className="structure-item-header">
        <LevelHeading level={headingLevel} className="structure-item-title">
          <span className="structure-item-name">{questionExcerpt(question.questionText)}</span>
        </LevelHeading>
        <div className="structure-item-actions">
          <button type="button" className="button button-secondary button-small" onClick={onEdit}>
            Edit<span className="visually-hidden"> question {name}</span>
          </button>
          <button type="button" className="button button-secondary button-small" onClick={onChangeStatus}>
            Change status<span className="visually-hidden"> of question {name}</span>
          </button>
          <button type="button" className="button button-danger-outline button-small" onClick={onDelete}>
            Delete<span className="visually-hidden"> question {name}</span>
          </button>
        </div>
      </div>

      <div className="structure-item-meta">
        <span className="content-type">{QUESTION_TYPE_LABELS[question.questionType] ?? formatEnumLabel(question.questionType)}</span>
        {answers && <span>Answers {answers}</span>}
        <span>Difficulty {formatEnumLabel(question.difficulty)}</span>
        <span>Bloom level {formatEnumLabel(question.bloomLevel)}</span>
        <span>
          {question.defaultPoints} point{question.defaultPoints === 1 ? '' : 's'}
        </span>
        <span>Explanation {question.explanation ? 'included' : 'none'}</span>
        {question.version > 1 && <span>Version {question.version}</span>}
        <StatusBadge status={question.status} />
      </div>
    </article>
  )
}
