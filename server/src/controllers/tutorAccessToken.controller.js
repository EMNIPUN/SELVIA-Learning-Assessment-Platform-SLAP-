import { issueTutorAccessToken } from '../services/tutorAccessToken.service.js'

export async function issueTutorAccessTokenHandler(req, res) {
  const data = await issueTutorAccessToken(req.body)

  res.status(200).json({
    success: true,
    data,
  })
}
