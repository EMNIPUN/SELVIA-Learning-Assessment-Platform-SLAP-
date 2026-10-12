import * as materialService from '../services/learningMaterial.service.js'

export async function createMaterial(req, res) {
  const material = await materialService.createMaterial(req.user, req.params.lessonId, req.body)
  res.status(201).json({ success: true, message: 'Learning material created', data: { material } })
}

export async function listMaterials(req, res) {
  const materials = await materialService.listMaterials(req.user, req.params.lessonId)
  res.status(200).json({ success: true, data: { materials } })
}

export async function getMaterial(req, res) {
  const material = await materialService.getMaterial(req.user, req.params.materialId)
  res.status(200).json({ success: true, data: { material } })
}

export async function updateMaterial(req, res) {
  const material = await materialService.updateMaterial(req.user, req.params.materialId, req.body)
  res.status(200).json({ success: true, message: 'Learning material updated', data: { material } })
}

export async function deleteMaterial(req, res) {
  await materialService.deleteMaterial(req.user, req.params.materialId)
  res.status(200).json({ success: true, message: 'Learning material deleted' })
}
