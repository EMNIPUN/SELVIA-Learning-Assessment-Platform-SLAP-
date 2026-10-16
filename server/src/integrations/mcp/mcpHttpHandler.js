import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import env from '../../config/env.js'
import { findStudentByUserId } from '../../repositories/student.repository.js'
import { getAuthenticatedUser } from '../../services/auth.service.js'
import { getStudentActivities } from '../../services/learningActivity.service.js'
import { getCurrentEvidence } from '../../services/studentEvidence.service.js'
import { createTutorMcpServerFactory } from './createTutorMcpServer.js'
import { createTutorTokenConfig } from './tutorToken.js'
import { createTutorOAuthVerifier } from './tutorOAuthVerifier.js'
import {
  createTutorMcpAuthMiddleware,
  mcpUnavailableMiddleware,
  shouldServeTutorMcp,
} from './tutorMcpAuth.middleware.js'

/**
 * Builds the /mcp middleware stack. When tutor auth is not configured, mounts a 503 handler only —
 * never an unauthenticated MCP server.
 *
 * @param {{ tutor?: object, getAuthenticatedUser?: Function, findStudentByUserId?: Function, getCurrentEvidence?: Function, getStudentActivities?: Function }} [options]
 */
export function createMcpHttpStack(options = {}) {
  const tutor = options.tutor ?? env.mcp.tutor

  if (!shouldServeTutorMcp(tutor)) {
    return Object.freeze({
      configured: false,
      close: async () => {},
      middlewares: [mcpUnavailableMiddleware],
    })
  }

  const config = createTutorTokenConfig({
    secret: tutor.secret,
    audience: tutor.audience,
    issuer: tutor.issuer,
  })

  const verifier = createTutorOAuthVerifier({
    config,
    getAuthenticatedUser: options.getAuthenticatedUser ?? getAuthenticatedUser,
    findStudentByUserId: options.findStudentByUserId ?? findStudentByUserId,
  })

  const authMiddleware = createTutorMcpAuthMiddleware({
    verifier,
    audience: config.audience,
  })

  const services = {
    getCurrentEvidence: options.getCurrentEvidence ?? getCurrentEvidence,
    getStudentActivities: options.getStudentActivities ?? getStudentActivities,
  }

  const mcpHandler = createMcpHandler(createTutorMcpServerFactory(services))
  const nodeHandler = toNodeHandler(mcpHandler)

  return Object.freeze({
    configured: true,
    close: () => mcpHandler.close(),
    middlewares: [authMiddleware, nodeHandler],
    mcpHandler,
  })
}

/** Mounts Streamable HTTP MCP at /mcp on the existing Express app (not under /api/v1). */
export function mountTutorMcp(app, options = {}) {
  const stack = createMcpHttpStack(options)
  app.use('/mcp', ...stack.middlewares)
  return stack
}
