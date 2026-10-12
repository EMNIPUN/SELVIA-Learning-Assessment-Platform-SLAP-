import { Router } from 'express'
import { getMe, login, register } from '../../controllers/auth.controller.js'
import { authenticate } from '../../middleware/authenticate.js'
import { validateBody } from '../../middleware/validate.js'
import { loginSchema, registerSchema } from '../../schemas/auth.schemas.js'

const router = Router()

// Body: email, password, firstName, lastName, role ("STUDENT" | "LECTURER"),
// plus studentNumber for STUDENT or staffNumber for LECTURER.
// 201 returns the user with its student or lecturer profile; 409 on a duplicate email or number.
router.post('/register', validateBody(registerSchema), register)
router.post('/login', validateBody(loginSchema), login)
router.get('/me', authenticate, getMe)

export default router
