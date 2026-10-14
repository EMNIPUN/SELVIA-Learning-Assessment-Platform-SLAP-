import { Prisma, QuestionType } from '@prisma/client'
import { QUIZ_QUESTION_TYPES } from '../constants/assessment.js'
import { parseAnswerConfig } from '../schemas/question.schemas.js'
import { ApiError } from '../utils/ApiError.js'
import { normaliseShortAnswer } from '../utils/shortAnswer.js'

// Deterministic grading of quiz answers against the answer configuration the lecturer defined; no AI grading.
// A grade says whether one answer was right and what it scored, nothing about the student's ability.
// Pure: no database, request or environment access. Scores are Prisma.Decimal, as the numeric columns are.

const ZERO = new Prisma.Decimal(0)

const invalidAnswer = (field, message) => ApiError.badRequest('Validation failed', [{ field, message }])

// The answer configuration is validated when a question is written and again when a quiz is published; it is
// parsed once more here so that a grade is never computed from a configuration of another shape.
function readAnswerConfig({ questionType, answerConfig }) {
  if (!QUIZ_QUESTION_TYPES.includes(questionType)) {
    throw ApiError.conflict(`${questionType} questions cannot be graded automatically`, [
      { field: 'questionType', message: `Only ${QUIZ_QUESTION_TYPES.join(' and ')} questions can be graded` },
    ])
  }
  const result = parseAnswerConfig(questionType, answerConfig)
  if (!result.success) {
    throw ApiError.conflict('This question cannot be graded because its answer configuration is invalid')
  }
  return result.data
}

function toPoints(maxScore) {
  const points = new Prisma.Decimal(maxScore)
  if (!points.isFinite() || points.lte(0)) {
    throw new Error(`Quiz question points must be greater than 0; got ${maxScore}`)
  }
  return points
}

// Per question type: the save-answer field it is answered with, how that answer is stored in
// student_answers.response, and whether a stored response is correct.
const QUESTION_TYPE_RULES = {
  [QuestionType.MULTIPLE_CHOICE_SINGLE]: {
    field: 'selectedOptionId',
    toResponse(config, selectedOptionId) {
      if (!config.options.some((option) => option.id === selectedOptionId)) {
        throw invalidAnswer('selectedOptionId', "The selected option is not one of this question's options")
      }
      return { selected_option_id: selectedOptionId }
    },
    isCorrect(config, response) {
      if (typeof response.selected_option_id !== 'string') {
        throw new Error('A stored multiple-choice response has no selected_option_id')
      }
      return config.correct_option_ids.includes(response.selected_option_id)
    },
  },
  [QuestionType.SHORT_ANSWER]: {
    field: 'answerText',
    toResponse(config, answerText) {
      return { answer_text: answerText }
    },
    isCorrect(config, response) {
      if (typeof response.answer_text !== 'string') {
        throw new Error('A stored short-answer response has no answer_text')
      }
      const answer = normaliseShortAnswer(response.answer_text, config.case_sensitive)
      return config.accepted_answers.some((accepted) => normaliseShortAnswer(accepted, config.case_sensitive) === answer)
    },
  },
}

// Converts a validated save-answer body (selectedOptionId or answerText) into the response stored for the
// question, refusing (400) a field that does not suit the question's type or an option it does not have.
export function toStoredResponse(question, answer) {
  const config = readAnswerConfig(question)
  const rules = QUESTION_TYPE_RULES[question.questionType]
  const value = answer[rules.field]
  if (value === undefined) {
    const other = Object.values(QUESTION_TYPE_RULES).find((candidate) => candidate !== rules).field
    throw invalidAnswer(other, `This question is answered with ${rules.field}, not ${other}`)
  }
  return rules.toResponse(config, value)
}

// Grades a stored response (null when the question was not answered) for a question worth `maxScore` points:
// { answered, isCorrect, scoreAwarded, maxScore }. A correct answer earns every point and any other answer none.
// An unanswered question scores 0 and its correctness is null: it was not answered, so it was not judged.
export function gradeResponse(question, maxScore, response) {
  const config = readAnswerConfig(question)
  const points = toPoints(maxScore)
  if (response === null || response === undefined) {
    return { answered: false, isCorrect: null, scoreAwarded: ZERO, maxScore: points }
  }
  const isCorrect = QUESTION_TYPE_RULES[question.questionType].isCorrect(config, response)
  return { answered: true, isCorrect, scoreAwarded: isCorrect ? points : ZERO, maxScore: points }
}
