import { Prisma } from '@prisma/client'
import { QUIZ_QUESTION_STATUSES, QUIZ_QUESTION_TYPES, QUIZ_RELEASE_POLICY, QUIZ_TYPE } from '../constants/assessment.js'
import { CONTENT_STATUS } from '../constants/contentStatus.js'
import * as assessmentRepository from '../repositories/assessment.repository.js'
import { MAX_SEQUENCE_ORDER } from '../schemas/common.schemas.js'
import { parseAnswerConfig } from '../schemas/question.schemas.js'
import { ApiError } from '../utils/ApiError.js'
import { isForeignKeyViolation, translatePrismaError } from '../utils/prismaErrors.js'
import { assertCourseOwner } from './courseAccess.service.js'
import { getOwnedCourse } from './course.service.js'
import { assertNoDependents, deletionBlocked } from './deletionGuard.service.js'

// Lecturer management of quizzes: settings, lifecycle and question set. Taking quizzes, grading and results
// are separate concerns.

const NOT_FOUND = 'Quiz not found'
const QUIZ_QUESTION_NOT_FOUND = 'Quiz question not found'

const QUIZ_QUESTION_CONFLICTS = {
  assessment_questions_assessment_id_question_id_key: {
    field: 'questionId',
    message: 'This question is already in the quiz',
  },
  assessment_questions_assessment_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another question in this quiz already uses this sequence order',
  },
}

// Decimal columns would serialise as strings.
const toNumber = (value) => (value === null ? null : Number(value))

function toQuizResponse({ course, _count, passPercentage, ...quiz }) {
  return { ...quiz, passPercentage: toNumber(passPercentage), questionCount: _count.questions, attemptCount: _count.attempts }
}

function toQuizQuestionResponse({ points, question, ...entry }) {
  return { ...entry, points: Number(points), question: { ...question, defaultPoints: Number(question.defaultPoints) } }
}

function toQuizDetailResponse(quiz, entries) {
  const totalPoints = entries.reduce((sum, entry) => sum.plus(entry.points), new Prisma.Decimal(0))
  return { ...toQuizResponse(quiz), totalPoints: totalPoints.toNumber(), questions: entries.map(toQuizQuestionResponse) }
}

// publishedAt records when a quiz was first published and is kept afterwards.
function publishedAtChange(status, currentPublishedAt) {
  return status === CONTENT_STATUS.PUBLISHED && !currentPublishedAt ? { publishedAt: new Date() } : {}
}

// Tests and examinations are outside this version of the assessment system, so they are not found here.
async function getOwnedQuiz(user, assessmentId) {
  const quiz = await assessmentRepository.findQuizById(assessmentId)
  if (!quiz || quiz.assessmentType !== QUIZ_TYPE) {
    throw ApiError.notFound(NOT_FOUND)
  }
  assertCourseOwner(user, quiz.course)
  return quiz
}

// Runs `work(tx, quiz)` while the quiz row is locked against concurrent changes and new attempts; `quiz` is its
// state at that point.
function withLockedQuiz(assessmentId, work) {
  return assessmentRepository.transaction(async (tx) => {
    const quiz = await assessmentRepository.lockQuiz(tx, assessmentId)
    if (!quiz) {
      throw ApiError.notFound(NOT_FOUND)
    }
    return work(tx, quiz)
  })
}

// Students' answers refer to the quiz's questions and copy their points, so the question set of an attempted
// quiz stays as it was (docs/database-design.md, section 5.15).
function assertNotAttempted(quiz, message) {
  if (quiz._count.attempts > 0) {
    throw ApiError.conflict(message, [{ resource: 'attempts', count: quiz._count.attempts }])
  }
}

function assertValidWindow(availableFrom, availableUntil) {
  if (availableFrom && availableUntil && availableUntil <= availableFrom) {
    throw ApiError.badRequest('Validation failed', [
      { field: 'availableUntil', message: 'Available until must be later than available from' },
    ])
  }
}

