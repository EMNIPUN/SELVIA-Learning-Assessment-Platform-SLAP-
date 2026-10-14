import { EXERCISE_TYPE } from '../../constants/exerciseTypes.js'
import { QUESTION_TYPE } from '../../constants/questionTypes.js'
import { answerConfigOf, answerProblem, answerStateFrom } from './answerConfig.js'

// The answers of a question as the form edits them, and the answerConfig the question bank API stores:
//   MULTIPLE_CHOICE_SINGLE: { options: [{ id, text }], correct_option_ids: [id], shuffle_options }
//   SHORT_ANSWER:           { accepted_answers: [text], case_sensitive, requires_manual_grading: false }
// Options and accepted answers have the same shape and limits as those of practice exercises, so they are
// edited with the same editor; the question-only keys are added here.

export const EDITOR_TYPE = Object.freeze({
  [QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE]: EXERCISE_TYPE.MULTIPLE_CHOICE,
  [QUESTION_TYPE.SHORT_ANSWER]: EXERCISE_TYPE.SHORT_ANSWER,
})

// Like answerStateFrom, the state keeps the answers of both types, so switching the type back restores them.
export function questionAnswerStateFrom(questionType, answerConfig) {
  return {
    ...answerStateFrom(EDITOR_TYPE[questionType], answerConfig),
    shuffleOptions: questionType === QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE && answerConfig?.shuffle_options === true,
  }
}

// The answerConfig for the chosen type only; undefined for a type the form cannot configure. Manual grading does
// not exist, so short answers are always graded automatically.
export function questionAnswerConfigOf(questionType, state) {
  const config = answerConfigOf(EDITOR_TYPE[questionType], state)
  if (questionType === QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE) return { ...config, shuffle_options: state.shuffleOptions }
  if (questionType === QUESTION_TYPE.SHORT_ANSWER) return { ...config, requires_manual_grading: false }
  return undefined
}

// The first problem with the answers, as answerProblem reports it; null when the API would accept them.
export const questionAnswerProblem = (questionType, state) => answerProblem(EDITOR_TYPE[questionType], state)
