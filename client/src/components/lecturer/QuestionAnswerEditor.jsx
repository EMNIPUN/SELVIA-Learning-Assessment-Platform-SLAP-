import { QUESTION_TYPE, QUESTION_TYPE_LABELS } from '../../constants/questionTypes.js'
import AnswerConfigEditor from './AnswerConfigEditor.jsx'
import { EDITOR_TYPE } from './questionAnswerConfig.js'

// The answers of a question: the options, the correct one and whether to shuffle them for multiple choice, or the
// accepted answers and case sensitivity for short answer. `value` is the state from questionAnswerStateFrom; `ref`
// receives focus() from the answer editor. `replacing` names the saved type whose answers a new type would
// replace, so the lecturer knows the saved answers are not carried over.
export default function QuestionAnswerEditor({ id, questionType, value, onChange, invalid, replacing, ref }) {
  const editorType = EDITOR_TYPE[questionType]
  if (!editorType) {
    return <p className="answer-editor-empty">Choose a question type above to set up its answers.</p>
  }

  return (
    <>
      {replacing && (
        <p className="alert alert-warning">
          This question is saved as {QUESTION_TYPE_LABELS[replacing] ?? 'another type'}. Saving it as{' '}
          {QUESTION_TYPE_LABELS[questionType]} replaces all of its saved answers with the ones below, so set them up
          now. To keep the saved answers, choose {QUESTION_TYPE_LABELS[replacing] ?? 'the saved type'} again.
        </p>
      )}
      <AnswerConfigEditor id={id} exerciseType={editorType} value={value} onChange={onChange} invalid={invalid} ref={ref} />
      {questionType === QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE && (
        <div className="answer-case">
          <label className="form-choice-option">
            <input
              type="checkbox"
              checked={value.shuffleOptions}
              onChange={(event) => onChange((current) => ({ ...current, shuffleOptions: event.target.checked }))}
              aria-describedby={`${id}-shuffle-hint`}
            />
            Shuffle the options
          </label>
          <span id={`${id}-shuffle-hint`} className="form-hint">
            When on, each student sees the options in a different order. When off, they appear in the order above.
          </span>
        </div>
      )}
      {questionType === QUESTION_TYPE.SHORT_ANSWER && (
        <p className="form-hint">
          Answers are graded automatically by comparing them with the accepted answers. Manual grading is not
          available.
        </p>
      )}
    </>
  )
}
