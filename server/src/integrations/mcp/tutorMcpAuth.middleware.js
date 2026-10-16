import { requireBearerAuth } from '@modelcontextprotocol/express'

// Express bearer gate for /mcp. Scope checks for individual tools stay on registerTool (requireScopes).
// Does not reuse the login JWT authenticate middleware.

/** Fail closed: only serve MCP tools when env.mcp.tutor.configured is true. */
export function shouldServeTutorMcp(tutor) {
  return tutor?.configured === true
}

export function mcpUnavailableMiddleware(_req, res) {
  res.status(503).json({
    ok: false,
    error: {
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Tutor MCP authentication is not configured',
    },
  })
}

/**
 * @param {{ verifier: { verifyAccessToken: Function }, audience: string }} options
 */
export function createTutorMcpAuthMiddleware({ verifier, audience }) {
  if (!verifier || typeof verifier.verifyAccessToken !== 'function') {
    throw new Error('Tutor MCP auth middleware requires an OAuth token verifier')
  }
  if (typeof audience !== 'string' || audience.length === 0) {
    throw new Error('Tutor MCP auth middleware requires the MCP resource audience URL')
  }

  return requireBearerAuth({
    verifier,
    expectedResource: new URL(audience),
    // Intentionally no requiredScopes here: tokens may carry only one tool scope.
  })
}
