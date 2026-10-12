import { apiRequest } from './client.js'
import { getConcept, getCourse, getModule, getTopic } from './course.api.js'

// Students receive only published lessons whose course, module, topic and concept are also published.

export async function listLessons(conceptId, { signal } = {}) {
  const { lessons } = await apiRequest(`/concepts/${encodeURIComponent(conceptId)}/lessons`, { signal })
  return lessons
}

export async function getLesson(lessonId, { signal } = {}) {
  const { lesson } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}`, { signal })
  return lesson
}

// Lesson changes are lecturer-only and allowed only in the lecturer's own courses; the API checks ownership
// through the concept's course, so requests carry only the lesson's own fields.

// `fields`: title, body (Markdown), summary, estimatedDurationMinutes, sequenceOrder, status.
// Without a sequenceOrder the API adds the lesson at the end of its concept.
export async function createLesson(conceptId, fields) {
  const { lesson } = await apiRequest(`/concepts/${encodeURIComponent(conceptId)}/lessons`, {
    method: 'POST',
    body: fields,
  })
  return lesson
}

// `changes`: any of the createLesson fields; at least one is required.
export async function updateLesson(lessonId, changes) {
  const { lesson } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}`, { method: 'PATCH', body: changes })
  return lesson
}

// Also deletes the lesson's learning materials, examples and exercises, and returns how many:
// { materials, examples, exercises }. Refused (409) while student activity refers to any of them.
export async function deleteLesson(lessonId) {
  const { deleted } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}`, { method: 'DELETE' })
  return deleted
}

// Materials, examples and exercises arrive in the lesson's sequence order; students receive only published items.

export async function listMaterials(lessonId, { signal } = {}) {
  const { materials } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}/materials`, { signal })
  return materials
}

export async function getMaterial(materialId, { signal } = {}) {
  const { material } = await apiRequest(`/materials/${encodeURIComponent(materialId)}`, { signal })
  return material
}

// Material changes are lecturer-only and allowed only in the lecturer's own courses; the API checks ownership
// through the lesson's course, so requests carry only the material's own fields.

// `fields`: title, materialType, exactly one of externalUrl or fileStorageKey (files are stored outside SELVIA
// and cannot be uploaded through the API), description, mimeType, fileSizeBytes, sequenceOrder, status.
// Without a sequenceOrder the API adds the material at the end of its lesson.
export async function createMaterial(lessonId, fields) {
  const { material } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}/materials`, {
    method: 'POST',
    body: fields,
  })
  return material
}

// `changes`: any of the createMaterial fields; at least one is required. The "exactly one of externalUrl or
// fileStorageKey" rule applies to the stored result, so switching from one to the other clears the old one.
export async function updateMaterial(materialId, changes) {
  const { material } = await apiRequest(`/materials/${encodeURIComponent(materialId)}`, {
    method: 'PATCH',
    body: changes,
  })
  return material
}

// Refused (409) while student activity refers to the material.
export async function deleteMaterial(materialId) {
  await apiRequest(`/materials/${encodeURIComponent(materialId)}`, { method: 'DELETE' })
}

export async function listExamples(lessonId, { signal } = {}) {
  const { examples } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}/examples`, { signal })
  return examples
}

export async function getExample(exampleId, { signal } = {}) {
  const { example } = await apiRequest(`/examples/${encodeURIComponent(exampleId)}`, { signal })
  return example
}

// Example changes are lecturer-only and allowed only in the lecturer's own courses; the API checks ownership
// through the lesson's course, so requests carry only the example's own fields.

// `fields`: title, exampleType, content (Markdown), problemStatement, explanation, codeSnippet (requires
// programmingLanguage), programmingLanguage, sequenceOrder, status.
// Without a sequenceOrder the API adds the example at the end of its lesson.
export async function createExample(lessonId, fields) {
  const { example } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}/examples`, {
    method: 'POST',
    body: fields,
  })
  return example
}

// `changes`: any of the createExample fields; at least one is required. The code snippet still needs a
// programming language after the change is applied.
export async function updateExample(exampleId, changes) {
  const { example } = await apiRequest(`/examples/${encodeURIComponent(exampleId)}`, {
    method: 'PATCH',
    body: changes,
  })
  return example
}

// Refused (409) while student activity refers to the example.
export async function deleteExample(exampleId) {
  await apiRequest(`/examples/${encodeURIComponent(exampleId)}`, { method: 'DELETE' })
}

// Students receive the question only: multiple-choice exercises list their options, and the correct answer
// and explanation never leave the server before an answer is submitted. The lecturer who owns the course
// receives the full definition, including answerConfig and solutionExplanation.
export async function listExercises(lessonId, { signal } = {}) {
  const { exercises } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}/exercises`, { signal })
  return exercises
}

export async function getExercise(exerciseId, { signal } = {}) {
  const { exercise } = await apiRequest(`/exercises/${encodeURIComponent(exerciseId)}`, { signal })
  return exercise
}

// Exercise changes are lecturer-only and allowed only in the lecturer's own courses; the API checks ownership
// through the lesson's course, so requests carry only the exercise's own fields.

// `fields`: title, instructions (Markdown), exerciseType, answerConfig (its shape depends on the type),
// solutionExplanation, difficulty, bloomLevel, maxScore, estimatedDurationMinutes, sequenceOrder, status.
// Without a sequenceOrder the API adds the exercise at the end of its lesson; without a maxScore it is worth 1.
export async function createExercise(lessonId, fields) {
  const { exercise } = await apiRequest(`/lessons/${encodeURIComponent(lessonId)}/exercises`, {
    method: 'POST',
    body: fields,
  })
  return exercise
}

// `changes`: any of the createExercise fields; at least one is required. A new exerciseType must come with an
// answerConfig of that type.
export async function updateExercise(exerciseId, changes) {
  const { exercise } = await apiRequest(`/exercises/${encodeURIComponent(exerciseId)}`, {
    method: 'PATCH',
    body: changes,
  })
  return exercise
}

// Refused (409) while student attempts refer to the exercise.
export async function deleteExercise(exerciseId) {
  await apiRequest(`/exercises/${encodeURIComponent(exerciseId)}`, { method: 'DELETE' })
}

// Where a lesson sits in its course, resolved by following each record's parent id upwards.
// Returns { courseId, courseTitle, moduleId, moduleTitle, topicId, topicTitle, conceptId, conceptName }.
export async function getLessonContext(conceptId, { signal } = {}) {
  const concept = await getConcept(conceptId, { signal })
  const topic = await getTopic(concept.topicId, { signal })
  const module = await getModule(topic.moduleId, { signal })
  const course = await getCourse(module.courseId, { signal })
  return {
    courseId: course.id,
    courseTitle: course.title,
    moduleId: module.id,
    moduleTitle: module.title,
    topicId: topic.id,
    topicTitle: topic.title,
    conceptId: concept.id,
    conceptName: concept.name,
  }
}
