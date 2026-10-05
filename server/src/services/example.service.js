import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as exampleRepository from '../repositories/example.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'
import { lifecycleChanges, NEW_CONTENT } from './contentLifecycle.service.js'
import { resolveSourceReference } from './contentSource.service.js'
import { assertCourseOwner, canView, visibleChildrenFilter } from './courseAccess.service.js'
import { assertNoDependents } from './deletionGuard.service.js'
import { getOwnedLesson, getVisibleLesson } from './lesson.service.js'

const NOT_FOUND = 'Example not found'

const EXAMPLE_CONFLICTS = {
  examples_lesson_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another example in this lesson already uses this sequence order',
  },
}

const toExampleResponse = ({ lesson, ...example }) => example

// Mirrors the examples CHECK constraint. Checked against the final values so updates are covered.
function assertCodeHasLanguage({ codeSnippet, programmingLanguage }) {
  if (codeSnippet && !programmingLanguage) {
    throw ApiError.badRequest('Validation failed', [
      { field: 'programmingLanguage', message: 'Programming language is required when a code snippet is given' },
    ])
  }
}

async function findExample(exampleId) {
  const example = await exampleRepository.findExampleById(exampleId)
  if (!example) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return example
}

async function getOwnedExample(user, exampleId) {
  const example = await findExample(exampleId)
  assertCourseOwner(user, example.lesson.concept.topic.module.course)
  return example
}

export async function createExample(user, lessonId, input) {
  await getOwnedLesson(user, lessonId)
  assertCodeHasLanguage(input)
  const { sourceId, status, ...fields } = input
  const source = await resolveSourceReference(sourceId)
  const sequenceOrder = fields.sequenceOrder ?? (await exampleRepository.findMaxSequenceOrder(lessonId)) + 1

  try {
    return await exampleRepository.createExample({
      ...fields,
      lessonId,
      sequenceOrder,
      sourceId: source?.id ?? null,
      createdByUserId: user.id,
      ...lifecycleChanges(user, status, NEW_CONTENT, source?.sourceType),
    })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: EXAMPLE_CONFLICTS })
  }
}

export async function listExamples(user, lessonId) {
  const lesson = await getVisibleLesson(user, lessonId)
  return exampleRepository.findExamplesByLesson(lessonId, visibleChildrenFilter(user, lesson.concept.topic.module.course))
}

export async function getExample(user, exampleId) {
  const example = await findExample(exampleId)
  const { lesson } = example
  const { concept } = lesson
  if (!canView(user, concept.topic.module.course, concept.topic.module, concept.topic, concept, lesson, example)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return toExampleResponse(example)
}

export async function updateExample(user, exampleId, input) {
  const example = await getOwnedExample(user, exampleId)
  assertCodeHasLanguage({ ...example, ...input })
  const { sourceId, status, ...fields } = input
  const source = await resolveSourceReference(sourceId)
  const sourceType = source === undefined ? example.source?.sourceType : source?.sourceType

  try {
    return await exampleRepository.updateExample(exampleId, {
      ...fields,
      ...(source !== undefined && { sourceId: source?.id ?? null }),
      ...lifecycleChanges(user, status, example, sourceType),
    })
  } catch (err) {
    throw translatePrismaError(err, { conflicts: EXAMPLE_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteExample(user, exampleId) {
  await getOwnedExample(user, exampleId)
  assertNoDependents('example', await dependencyRepository.countExampleDependents(exampleId))

  try {
    await exampleRepository.deleteExample(exampleId)
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
