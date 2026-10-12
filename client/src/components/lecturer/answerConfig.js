import { EXERCISE_TYPE } from '../../constants/exerciseTypes.js'

// The answers of a practice exercise as the form edits them, and the answerConfig the API stores:
//   MULTIPLE_CHOICE: { options: [{ id, text }], correct_option_ids: [id] }
//   SHORT_ANSWER:    { accepted_answers: [text], case_sensitive }
// The API's limits for answer configurations:
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 10
export const OPTION_MAX_LENGTH = 1000
export const MIN_ACCEPTED_ANSWERS = 1
export const MAX_ACCEPTED_ANSWERS = 20
export const ACCEPTED_ANSWER_MAX_LENGTH = 200
const CONFIG_MAX_LENGTH = 20_000

// Students' attempts record the id of the option they chose, so existing options keep their id and a new
// option gets one that is unlikely to have been used before in this exercise.
export function newOption(options) {
  let id
  do {
    id = `opt-${Math.random().toString(36).slice(2, 10)}`
  } while (options.some((option) => option.id === id))
  return { id, text: '' }
}

let lastAnswerKey = 0
export const newAcceptedAnswer = (text = '') => ({ key: `answer-${(lastAnswerKey += 1)}`, text })

// The form keeps the answers of both types, so switching the type back and forth loses nothing; only the
// chosen type's answers are sent.
export function answerStateFrom(exerciseType, answerConfig) {
  const first = newOption([])
  const state = {
    options: [first, newOption([first])],
    correctId: null,
    answers: [newAcceptedAnswer()],
    caseSensitive: false,
  }
  if (exerciseType === EXERCISE_TYPE.MULTIPLE_CHOICE && Array.isArray(answerConfig?.options)) {
    state.options = answerConfig.options.map(({ id, text }) => ({ id, text }))
    state.correctId = answerConfig.correct_option_ids?.[0] ?? null
  }
  if (exerciseType === EXERCISE_TYPE.SHORT_ANSWER && Array.isArray(answerConfig?.accepted_answers)) {
    state.answers = answerConfig.accepted_answers.map((text) => newAcceptedAnswer(text))
    state.caseSensitive = answerConfig.case_sensitive === true
  }
  return state
}

// The answerConfig for the chosen type, with surrounding spaces removed as the API does; undefined for a
// type the form cannot configure.
export function answerConfigOf(exerciseType, state) {
  if (exerciseType === EXERCISE_TYPE.MULTIPLE_CHOICE) {
    return {
      options: state.options.map(({ id, text }) => ({ id, text: text.trim() })),
      correct_option_ids: state.correctId ? [state.correctId] : [],
    }
  }
  if (exerciseType === EXERCISE_TYPE.SHORT_ANSWER) {
    return { accepted_answers: state.answers.map(({ text }) => text.trim()), case_sensitive: state.caseSensitive }
  }
  return undefined
}

function textProblem(text, label, maxLength) {
  const length = text.trim().length
  if (length === 0) return `${label} is required`
  if (length > maxLength) return `${label} must be at most ${maxLength} characters`
  return undefined
}

// The first problem with the answers, in the order they are shown: { message, focus } where `focus` is
// { index } for an option or accepted answer, { correct: true } for the correct-answer choice or
// { add: true } for the add button. null when the API would accept them.
export function answerProblem(exerciseType, state) {
  if (exerciseType === EXERCISE_TYPE.MULTIPLE_CHOICE) {
    const { options, correctId } = state
    if (options.length < MIN_OPTIONS) return { message: `Provide at least ${MIN_OPTIONS} options`, focus: { add: true } }
    if (options.length > MAX_OPTIONS) return { message: `Provide at most ${MAX_OPTIONS} options`, focus: { index: 0 } }
    for (const [index, option] of options.entries()) {
      const message = textProblem(option.text, `Option ${index + 1} text`, OPTION_MAX_LENGTH)
      if (message) return { message, focus: { index } }
    }
    if (!options.some((option) => option.id === correctId)) {
      return { message: 'Mark exactly one option as correct', focus: { correct: true } }
    }
  } else if (exerciseType === EXERCISE_TYPE.SHORT_ANSWER) {
    const { answers } = state
    if (answers.length < MIN_ACCEPTED_ANSWERS) {
      return { message: 'Provide at least one accepted answer', focus: { add: true } }
    }
    if (answers.length > MAX_ACCEPTED_ANSWERS) {
      return { message: `Provide at most ${MAX_ACCEPTED_ANSWERS} accepted answers`, focus: { index: 0 } }
    }
    for (const [index, answer] of answers.entries()) {
      const message = textProblem(answer.text, `Accepted answer ${index + 1}`, ACCEPTED_ANSWER_MAX_LENGTH)
      if (message) return { message, focus: { index } }
    }
  } else {
    return null
  }
  if (JSON.stringify(answerConfigOf(exerciseType, state)).length > CONFIG_MAX_LENGTH) {
    return { message: 'The answers are too long in total. Shorten some of them.', focus: { index: 0 } }
  }
  return null
}

// Words an API error about part of answerConfig ("options.1.text") for the lecturer.
export function answerConfigError(path, message) {
  const [list, position] = path.split('.')
  const number = Number(position) + 1
  if (list === 'options' && Number.isInteger(number)) return `Option ${number}: ${message}`
  if (list === 'accepted_answers' && Number.isInteger(number)) return `Accepted answer ${number}: ${message}`
  return message
}
