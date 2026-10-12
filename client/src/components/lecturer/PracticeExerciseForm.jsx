import { BLOOM_LEVELS, DIFFICULTY_LEVELS, EXERCISE_TYPE, PRACTICE_EXERCISE_TYPES } from '../../constants/exerciseTypes.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import {
  checkOneOf,
  checkOptionalText,
  checkRequiredRichText,
  checkRequiredText,
  checkWholeNumber,
  collectErrors,
  numberOrNull,
  textOrNull,
  TITLE_MAX_LENGTH,
} from '../../utils/formValidation.js'
import AnswerConfigEditor from './AnswerConfigEditor.jsx'
import {
  answerConfigError,
  answerConfigOf,
  answerProblem,
  answerStateFrom,
  MAX_ACCEPTED_ANSWERS,
  MAX_OPTIONS,
  MIN_ACCEPTED_ANSWERS,
  MIN_OPTIONS,
} from './answerConfig.js'
import EntityForm from './EntityForm.jsx'
import { checkSequenceOrder, sequenceOrderField, sequenceOrderOrUndefined } from './structureFields.js'

// The API's limits for practice exercises.
const INSTRUCTIONS_MAX_LENGTH = 20_000
const EXPLANATION_MAX_LENGTH = 20_000
const MAX_SCORE = 1000
const MIN_DURATION = 1
const MAX_DURATION = 600

const TYPE_HINTS = {
  [EXERCISE_TYPE.MULTIPLE_CHOICE]: 'Multiple choice: students choose one of the options.',
  [EXERCISE_TYPE.SHORT_ANSWER]: 'Short answer: students type a short text answer.',
}

const enumOptions = (values, placeholder, current) => {
  const options = values.map((value) => ({ value, label: formatEnumLabel(value) }))
  return current ? options : [{ value: '', label: placeholder }, ...options]
}

function answerHint(type, editing) {
  const hint = {
    [EXERCISE_TYPE.MULTIPLE_CHOICE]: `Between ${MIN_OPTIONS} and ${MAX_OPTIONS} options, shown to students in this order. Mark exactly one as the correct answer.`,
    [EXERCISE_TYPE.SHORT_ANSWER]: `Between ${MIN_ACCEPTED_ANSWERS} and ${MAX_ACCEPTED_ANSWERS} answers. A student's answer is correct when it matches any of them.`,
  }[type]
  if (!hint || !editing) return hint
  return `${hint} Answers students already submitted keep the result they were given; changes apply to new answers.`
}

function fields(values, editing, exercise) {
  const type = values.exerciseType
  const typeChanged = editing && type !== exercise.exerciseType

  return [
    { name: 'title', label: 'Title', required: true, maxLength: TITLE_MAX_LENGTH },
    {
      name: 'instructions',
      label: 'Instructions',
      type: 'textarea',
      required: true,
      rows: 5,
      maxLength: INSTRUCTIONS_MAX_LENGTH,
      hint: 'The question or task students answer. Written in Markdown.',
    },
    {
      name: 'exerciseType',
      label: 'Exercise type',
      type: 'radio',
      required: true,
      options: PRACTICE_EXERCISE_TYPES.map((value) => ({ value, label: formatEnumLabel(value) })),
      hint: typeChanged
        ? `${TYPE_HINTS[type] ?? ''} Changing the type replaces the answers: set up the new type's answers below.`.trim()
        : (TYPE_HINTS[type] ?? 'Choose how students answer.'),
    },
    {
      name: 'answerConfig',
      label: {
        [EXERCISE_TYPE.MULTIPLE_CHOICE]: 'Answer options',
        [EXERCISE_TYPE.SHORT_ANSWER]: 'Accepted answers',
      }[type] ?? 'Answers',
      type: 'custom',
      required: true,
      hint: answerHint(type, editing),
      render: (props) => <AnswerConfigEditor exerciseType={type} {...props} />,
      nestedError: answerConfigError,
    },
    {
      name: 'solutionExplanation',
      label: 'Solution explanation',
      type: 'textarea',
      rows: 4,
      maxLength: EXPLANATION_MAX_LENGTH,
      hint: 'Optional. Shown to students only after they submit an answer, whether it was right or wrong. Written in Markdown.',
    },
    {
      name: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      required: true,
      options: enumOptions(DIFFICULTY_LEVELS, 'Choose a difficulty', values.difficulty),
      row: 'level',
    },
    {
      name: 'bloomLevel',
      label: 'Bloom level',
      type: 'select',
      required: true,
      options: enumOptions(BLOOM_LEVELS, 'Choose a Bloom level', values.bloomLevel),
      hint: 'The thinking skill the exercise practises.',
      row: 'level',
    },
    {
      name: 'maxScore',
      label: 'Max score',
      required: maxScoreRequired(editing, exercise),
      inputMode: 'decimal',
      hint: maxScoreRequired(editing, exercise)
        ? `Points for a correct answer, up to ${MAX_SCORE} with at most 2 decimal places.`
        : `Optional. Points for a correct answer, up to ${MAX_SCORE} with at most 2 decimal places. Leave blank for 1 point.`,
      row: 'scoring',
    },
    {
      name: 'estimatedDurationMinutes',
      label: 'Estimated duration (minutes)',
      inputMode: 'numeric',
      hint: `Optional. A whole number from ${MIN_DURATION} to ${MAX_DURATION}.`,
      row: 'scoring',
    },
    sequenceOrderField({ editing, siblings: 'practice exercise', parent: 'lesson' }),
  ]
}

