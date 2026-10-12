import { EXAMPLE_TYPES } from '../../constants/exampleTypes.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import {
  checkOneOf,
  checkOptionalRichText,
  checkOptionalText,
  checkRequiredRichText,
  checkRequiredText,
  collectErrors,
  richTextOrNull,
  textOrNull,
  TITLE_MAX_LENGTH,
} from '../../utils/formValidation.js'
import EntityForm from './EntityForm.jsx'
import { checkSequenceOrder, sequenceOrderField, sequenceOrderOrUndefined } from './structureFields.js'

// The API's limits for examples.
const PROBLEM_MAX_LENGTH = 10_000
const CONTENT_MAX_LENGTH = 50_000
const EXPLANATION_MAX_LENGTH = 20_000
const CODE_MAX_LENGTH = 20_000
const LANGUAGE_MAX_LENGTH = 50

const MARKDOWN_HINT = 'Written in Markdown.'

// A code snippet must name its programming language.
const hasCode = (values) => Boolean(values.codeSnippet.trim())

function fields(values, editing) {
  const typeOptions = EXAMPLE_TYPES.map((type) => ({ value: type, label: formatEnumLabel(type) }))

  return [
    { name: 'title', label: 'Title', required: true, maxLength: TITLE_MAX_LENGTH },
    {
      name: 'exampleType',
      label: 'Example type',
      type: 'select',
      required: true,
      options: values.exampleType ? typeOptions : [{ value: '', label: 'Choose a type' }, ...typeOptions],
      hint: 'Shown to students with the example.',
    },
    {
      name: 'problemStatement',
      label: 'Problem statement',
      type: 'textarea',
      rows: 3,
      maxLength: PROBLEM_MAX_LENGTH,
      hint: `Optional. The problem the example solves, shown before students open it. ${MARKDOWN_HINT}`,
    },
    {
      name: 'content',
      label: 'Example content',
      type: 'textarea',
      required: true,
      rows: 8,
      maxLength: CONTENT_MAX_LENGTH,
      hint: `The worked example students reveal with Show example. ${MARKDOWN_HINT}`,
    },
    {
      name: 'codeSnippet',
      label: 'Code snippet',
      type: 'textarea',
      code: true,
      rows: 6,
      maxLength: CODE_MAX_LENGTH,
      hint: 'Optional. Shown exactly as entered and never run.',
    },
    {
      name: 'programmingLanguage',
      label: 'Programming language',
      required: hasCode(values),
      maxLength: LANGUAGE_MAX_LENGTH,
      spellCheck: false,
      hint: 'Required with a code snippet, for example python or javascript. Shown above the code.',
    },
    {
      name: 'explanation',
      label: 'Explanation',
      type: 'textarea',
      rows: 4,
      maxLength: EXPLANATION_MAX_LENGTH,
      hint: `Optional. Why the example works, shown after the code. ${MARKDOWN_HINT}`,
    },
    sequenceOrderField({ editing, siblings: 'example', parent: 'lesson' }),
  ]
}

function checkLanguage(values) {
  if (hasCode(values) && !values.programmingLanguage.trim()) {
    return 'Programming language is required when a code snippet is given'
  }
  return checkOptionalText(values.programmingLanguage, 'Programming language', LANGUAGE_MAX_LENGTH)
}

function validate(values, editing) {
  return collectErrors({
    title: checkRequiredText(values.title, 'Title', TITLE_MAX_LENGTH),
    exampleType: checkOneOf(values.exampleType, EXAMPLE_TYPES, 'Choose an example type'),
    problemStatement: checkOptionalText(values.problemStatement, 'Problem statement', PROBLEM_MAX_LENGTH),
    content: checkRequiredRichText(values.content, 'Example content', CONTENT_MAX_LENGTH),
    codeSnippet: checkOptionalRichText(values.codeSnippet, 'Code snippet', CODE_MAX_LENGTH),
    programmingLanguage: checkLanguage(values),
    explanation: checkOptionalText(values.explanation, 'Explanation', EXPLANATION_MAX_LENGTH),
    sequenceOrder: checkSequenceOrder(values.sequenceOrder, editing),
  })
}

// The example content and code are sent exactly as entered; a blank optional field is sent as null.
function toFields(values) {
  return {
    title: values.title.trim(),
    exampleType: values.exampleType,
    problemStatement: textOrNull(values.problemStatement),
    content: values.content,
    codeSnippet: richTextOrNull(values.codeSnippet),
    programmingLanguage: textOrNull(values.programmingLanguage),
    explanation: textOrNull(values.explanation),
    sequenceOrder: sequenceOrderOrUndefined(values.sequenceOrder),
  }
}

function initialValues(example) {
  return {
    title: example?.title ?? '',
    exampleType: example?.exampleType ?? '',
    problemStatement: example?.problemStatement ?? '',
    content: example?.content ?? '',
    codeSnippet: example?.codeSnippet ?? '',
    programmingLanguage: example?.programmingLanguage ?? '',
    explanation: example?.explanation ?? '',
    sequenceOrder: example?.sequenceOrder == null ? '' : String(example.sequenceOrder),
  }
}

// Creates an example, or edits `example` and submits only the fields that changed. The example's content
// source is managed by the API and left untouched.
export default function ExampleForm({ example, ...formProps }) {
  const editing = Boolean(example)
  return (
    <EntityForm
      noun="example"
      fields={(values) => fields(values, editing)}
      initialValues={() => initialValues(example)}
      validate={(values) => validate(values, editing)}
      toFields={toFields}
      original={example}
      {...formProps}
    />
  )
}
