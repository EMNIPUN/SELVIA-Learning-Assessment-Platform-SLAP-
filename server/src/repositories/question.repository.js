import prisma from '../database/postgres/prisma.js'
import { CONCEPT_ACCESS_SELECT } from './concept.repository.js'
import { SOURCE_SUMMARY_SELECT } from './contentSource.repository.js'

// answerConfig and explanation give the answer away; only the owning lecturer receives questions.
const QUESTION_SELECT = {
  id: true,
  conceptId: true,
  questionText: true,
  questionType: true,
  difficulty: true,
  bloomLevel: true,
  answerConfig: true,
  explanation: true,
  defaultPoints: true,
  version: true,
  previousVersionId: true,
  status: true,
  sourceReference: true,
  reviewedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  source: { select: SOURCE_SUMMARY_SELECT },
}

// Course-wide listings say which concept each question assesses.
const CONCEPT_SUMMARY_SELECT = { id: true, code: true, name: true }

function filterWhere({ search, status, questionType, difficulty, bloomLevel }) {
  return {
    ...(search && { questionText: { contains: search, mode: 'insensitive' } }),
    ...(status && { status }),
    ...(questionType && { questionType }),
    ...(difficulty && { difficulty }),
    ...(bloomLevel && { bloomLevel }),
  }
}

// Newest first; the id keeps the order stable between pages.
async function findPage(scope, filters, select) {
  const where = { ...scope, ...filterWhere(filters) }
  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      select,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: filters.limit,
      skip: filters.offset,
    }),
    prisma.question.count({ where }),
  ])
  return { questions, total }
}

export function findQuestionById(id) {
  return prisma.question.findUnique({
    where: { id },
    select: { ...QUESTION_SELECT, concept: { select: CONCEPT_ACCESS_SELECT } },
  })
}

export function findQuestionsByConcept(conceptId, filters) {
  return findPage({ conceptId }, filters, QUESTION_SELECT)
}

export function findQuestionsByCourse(courseId, { conceptId, ...filters }) {
  return findPage(
    { concept: { topic: { module: { courseId } } }, ...(conceptId && { conceptId }) },
    filters,
    { ...QUESTION_SELECT, concept: { select: CONCEPT_SUMMARY_SELECT } },
  )
}

export function createQuestion(data) {
  return prisma.question.create({ data, select: QUESTION_SELECT })
}

export function updateQuestion(id, data) {
  return prisma.question.update({ where: { id }, data, select: QUESTION_SELECT })
}

export function deleteQuestion(id) {
  return prisma.question.delete({ where: { id }, select: { id: true } })
}