// The API cannot clear a score, so an exercise that has one keeps one.
const maxScoreRequired = (editing, exercise) => editing && exercise.maxScore != null

function checkMaxScore(value, required) {
  const text = value.trim()
  if (!text) return required ? 'Max score is required' : undefined
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return 'Max score must be a number'
  const score = Number(text)
  if (score <= 0) return 'Max score must be greater than 0'
  if (score > MAX_SCORE) return `Max score must be at most ${MAX_SCORE}`
  if (/\.\d{3,}$/.test(text)) return 'Max score can have at most 2 decimal places'
  return undefined
}

function validate(values, editing, exercise) {
  return collectErrors({
    title: checkRequiredText(values.title, 'Title', TITLE_MAX_LENGTH),
    instructions: checkRequiredRichText(values.instructions, 'Instructions', INSTRUCTIONS_MAX_LENGTH),
    exerciseType: checkOneOf(values.exerciseType, PRACTICE_EXERCISE_TYPES, 'Choose an exercise type'),
    answerConfig: answerProblem(values.exerciseType, values.answerConfig)?.message,
    solutionExplanation: checkOptionalText(values.solutionExplanation, 'Solution explanation', EXPLANATION_MAX_LENGTH),
    difficulty: checkOneOf(values.difficulty, DIFFICULTY_LEVELS, 'Choose a difficulty'),
    bloomLevel: checkOneOf(values.bloomLevel, BLOOM_LEVELS, 'Choose a Bloom level'),
    maxScore: checkMaxScore(values.maxScore, maxScoreRequired(editing, exercise)),
    estimatedDurationMinutes: checkWholeNumber(values.estimatedDurationMinutes, 'Estimated duration', {
      min: MIN_DURATION,
      max: MAX_DURATION,
    }),
    sequenceOrder: checkSequenceOrder(values.sequenceOrder, editing),
  })
}

// The instructions are sent exactly as entered; a blank optional field is sent as null, except a blank max
// score, which is not sent so the API applies its default. The answers are sent in the shape of the chosen
// type only, so changing the type never leaves the previous type's answers behind.
function toFields(values) {
  const maxScore = values.maxScore.trim()
  return {
    title: values.title.trim(),
    instructions: values.instructions,
    exerciseType: values.exerciseType,
    answerConfig: answerConfigOf(values.exerciseType, values.answerConfig),
    solutionExplanation: textOrNull(values.solutionExplanation),
    difficulty: values.difficulty,
    bloomLevel: values.bloomLevel,
    maxScore: maxScore ? Number(maxScore) : undefined,
    estimatedDurationMinutes: numberOrNull(values.estimatedDurationMinutes),
    sequenceOrder: sequenceOrderOrUndefined(values.sequenceOrder),
  }
}

function initialValues(exercise) {
  return {
    title: exercise?.title ?? '',
    instructions: exercise?.instructions ?? '',
    exerciseType: exercise?.exerciseType ?? '',
    answerConfig: answerStateFrom(exercise?.exerciseType, exercise?.answerConfig),
    solutionExplanation: exercise?.solutionExplanation ?? '',
    difficulty: exercise?.difficulty ?? '',
    bloomLevel: exercise?.bloomLevel ?? '',
    maxScore: exercise?.maxScore == null ? '' : String(exercise.maxScore),
    estimatedDurationMinutes: exercise?.estimatedDurationMinutes == null ? '' : String(exercise.estimatedDurationMinutes),
    sequenceOrder: exercise?.sequenceOrder == null ? '' : String(exercise.sequenceOrder),
  }
}

// Creates a practice exercise, or edits `exercise` and submits only the fields that changed. Only the
// exercise definition is managed here: students' attempts and the activity they record are untouched, and
// the exercise's content source is managed by the API.
export default function PracticeExerciseForm({ exercise, ...formProps }) {
  const editing = Boolean(exercise)
  return (
    <EntityForm
      noun="practice exercise"
      fields={(values) => fields(values, editing, exercise)}
      initialValues={() => initialValues(exercise)}
      validate={(values) => validate(values, editing, exercise)}
      toFields={toFields}
      original={exercise}
      {...formProps}
    />
  )
}
