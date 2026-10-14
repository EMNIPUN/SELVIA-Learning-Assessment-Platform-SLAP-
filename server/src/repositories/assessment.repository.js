import { AssessmentType } from '@prisma/client'
import prisma from '../database/postgres/prisma.js'
import { COURSE_ACCESS_SELECT } from './course.repository.js'

// Prisma's 5-second default is too short for a multi-statement transaction against the hosted database.
const ASSESSMENT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 }

// Lecturer management view. Attempts are only counted: answers and results are never selected here.
const QUIZ_SELECT = {
  id: true,
  courseId: true,
  moduleId: true,
  topicId: true,
  assessmentType: true,
  title: true,
  description: true,
  instructions: true,
  timeLimitMinutes: true,
  maxAttempts: true,
  passPercentage: true,
  shuffleQuestions: true,
  resultsReleasePolicy: true,
  availableFrom: true,
  availableUntil: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { questions: true, attempts: true } },
}

// The bank question behind each quiz entry, including its answers: only the owning lecturer receives it.
const QUIZ_QUESTION_SELECT = {
  id: true,
  questionId: true,
  sequenceOrder: true,
  points: true,
  sectionLabel: true,
  createdAt: true,
  updatedAt: true,
  question: {
    select: {
      id: true,
      questionText: true,
      questionType: true,
      difficulty: true,
      bloomLevel: true,
      answerConfig: true,
      explanation: true,
      defaultPoints: true,
      version: true,
      status: true,
      concept: { select: { id: true, code: true, name: true } },
    },
  },
}

// The state that quiz changes are checked against while the quiz row is locked.
const LOCKED_QUIZ_SELECT = {
  id: true,
  courseId: true,
  status: true,
  publishedAt: true,
  availableFrom: true,
  availableUntil: true,
  _count: { select: { questions: true, attempts: true } },
}

// What a question must satisfy to be assessed in a quiz of a given course.
export const QUESTION_ELIGIBILITY_SELECT = {
  id: true,
  status: true,
  questionType: true,
  answerConfig: true,
  defaultPoints: true,
  concept: { select: { topic: { select: { module: { select: { courseId: true } } } } } },
}

export function findQuizById(id) {
  return prisma.assessment.findUnique({
    where: { id },
    select: { ...QUIZ_SELECT, course: { select: COURSE_ACCESS_SELECT } },
  })
}

export function findQuizQuestions(assessmentId) {
  return prisma.assessmentQuestion.findMany({
    where: { assessmentId },
    select: QUIZ_QUESTION_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

// Newest first; the id keeps the order stable between pages.
export async function findQuizzesByCourse(courseId, { search, status, limit, offset }) {
  const where = {
    courseId,
    assessmentType: AssessmentType.QUIZ,
    ...(search && { title: { contains: search, mode: 'insensitive' } }),
    ...(status && { status }),
  }
  const [quizzes, total] = await Promise.all([
    prisma.assessment.findMany({
      where,
      select: QUIZ_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    }),
    prisma.assessment.count({ where }),
  ])
  return { quizzes, total }
}

export function createQuiz(data) {
  return prisma.assessment.create({ data, select: QUIZ_SELECT })
}

export function transaction(work) {
  return prisma.$transaction(work, ASSESSMENT_TRANSACTION_OPTIONS)
}

// Locks the assessment row until the transaction ends and returns its current state, or null when it no longer
// exists. FOR UPDATE conflicts with the key-share lock that inserting an assessment_attempts row takes on its
// assessment, so no attempt can be created while the lock is held, and attempts committed before it are counted.
export async function lockQuiz(tx, id) {
  const rows = await tx.$queryRaw`SELECT id FROM assessments WHERE id = ${id}::uuid FOR UPDATE`
  if (rows.length === 0) {
    return null
  }
  return tx.assessment.findUnique({ where: { id }, select: LOCKED_QUIZ_SELECT })
}

// FOR SHARE keeps the questions' status from changing until the transaction ends.
export async function findEligibilityOfQuestion(tx, questionId) {
  await tx.$queryRaw`SELECT id FROM questions WHERE id = ${questionId}::uuid FOR SHARE`
  return tx.question.findUnique({ where: { id: questionId }, select: QUESTION_ELIGIBILITY_SELECT })
}

export async function findEligibilityOfQuizQuestions(tx, assessmentId) {
  await tx.$queryRaw`
    SELECT q.id FROM questions q
    JOIN assessment_questions aq ON aq.question_id = q.id
    WHERE aq.assessment_id = ${assessmentId}::uuid
    FOR SHARE OF q`
  return tx.assessmentQuestion.findMany({
    where: { assessmentId },
    select: { id: true, sequenceOrder: true, question: { select: QUESTION_ELIGIBILITY_SELECT } },
    orderBy: { sequenceOrder: 'asc' },
  })
}

export function updateQuiz(tx, id, data) {
  return tx.assessment.update({ where: { id }, data, select: QUIZ_SELECT })
}

// Its quiz questions are removed with it (ON DELETE CASCADE); attempts block the deletion (RESTRICT).
export function deleteQuiz(tx, id) {
  return tx.assessment.delete({ where: { id }, select: { id: true } })
}

export async function findMaxQuestionSequenceOrder(tx, assessmentId) {
  const { _max } = await tx.assessmentQuestion.aggregate({ where: { assessmentId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function findQuizQuestion(tx, assessmentId, assessmentQuestionId) {
  return tx.assessmentQuestion.findFirst({ where: { id: assessmentQuestionId, assessmentId }, select: QUIZ_QUESTION_SELECT })
}

export function createQuizQuestion(tx, data) {
  return tx.assessmentQuestion.create({ data, select: QUIZ_QUESTION_SELECT })
}

export function updateQuizQuestion(tx, id, data) {
  return tx.assessmentQuestion.update({ where: { id }, data, select: QUIZ_QUESTION_SELECT })
}

export function deleteQuizQuestion(tx, id) {
  return tx.assessmentQuestion.delete({ where: { id }, select: { id: true } })
}
