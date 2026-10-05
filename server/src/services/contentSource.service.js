import { ContentSourceType } from '@prisma/client'
import * as sourceRepository from '../repositories/contentSource.repository.js'
import { ApiError } from '../utils/ApiError.js'
import { translatePrismaError } from '../utils/prismaErrors.js'

const NOT_FOUND = 'Content source not found'

const URL_REQUIRED_TYPES = [ContentSourceType.WEBSITE, ContentSourceType.OPEN_EDUCATIONAL_RESOURCE]

const toSourceResponse = ({ createdByUserId, ...source }) => source

// Mirrors the content_sources CHECK constraints. Checked against the final values so updates are covered.
function assertSourceRules({ sourceType, url, generationMetadata }) {
  const details = []
  if (URL_REQUIRED_TYPES.includes(sourceType) && !url) {
    details.push({ field: 'url', message: `URL is required for ${sourceType} sources` })
  }
  if (sourceType === ContentSourceType.AI_GENERATED && !(generationMetadata && Object.keys(generationMetadata).length > 0)) {
    details.push({
      field: 'generationMetadata',
      message: 'Generation metadata (for example model, prompt reference, generation date) is required for AI_GENERATED sources',
    })
  }
  if (details.length > 0) {
    throw ApiError.badRequest('Validation failed', details)
  }
}

async function findSource(sourceId) {
  const source = await sourceRepository.findSourceById(sourceId)
  if (!source) {
    throw ApiError.notFound(NOT_FOUND)
  }
  return source
}

// For content services: `undefined` leaves the source unchanged, `null` removes it.
export async function resolveSourceReference(sourceId) {
  if (sourceId === undefined || sourceId === null) {
    return sourceId
  }
  const source = await sourceRepository.findSourceById(sourceId)
  if (!source) {
    throw ApiError.badRequest('Validation failed', [{ field: 'sourceId', message: NOT_FOUND }])
  }
  return source
}

export async function createContentSource(user, input) {
  assertSourceRules(input)
  return toSourceResponse(await sourceRepository.createSource({ ...input, createdByUserId: user.id }))
}

export async function listContentSources({ sourceType }) {
  const sources = await sourceRepository.findSources(sourceType ? { sourceType } : {})
  return sources.map(toSourceResponse)
}

export async function getContentSource(sourceId) {
  return toSourceResponse(await findSource(sourceId))
}

export async function updateContentSource(user, sourceId, input) {
  const source = await findSource(sourceId)
  if (source.createdByUserId !== user.id) {
    throw ApiError.forbidden('Only the lecturer who created this source can modify it')
  }
  assertSourceRules({ ...source, ...input })

  try {
    return toSourceResponse(await sourceRepository.updateSource(sourceId, input))
  } catch (err) {
    throw translatePrismaError(err, { notFound: NOT_FOUND })
  }
}
