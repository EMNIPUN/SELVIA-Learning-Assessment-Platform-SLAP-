import { ActivityTargetType } from '@prisma/client'
import prisma from '../database/postgres/prisma.js'

// Records outside the Course -> Module -> Topic -> Concept structure that reference it.
// Structure is only deleted when every count is zero.

// Learning materials, examples and exercises belong to lessons, so the lesson count covers them.
const CONCEPT_DEPENDENTS = {
  lessons: true,
  questions: true,
  learningActivities: true,
  evidence: true,
}

function sumCounts(...countObjects) {
  const totals = {}
  for (const counts of countObjects) {
    for (const [name, count] of Object.entries(counts)) {
      totals[name] = (totals[name] ?? 0) + count
    }
  }
  return totals
}

async function sumConceptDependents(conceptWhere) {
  const concepts = await prisma.concept.findMany({
    where: conceptWhere,
    select: { _count: { select: CONCEPT_DEPENDENTS } },
  })
  return sumCounts(...concepts.map((concept) => concept._count))
}

export async function countCourseDependents(courseId) {
  const [conceptCounts, assessments, course] = await Promise.all([
    sumConceptDependents({ topic: { module: { courseId } } }),
    prisma.assessment.count({
      where: { OR: [{ courseId }, { module: { courseId } }, { topic: { module: { courseId } } }] },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { _count: { select: { enrollments: true, learningActivities: true, evidence: true } } },
    }),
  ])
  return sumCounts(conceptCounts, { assessments }, course?._count ?? {})
}

export async function countModuleDependents(moduleId) {
  const [conceptCounts, assessments] = await Promise.all([
    sumConceptDependents({ topic: { moduleId } }),
    prisma.assessment.count({ where: { OR: [{ moduleId }, { topic: { moduleId } }] } }),
  ])
  return sumCounts(conceptCounts, { assessments })
}

export async function countTopicDependents(topicId) {
  const [conceptCounts, assessments] = await Promise.all([
    sumConceptDependents({ topicId }),
    prisma.assessment.count({ where: { topicId } }),
  ])
  return sumCounts(conceptCounts, { assessments })
}

export function countConceptDependents(conceptId) {
  return sumConceptDependents({ id: conceptId })
}

// Learning activities point at lessons, materials, examples, and exercises through (target_type, target_id)
// without a foreign key, so these counts are the only protection for them. Exercise attempts are
// EXERCISE_SUBMITTED activities, and their evidence refers to those activities, so the activity count
// covers attempts and evidence too.

export async function countLessonDependents(lessonId) {
  const [materials, examples, exercises] = await Promise.all([
    prisma.learningMaterial.findMany({ where: { lessonId }, select: { id: true } }),
    prisma.example.findMany({ where: { lessonId }, select: { id: true } }),
    prisma.exercise.findMany({ where: { lessonId }, select: { id: true } }),
  ])
  const learningActivities = await prisma.learningActivity.count({
    where: {
      OR: [
        { targetType: ActivityTargetType.LESSON, targetId: lessonId },
        { targetType: ActivityTargetType.LEARNING_MATERIAL, targetId: { in: materials.map((m) => m.id) } },
        { targetType: ActivityTargetType.EXAMPLE, targetId: { in: examples.map((e) => e.id) } },
        { targetType: ActivityTargetType.EXERCISE, targetId: { in: exercises.map((e) => e.id) } },
      ],
    },
  })
  return { learningActivities }
}

export async function countMaterialDependents(materialId) {
  const learningActivities = await prisma.learningActivity.count({
    where: { targetType: ActivityTargetType.LEARNING_MATERIAL, targetId: materialId },
  })
  return { learningActivities }
}

export async function countExampleDependents(exampleId) {
  const learningActivities = await prisma.learningActivity.count({
    where: { targetType: ActivityTargetType.EXAMPLE, targetId: exampleId },
  })
  return { learningActivities }
}

export async function countExerciseDependents(exerciseId) {
  const learningActivities = await prisma.learningActivity.count({
    where: { targetType: ActivityTargetType.EXERCISE, targetId: exerciseId },
  })
  return { learningActivities }
}

// Student answers, and the evidence derived from them, refer to a question through its assessment entries,
// so the assessment count covers them.
export function countQuestionAssessmentUses(questionId) {
  return prisma.assessmentQuestion.count({ where: { questionId } })
}

export async function countQuestionDependents(questionId) {
  const [assessmentQuestions, learningActivities, laterVersions] = await Promise.all([
    countQuestionAssessmentUses(questionId),
    prisma.learningActivity.count({ where: { targetType: ActivityTargetType.QUESTION, targetId: questionId } }),
    prisma.question.count({ where: { previousVersionId: questionId } }),
  ])
  return { assessmentQuestions, learningActivities, laterVersions }
}
