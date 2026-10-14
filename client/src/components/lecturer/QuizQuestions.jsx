import { useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { QUIZ_LIMITS, isQuizEligible } from '../../constants/quiz.js'
import { QUESTION_TYPE_LABELS } from '../../constants/questionTypes.js'
import { removeQuizQuestion, updateQuizQuestion } from '../../services/api/assessment.api.js'
import { getActionErrorMessage } from '../../utils/errorMessages.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import { questionExcerpt } from '../../utils/questionText.js'
import MarkdownContent from '../MarkdownContent.jsx'
import StatusBadge from '../StatusBadge.jsx'
import ConfirmDeleteDialog from './ConfirmDeleteDialog.jsx'
import FormDialog from './FormDialog.jsx'
import QuizQuestionForm from './QuizQuestionForm.jsx'
import { explainFrozen, isFrozenError, pointsText, questionCountText } from './quizSummary.js'

const nameOf = (entry) => questionExcerpt(entry.question.questionText, 80)

// A position no question of the quiz uses: after the last one if possible, otherwise the first gap.
function freePosition(entries) {
  const used = new Set(entries.map((entry) => entry.sequenceOrder))
  const after = Math.max(0, ...used) + 1
  if (after <= QUIZ_LIMITS.SEQUENCE_ORDER) return after
  for (let position = 1; position <= QUIZ_LIMITS.SEQUENCE_ORDER; position += 1) {
    if (!used.has(position)) return position
  }
  return null
}

// The questions of a quiz in sequence order, with their points and section labels, which can be changed,
// reordered and removed. Every change is followed by `refresh()`, which loads the quiz again, so the list always
// shows the order and points as stored. `frozen`: students have attempted the quiz, so only section labels can
// change. `notify({ type, message })` reports the outcome on the page.
export default function QuizQuestions({ quiz, frozen, refresh, notify }) {
  // { type: 'edit', item } | { type: 'remove', item }
  const [dialog, setDialog] = useState(null)
  const [moving, setMoving] = useState(null)
  const movingRef = useRef(false)
  const moveButtonRefs = useRef({})
  const headingRef = useRef(null)
  const headingId = useId()
  const entries = quiz.questions

  function openDialog(next) {
    notify(null)
    setDialog(next)
  }

  // A 409 because the quiz has attempts means the page is out of date: reload it so it shows the quiz as frozen.
  function reportFailure(prefix, err) {
    notify({ type: 'error', message: `${prefix} ${getActionErrorMessage(explainFrozen(err))}` })
    if (isFrozenError(err)) refresh()
  }

  // Positions are unique, so two questions swap through a free position, one request at a time: the first
  // question moves out of the way, the second takes its place, then the first takes the second's old place.
  async function move(index, direction) {
    const entry = entries[index]
    const other = entries[index + direction]
    if (movingRef.current || !other) return
    movingRef.current = true
    setMoving(entry.id)
    notify(null)
    const steps = [
      [entry, freePosition(entries)],
      [other, entry.sequenceOrder],
      [entry, other.sequenceOrder],
    ]
    let completed = 0
    try {
      if (steps[0][1] == null) {
        throw new Error('Every position is in use, so the questions cannot be swapped.')
      }
      for (const [item, sequenceOrder] of steps) {
        await updateQuizQuestion(quiz.id, item.id, { sequenceOrder })
        completed += 1
      }
      notify({
        type: 'success',
        message: `Question "${nameOf(entry)}" moved ${direction < 0 ? 'up' : 'down'} to position ${index + direction + 1}.`,
      })
    } catch (err) {
      const prefix =
        completed === 0
          ? 'The order was not changed.'
          : 'The order was only partly saved; the list shows it as it is now stored.'
      if (err.status === undefined) notify({ type: 'error', message: `${prefix} ${err.message}` })
      else reportFailure(prefix, err)
    } finally {
      await refresh()
      flushSync(() => setMoving(null))
      movingRef.current = false
      moveButtonRefs.current[`${entry.id}:${direction}`]?.focus()
    }
  }

  function handleSaved() {
    setDialog(null)
    notify({ type: 'success', message: `Question "${nameOf(dialog.item)}" was updated.` })
    refresh()
  }

  // The question disappears with the control that opened the dialog, so focus moves to the list's heading.
  function handleRemoved(type, message) {
    flushSync(() => {
      setDialog(null)
      notify({ type, message })
    })
    headingRef.current?.focus()
    refresh()
  }

  const totalText = `${questionCountText(entries.length)}, ${pointsText(quiz.totalPoints)} in total`

  return (
    <section className="structure-list quiz-questions" aria-labelledby={headingId}>
      <div className="structure-list-header">
        <div className="structure-list-heading">
          <h2 id={headingId} ref={headingRef} className="structure-list-title" tabIndex={-1}>
            Questions
          </h2>
          <p className="muted structure-list-intro">
            {entries.length > 0 ? `${totalText}. ` : ''}
            {frozen
              ? 'Students have attempted this quiz, so only section labels can be changed.'
              : 'Students answer them in this order unless the quiz shuffles its questions.'}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="structure-empty">
          This quiz has no questions yet. Add approved or published questions from the question bank below; a quiz
          needs at least one before it can be published.
        </p>
      ) : (
        <ol className="structure-items quiz-question-items" aria-busy={Boolean(moving)}>
          {entries.map((entry, index) => (
            <li key={entry.id}>
              <QuizQuestionItem
                entry={entry}
                position={index + 1}
                frozen={frozen}
                moving={moving}
                isFirst={index === 0}
                isLast={index === entries.length - 1}
                moveButtonRef={(direction) => (element) => {
                  moveButtonRefs.current[`${entry.id}:${direction}`] = element
                }}
                onMove={(direction) => move(index, direction)}
                onEdit={() => openDialog({ type: 'edit', item: entry })}
                onRemove={() => openDialog({ type: 'remove', item: entry })}
              />
            </li>
          ))}
        </ol>
      )}

      {dialog?.type === 'edit' && (
        <FormDialog
          title={frozen ? 'Edit section label' : 'Edit quiz question'}
          noun="quiz question"
          size="narrow"
          save={(changes) =>
            updateQuizQuestion(quiz.id, dialog.item.id, changes).catch((err) => {
              if (isFrozenError(err)) refresh()
              throw explainFrozen(err)
            })
          }
          onSaved={handleSaved}
          onMissing={() => handleRemoved('error', `Question "${nameOf(dialog.item)}" is no longer in this quiz.`)}
          onClose={() => setDialog(null)}
          renderForm={(_, formProps) => (
            <>
              <p className="quiz-question-context">
                <span className="muted">Question</span> <strong>{nameOf(dialog.item)}</strong>
              </p>
              <QuizQuestionForm
                entry={dialog.item}
                defaultPoints={dialog.item.question.defaultPoints}
                frozen={frozen}
                submitLabel="Save changes"
                submittingLabel="Saving…"
                {...formProps}
              />
            </>
          )}
        />
      )}
      {dialog?.type === 'remove' && (
        <ConfirmDeleteDialog
          noun="quiz question"
          verb="remove"
          confirmLabel="Remove Question"
          remove={() =>
            removeQuizQuestion(quiz.id, dialog.item.id).catch((err) => {
              if (isFrozenError(err)) refresh()
              throw explainFrozen(err)
            })
          }
          onDeleted={() => handleRemoved('success', `Question "${nameOf(dialog.item)}" was removed from the quiz.`)}
          onMissing={() => handleRemoved('error', `Question "${nameOf(dialog.item)}" is no longer in this quiz.`)}
          onClose={() => setDialog(null)}
        >
          <p>
            You are about to remove the question <strong>{nameOf(dialog.item)}</strong> from this quiz. It stays in the
            question bank and can be added again.
          </p>
          <p className="muted">
            Questions cannot be removed once students have attempted the quiz, and a published quiz must keep at least
            one question.
          </p>
        </ConfirmDeleteDialog>
      )}
    </section>
  )
}

