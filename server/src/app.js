import express from 'express'
import v1Routes from './routes/v1/index.js'
import { mountTutorMcp } from './integrations/mcp/mcpHttpHandler.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.disable('x-powered-by')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/v1', v1Routes)

// Streamable HTTP MCP for the Adaptive AI Tutor. Outside /api/v1. Auth uses tutor tokens only.
export const mcpLifecycle = mountTutorMcp(app)

app.use(notFound)
app.use(errorHandler)

export default app
