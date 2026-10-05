import { MaterialType } from '@prisma/client'
import * as dependencyRepository from '../repositories/contentDependency.repository.js'
import * as materialRepository from '../repositories/learningMaterial.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'
import { lifecycleChanges, NEW_CONTENT } from './contentLifecycle.service.js'
import { resolveSourceReference } from './contentSource.service.js'
import { assertCourseOwner, canView, visibleChildrenFilter } from './courseAccess.service.js'
import { assertNoDependents } from './deletionGuard.service.js'
import { getOwnedLesson, getVisibleLesson } from './lesson.service.js'

const NOT_FOUND = 'Learning material not found'

const MATERIAL_CONFLICTS = {
  learning_materials_lesson_id_sequence_order_key: {
    field: 'sequenceOrder',
    message: 'Another material in this lesson already uses this sequence order',
  },
}

// fileSizeBytes is a BigInt column; JSON cannot serialise BigInt.
const toMaterialResponse = ({ lesson, fileSizeBytes, ...material }) => ({
  ...material,
  fileSizeBytes: fileSizeBytes === null ? null : Number(fileSizeBytes),
})

// Mirrors the learning_materials CHECK constraints. Checked against the final values so updates are covered.
function assertMaterialLocation({ materialType, externalUrl, fileStorageKey }) {
  if (Boolean(externalUrl) === Boolean(fileStorageKey)) {
    throw ApiError.badRequest('Validation failed', [
      { field: 'externalUrl', message: 'Provide exactly one of externalUrl or fileStorageKey' },
    ])
  }
  if (materialType === MaterialType.LINK && !externalUrl) {
    throw ApiError.badRequest('Validation failed', [
      { field: 'externalUrl', message: 'LINK materials require an externalUrl' },
    ])
  }
}

async function findMaterial(materialId) {
  const material = await materialRepository.findMaterialById(materialId)
  if (!material) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return material
}

async function getOwnedMaterial(user, materialId) {
  const material = await findMaterial(materialId)
  assertCourseOwner(user, material.lesson.concept.topic.module.course)
  return material
}

export async function createMaterial(user, lessonId, input) {
  await getOwnedLesson(user, lessonId)
  assertMaterialLocation(input)
  const { sourceId, status, ...fields } = input
  const source = await resolveSourceReference(sourceId)
  const sequenceOrder = fields.sequenceOrder ?? (await materialRepository.findMaxSequenceOrder(lessonId)) + 1

  try {
    const material = await materialRepository.createMaterial({
      ...fields,
      lessonId,
      sequenceOrder,
      sourceId: source?.id ?? null,
      createdByUserId: user.id,
      ...lifecycleChanges(user, status, NEW_CONTENT, source?.sourceType),
    })
    return toMaterialResponse(material)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: MATERIAL_CONFLICTS })
  }
}

export async function listMaterials(user, lessonId) {
  const lesson = await getVisibleLesson(user, lessonId)
  const materials = await materialRepository.findMaterialsByLesson(
    lessonId,
    visibleChildrenFilter(user, lesson.concept.topic.module.course),
  )
  return materials.map(toMaterialResponse)
}

export async function getMaterial(user, materialId) {
  const material = await findMaterial(materialId)
  const { lesson } = material
  const { concept } = lesson
  if (!canView(user, concept.topic.module.course, concept.topic.module, concept.topic, concept, lesson, material)) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return toMaterialResponse(material)
}

export async function updateMaterial(user, materialId, input) {
  const material = await getOwnedMaterial(user, materialId)
  assertMaterialLocation({ ...material, ...input })
  const { sourceId, status, ...fields } = input
  const source = await resolveSourceReference(sourceId)
  const sourceType = source === undefined ? material.source?.sourceType : source?.sourceType

  try {
    const updated = await materialRepository.updateMaterial(materialId, {
      ...fields,
      ...(source !== undefined && { sourceId: source?.id ?? null }),
      ...lifecycleChanges(user, status, material, sourceType),
    })
    return toMaterialResponse(updated)
  } catch (err) {
    throw translatePrismaError(err, { conflicts: MATERIAL_CONFLICTS, notFound: NOT_FOUND })
  }
}

export async function deleteMaterial(user, materialId) {
  await getOwnedMaterial(user, materialId)
  assertNoDependents('learning material', await dependencyRepository.countMaterialDependents(materialId))

  try {
    await materialRepository.deleteMaterial(materialId)
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