// Why a question cannot be assessed in a quiz of this course, completing "This question ..." sentences.
export function ineligibilityReasons(question, courseId) {
  if (question.concept.topic.module.courseId !== courseId) {
    return ['belongs to another course']
  }
  const reasons = []
  if (!QUIZ_QUESTION_STATUSES.includes(question.status)) {
    reasons.push(`is ${question.status}; only ${QUIZ_QUESTION_STATUSES.join(' or ')} questions can be used in a quiz`)
  }
  if (!QUIZ_QUESTION_TYPES.includes(question.questionType)) {
    reasons.push(`is a ${question.questionType} question, which quizzes cannot grade`)
  } else if (!parseAnswerConfig(question.questionType, question.answerConfig).success) {
    reasons.push('has an invalid answer configuration; edit it in the question bank')
  }
  return reasons
}

// Questions of other courses are reported as not found, exactly as the question bank does.
function assertCanBeAdded(question, courseId) {
  if (!question || question.concept.topic.module.courseId !== courseId) {
    throw ApiError.badRequest('Validation failed', [{ field: 'questionId', message: 'Question not found in this course' }])
  }
  const reasons = ineligibilityReasons(question, courseId)
  if (reasons.length > 0) {
    throw ApiError.badRequest(
      'This question cannot be added to the quiz',
      reasons.map((reason) => ({ field: 'questionId', message: `This question ${reason}` })),
    )
  }
}

async function assertPublishable(tx, quiz) {
  const entries = await assessmentRepository.findEligibilityOfQuizQuestions(tx, quiz.id)
  const details =
    entries.length === 0
      ? [{ field: 'questions', message: 'Add at least one question before publishing the quiz' }]
      : entries.flatMap((entry) =>
          ineligibilityReasons(entry.question, quiz.courseId).map((reason) => ({
            field: `questions.${entry.id}`,
            message: `The question at position ${entry.sequenceOrder} ${reason}`,
          })),
        )
  if (details.length > 0) {
    throw ApiError.badRequest('This quiz cannot be published', details)
  }
}

export async function createQuiz(user, courseId, input) {
  await getOwnedCourse(user, courseId)
  const { status, ...fields } = input

  const quiz = await assessmentRepository.createQuiz({
    ...fields,
    courseId,
    assessmentType: QUIZ_TYPE,
    resultsReleasePolicy: QUIZ_RELEASE_POLICY,
    status: CONTENT_STATUS.DRAFT,
    createdByUserId: user.id,
  })
  return toQuizResponse(quiz)
}

export async function listCourseQuizzes(user, courseId, query) {
  await getOwnedCourse(user, courseId)
  const { quizzes, total } = await assessmentRepository.findQuizzesByCourse(courseId, query)
  return {
    assessments: quizzes.map(toQuizResponse),
    pagination: { total, limit: query.limit, offset: query.offset },
  }
}

export async function getQuiz(user, assessmentId) {
  const quiz = await getOwnedQuiz(user, assessmentId)
  return toQuizDetailResponse(quiz, await assessmentRepository.findQuizQuestions(assessmentId))
}

