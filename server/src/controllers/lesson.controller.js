import * as lessonService from '../services/lesson.service.js'

export async function createLesson(req, res) {
  const lesson = await lessonService.createLesson(req.user, req.params.conceptId, req.body)
  res.status(201).json({ success: true, message: 'Lesson created', data: { lesson } })
}

export async function listLessons(req, res) {
  const lessons = await lessonService.listLessons(req.user, req.params.conceptId)
  res.status(200).json({ success: true, data: { lessons } })
}

export async function getLesson(req, res) {
  const lesson = await lessonService.getLesson(req.user, req.params.lessonId)
  res.status(200).json({ success: true, data: { lesson } })
}

export async function updateLesson(req, res) {
  const lesson = await lessonService.updateLesson(req.user, req.params.lessonId, req.body)
  res.status(200).json({ success: true, message: 'Lesson updated', data: { lesson } })
}

// `deleted` counts the learning materials and examples removed with the lesson.
export async function deleteLesson(req, res) {
  const deleted = await lessonService.deleteLesson(req.user, req.params.lessonId)
  res.status(200).json({ success: true, message: 'Lesson deleted', data: { deleted } })
}
