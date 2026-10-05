import * as moduleService from '../services/module.service.js'

export async function createModule(req, res) {
  const module = await moduleService.createModule(req.user, req.params.courseId, req.body)
  res.status(201).json({ success: true, message: 'Module created', data: { module } })
}

export async function listModules(req, res) {
  const modules = await moduleService.listModules(req.user, req.params.courseId)
  res.status(200).json({ success: true, data: { modules } })
}

export async function getModule(req, res) {
  const module = await moduleService.getModule(req.user, req.params.moduleId)
  res.status(200).json({ success: true, data: { module } })
}

export async function updateModule(req, res) {
  const module = await moduleService.updateModule(req.user, req.params.moduleId, req.body)
  res.status(200).json({ success: true, message: 'Module updated', data: { module } })
}

// `deleted` counts the topics and concepts removed with the module.
export async function deleteModule(req, res) {
  const deleted = await moduleService.deleteModule(req.user, req.params.moduleId)
  res.status(200).json({ success: true, message: 'Module deleted', data: { deleted } })
}
