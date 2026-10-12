import * as topicService from '../services/topic.service.js'

export async function createTopic(req, res) {
  const topic = await topicService.createTopic(req.user, req.params.moduleId, req.body)
  res.status(201).json({ success: true, message: 'Topic created', data: { topic } })
}

export async function listTopics(req, res) {
  const topics = await topicService.listTopics(req.user, req.params.moduleId)
  res.status(200).json({ success: true, data: { topics } })
}

export async function getTopic(req, res) {
  const topic = await topicService.getTopic(req.user, req.params.topicId)
  res.status(200).json({ success: true, data: { topic } })
}

export async function updateTopic(req, res) {
  const topic = await topicService.updateTopic(req.user, req.params.topicId, req.body)
  res.status(200).json({ success: true, message: 'Topic updated', data: { topic } })
}

// `deleted` counts the concepts removed with the topic.
export async function deleteTopic(req, res) {
  const deleted = await topicService.deleteTopic(req.user, req.params.topicId)
  res.status(200).json({ success: true, message: 'Topic deleted', data: { deleted } })
}
