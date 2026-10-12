import { useEffect, useImperativeHandle, useRef } from 'react'
import { EXERCISE_TYPE } from '../../constants/exerciseTypes.js'
import {
  ACCEPTED_ANSWER_MAX_LENGTH,
  answerProblem,
  MAX_ACCEPTED_ANSWERS,
  MAX_OPTIONS,
  MIN_ACCEPTED_ANSWERS,
  MIN_OPTIONS,
  newAcceptedAnswer,
  newOption,
  OPTION_MAX_LENGTH,
} from './answerConfig.js'

// The answers of a practice exercise: the options and the correct one for multiple choice, or the accepted
// answers and case sensitivity for short answer. `value` is the state from answerStateFrom; `ref` receives
// focus(), which goes to the first problem the form reports, or the first input.
// An added item's input receives focus; after a removal focus moves to the neighbouring item.
export default function AnswerConfigEditor({ id, exerciseType, value, onChange, invalid, ref }) {
  const inputRefs = useRef(new Map())
  const firstRadioRef = useRef(null)
  const addRef = useRef(null)
  const pendingFocus = useRef(null)
  const isMultipleChoice = exerciseType === EXERCISE_TYPE.MULTIPLE_CHOICE
  const items = isMultipleChoice ? value.options : value.answers
  const keyOf = (item) => (isMultipleChoice ? item.id : item.key)
  const problem = invalid ? answerProblem(exerciseType, value) : null
  const errorId = `${id}-error`

  useEffect(() => {
    if (pendingFocus.current === null) return
    const key = pendingFocus.current
    pendingFocus.current = null
    ;(inputRefs.current.get(key) ?? addRef.current)?.focus()
  })

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        const target = answerProblem(exerciseType, value)?.focus ?? { index: 0 }
        if (target.correct) firstRadioRef.current?.focus()
        else if (target.add) addRef.current?.focus()
        else if (items[target.index]) inputRefs.current.get(keyOf(items[target.index]))?.focus()
      },
    }),
    [exerciseType, value],
  )

  if (exerciseType !== EXERCISE_TYPE.MULTIPLE_CHOICE && exerciseType !== EXERCISE_TYPE.SHORT_ANSWER) {
    return <p className="answer-editor-empty">Choose an exercise type above to set up its answers.</p>
  }

  const listKey = isMultipleChoice ? 'options' : 'answers'
  const minItems = isMultipleChoice ? MIN_OPTIONS : MIN_ACCEPTED_ANSWERS
  const maxItems = isMultipleChoice ? MAX_OPTIONS : MAX_ACCEPTED_ANSWERS
  const itemLabel = isMultipleChoice ? 'Option' : 'Accepted answer'

  // Changes apply to the current answers, so quick successive edits are never lost.
  const update = (change) => onChange((current) => ({ ...current, ...change(current) }))

  function editText(key, text) {
    update((current) => ({
      [listKey]: current[listKey].map((item) => (keyOf(item) === key ? { ...item, text } : item)),
    }))
  }

  function addItem() {
    const item = isMultipleChoice ? newOption(items) : newAcceptedAnswer()
    pendingFocus.current = keyOf(item)
    update((current) => ({ [listKey]: [...current[listKey], item] }))
  }

  // Removing the correct option leaves no correct answer until another one is marked.
  function removeItem(key) {
    const index = items.findIndex((item) => keyOf(item) === key)
    const remaining = items.filter((item) => keyOf(item) !== key)
    pendingFocus.current = keyOf(remaining[Math.min(index, remaining.length - 1)])
    update((current) => ({
      [listKey]: current[listKey].filter((item) => keyOf(item) !== key),
      ...(isMultipleChoice && current.correctId === key ? { correctId: null } : {}),
    }))
  }

  const inputRef = (key) => (element) => {
    if (element) inputRefs.current.set(key, element)
    else inputRefs.current.delete(key)
  }

  return (
    <div className="answer-editor">
      <ol className="answer-items">
        {items.map((item, index) => {
          const key = keyOf(item)
          const inputId = `${id}-${key}`
          const number = index + 1
          const isCorrect = isMultipleChoice && item.id === value.correctId
          const hasProblem = problem?.focus.index === index
          return (
            <li key={key} className={`answer-item${isCorrect ? ' answer-item-correct' : ''}`}>
              <div className="answer-item-header">
                <label className="answer-item-label" htmlFor={inputId}>
                  {itemLabel} {number}
                </label>
                {isCorrect && (
                  <span className="answer-correct-badge" aria-hidden="true">
                    ✓ Correct answer
                  </span>
                )}
              </div>
              <input
                ref={inputRef(key)}
                id={inputId}
                type="text"
                autoComplete="off"
                value={item.text}
                maxLength={isMultipleChoice ? OPTION_MAX_LENGTH : ACCEPTED_ANSWER_MAX_LENGTH}
                onChange={(event) => editText(key, event.target.value)}
                aria-invalid={hasProblem}
                aria-describedby={hasProblem ? errorId : undefined}
              />
              <div className="answer-item-actions">
                {isMultipleChoice && (
                  <label className="form-choice-option">
                    <input
                      ref={index === 0 ? firstRadioRef : undefined}
                      type="radio"
                      name={`${id}-correct`}
                      checked={isCorrect}
                      onChange={() => update(() => ({ correctId: item.id }))}
                      aria-invalid={Boolean(problem?.focus.correct)}
                      aria-describedby={problem?.focus.correct ? errorId : undefined}
                    />
                    Correct answer<span className="visually-hidden"> is option {number}</span>
                  </label>
                )}
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => removeItem(key)}
                  disabled={items.length <= minItems}
                >
                  Remove
                  <span className="visually-hidden">
                    {' '}
                    {itemLabel.toLowerCase()} {number}
                  </span>
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      <button
        ref={addRef}
        type="button"
        className="button button-secondary button-small answer-add"
        onClick={addItem}
        disabled={items.length >= maxItems}
      >
        <span aria-hidden="true">+</span> Add {isMultipleChoice ? 'option' : 'accepted answer'}
      </button>

      {!isMultipleChoice && (
        <div className="answer-case">
          <label className="form-choice-option">
            <input
              type="checkbox"
              checked={value.caseSensitive}
              onChange={(event) => update(() => ({ caseSensitive: event.target.checked }))}
              aria-describedby={`${id}-case-hint`}
            />
            Case-sensitive
          </label>
          <span id={`${id}-case-hint`} className="form-hint">
            When off, capital and small letters count as the same, so “Paris” matches “paris”. Spaces before and
            after an answer, and repeated spaces, are always ignored.
          </span>
        </div>
      )}
    </div>
  )
}
