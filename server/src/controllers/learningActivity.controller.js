import * as activityService from '../services/learningActivity.service.js'

export async function recordActivity(req, res) {
  const activity = await activityService.recordActivity(req.user, req.body)
  res.status(201).json({ success: true, message: 'Learning activity recorded', data: { activity } })
}

export async function listMyActivities(req, res) {
  const activities = await activityService.listMyActivities(req.user, req.validatedQuery)
  res.status(200).json({ success: true, data: { activities } })
}
