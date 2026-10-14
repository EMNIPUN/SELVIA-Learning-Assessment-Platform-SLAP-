import { Prisma } from '@prisma/client'
import { ApiError } from './ApiError.js'

function isPrismaError(err, code) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
}

export function isForeignKeyViolation(err) {
  return isPrismaError(err, 'P2003')
}

// With `indexes` (unique index names from the migration), only a violation of one of them counts.
export function isUniqueViolation(err, indexes) {
  if (!isPrismaError(err, 'P2002')) {
    return false
  }
  return !indexes || indexes.includes(err.meta?.driverAdapterError?.cause?.constraint?.index)
}

// Translates expected Prisma failures into API errors; anything else is returned unchanged.
// `conflicts` maps unique index names from the migration to { field, message }.
export function translatePrismaError(err, { conflicts = {}, notFound } = {}) {
  if (isPrismaError(err, 'P2002')) {
    const conflict = conflicts[err.meta?.driverAdapterError?.cause?.constraint?.index]
    if (conflict) {
      return ApiError.conflict(conflict.message, [conflict])
    }
  }
  if (isPrismaError(err, 'P2025') && notFound) {
    return ApiError.notFound(notFound)
  }
  return err
}
