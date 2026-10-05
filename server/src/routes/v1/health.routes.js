import { Router } from 'express'
import { getHealth, getNeo4jHealth } from '../../controllers/health.controller.js'

const router = Router()

router.get('/', getHealth)
router.get('/neo4j', getNeo4jHealth)

export default router
