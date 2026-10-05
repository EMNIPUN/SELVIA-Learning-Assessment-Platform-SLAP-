import * as conceptService from '../services/concept.service.js'

export async function createConcept(req, res) {
  const concept = await conceptService.createConcept(req.user, req.params.topicId, req.body)
  res.status(201).json({ success: true, message: 'Concept created', data: { concept } })
}

export async function listConcepts(req, res) {
  const concepts = await conceptService.listConcepts(req.user, req.params.topicId)
  res.status(200).json({ success: true, data: { concepts } })
}

export async function getConcept(req, res) {
  const concept = await conceptService.getConcept(req.user, req.params.conceptId)
  res.status(200).json({ success: true, data: { concept } })
}

export async function updateConcept(req, res) {
  const concept = await conceptService.updateConcept(req.user, req.params.conceptId, req.body)
  res.status(200).json({ success: true, message: 'Concept updated', data: { concept } })
}

export async function deleteConcept(req, res) {
  await conceptService.deleteConcept(req.user, req.params.conceptId)
  res.status(200).json({ success: true, message: 'Concept deleted' })
}
