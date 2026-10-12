import { apiRequest } from './client.js'

// The API decides visibility: students receive published courses and published content only.

// `mine: true` (lecturers only) returns just the lecturer's own courses, in every status. Without it a
// lecturer also receives other lecturers' published courses.
export async function listCourses({ signal, mine = false } = {}) {
  const { courses } = await apiRequest(mine ? '/courses?mine=true' : '/courses', { signal })
  return courses
}

export async function getCourse(courseId, { signal } = {}) {
  const { course } = await apiRequest(`/courses/${encodeURIComponent(courseId)}`, { signal })
  return course
}

// Course changes are lecturer-only. The API makes the signed-in lecturer the owner and only lets the owner
// change or delete a course, so requests never name a lecturer.

// `fields`: code, title, description, credits, status.
export async function createCourse(fields) {
  const { course } = await apiRequest('/courses', { method: 'POST', body: fields })
  return course
}

// `changes`: any of the createCourse fields; at least one is required.
export async function updateCourse(courseId, changes) {
  const { course } = await apiRequest(`/courses/${encodeURIComponent(courseId)}`, { method: 'PATCH', body: changes })
  return course
}

// Also deletes the course's modules, topics and concepts. Refused (409) while anything else depends on them.
export async function deleteCourse(courseId) {
  await apiRequest(`/courses/${encodeURIComponent(courseId)}`, { method: 'DELETE' })
}

export async function listModules(courseId, { signal } = {}) {
  const { modules } = await apiRequest(`/courses/${encodeURIComponent(courseId)}/modules`, { signal })
  return modules
}

export async function listTopics(moduleId, { signal } = {}) {
  const { topics } = await apiRequest(`/modules/${encodeURIComponent(moduleId)}/topics`, { signal })
  return topics
}

export async function listConcepts(topicId, { signal } = {}) {
  const { concepts } = await apiRequest(`/topics/${encodeURIComponent(topicId)}/concepts`, { signal })
  return concepts
}

export async function getModule(moduleId, { signal } = {}) {
  const { module } = await apiRequest(`/modules/${encodeURIComponent(moduleId)}`, { signal })
  return module
}

export async function getTopic(topicId, { signal } = {}) {
  const { topic } = await apiRequest(`/topics/${encodeURIComponent(topicId)}`, { signal })
  return topic
}

export async function getConcept(conceptId, { signal } = {}) {
  const { concept } = await apiRequest(`/concepts/${encodeURIComponent(conceptId)}`, { signal })
  return concept
}

// Module, topic and concept changes are lecturer-only and allowed only in the lecturer's own courses; the API
// checks ownership through the course, so requests carry only the item's own fields.
// Without a sequenceOrder the API adds a new item at the end of its parent.

// `fields`: title, description, sequenceOrder, status.
export async function createModule(courseId, fields) {
  const { module } = await apiRequest(`/courses/${encodeURIComponent(courseId)}/modules`, {
    method: 'POST',
    body: fields,
  })
  return module
}

// `changes`: any of the createModule fields; at least one is required.
export async function updateModule(moduleId, changes) {
  const { module } = await apiRequest(`/modules/${encodeURIComponent(moduleId)}`, { method: 'PATCH', body: changes })
  return module
}

// Also deletes the module's topics and concepts, and returns how many: { topics, concepts }.
// Refused (409) while anything else depends on them.
export async function deleteModule(moduleId) {
  const { deleted } = await apiRequest(`/modules/${encodeURIComponent(moduleId)}`, { method: 'DELETE' })
  return deleted
}

// `fields`: title, description, sequenceOrder, status.
export async function createTopic(moduleId, fields) {
  const { topic } = await apiRequest(`/modules/${encodeURIComponent(moduleId)}/topics`, {
    method: 'POST',
    body: fields,
  })
  return topic
}

export async function updateTopic(topicId, changes) {
  const { topic } = await apiRequest(`/topics/${encodeURIComponent(topicId)}`, { method: 'PATCH', body: changes })
  return topic
}

// Also deletes the topic's concepts, and returns how many: { concepts }.
// Refused (409) while anything else depends on them.
export async function deleteTopic(topicId) {
  const { deleted } = await apiRequest(`/topics/${encodeURIComponent(topicId)}`, { method: 'DELETE' })
  return deleted
}

// `fields`: code (unique across all courses), name (unique within the topic), description, sequenceOrder, status.
export async function createConcept(topicId, fields) {
  const { concept } = await apiRequest(`/topics/${encodeURIComponent(topicId)}/concepts`, {
    method: 'POST',
    body: fields,
  })
  return concept
}

export async function updateConcept(conceptId, changes) {
  const { concept } = await apiRequest(`/concepts/${encodeURIComponent(conceptId)}`, { method: 'PATCH', body: changes })
  return concept
}

// Refused (409) while lessons, questions, student activity or evidence refer to the concept.
export async function deleteConcept(conceptId) {
  await apiRequest(`/concepts/${encodeURIComponent(conceptId)}`, { method: 'DELETE' })
}
