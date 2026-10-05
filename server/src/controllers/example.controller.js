import * as exampleService from '../services/example.service.js'

export async function createExample(req, res) {
  const example = await exampleService.createExample(req.user, req.params.lessonId, req.body)
  res.status(201).json({ success: true, message: 'Example created', data: { example } })
}

export async function listExamples(req, res) {
  const examples = await exampleService.listExamples(req.user, req.params.lessonId)
  res.status(200).json({ success: true, data: { examples } })
}

export async function getExample(req, res) {
  const example = await exampleService.getExample(req.user, req.params.exampleId)
  res.status(200).json({ success: true, data: { example } })
}

export async function updateExample(req, res) {
  const example = await exampleService.updateExample(req.user, req.params.exampleId, req.body)
  res.status(200).json({ success: true, message: 'Example updated', data: { example } })
}

export async function deleteExample(req, res) {
  await exampleService.deleteExample(req.user, req.params.exampleId)
  res.status(200).json({ success: true, message: 'Example deleted' })
}
