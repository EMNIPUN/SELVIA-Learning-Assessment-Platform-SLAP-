import { BLOOM_LEVELS, DIFFICULTY_LEVELS } from '../../constants/exerciseTypes.js'
import { BANK_QUESTION_TYPES, QUESTION_TYPE, QUESTION_TYPE_LABELS } from '../../constants/questionTypes.js'
import { formatEnumLabel } from '../../utils/formatters.js'
import { checkOneOf, checkOptionalText, checkRequiredRichText, collectErrors, textOrNull } from '../../utils/formValidation.js'
import {
  answerConfigError,
  MAX_ACCEPTED_ANSWERS,
  MAX_OPTIONS,
  MIN_ACCEPTED_ANSWERS,
  MIN_OPTIONS,
} from './answerConfig.js'
import EntityForm from './EntityForm.jsx'
import QuestionAnswerEditor from './QuestionAnswerEditor.jsx'
import { questionAnswerConfigOf, questionAnswerProblem, questionAnswerStateFrom } from './questionAnswerConfig.js'

// The question bank API's limits.
const QUESTION_TEXT_MAX_LENGTH = 20_000
const EXPLANATION_MAX_LENGTH = 20_000
const MAX_POINTS = 1000

const TYPE_HINTS = {
  [QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE]: 'Students choose one of the options.',
  [QUESTION_TYPE.SHORT_ANSWER]: 'Students type a short text answer.',
}

const ANSWER_HINTS = {
  [QUESTION_TYPE.MULTIPLE_CHOICE_SINGLE]: `Between ${MIN_OPTIONS} and ${MAX_OPTIONS} options. Mark exactly one as the correct answer.`,
  [QUESTION_TYPE.SHORT_ANSWER]: `Between ${MIN_ACCEPTED_ANSWERS} and ${MAX_ACCEPTED_ANSWERS} answers. A student's answer is correct when it matches any of them.`,
}

const enumOptions = (values, placeholder, current) => {
  const options = values.map((value) => ({ value, label: formatEnumLabel(value) }))
  return current ? options : [{ value: '', label: placeholder }, ...options]
}

// The saved type, when the lecturer has chosen a different one while editing.
const replacedType = (values, question) =>
  question && values.questionType && values.questionType !== question.questionType ? question.questionType : null

function fields(values, editing, question) {
  const type = values.questionType
  const replacing = replacedType(values, question)

  return [
    {
      name: 'questionText',
      label: 'Question text',
      type: 'textarea',
      required: true,
      rows: 6,
      maxLength: QUESTION_TEXT_MAX_LENGTH,
      hint: 'What students are asked. Written in Markdown, so it can include formatting, lists and code blocks.',
    },
    {
      name: 'questionType',
      label: 'Question type',
      type: 'radio',
      required: true,
      options: BANK_QUESTION_TYPES.map((value) => ({ value, label: QUESTION_TYPE_LABELS[value] })),
      hint: replacing
        ? `${TYPE_HINTS[type]} Changing the type replaces the saved answers: set up the new type's answers below.`
        : (TYPE_HINTS[type] ?? 'Choose how students answer.'),
    },
    {
      name: 'answerConfig',
      label: type === QUESTION_TYPE.SHORT_ANSWER ? 'Accepted answers' : type ? 'Answer options' : 'Answers',
      type: 'custom',
      required: true,
      hint: ANSWER_HINTS[type],
      render: (props) => <QuestionAnswerEditor questionType={type} replacing={replacing} {...props} />,
      nestedError: answerConfigError,
    },
    {
      name: 'explanation',
      label: 'Explanation',
      type: 'textarea',
      rows: 4,
      maxLength: EXPLANATION_MAX_LENGTH,
      hint: 'Optional. Explains the correct answer, for students to read once their answer has been graded. Written in Markdown.',
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
      hint: 'The thinking skill the question assesses.',
      row: 'level',
    },
    {
      name: 'defaultPoints',
      label: 'Default points',
      required: editing,
      inputMode: 'decimal',
      hint: editing
        ? `Points for a correct answer, up to ${MAX_POINTS} with at most 2 decimal places. An assessment can give it a different value.`
        : `Optional. Points for a correct answer, up to ${MAX_POINTS} with at most 2 decimal places. Leave blank for 1 point.`,
    },
  ]
}

// The API always stores default points, so an existing question keeps a value.
function checkPoints(value, required) {
  const text = value.trim()
  if (!text) return required ? 'Default points are required' : undefined
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return 'Default points must be a number'
  const points = Number(text)
  if (points <= 0) return 'Default points must be greater than 0'
  if (points > MAX_POINTS) return `Default points must be at most ${MAX_POINTS}`
  if (/\.\d{3,}$/.test(text)) return 'Default points can have at most 2 decimal places'
  return undefined
}

function validate(values, editing) {
  return collectErrors({
    questionText: checkRequiredRichText(values.questionText, 'Question text', QUESTION_TEXT_MAX_LENGTH),
    questionType: checkOneOf(values.questionType, BANK_QUESTION_TYPES, 'Choose a question type'),
    answerConfig: questionAnswerProblem(values.questionType, values.answerConfig)?.message,
    explanation: checkOptionalText(values.explanation, 'Explanation', EXPLANATION_MAX_LENGTH),
    difficulty: checkOneOf(values.difficulty, DIFFICULTY_LEVELS, 'Choose a difficulty'),
    bloomLevel: checkOneOf(values.bloomLevel, BLOOM_LEVELS, 'Choose a Bloom level'),
    defaultPoints: checkPoints(values.defaultPoints, editing),
  })
}

// The question text is sent exactly as entered; a blank explanation is sent as null, and blank default points
// are not sent, so the API applies its default. The answers are sent in the shape of the chosen type only.
// Status, author and review fields are never sent from this form: new questions start as drafts and the status
// changes through the status dialog.
function toFields(values) {
  const points = values.defaultPoints.trim()
  return {
    questionText: values.questionText,
    questionType: values.questionType,
    answerConfig: questionAnswerConfigOf(values.questionType, values.answerConfig),
    explanation: textOrNull(values.explanation),
    difficulty: values.difficulty,
    bloomLevel: values.bloomLevel,
    defaultPoints: points ? Number(points) : undefined,
  }
}

function initialValues(question) {
  return {
    questionText: question?.questionText ?? '',
    questionType: question?.questionType ?? '',
    answerConfig: questionAnswerStateFrom(question?.questionType, question?.answerConfig),
    explanation: question?.explanation ?? '',
    difficulty: question?.difficulty ?? '',
    bloomLevel: question?.bloomLevel ?? '',
    defaultPoints: question?.defaultPoints == null ? '' : String(question.defaultPoints),
  }
}

// Creates a question, or edits `question` and submits only the fields that changed.
export default function QuestionForm({ question, ...formProps }) {
  const editing = Boolean(question)
  return (
    <EntityForm
      noun="question"
      fields={(values) => fields(values, editing, question)}
      initialValues={() => initialValues(question)}
      validate={(values) => validate(values, editing)}
      toFields={toFields}
      original={question}
      {...formProps}
    />
  )
}
