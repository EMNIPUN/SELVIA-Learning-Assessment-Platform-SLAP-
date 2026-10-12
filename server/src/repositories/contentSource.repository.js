import prisma from '../database/postgres/prisma.js'

// Shown alongside lessons, materials, and examples that cite the source.
export const SOURCE_SUMMARY_SELECT = {
  id: true,
  sourceType: true,
  title: true,
  authors: true,
  url: true,
  citation: true,
}

const SOURCE_SELECT = {
  id: true,
  sourceType: true,
  title: true,
  authors: true,
  publisher: true,
  publicationYear: true,
  edition: true,
  url: true,
  isbnOrDoi: true,
  license: true,
  citation: true,
  generationMetadata: true,
  accessedAt: true,
  notes: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
}

export function findSourceById(id) {
  return prisma.contentSource.findUnique({ where: { id }, select: SOURCE_SELECT })
}

export function findSources(where) {
  return prisma.contentSource.findMany({ where, select: SOURCE_SELECT, orderBy: { title: 'asc' } })
}

export function createSource(data) {
  return prisma.contentSource.create({ data, select: SOURCE_SELECT })
}

export function updateSource(id, data) {
  return prisma.contentSource.update({ where: { id }, data, select: SOURCE_SELECT })
}
