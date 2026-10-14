import * as conceptRepository from '../repositories/concept.repository.js'
import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as questionRepository from '../repositories/question.repository.js'
import { parseAnswerConfig } from '../schemas/question.schemas.js'
import { ApiError } from '../utils/ApiError.js'
import { isForeignKeyViolation, translatePrismaError } from '../utils/prismaErrors.js'
import { getOwnedConcept } from './concept.service.js'
import { lifecycleChanges, NEW_CONTENT } from './contentLifecycle.service.js'
import { resolveSourceReference } from './contentSource.service.js'
import { assertCourseOwner } from './courseAccess.service.js'
import { getOwnedCourse } from './course.service.js'
import { assertNoDependents, deletionBlocked } from './deletionGuard.service.js'

const NOT_FOUND = 'Question not found'

// Students answer what these fields say, so once a question is part of an assessment they are not edited in
// place (docs/database-design.md, section 5.14). A new version of the question is needed instead.
const ASSESSED_FIELDS = ['questionText', 'questionType', 'answerConfig']

// defaultPoints is a Decimal column; JSON would serialise it as a string. `concept` is the ownership chain
// when the question was loaded on its own and is not returned.
function toQuestionResponse({ concept, defaultPoints, ...question }) {
  return { ...question, defaultPoints: Number(defaultPoints) }
}

// Course-wide listings keep the concept summary ({ id, code, name }).
const toCourseQuestionResponse = (question) => ({ ...toQuestionResponse(question), concept: question.concept })

const toPage = ({ questions, total }, { limit, offset }, toResponse) => ({
  questions: questions.map(toResponse),
  pagination: { total, limit, offset },
})

function assertValidAnswerConfig(questionType, answerConfig) {
  const result = parseAnswerConfig(questionType, answerConfig)
  if (!result.success) {
    throw ApiError.badRequest(
      'Validation failed',
      result.error.issues.map((issue) => ({ field: ['answerConfig', ...issue.path].join('.'), message: issue.message })),
    )
  }
  return result.data
}

// JSONB does not keep key order, so stored and submitted answer configurations are compared by value.
function sameJson(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameJson(item, b[i]))
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]))
  }
  return a === b
}

async function assertAssessedFieldsUnchanged(question, fields) {
  const changed = ASSESSED_FIELDS.filter((name) => fields[name] !== undefined && !sameJson(fields[name], question[name]))
  if (changed.length === 0) {
    return
  }
  if ((await dependencyRepository.countQuestionAssessmentUses(question.id)) > 0) {
    throw ApiError.conflict(
      'This question is used in an assessment, so its text, type and answers cannot be changed',
      changed.map((field) => ({ field, message: 'Cannot be changed while the question is used in an assessment' })),
    )
  }
}

async function getOwnedQuestion(user, questionId) {
  const question = await questionRepository.findQuestionById(questionId)
  if (!question) {
    throw ApiError.notFound(NOT_FOUND)
  }
  assertCourseOwner(user, question.concept.topic.module.course)
  return question
}

export async function createQuestion(user, conceptId, input) {
  await getOwnedConcept(user, conceptId)
  const { sourceId, status, ...fields } = input
  const answerConfig = assertValidAnswerConfig(fields.questionType, fields.answerConfig)
  const source = await resolveSourceReference(sourceId)

  const question = await questionRepository.createQuestion({
    ...fields,
    answerConfig,
    conceptId,
    sourceId: source?.id ?? null,
    createdByUserId: user.id,
    ...lifecycleChanges(user, status, NEW_CONTENT, source?.sourceType),
  })
  return toQuestionResponse(question)
}

export async function listConceptQuestions(user, conceptId, query) {
  await getOwnedConcept(user, conceptId)
  return toPage(await questionRepository.findQuestionsByConcept(conceptId, query), query, toQuestionResponse)
}

export async function listCourseQuestions(user, courseId, query) {
  await getOwnedCourse(user, courseId)
  if (query.conceptId) {
    const concept = await conceptRepository.findConceptById(query.conceptId)
    if (concept?.topic.module.course.id !== courseId) {
      throw ApiError.badRequest('Validation failed', [{ field: 'conceptId', message: 'Concept not found in this course' }])
    }
  }
  return toPage(await questionRepository.findQuestionsByCourse(courseId, query), query, toCourseQuestionResponse)
}

export async function getQuestion(user, questionId) {
  return toQuestionResponse(await getOwnedQuestion(user, questionId))
}

export async function updateQuestion(user, questionId, input) {
  const question = await getOwnedQuestion(user, questionId)
  const { sourceId, status, ...fields } = input
  // A new type needs an answer configuration of that type, so both are checked together.
  if (fields.questionType !== undefined || fields.answerConfig !== undefined) {
    fields.answerConfig = assertValidAnswerConfig(
      fields.questionType ?? question.questionType,
      fields.answerConfig ?? question.answerConfig,
    )
  }
  await assertAssessedFieldsUnchanged(question, fields)
  const source = await resolveSourceReference(sourceId)
  const sourceType = source === undefined ? question.source?.sourceType : source?.sourceType

  try {
    const updated = await questionRepository.updateQuestion(questionId, {
      ...fields,
      ...(source !== undefined && { sourceId: source?.id ?? null }),
      ...lifecycleChanges(user, status, question, sourceType),
    })
    return toQuestionResponse(updated)
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}

export async function deleteQuestion(user, questionId) {
  await getOwnedQuestion(user, questionId)
  assertNoDependents('question', await dependencyRepository.countQuestionDependents(questionId))

  try {
    await questionRepository.deleteQuestion(questionId)
  } catch (err) {
    // A dependent record was added after the check; RESTRICT foreign keys rolled the deletion back.
    if (isForeignKeyViolation(err)) {
      throw deletionBlocked('question')
    }
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
