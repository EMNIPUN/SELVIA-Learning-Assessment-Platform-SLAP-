import { Router } from 'express'
import assessmentRoutes from './assessment.routes.js'
import assessmentAttemptRoutes from './assessmentAttempt.routes.js'
import authRoutes from './auth.routes.js'
import conceptRoutes from './concept.routes.js'
import contentSourceRoutes from './contentSource.routes.js'
import courseRoutes from './course.routes.js'
import courseGraphRoutes from './courseGraph.routes.js'
import exampleRoutes from './example.routes.js'
import exerciseRoutes from './exercise.routes.js'
import healthRoutes from './health.routes.js'
import learningActivityRoutes from './learningActivity.routes.js'
import learningMaterialRoutes from './learningMaterial.routes.js'
import lessonRoutes from './lesson.routes.js'
import moduleRoutes from './module.routes.js'
import questionRoutes from './question.routes.js'
import topicRoutes from './topic.routes.js'

const router = Router()

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/graph', courseGraphRoutes)

// Course structure and learning content routers declare full paths because nested routes span two
// resources (for example /courses/:courseId/modules lives with the module routes).
router.use(courseRoutes)
router.use(moduleRoutes)
router.use(topicRoutes)
router.use(conceptRoutes)
router.use(lessonRoutes)
router.use(learningMaterialRoutes)
router.use(exampleRoutes)
router.use(exerciseRoutes)
router.use(questionRoutes)
router.use(assessmentRoutes)
router.use(assessmentAttemptRoutes)
router.use(contentSourceRoutes)
router.use(learningActivityRoutes)

export default router
