import * as attemptService from '../services/exerciseAttempt.service.js'
import * as exerciseService from '../services/exercise.service.js'

export async function createExercise(req, res) {
  const exercise = await exerciseService.createExercise(req.user, req.params.lessonId, req.body)
  res.status(201).json({ success: true, message: 'Exercise created', data: { exercise } })
}

export async function listExercises(req, res) {
  const exercises = await exerciseService.listExercises(req.user, req.params.lessonId)
  res.status(200).json({ success: true, data: { exercises } })
}

export async function getExercise(req, res) {
  const exercise = await exerciseService.getExercise(req.user, req.params.exerciseId)
  res.status(200).json({ success: true, data: { exercise } })
}

export async function updateExercise(req, res) {
  const exercise = await exerciseService.updateExercise(req.user, req.params.exerciseId, req.body)
  res.status(200).json({ success: true, message: 'Exercise updated', data: { exercise } })
}

export async function deleteExercise(req, res) {
  await exerciseService.deleteExercise(req.user, req.params.exerciseId)
  res.status(200).json({ success: true, message: 'Exercise deleted' })
}

export async function submitAttempt(req, res) {
  const attempt = await attemptService.submitAttempt(req.user, req.params.exerciseId, req.body)
  res.status(201).json({ success: true, message: 'Answer evaluated', data: { attempt } })
}

export async function listMyAttempts(req, res) {
  const attempts = await attemptService.listMyAttempts(req.user, req.params.exerciseId)
  res.status(200).json({ success: true, data: { attempts } })
}
