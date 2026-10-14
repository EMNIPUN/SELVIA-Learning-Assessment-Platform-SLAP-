import EntityForm from './EntityForm.jsx'
import { QUIZ_FIELDS, quizFormValues, quizRequestFields, validateQuiz } from './quizFormFields.js'

// Creates a quiz, or edits `quiz` and submits only the settings that changed.
export default function QuizForm({ quiz, ...formProps }) {
  return (
    <EntityForm
      noun="quiz"
      fields={QUIZ_FIELDS}
      initialValues={() => quizFormValues(quiz)}
      validate={validateQuiz}
      toFields={quizRequestFields}
      original={quiz}
      {...formProps}
    />
  )
}
