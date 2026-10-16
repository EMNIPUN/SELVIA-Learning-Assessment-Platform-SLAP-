import { McpServer, requireScopes } from '@modelcontextprotocol/server'
import {
  getCurrentEvidenceToolInputSchema,
  getLearningActivitiesToolInputSchema,
} from './mcpToolSchemas.js'
import { safeToolErrorFromException, toolSuccess } from './toolResults.js'

export const TUTOR_MCP_SERVER_INFO = Object.freeze({
  name: 'selvia-tutor-mcp',
  version: '0.1.0',
})

export const EVIDENCE_READ_SCOPE = 'tutor:evidence.read'
export const ACTIVITY_READ_SCOPE = 'tutor:activity.read'

function requireStudentId(authInfo) {
  const studentId = authInfo?.extra?.studentId
  if (typeof studentId !== 'string' || studentId.length === 0) {
    return null
  }
  return studentId
}

/**
 * Tool body for get_current_evidence. Exported for unit tests; production registers it on McpServer.
 * studentId must come from verified AuthInfo — never from tool arguments.
 */
export async function executeGetCurrentEvidence({ studentId, args, getCurrentEvidence }) {
  if (!studentId) {
    return safeToolErrorFromException(new Error('missing student identity'))
  }

  try {
    const records = await getCurrentEvidence({
      studentId,
      ...(args?.courseId !== undefined ? { courseId: args.courseId } : {}),
      ...(args?.conceptId !== undefined ? { conceptId: args.conceptId } : {}),
    })
    return toolSuccess(records)
  } catch (err) {
    return safeToolErrorFromException(err)
  }
}

/**
 * Tool body for get_learning_activities. studentId is injected from AuthInfo only.
 */
export async function executeGetLearningActivities({ studentId, args, getStudentActivities }) {
  if (!studentId) {
    return safeToolErrorFromException(new Error('missing student identity'))
  }

  try {
    const records = await getStudentActivities({
      studentId,
      ...(args?.courseId !== undefined ? { courseId: args.courseId } : {}),
      ...(args?.activityType !== undefined ? { activityType: args.activityType } : {}),
      ...(args?.targetType !== undefined ? { targetType: args.targetType } : {}),
      ...(args?.occurredFrom !== undefined ? { occurredFrom: args.occurredFrom } : {}),
      ...(args?.occurredTo !== undefined ? { occurredTo: args.occurredTo } : {}),
      ...(args?.limit !== undefined ? { limit: args.limit } : {}),
    })
    return toolSuccess(records)
  } catch (err) {
    return safeToolErrorFromException(err)
  }
}

/**
 * Builds a fresh McpServer for one request. Identity is closed over from that request's AuthInfo only —
 * never stored at module level.
 *
 * @param {{ authInfo?: object, services: { getCurrentEvidence: Function, getStudentActivities: Function } }} options
 */
export function createTutorMcpServer({ authInfo, services }) {
  if (!services || typeof services.getCurrentEvidence !== 'function' || typeof services.getStudentActivities !== 'function') {
    throw new Error('createTutorMcpServer requires getCurrentEvidence and getStudentActivities services')
  }

  const studentId = requireStudentId(authInfo)
  const server = new McpServer(TUTOR_MCP_SERVER_INFO)

  server.registerTool(
    'get_current_evidence',
    {
      title: 'Get current evidence',
      description:
        'Retrieve the authenticated student\'s current learning evidence, optionally filtered by course and concept. Returns recorded evidence only and does not calculate mastery or competency.',
      inputSchema: getCurrentEvidenceToolInputSchema,
      scopeChallenge: requireScopes(EVIDENCE_READ_SCOPE),
    },
    async (args) =>
      executeGetCurrentEvidence({
        studentId,
        args,
        getCurrentEvidence: services.getCurrentEvidence,
      }),
  )

  server.registerTool(
    'get_learning_activities',
    {
      title: 'Get learning activities',
      description:
        'Retrieve the authenticated student\'s recorded learning activities, optionally filtered by course, activity type, target type, and occurrence date range. Recorded activity is behavioral evidence and does not prove understanding.',
      inputSchema: getLearningActivitiesToolInputSchema,
      scopeChallenge: requireScopes(ACTIVITY_READ_SCOPE),
    },
    async (args) =>
      executeGetLearningActivities({
        studentId,
        args,
        getStudentActivities: services.getStudentActivities,
      }),
  )

  return server
}

/** Factory for createMcpHandler: one McpServer instance per HTTP request / auth context. */
export function createTutorMcpServerFactory(services) {
  return (ctx) => createTutorMcpServer({ authInfo: ctx.authInfo, services })
}
