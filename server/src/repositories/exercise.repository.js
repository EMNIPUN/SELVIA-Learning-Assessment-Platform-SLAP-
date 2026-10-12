import prisma from '../database/postgres/prisma.js'
import { SOURCE_SUMMARY_SELECT } from './contentSource.repository.js'
import { LESSON_ACCESS_SELECT } from './lesson.repository.js'

// answerConfig and solutionExplanation give the answer away; the service decides who receives them.
const EXERCISE_SELECT = {
  id: true,
  lessonId: true,
  title: true,
  instructions: true,
  exerciseType: true,
  difficulty: true,
  bloomLevel: true,
  answerConfig: true,
  solutionExplanation: true,
  maxScore: true,
  estimatedDurationMinutes: true,
  sequenceOrder: true,
  status: true,
  sourceReference: true,
  reviewedAt: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  source: { select: SOURCE_SUMMARY_SELECT },
}

export function findExerciseById(id) {
  return prisma.exercise.findUnique({
    where: { id },
    select: { ...EXERCISE_SELECT, lesson: { select: LESSON_ACCESS_SELECT } },
  })
}

export function findExercisesByLesson(lessonId, filter = {}) {
  return prisma.exercise.findMany({
    where: { lessonId, ...filter },
    select: EXERCISE_SELECT,
    orderBy: { sequenceOrder: 'asc' },
  })
}

export async function findMaxSequenceOrder(lessonId) {
  const { _max } = await prisma.exercise.aggregate({ where: { lessonId }, _max: { sequenceOrder: true } })
  return _max.sequenceOrder ?? 0
}

export function createExercise(data) {
  return prisma.exercise.create({ data, select: EXERCISE_SELECT })
}

export function updateExercise(id, data) {
  return prisma.exercise.update({ where: { id }, data, select: EXERCISE_SELECT })
}

export function deleteExercise(id) {
  return prisma.exercise.delete({ where: { id }, select: { id: true } })
}
