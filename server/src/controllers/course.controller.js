import * as courseService from '../services/course.service.js'

export async function createCourse(req, res) {
  const course = await courseService.createCourse(req.user, req.body)
  res.status(201).json({ success: true, message: 'Course created', data: { course } })
}

export async function listCourses(req, res) {
  const courses = await courseService.listCourses(req.user, req.validatedQuery)
  res.status(200).json({ success: true, data: { courses } })
}

export async function getCourse(req, res) {
  const course = await courseService.getCourse(req.user, req.params.courseId)
  res.status(200).json({ success: true, data: { course } })
}

export async function updateCourse(req, res) {
  const course = await courseService.updateCourse(req.user, req.params.courseId, req.body)
  res.status(200).json({ success: true, message: 'Course updated', data: { course } })
}

// `deleted` counts the modules, topics, and concepts removed with the course.
export async function deleteCourse(req, res) {
  const deleted = await courseService.deleteCourse(req.user, req.params.courseId)
  res.status(200).json({ success: true, message: 'Course deleted', data: { deleted } })
}
