import {
  checkOptionalText,
  checkRequiredRichText,
  checkRequiredText,
  checkWholeNumber,
  collectErrors,
  numberOrNull,
  textOrNull,
  TITLE_MAX_LENGTH,
} from '../../utils/formValidation.js'
import EntityForm from './EntityForm.jsx'
import { checkSequenceOrder, sequenceOrderField, sequenceOrderOrUndefined } from './structureFields.js'

// The API's limits for lessons.
const SUMMARY_MAX_LENGTH = 2000
const BODY_MAX_LENGTH = 100_000
const MIN_DURATION = 1
const MAX_DURATION = 600

function fields(editing) {
  return [
    { name: 'title', label: 'Title', required: true, maxLength: TITLE_MAX_LENGTH },
    {
      name: 'summary',
      label: 'Summary',
      type: 'textarea',
      rows: 3,
      maxLength: SUMMARY_MAX_LENGTH,
      hint: `Optional. A short overview shown with the lesson. Up to ${SUMMARY_MAX_LENGTH.toLocaleString()} characters.`,
    },
    {
      name: 'body',
      label: 'Lesson content',
      type: 'textarea',
      required: true,
      rows: 12,
      maxLength: BODY_MAX_LENGTH,
      hint: 'Written in Markdown. Students see headings, lists, quotes, links, bold, italic and code blocks formatted.',
    },
    {
      name: 'estimatedDurationMinutes',
      label: 'Estimated duration (minutes)',
      inputMode: 'numeric',
      hint: `Optional. A whole number from ${MIN_DURATION} to ${MAX_DURATION}.`,
      row: 'settings',
    },
    sequenceOrderField({ editing, siblings: 'lesson', parent: 'concept' }),
  ]
}

function validate(values, editing) {
  return collectErrors({
    title: checkRequiredText(values.title, 'Title', TITLE_MAX_LENGTH),
    summary: checkOptionalText(values.summary, 'Summary', SUMMARY_MAX_LENGTH),
    body: checkRequiredRichText(values.body, 'Lesson content', BODY_MAX_LENGTH),
    estimatedDurationMinutes: checkWholeNumber(values.estimatedDurationMinutes, 'Estimated duration', {
      min: MIN_DURATION,
      max: MAX_DURATION,
    }),
    sequenceOrder: checkSequenceOrder(values.sequenceOrder, editing),
  })
}

// The lesson content is Markdown, so it is sent exactly as entered.
function toFields(values) {
  return {
    title: values.title.trim(),
    summary: textOrNull(values.summary),
    body: values.body,
    estimatedDurationMinutes: numberOrNull(values.estimatedDurationMinutes),
    sequenceOrder: sequenceOrderOrUndefined(values.sequenceOrder),
  }
}

function initialValues(lesson) {
  return {
    title: lesson?.title ?? '',
    summary: lesson?.summary ?? '',
    body: lesson?.body ?? '',
    estimatedDurationMinutes: lesson?.estimatedDurationMinutes == null ? '' : String(lesson.estimatedDurationMinutes),
    sequenceOrder: lesson?.sequenceOrder == null ? '' : String(lesson.sequenceOrder),
  }
}

// Creates a lesson, or edits `lesson` and submits only the fields that changed.
export default function LessonForm({ lesson, ...formProps }) {
  const editing = Boolean(lesson)
  return (
    <EntityForm
      noun="lesson"
      fields={fields(editing)}
      initialValues={() => initialValues(lesson)}
      validate={(values) => validate(values, editing)}
      toFields={toFields}
      original={lesson}
      {...formProps}
    />
  )
}
