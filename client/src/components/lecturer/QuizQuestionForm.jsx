import EntityForm from './EntityForm.jsx'
import {
  quizQuestionFields,
  quizQuestionFormValues,
  quizQuestionRequestFields,
  validateQuizQuestion,
} from './quizFormFields.js'

// The points and section label of a question in a quiz: adds `questionId`, or edits `entry` and submits only the
// changes. `frozen`: the quiz has attempts, so its points cannot change and only the section label is offered.
export default function QuizQuestionForm({ entry, questionId, defaultPoints, frozen = false, ...formProps }) {
  return (
    <EntityForm
      noun={entry ? 'quiz question' : 'question'}
      fields={quizQuestionFields(defaultPoints, frozen)}
      initialValues={() => quizQuestionFormValues(entry, defaultPoints)}
      validate={(values) => validateQuizQuestion(values, frozen)}
      toFields={(values) => quizQuestionRequestFields(values, { questionId: entry ? undefined : questionId, defaultPoints, frozen })}
      original={entry}
      {...formProps}
    />
  )
}
