import express from 'express'
import v1Routes from './routes/v1/index.js'
import { mountTutorMcp } from './integrations/mcp/mcpHttpHandler.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.disable('x-powered-by')

// Streamable HTTP MCP must receive the raw request body. Skip JSON/urlencoded parsers on /mcp
// so @modelcontextprotocol/node can parse JSON-RPC itself (otherwise: "Parse error: Invalid JSON").
const jsonParser = express.json()
const urlencodedParser = express.urlencoded({ extended: true })
app.use((req, res, next) => {
  if (req.path === '/mcp' || req.path.startsWith('/mcp/')) {
    return next()
  }
  jsonParser(req, res, (err) => {
    if (err) return next(err)
    urlencodedParser(req, res, next)
  })
})

app.use('/api/v1', v1Routes)

// Streamable HTTP MCP for the Adaptive AI Tutor. Outside /api/v1. Auth uses tutor tokens only.
export const mcpLifecycle = mountTutorMcp(app)

app.use(notFound)
app.use(errorHandler)

export default app
