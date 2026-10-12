import { ExerciseType } from '@prisma/client'
import { ApiError } from '../utils/ApiError.js'

// Deterministic evaluation against the answer configuration the lecturer defined; no AI grading. The result
// says whether this answer was right, nothing about the student's ability.

const invalidAnswer = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }])

// Short answers are compared after Unicode normalisation, trimming and collapsing runs of whitespace, and
// ignoring case unless the exercise is case-sensitive.
function normaliseShortAnswer(text, caseSensitive) {
  const normalised = text.normalize('NFC').trim().replace(/\s+/g, ' ')
  return caseSensitive ? normalised : normalised.toLowerCase()
}

// Each evaluator returns the response as stored in the attempt and whether it is correct.
const EVALUATORS = {
  [ExerciseType.MULTIPLE_CHOICE]({ options, correct_option_ids: correctOptionIds }, { selectedOptionId }) {
    if (selectedOptionId === undefined) {
      throw invalidAnswer('selectedOptionId', 'Choose one of the options')
    }
    if (!options.some((option) => option.id === selectedOptionId)) {
      throw invalidAnswer('selectedOptionId', "The selected option is not one of this exercise's options")
    }
    return { response: { selected_option_id: selectedOptionId }, isCorrect: correctOptionIds.includes(selectedOptionId) }
  },

  [ExerciseType.SHORT_ANSWER]({ accepted_answers: acceptedAnswers, case_sensitive: caseSensitive }, { answerText }) {
    if (answerText === undefined) {
      throw invalidAnswer('answerText', 'Enter an answer')
    }
    const answer = normaliseShortAnswer(answerText, caseSensitive)
    return {
      response: { answer_text: answerText },
      isCorrect: acceptedAnswers.some((accepted) => normaliseShortAnswer(accepted, caseSensitive) === answer),
    }
  },
}

export function evaluateAnswer({ exerciseType, answerConfig }, submission) {
  const evaluate = EVALUATORS[exerciseType]
  if (!evaluate || !answerConfig) {
    throw ApiError.conflict('This exercise cannot be answered online yet')
  }
  return evaluate(answerConfig, submission)
}
