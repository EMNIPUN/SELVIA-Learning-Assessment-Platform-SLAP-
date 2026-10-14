import * as attemptService from '../services/assessmentAttempt.service.js'

export async function listCourseQuizzes(req, res) {
  const { quizzes } = await attemptService.listCourseQuizzes(req.user, req.params.courseId)
  res.status(200).json({ success: true, data: { quizzes } })
}

export async function getQuiz(req, res) {
  const quiz = await attemptService.getQuiz(req.user, req.params.assessmentId)
  res.status(200).json({ success: true, data: { quiz } })
}

export async function startAttempt(req, res) {
  const { resumed, attempt } = await attemptService.startAttempt(req.user, req.params.assessmentId)
  res.status(resumed ? 200 : 201).json({
    success: true,
    message: resumed ? 'Attempt resumed' : 'Attempt started',
    data: { attempt, resumed },
  })
}

export async function getAttempt(req, res) {
  const attempt = await attemptService.getAttempt(req.user, req.params.attemptId)
  res.status(200).json({ success: true, data: { attempt } })
}

export async function saveAnswer(req, res) {
  const { attemptId, assessmentQuestionId } = req.params
  const { answer, progress } = await attemptService.saveAnswer(req.user, attemptId, assessmentQuestionId, req.body)
  res.status(200).json({ success: true, message: 'Answer saved', data: { answer, progress } })
}

export async function clearAnswer(req, res) {
  const { attemptId, assessmentQuestionId } = req.params
  const { answer, progress } = await attemptService.clearAnswer(req.user, attemptId, assessmentQuestionId)
  res.status(200).json({ success: true, message: 'Answer cleared', data: { answer, progress } })
}

export async function submitAttempt(req, res) {
  const attempt = await attemptService.submitAttempt(req.user, req.params.attemptId)
  res.status(200).json({ success: true, message: 'Attempt submitted', data: { attempt } })
}