// Settings stay editable after attempts; only the question set is frozen. Publishing re-checks every question.
export async function updateQuiz(user, assessmentId, input) {
  await getOwnedQuiz(user, assessmentId)

  try {
    const updated = await withLockedQuiz(assessmentId, async (tx, quiz) => {
      assertValidWindow(
        input.availableFrom === undefined ? quiz.availableFrom : input.availableFrom,
        input.availableUntil === undefined ? quiz.availableUntil : input.availableUntil,
      )
      if (input.status === CONTENT_STATUS.PUBLISHED) {
        await assertPublishable(tx, quiz)
      }
      return assessmentRepository.updateQuiz(tx, assessmentId, {
        ...input,
        ...publishedAtChange(input.status, quiz.publishedAt),
      })
    })
    return toQuizResponse(updated)
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}

export async function deleteQuiz(user, assessmentId) {
  await getOwnedQuiz(user, assessmentId)

  try {
    await withLockedQuiz(assessmentId, async (tx, quiz) => {
      assertNoDependents('quiz', { attempts: quiz._count.attempts })
      await assessmentRepository.deleteQuiz(tx, assessmentId)
    })
  } catch (err) {
    // Attempts refer to the quiz through RESTRICT foreign keys, so the database refuses the deletion too.
    if (isForeignKeyViolation(err)) {
      throw deletionBlocked('quiz')
    }
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}

export async function addQuizQuestion(user, assessmentId, { questionId, points, sequenceOrder, sectionLabel }) {
  await getOwnedQuiz(user, assessmentId)

  try {
    const entry = await withLockedQuiz(assessmentId, async (tx, quiz) => {
      assertNotAttempted(quiz, 'Questions cannot be added to a quiz that students have attempted')
      const question = await assessmentRepository.findEligibilityOfQuestion(tx, questionId)
      assertCanBeAdded(question, quiz.courseId)

      const position = sequenceOrder ?? (await assessmentRepository.findMaxQuestionSequenceOrder(tx, assessmentId)) + 1
      if (position > MAX_SEQUENCE_ORDER) {
        throw ApiError.conflict(`There is no free position after the last question (the maximum is ${MAX_SEQUENCE_ORDER}); give a sequenceOrder`)
      }
      return assessmentRepository.createQuizQuestion(tx, {
        assessmentId,
        questionId,
        sequenceOrder: position,
        points: points ?? question.defaultPoints,
        sectionLabel,
      })
    })
    return toQuizQuestionResponse(entry)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: QUIZ_QUESTION_CONFLICTS })
  }
}

// The section label is presentation only and stays editable after attempts; points and order do not.
export async function updateQuizQuestion(user, assessmentId, assessmentQuestionId, input) {
  await getOwnedQuiz(user, assessmentId)

  try {
    const entry = await withLockedQuiz(assessmentId, async (tx, quiz) => {
      const current = await assessmentRepository.findQuizQuestion(tx, assessmentId, assessmentQuestionId)
      if (!current) {
        throw ApiError.notFound(QUIZ_QUESTION_NOT_FOUND)
      }
      const reweighted = input.points !== undefined && input.points !== Number(current.points)
      const reordered = input.sequenceOrder !== undefined && input.sequenceOrder !== current.sequenceOrder
      if (reweighted || reordered) {
        assertNotAttempted(quiz, 'Points and order cannot be changed in a quiz that students have attempted')
      }
      return assessmentRepository.updateQuizQuestion(tx, assessmentQuestionId, input)
    })
    return toQuizQuestionResponse(entry)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: QUIZ_QUESTION_CONFLICTS, notFound: QUIZ_QUESTION_NOT_FOUND })
  }
}

export async function removeQuizQuestion(user, assessmentId, assessmentQuestionId) {
  await getOwnedQuiz(user, assessmentId)

  try {
    await withLockedQuiz(assessmentId, async (tx, quiz) => {
      if (!(await assessmentRepository.findQuizQuestion(tx, assessmentId, assessmentQuestionId))) {
        throw ApiError.notFound(QUIZ_QUESTION_NOT_FOUND)
      }
      assertNotAttempted(quiz, 'Questions cannot be removed from a quiz that students have attempted')
      if (quiz.status === CONTENT_STATUS.PUBLISHED && quiz._count.questions === 1) {
        throw ApiError.conflict('A published quiz must keep at least one question. Set the quiz to DRAFT before removing its last question.')
      }
      await assessmentRepository.deleteQuizQuestion(tx, assessmentQuestionId)
    })
  } catch (err) {
    // Student answers refer to quiz questions through RESTRICT foreign keys.
    if (isForeignKeyViolation(err)) {
      throw ApiError.conflict('Questions cannot be removed from a quiz that students have attempted')
    }
    throw translatePrismaError(err, { notFound: QUIZ_QUESTION_NOT_FOUND })
  }
}
