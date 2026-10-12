import * as sourceService from '../services/contentSource.service.js'

export async function createContentSource(req, res) {
  const source = await sourceService.createContentSource(req.user, req.body)
  res.status(201).json({ success: true, message: 'Content source created', data: { source } })
}

export async function listContentSources(req, res) {
  const sources = await sourceService.listContentSources(req.validatedQuery)
  res.status(200).json({ success: true, data: { sources } })
}

export async function getContentSource(req, res) {
  const source = await sourceService.getContentSource(req.params.sourceId)
  res.status(200).json({ success: true, data: { source } })
}

export async function updateContentSource(req, res) {
  const source = await sourceService.updateContentSource(req.user, req.params.sourceId, req.body)
  res.status(200).json({ success: true, message: 'Content source updated', data: { source } })
}
