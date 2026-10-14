import { useId } from 'react'
import { QUESTION_TYPE } from '../constants/questionTypes.js'
import { SAVE_STATUS } from '../services/answerSaveQueue.js'
import { getErrorMessage } from '../utils/errorMessages.js'
import MarkdownContent from './MarkdownContent.jsx'

// The same limit the API applies to answer text.
export const MAX_ANSWER_LENGTH = 1000

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

const STATUS_TEXT = {
  [SAVE_STATUS.WAITING]: 'Not saved yet',
  [SAVE_STATUS.SAVING]: 'Saving…',
  [SAVE_STATUS.SAVED]: 'Saved',
  [SAVE_STATUS.FAILED]: 'Save failed',
  [SAVE_STATUS.REJECTED]: 'Not saved: this attempt no longer accepts changes',
}

// `error` is set only when the server refused this answer itself; a lost connection is reported for the page.
function SaveStatus({ status, error, onRetry }) {
  if (!status) return null
  return (
    <div className={`attempt-save-status attempt-save-${status.toLowerCase()}`}>
      <span>{STATUS_TEXT[status]}</span>
      {status === SAVE_STATUS.FAILED && (
        <>
          {error && <span className="attempt-save-message">{getErrorMessage(error)}</span>}
          <button type="button" className="button button-secondary button-small" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </div>
  )
}

function ChoiceInput({ question, value, disabled, onSelect }) {
  const name = useId()
  return (
    <fieldset className="exercise-options" disabled={disabled}>
      <legend className="visually-hidden">Answer for question {question.position}</legend>
      {question.options.map((option) => (
        <label key={option.id} className="exercise-option">
          <input
            type="radio"
            name={name}
            value={option.id}
            checked={value === option.id}
            onChange={() => onSelect(option.id)}
          />
          <span>{option.text}</span>
        </label>
      ))}
    </fieldset>
  )
}

function TextInput({ question, value, disabled, onChange, onBlur }) {
  const id = useId()
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        Your answer<span className="visually-hidden"> to question {question.position}</span>
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        maxLength={MAX_ANSWER_LENGTH}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </div>
  )
}

// One question of an open attempt. `draft` is what the student has entered on this page: an option id or null for
// a choice question, text for a short answer. Whether it is saved is shown by `status`, which only the server's
// confirmation turns into Saved. Nothing here knows or shows whether an answer is correct.
export default function AttemptQuestion({ question, draft, status, error, disabled, onSelect, onTextChange, onTextBlur, onRetry }) {
  const isChoice = question.questionType === QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE && Array.isArray(question.options)
  const isText = question.questionType === QUESTION_TYPE.SHORT_ANSWER

  return (
    <li className="attempt-question">
      <div className="attempt-question-header">
        <h3 id={`attempt-question-${question.id}`} className="attempt-question-number">
          Question {question.position}
        </h3>
        <span className="attempt-question-points">{plural(question.points, 'point')}</span>
      </div>
      {question.sectionLabel && <p className="attempt-question-section">{question.sectionLabel}</p>}
      <MarkdownContent source={question.questionText} className="attempt-question-text" />

      {isChoice && (
        <>
          <ChoiceInput question={question} value={draft} disabled={disabled} onSelect={onSelect} />
          {draft && !disabled && (
            <div>
              <button type="button" className="button button-secondary button-small" onClick={() => onSelect(null)}>
                Clear selection<span className="visually-hidden"> for question {question.position}</span>
              </button>
            </div>
          )}
        </>
      )}
      {isText && (
        <TextInput question={question} value={draft} disabled={disabled} onChange={onTextChange} onBlur={onTextBlur} />
      )}
      {!isChoice && !isText && <p className="attempt-question-unanswered">This type of question cannot be answered here.</p>}

      <SaveStatus status={status} error={error} onRetry={onRetry} />
    </li>
  )
}
