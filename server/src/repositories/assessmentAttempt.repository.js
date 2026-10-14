import { AttemptStatus, GradingStatus, Prisma } from '@prisma/client'
import prisma from '../database/postgres/prisma.js'
import { QUESTION_ELIGIBILITY_SELECT } from './assessment.repository.js'

// Students taking quizzes. Every transaction that changes an attempt takes its locks in the same order:
// the student's advisory lock for the quiz, the quiz's course row, the quiz row, its questions, then the attempt
// row. Lecturer quiz changes lock the quiz and then its questions, and course changes update only the course
// row, so neither can wait on these locks in the opposite order.

// Prisma's 5-second default is too short for a multi-statement transaction against the hosted database.
const ATTEMPT_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 }

// What a student may know about a quiz. Answer keys live on the questions and are never selected here.
const STUDENT_QUIZ_SELECT = {
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
  availableFrom: true,
  availableUntil: true,
  status: true,
  course: { select: { id: true, status: true } },
  _count: { select: { questions: true } },
}

// The settings a start or finalisation is decided on while the quiz row is locked.
const LOCKED_QUIZ_SELECT = {
  id: true,
  courseId: true,
  assessmentType: true,
  title: true,
  timeLimitMinutes: true,
  maxAttempts: true,
  passPercentage: true,
  shuffleQuestions: true,
  resultsReleasePolicy: true,
  availableFrom: true,
  availableUntil: true,
  status: true,
  course: { select: { id: true, status: true } },
}

const ATTEMPT_SELECT = {
  id: true,
  assessmentId: true,
  studentId: true,
  attemptNumber: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  submittedAt: true,
  timeSpentSeconds: true,
  result: {
    select: { totalScore: true, maxScore: true, percentage: true, passed: true, status: true, releasedAt: true },
  },
}

// The attempt's own question set. answerConfig is read only to list a choice question's options.
const ATTEMPT_QUESTION_SELECT = {
  assessmentQuestionId: true,
  response: true,
  maxScore: true,
  assessmentQuestion: {
    select: {
      sequenceOrder: true,
      sectionLabel: true,
      question: { select: { questionType: true, questionText: true, answerConfig: true } },
    },
  },
}

// What closing an attempt needs per answer: the answer key to grade it, and the question's concept and context
// for its evidence.
const ANSWER_FINALISATION_SELECT = {
  id: true,
  assessmentQuestionId: true,
  response: true,
  maxScore: true,
  answeredAt: true,
  assessmentQuestion: {
    select: {
      question: {
        select: {
          id: true,
          conceptId: true,
          version: true,
          questionType: true,
          difficulty: true,
          bloomLevel: true,
          answerConfig: true,
        },
      },
    },
  },
}

export function transaction(work) {
  return prisma.$transaction(work, ATTEMPT_TRANSACTION_OPTIONS)
}

export function findCourse(courseId) {
  return prisma.course.findUnique({ where: { id: courseId }, select: { id: true, status: true } })
}

export function findQuiz(assessmentId) {
  return prisma.assessment.findUnique({ where: { id: assessmentId }, select: STUDENT_QUIZ_SELECT })
}

export function findQuizzesInCourse(courseId, { assessmentType, status }) {
  return prisma.assessment.findMany({
    where: { courseId, assessmentType, status },
    select: STUDENT_QUIZ_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
}

// Sums the points of each quiz's questions, keyed by quiz id.
export async function sumQuizPoints(assessmentIds) {
  const sums = await prisma.assessmentQuestion.groupBy({
    by: ['assessmentId'],
    where: { assessmentId: { in: assessmentIds } },
    _sum: { points: true },
  })
  return new Map(sums.map((sum) => [sum.assessmentId, sum._sum.points]))
}

// Grouped by quiz, newest attempt first.
export function findStudentAttempts(studentId, assessmentIds) {
  return prisma.assessmentAttempt.findMany({
    where: { studentId, assessmentId: { in: assessmentIds } },
    select: ATTEMPT_SELECT,
    orderBy: [{ assessmentId: 'asc' }, { attemptNumber: 'desc' }],
  })
}

export function findAttemptById(attemptId) {
  return prisma.assessmentAttempt.findUnique({ where: { id: attemptId }, select: ATTEMPT_SELECT })
}

// Ids of the quizzes in which the student has an in-progress attempt whose deadline has passed.
export async function findQuizzesWithExpiredAttempts(studentId, now, { courseId, assessmentType, status }) {
  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      studentId,
      status: AttemptStatus.IN_PROGRESS,
      expiresAt: { lte: now },
      assessment: { courseId, assessmentType, status },
    },
    select: { assessmentId: true },
  })
  return attempts.map((attempt) => attempt.assessmentId)
}