// One question of the quiz: its position, text, type, concept, levels, points and section label, with a preview
// of the full text and its move, edit and remove actions. Its answers are never shown here.
function QuizQuestionItem({ entry, position, frozen, moving, isFirst, isLast, moveButtonRef, onMove, onEdit, onRemove }) {
  const { question } = entry
  const name = nameOf(entry)
  const busy = Boolean(moving)

  // aria-disabled rather than disabled, so a moved question's button keeps keyboard focus.
  function moveButton(direction, label, blocked) {
    const unavailable = busy || blocked
    return (
      <button
        ref={moveButtonRef(direction)}
        type="button"
        className="button button-secondary button-small"
        aria-disabled={unavailable}
        onClick={() => !unavailable && onMove(direction)}
      >
        {moving === entry.id ? 'Moving…' : label}
        <span className="visually-hidden"> question {name}</span>
      </button>
    )
  }

  return (
    <article className="structure-item structure-item-question">
      <div className="structure-item-header">
        <h3 className="structure-item-title quiz-question-title">
          <span className="quiz-question-position" aria-hidden="true">
            {position}.
          </span>
          <span className="visually-hidden">Position {position}: </span>{' '}
          <span className="structure-item-name">{questionExcerpt(question.questionText)}</span>
        </h3>
        <div className="structure-item-actions">
          {!frozen && moveButton(-1, 'Move up', isFirst)}
          {!frozen && moveButton(1, 'Move down', isLast)}
          <button type="button" className="button button-secondary button-small" onClick={onEdit} disabled={busy}>
            {frozen ? 'Edit section' : 'Edit'}
            <span className="visually-hidden"> question {name}</span>
          </button>
          {!frozen && (
            <button type="button" className="button button-danger-outline button-small" onClick={onRemove} disabled={busy}>
              Remove<span className="visually-hidden"> question {name}</span>
            </button>
          )}
        </div>
      </div>

      <div className="structure-item-meta">
        {entry.sectionLabel && <span className="content-type">{entry.sectionLabel}</span>}
        <span>{pointsText(entry.points)}</span>
        <span>{QUESTION_TYPE_LABELS[question.questionType] ?? formatEnumLabel(question.questionType)}</span>
        <span>
          Concept {question.concept.code} {question.concept.name}
        </span>
        <span>Difficulty {formatEnumLabel(question.difficulty)}</span>
        <span>Bloom level {formatEnumLabel(question.bloomLevel)}</span>
        <StatusBadge status={question.status} />
      </div>

      {!isQuizEligible(question) && (
        <p className="alert alert-warning quiz-question-warning">
          This question can no longer be used in a quiz: only approved or published questions of a gradable type
          can. The quiz cannot be published again until the question is approved in the question bank or removed
          from the quiz.
        </p>
      )}

      <details className="quiz-question-preview">
        <summary>Show full question</summary>
        <MarkdownContent source={question.questionText} />
      </details>
    </article>
  )
}
