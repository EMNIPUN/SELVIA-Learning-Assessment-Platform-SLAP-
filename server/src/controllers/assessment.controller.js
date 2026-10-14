import * as assessmentService from '../services/assessment.service.js'

export async function createQuiz(req, res) {
  const assessment = await assessmentService.createQuiz(req.user, req.params.courseId, req.body)
  res.status(201).json({ success: true, message: 'Quiz created', data: { assessment } })
}

export async function listCourseQuizzes(req, res) {
  const { assessments, pagination } = await assessmentService.listCourseQuizzes(req.user, req.params.courseId, req.validatedQuery)
  res.status(200).json({ success: true, data: { assessments, pagination } })
}

export async function getQuiz(req, res) {
  const assessment = await assessmentService.getQuiz(req.user, req.params.assessmentId)
  res.status(200).json({ success: true, data: { assessment } })
}

export async function updateQuiz(req, res) {
  const assessment = await assessmentService.updateQuiz(req.user, req.params.assessmentId, req.body)
  res.status(200).json({ success: true, message: 'Quiz updated', data: { assessment } })
}

export async function deleteQuiz(req, res) {
  await assessmentService.deleteQuiz(req.user, req.params.assessmentId)
  res.status(200).json({ success: true, message: 'Quiz deleted' })
}

export async function addQuizQuestion(req, res) {
  const assessmentQuestion = await assessmentService.addQuizQuestion(req.user, req.params.assessmentId, req.body)
  res.status(201).json({ success: true, message: 'Question added to the quiz', data: { assessmentQuestion } })
}

export async function updateQuizQuestion(req, res) {
  const { assessmentId, assessmentQuestionId } = req.params
  const assessmentQuestion = await assessmentService.updateQuizQuestion(req.user, assessmentId, assessmentQuestionId, req.body)
  res.status(200).json({ success: true, message: 'Quiz question updated', data: { assessmentQuestion } })
}

export async function removeQuizQuestion(req, res) {
  const { assessmentId, assessmentQuestionId } = req.params
  await assessmentService.removeQuizQuestion(req.user, assessmentId, assessmentQuestionId)
  res.status(200).json({ success: true, message: 'Question removed from the quiz' })
}
