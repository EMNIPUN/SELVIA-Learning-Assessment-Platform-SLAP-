import { Router } from 'express'
import env from '../../../config/env.js'
import { issueTutorAccessTokenHandler } from '../../../controllers/tutorAccessToken.controller.js'
import { createAuthenticateInternalTutorMint } from '../../../middleware/authenticateInternalTutorMint.js'
import { validateBody } from '../../../middleware/validate.js'
import { issueTutorAccessTokenSchema } from '../../../schemas/tutorAccessToken.schemas.js'

const router = Router()

const authenticateInternalTutorMint = createAuthenticateInternalTutorMint({
  getConfig: () => env.internalTutorMint,
})

/**
 * Internal-only: J26 Core API mints a short-lived tutor MCP access token.
 * Auth: Authorization Bearer INTERNAL_TUTOR_MINT_TOKEN (never expose to browsers).
 * Body: issuer + subject (Keycloak); optional expiresInSeconds (1–900, default 300).
 * Fixed scopes: tutor:evidence.read tutor:activity.read. Does not create identity links.
 */
router.post(
  '/tutor-access-tokens',
  authenticateInternalTutorMint,
  validateBody(issueTutorAccessTokenSchema),
  issueTutorAccessTokenHandler,
)

export default router
