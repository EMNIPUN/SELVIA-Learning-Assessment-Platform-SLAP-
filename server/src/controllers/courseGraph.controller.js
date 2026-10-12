import * as courseGraphService from '../services/courseGraph.service.js'

function syncHandler(sync, param, entity) {
  return async (req, res) => {
    const node = await sync(req.user, req.params[param])
    res.status(200).json({ success: true, message: `${entity} synchronized to the knowledge graph`, data: { node } })
  }
}

// `removed` counts the deleted nodes per label and the deleted relationships per type.
function removeHandler(remove, param, entity) {
  return async (req, res) => {
    const result = await remove(req.user, req.params[param])
    res.status(200).json({ success: true, message: `${entity} removed from the knowledge graph`, data: result })
  }
}

export const syncCourse = syncHandler(courseGraphService.syncCourse, 'courseId', 'Course')
export const syncModule = syncHandler(courseGraphService.syncModule, 'moduleId', 'Module')
export const syncTopic = syncHandler(courseGraphService.syncTopic, 'topicId', 'Topic')
export const syncConcept = syncHandler(courseGraphService.syncConcept, 'conceptId', 'Concept')
export const syncLesson = syncHandler(courseGraphService.syncLesson, 'lessonId', 'Lesson')

export async function syncCourseHierarchy(req, res) {
  const result = await courseGraphService.syncCourseHierarchy(req.user, req.params.courseId)
  res.status(200).json({ success: true, message: 'Course hierarchy synchronized to the knowledge graph', data: result })
}

export const removeCourse = removeHandler(courseGraphService.removeCourse, 'courseId', 'Course')
export const removeModule = removeHandler(courseGraphService.removeModule, 'moduleId', 'Module')
export const removeTopic = removeHandler(courseGraphService.removeTopic, 'topicId', 'Topic')
export const removeConcept = removeHandler(courseGraphService.removeConcept, 'conceptId', 'Concept')
export const removeLesson = removeHandler(courseGraphService.removeLesson, 'lessonId', 'Lesson')
