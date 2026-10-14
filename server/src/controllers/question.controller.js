import * as questionService from '../services/question.service.js'

export async function createQuestion(req, res) {
  const question = await questionService.createQuestion(req.user, req.params.conceptId, req.body)
  res.status(201).json({ success: true, message: 'Question created', data: { question } })
}

export async function listConceptQuestions(req, res) {
  const { questions, pagination } = await questionService.listConceptQuestions(req.user, req.params.conceptId, req.validatedQuery)
  res.status(200).json({ success: true, data: { questions, pagination } })
}

export async function listCourseQuestions(req, res) {
  const { questions, pagination } = await questionService.listCourseQuestions(req.user, req.params.courseId, req.validatedQuery)
  res.status(200).json({ success: true, data: { questions, pagination } })
}

export async function getQuestion(req, res) {
  const question = await questionService.getQuestion(req.user, req.params.questionId)
  res.status(200).json({ success: true, data: { question } })
}

export async function updateQuestion(req, res) {
  const question = await questionService.updateQuestion(req.user, req.params.questionId, req.body)
  res.status(200).json({ success: true, message: 'Question updated', data: { question } })
}

export async function deleteQuestion(req, res) {
  await questionService.deleteQuestion(req.user, req.params.questionId)
  res.status(200).json({ success: true, message: 'Question deleted' })
}
