import {
  checkCode,
  checkOptionalText,
  checkRequiredText,
  checkWholeNumber,
  collectErrors,
  DESCRIPTION_MAX_LENGTH,
  numberOrNull,
  textOrNull,
  TITLE_MAX_LENGTH,
} from '../../utils/formValidation.js'
import EntityForm from './EntityForm.jsx'
import { descriptionField } from './structureFields.js'

const CODE_MAX_LENGTH = 20
const MIN_CREDITS = 1
const MAX_CREDITS = 60

const FIELDS = [
  {
    name: 'code',
    label: 'Course code',
    required: true,
    maxLength: CODE_MAX_LENGTH,
    spellCheck: false,
    hint: 'Letters, numbers and hyphens, for example SE3010. Saved in capitals.',
  },
  { name: 'title', label: 'Title', required: true, maxLength: TITLE_MAX_LENGTH },
  descriptionField,
  {
    name: 'credits',
    label: 'Credits',
    inputMode: 'numeric',
    hint: `Optional. A whole number from ${MIN_CREDITS} to ${MAX_CREDITS}.`,
  },
]

function initialValues(course) {
  return {
    code: course?.code ?? '',
    title: course?.title ?? '',
    description: course?.description ?? '',
    credits: course?.credits == null ? '' : String(course.credits),
  }
}

function validate(values) {
  return collectErrors({
    code: checkCode(values.code, 'Course code', CODE_MAX_LENGTH),
    title: checkRequiredText(values.title, 'Title', TITLE_MAX_LENGTH),
    description: checkOptionalText(values.description, 'Description', DESCRIPTION_MAX_LENGTH),
    credits: checkWholeNumber(values.credits, 'Credits', { min: MIN_CREDITS, max: MAX_CREDITS }),
  })
}

function toFields(values) {
  return {
    code: values.code.trim().toUpperCase(),
    title: values.title.trim(),
    description: textOrNull(values.description),
    credits: numberOrNull(values.credits),
  }
}

// Creates a course (as a draft), or edits `course` and submits only the fields that changed. Its status is
// changed on the course's management page.
export default function CourseForm({ course, ...formProps }) {
  return (
    <EntityForm
      noun="course"
      fields={FIELDS}
      initialValues={() => initialValues(course)}
      validate={validate}
      toFields={toFields}
      original={course}
      {...formProps}
    />
  )
}