// Serialises everything one student does to one quiz's attempts until the transaction ends.
export async function lockStudentQuiz(tx, studentId, assessmentId) {
  await tx.$executeRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`assessment-attempt:${studentId}:${assessmentId}`}, 0))`
}

// Locks the quiz's course and then the quiz FOR SHARE, so their status as read here holds until the transaction
// ends: course updates (such as unpublishing) and lecturer quiz changes, which lock the quiz FOR UPDATE, wait for
// it. Students can still start attempts side by side. Returns null when the quiz does not exist.
export async function lockQuiz(tx, assessmentId) {
  const courses = await tx.$queryRaw`
    SELECT id FROM courses
    WHERE id = (SELECT course_id FROM assessments WHERE id = ${assessmentId}::uuid)
    FOR SHARE`
  if (courses.length === 0) {
    return null
  }
  const quizzes = await tx.$queryRaw`SELECT id FROM assessments WHERE id = ${assessmentId}::uuid FOR SHARE`
  if (quizzes.length === 0) {
    return null
  }
  return tx.assessment.findUnique({ where: { id: assessmentId }, select: LOCKED_QUIZ_SELECT })
}

// Locks the quiz's entries and their bank questions, in sequence order, so their points and status stay as read.
export async function lockQuizQuestions(tx, assessmentId) {
  await tx.$queryRaw`
    SELECT aq.id FROM assessment_questions aq
    JOIN questions q ON q.id = aq.question_id
    WHERE aq.assessment_id = ${assessmentId}::uuid
    ORDER BY aq.sequence_order
    FOR SHARE OF aq, q`
  return tx.assessmentQuestion.findMany({
    where: { assessmentId },
    select: { id: true, sequenceOrder: true, points: true, question: { select: QUESTION_ELIGIBILITY_SELECT } },
    orderBy: { sequenceOrder: 'asc' },
  })
}

// Locks the student's in-progress attempt at the quiz, or returns null when there is none. A row that another
// transaction submits while this one waits no longer matches and is skipped.
export async function lockInProgressAttempt(tx, assessmentId, studentId) {
  const rows = await tx.$queryRaw`
    SELECT id FROM assessment_attempts
    WHERE assessment_id = ${assessmentId}::uuid AND student_id = ${studentId}::uuid AND status = 'IN_PROGRESS'
    FOR UPDATE`
  if (rows.length === 0) {
    return null
  }
  return tx.assessmentAttempt.findUnique({ where: { id: rows[0].id }, select: ATTEMPT_SELECT })
}

export async function countAttempts(tx, assessmentId, studentId) {
  const { _count, _max } = await tx.assessmentAttempt.aggregate({
    where: { assessmentId, studentId },
    _count: { _all: true },
    _max: { attemptNumber: true },
  })
  return { count: _count._all, lastAttemptNumber: _max.attemptNumber ?? 0 }
}

// Creates the attempt and its answers, one per quiz question: `answers` are { id, assessmentQuestionId, maxScore }
// and stay unanswered and ungraded. The ids of both are chosen by the caller.
export async function createAttempt(tx, attempt, answers) {
  await tx.assessmentAttempt.create({ data: attempt, select: { id: true } })
  await tx.studentAnswer.createMany({ data: answers.map((answer) => ({ ...answer, attemptId: attempt.id })) })
  return tx.assessmentAttempt.findUnique({ where: { id: attempt.id }, select: ATTEMPT_SELECT })
}

// In the order the attempt shows them: answer ids are generated in ascending order along it.
export function findAttemptQuestions(attemptId, client = prisma) {
  return client.studentAnswer.findMany({
    where: { attemptId },
    select: ATTEMPT_QUESTION_SELECT,
    orderBy: { id: 'asc' },
  })
}

// One answer of the attempt with what saving it needs: its question's type and answer configuration, to check the
// response against. Null when the quiz question is not part of the attempt.
export function findAttemptAnswer(tx, attemptId, assessmentQuestionId) {
  return tx.studentAnswer.findUnique({
    where: { attemptId_assessmentQuestionId: { attemptId, assessmentQuestionId } },
    select: {
      id: true,
      assessmentQuestionId: true,
      response: true,
      answeredAt: true,
      assessmentQuestion: { select: { question: { select: { questionType: true, answerConfig: true } } } },
    },
  })
}

export function findAttemptResponses(tx, attemptId) {
  return tx.studentAnswer.findMany({ where: { attemptId }, select: { response: true } })
}

// Writes the student's response (null clears it) and nothing else. Only an ungraded answer of the attempt is
// changed; returns how many were (0 or 1).
export async function saveAnswerResponse(tx, attemptId, answerId, { response, answeredAt }) {
  const { count } = await tx.studentAnswer.updateMany({
    where: { id: answerId, attemptId, gradingStatus: GradingStatus.PENDING },
    data: { response: response ?? Prisma.DbNull, answeredAt },
  })
  return count
}

export function findAnswersForFinalisation(tx, attemptId) {
  return tx.studentAnswer.findMany({ where: { attemptId }, select: ANSWER_FINALISATION_SELECT })
}

// `grades` are { ids, isCorrect, scoreAwarded } groups of answers that received the same grade, so an attempt is
// graded in a few statements rather than one per answer. Returns how many answers were graded.
export async function saveAutomaticGrades(tx, attemptId, grades, gradedAt) {
  let graded = 0
  for (const { ids, isCorrect, scoreAwarded } of grades) {
    const { count } = await tx.studentAnswer.updateMany({
      where: { attemptId, id: { in: ids } },
      data: { isCorrect, scoreAwarded, gradingStatus: GradingStatus.AUTO_GRADED, gradedAt },
    })
    graded += count
  }
  return graded
}

// Only an in-progress attempt is closed. Returns how many were (0 or 1).
export async function closeAttempt(tx, attemptId, { status, submittedAt, timeSpentSeconds }) {
  const { count } = await tx.assessmentAttempt.updateMany({
    where: { id: attemptId, status: AttemptStatus.IN_PROGRESS },
    data: { status, submittedAt, timeSpentSeconds },
  })
  return count
}

// `percentage` is generated by the database and is never written.
export function createResult(tx, data) {
  return tx.assessmentResult.create({ data, select: { id: true } })
}

// student_evidence is append-only and its `percentage` is generated by the database, so rows are only inserted,
// without it. A second current row for the same answer and concept violates a unique index rather than being
// skipped. Returns how many rows were inserted.
export async function createEvidence(tx, rows) {
  const { count } = await tx.studentEvidence.createMany({ data: rows })
  return count
}

// learning_activities is append-only (enforced by a database trigger).
export function createActivity(tx, data) {
  return tx.learningActivity.create({ data, select: { id: true } })
}
