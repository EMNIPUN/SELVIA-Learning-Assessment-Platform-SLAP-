import { QUIZ_LIMITS } from '../../constants/quiz.js'
import {
  checkDateTime,
  checkDecimal,
  checkOptionalText,
  checkRequiredText,
  checkWholeNumber,
  collectErrors,
  numberOrNull,
  textOrNull,
} from '../../utils/formValidation.js'
import { pointsText } from './quizSummary.js'

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

const pad = (number) => String(number).padStart(2, '0')

// A stored date-time as the value of a datetime-local input, in the lecturer's time zone.
function toLocalInput(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// A datetime-local value is a time in the lecturer's time zone; the API stores the instant.
const fromLocalInput = (value) => (value.trim() ? new Date(value.trim()).toISOString() : null)

const text = (value) => (value == null ? '' : String(value))

// Quiz settings.

export const QUIZ_FIELDS = [
  { name: 'title', label: 'Title', required: true, maxLength: QUIZ_LIMITS.TITLE },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    rows: 3,
    maxLength: QUIZ_LIMITS.DESCRIPTION,
    hint: 'Optional. A short summary of what the quiz covers.',
  },
  {
    name: 'instructions',
    label: 'Instructions',
    type: 'textarea',
    rows: 5,
    maxLength: QUIZ_LIMITS.INSTRUCTIONS,
    hint: 'Optional. What students read before they start. Written in Markdown.',
  },
  {
    name: 'timeLimitMinutes',
    label: 'Time limit (minutes)',
    inputMode: 'numeric',
    row: 'limits',
    hint: `Optional. Leave blank for no time limit. At most ${QUIZ_LIMITS.TIME_LIMIT_MINUTES} (24 hours).`,
  },
  {
    name: 'maxAttempts',
    label: 'Maximum attempts',
    inputMode: 'numeric',
    row: 'limits',
    hint: `Optional. Leave blank for unlimited attempts. At most ${QUIZ_LIMITS.ATTEMPTS}.`,
  },
  {
    name: 'passPercentage',
    label: 'Pass mark (%)',
    inputMode: 'decimal',
    hint: 'Optional. Between 0 and 100, with at most 2 decimal places. Leave blank for no pass or fail.',
  },
  {
    name: 'availableFrom',
    label: 'Available from',
    inputType: 'datetime-local',
    row: 'window',
    hint: `Optional. In your time zone (${TIME_ZONE}).`,
  },
  {
    name: 'availableUntil',
    label: 'Available until',
    inputType: 'datetime-local',
    row: 'window',
    hint: 'Optional. Must be later than Available from.',
  },
  {
    name: 'shuffleQuestions',
    label: 'Question order',
    type: 'radio',
    options: [
      { value: 'false', label: 'The same order for every student' },
      { value: 'true', label: 'Shuffle the questions for each attempt' },
    ],
  },
]

export function quizFormValues(quiz) {
  return {
    title: quiz?.title ?? '',
    description: quiz?.description ?? '',
    instructions: quiz?.instructions ?? '',
    timeLimitMinutes: text(quiz?.timeLimitMinutes),
    maxAttempts: text(quiz?.maxAttempts),
    passPercentage: text(quiz?.passPercentage),
    availableFrom: toLocalInput(quiz?.availableFrom),
    availableUntil: toLocalInput(quiz?.availableUntil),
    shuffleQuestions: quiz?.shuffleQuestions ? 'true' : 'false',
  }
}

export function validateQuiz(values) {
  const errors = collectErrors({
    title: checkRequiredText(values.title, 'Title', QUIZ_LIMITS.TITLE),
    description: checkOptionalText(values.description, 'Description', QUIZ_LIMITS.DESCRIPTION),
    instructions: checkOptionalText(values.instructions, 'Instructions', QUIZ_LIMITS.INSTRUCTIONS),
    timeLimitMinutes: checkWholeNumber(values.timeLimitMinutes, 'Time limit', { min: 1, max: QUIZ_LIMITS.TIME_LIMIT_MINUTES }),
    maxAttempts: checkWholeNumber(values.maxAttempts, 'Maximum attempts', { min: 1, max: QUIZ_LIMITS.ATTEMPTS }),
    passPercentage: checkDecimal(values.passPercentage, 'Pass mark', { min: 0, max: 100 }),
    availableFrom: checkDateTime(values.availableFrom, 'Available from'),
    availableUntil: checkDateTime(values.availableUntil, 'Available until'),
  })
  if (!errors.availableFrom && !errors.availableUntil && values.availableFrom.trim() && values.availableUntil.trim()) {
    if (new Date(values.availableUntil) <= new Date(values.availableFrom)) {
      errors.availableUntil = 'Available until must be later than available from'
    }
  }
  return errors
}

// Blank optional settings are sent as null, which clears them. The type, release policy, course, author,
// status and publication date are never sent: the API sets them, and new quizzes start as drafts.
export function quizRequestFields(values) {
  return {
    title: values.title.trim(),
    description: textOrNull(values.description),
    instructions: textOrNull(values.instructions),
    timeLimitMinutes: numberOrNull(values.timeLimitMinutes),
    maxAttempts: numberOrNull(values.maxAttempts),
    passPercentage: numberOrNull(values.passPercentage),
    availableFrom: fromLocalInput(values.availableFrom),
    availableUntil: fromLocalInput(values.availableUntil),
    shuffleQuestions: values.shuffleQuestions === 'true',
  }
}

// A question's points and section label in a quiz.

export function quizQuestionFields(defaultPoints, frozen) {
  const sectionLabel = {
    name: 'sectionLabel',
    label: 'Section label',
    maxLength: QUIZ_LIMITS.SECTION_LABEL,
    hint: 'Optional. Groups questions under a heading, for example "Section A".',
  }
  if (frozen) return [sectionLabel]
  return [
    {
      name: 'points',
      label: 'Points',
      required: true,
      inputMode: 'decimal',
      hint: `Points for a correct answer in this quiz, up to ${QUIZ_LIMITS.POINTS} with at most 2 decimal places. The question's default is ${pointsText(defaultPoints)}.`,
    },
    sectionLabel,
  ]
}

export function quizQuestionFormValues(entry, defaultPoints) {
  return { points: String(entry?.points ?? defaultPoints), sectionLabel: entry?.sectionLabel ?? '' }
}

export function validateQuizQuestion(values, frozen) {
  return collectErrors({
    points: frozen
      ? undefined
      : checkDecimal(values.points, 'Points', { min: 0, max: QUIZ_LIMITS.POINTS, exclusiveMin: true, required: true }),
    sectionLabel: checkOptionalText(values.sectionLabel, 'Section label', QUIZ_LIMITS.SECTION_LABEL),
  })
}

// When adding `questionId`, points equal to the question's default and a blank label are left out, so the API
// applies its defaults. When frozen, points are never sent.
export function quizQuestionRequestFields(values, { questionId, defaultPoints, frozen = false }) {
  const points = frozen ? undefined : Number(values.points.trim())
  const sectionLabel = textOrNull(values.sectionLabel)
  if (questionId) {
    return { questionId, points: points === defaultPoints ? undefined : points, sectionLabel: sectionLabel ?? undefined }
  }
  return { points, sectionLabel }
}
