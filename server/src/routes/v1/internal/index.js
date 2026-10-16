import { Router } from 'express'
import tutorAccessTokenRoutes from './tutorAccessToken.routes.js'

const router = Router()

// Machine-to-machine routes for trusted backends (J26 Core API). Not for browsers.
router.use(tutorAccessTokenRoutes)

export default router
