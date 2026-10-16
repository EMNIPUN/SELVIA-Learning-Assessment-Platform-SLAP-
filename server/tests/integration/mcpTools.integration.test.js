// npm run test:integration:safe -- tests/integration/mcpTools.integration.test.js
// Exercises the mounted /mcp Streamable HTTP endpoint with the official MCP client. Uses only the guarded local
// *_test database and the runner-isolated tutor MCP secrets (never Supabase or Neo4j Aura).
import { checkedTestDatabase } from '../support/integrationPreload.js'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { after, before, describe, it } from 'node:test'
import { Client } from '@modelcontextprotocol/client'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import app from '../../src/app.js'
import env from '../../src/config/env.js'
import prisma from '../../src/database/postgres/prisma.js'
import {
  createTutorTokenConfig,
  signTutorToken,
  TUTOR_TOKEN_ISSUER,
} from '../../src/integrations/mcp/tutorToken.js'
import { ISOLATED_MCP_RESOURCE_URL } from '../support/testEnvironmentIsolation.js'

checkedTestDatabase.assertUnchanged()

const RUN_ID = randomBytes(5).toString('hex').toUpperCase()
const newPassword = () => `Aa1-${randomBytes(18).toString('base64url')}`

assert.equal(env.mcp.tutor.configured, true, 'integration isolation must configure tutor MCP auth')
assert.equal(env.mcp.tutor.audience, ISOLATED_MCP_RESOURCE_URL)

const tutorConfig = createTutorTokenConfig({
  secret: process.env.MCP_TUTOR_TOKEN_SECRET,
  audience: process.env.MCP_RESOURCE_URL,
  issuer: env.mcp.tutor.issuer || TUTOR_TOKEN_ISSUER,
})

async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }
  return { status: response.status, body: parsed }
}

function assertStatus(label, response, expected) {
  if (response.status === expected) return
  const summary =
    response.status >= 500
      ? 'server error, details withheld'
      : JSON.stringify({ message: response.body?.message, error: response.body?.error, details: response.body?.details })
  assert.fail(`${label}: expected HTTP ${expected}, got ${response.status} (${summary})`)
}

async function registerAndLogin(api, { role, email, profile }) {
  const password = newPassword()
  const registered = await api('POST', '/auth/register', {
    body: { email, password, firstName: 'Integration', lastName: `Test ${role.toLowerCase()}`, role, ...profile },
  })
  assertStatus(`registering a ${role.toLowerCase()}`, registered, 201)
  const loggedIn = await api('POST', '/auth/login', { body: { email, password } })
  assertStatus(`logging in a ${role.toLowerCase()}`, loggedIn, 200)
  return { user: registered.body.data.user, token: loggedIn.body.data.token }
}

async function registerStudent(api, label) {
  const student = await registerAndLogin(api, {
    role: 'STUDENT',
    email: `it-mcp-${RUN_ID.toLowerCase()}-student-${label}@example.test`,
    profile: { studentNumber: `IT-MCP-${label}-${RUN_ID}` },
  })
  assert.equal(typeof student.user.student?.id, 'string')
  return {
    userId: student.user.id,
    studentId: student.user.student.id,
    loginToken: student.token,
  }
}

function tutorToken({ userId, studentId, scopes }) {
  return signTutorToken({ userId, studentId, scopes }, tutorConfig)
}

async function withMcpClient(mcpBaseUrl, bearerToken, fn) {
  const headers = {}
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`
  const transport = new StreamableHTTPClientTransport(new URL(mcpBaseUrl), {
    requestInit: { headers },
  })
  const client = new Client({ name: 'selvia-mcp-integration-test', version: '0.1.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
    await transport.close().catch(() => {})
  }
}

function envelopeFromToolResult(result) {
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent
  }
  const text = result.content?.find((part) => part.type === 'text')?.text
  assert.equal(typeof text, 'string', 'tool result has no text content')
  return JSON.parse(text)
}

async function teardown(server) {
  const failures = []
  if (server?.listening) {
    const closed = new Promise((resolve) => server.close(resolve))
    server.closeAllConnections()
    const err = await closed
    if (err) failures.push(`closing the HTTP server: ${err.message}`)
  }
  try {
    await prisma.$disconnect()
  } catch (err) {
    failures.push(`disconnecting Prisma: ${err.message}`)
  }
  return failures
}

describe('MCP /mcp tools', { timeout: 180_000 }, () => {
  let server
  let apiBase
  let mcpBase
  let studentA
  let studentB
  let publishedLessonId

  before(async () => {
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = server.address().port
    apiBase = `http://127.0.0.1:${port}/api/v1`
    mcpBase = `http://127.0.0.1:${port}/mcp`
    const api = (method, path, options) => request(apiBase, method, path, options)

    studentA = await registerStudent(api, 'a')
    studentB = await registerStudent(api, 'b')

    const lecturer = await registerAndLogin(api, {
      role: 'LECTURER',
      email: `it-mcp-${RUN_ID.toLowerCase()}-lecturer@example.test`,
      profile: { staffNumber: `IT-MCP-L-${RUN_ID}` },
    })

    const course = await api('POST', '/courses', {
      token: lecturer.token,
      body: { code: `IT-MCP-${RUN_ID}`, title: `MCP integration course ${RUN_ID}`, status: 'PUBLISHED' },
    })
    assertStatus('creating course', course, 201)
    const module = await api('POST', `/courses/${course.body.data.course.id}/modules`, {
      token: lecturer.token,
      body: { title: 'MCP module', status: 'PUBLISHED' },
    })
    assertStatus('creating module', module, 201)
    const topic = await api('POST', `/modules/${module.body.data.module.id}/topics`, {
      token: lecturer.token,
      body: { title: 'MCP topic', status: 'PUBLISHED' },
    })
    assertStatus('creating topic', topic, 201)
    const concept = await api('POST', `/topics/${topic.body.data.topic.id}/concepts`, {
      token: lecturer.token,
      body: { code: `IT-MCP-C-${RUN_ID}`, name: 'MCP concept', status: 'PUBLISHED' },
    })
    assertStatus('creating concept', concept, 201)
    const lesson = await api('POST', `/concepts/${concept.body.data.concept.id}/lessons`, {
      token: lecturer.token,
      body: {
        title: 'MCP lesson',
        body: 'Lesson for MCP activity recording.',
        status: 'PUBLISHED',
      },
    })
    assertStatus('creating lesson', lesson, 201)
    publishedLessonId = lesson.body.data.lesson.id

    const tracked = await api('POST', '/learning-activities', {
      token: studentB.loginToken,
      body: { activityType: 'LESSON_VIEWED', targetId: publishedLessonId },
    })
    assertStatus('recording activity for student B', tracked, 201)
  })

  after(async () => {
    const failures = await teardown(server)
    assert.deepEqual(failures, [])
  })

  it('keeps existing REST health working', async () => {
    const health = await request(apiBase, 'GET', '/health')
    assertStatus('REST health', health, 200)
    assert.equal(health.body.success, true)
  })

  it('rejects unauthenticated and login-JWT MCP access', async () => {
    const unauth = await fetch(mcpBase, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'unauth', version: '0.0.0' },
      } }),
    })
    assert.equal(unauth.status, 401)

    const loginOnly = await fetch(mcpBase, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${studentA.loginToken}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'login-jwt', version: '0.0.0' },
      } }),
    })
    assert.equal(loginOnly.status, 401)
  })

  it('returns a successful empty Contract C envelope for get_current_evidence', async () => {
    const token = tutorToken({
      userId: studentA.userId,
      studentId: studentA.studentId,
      scopes: ['tutor:evidence.read'],
    })
    const result = await withMcpClient(mcpBase, token, (client) =>
      client.callTool({ name: 'get_current_evidence', arguments: {} }),
    )
    const envelope = envelopeFromToolResult(result)
    assert.equal(envelope.ok, true)
    assert.deepEqual(envelope.data.records, [])
    assert.notEqual(result.isError, true)
  })

  it('returns learning activities for the authenticated student only', async () => {
    const tokenB = tutorToken({
      userId: studentB.userId,
      studentId: studentB.studentId,
      scopes: ['tutor:activity.read'],
    })
    const forB = await withMcpClient(mcpBase, tokenB, (client) =>
      client.callTool({ name: 'get_learning_activities', arguments: { limit: 50 } }),
    )
    const envelopeB = envelopeFromToolResult(forB)
    assert.equal(envelopeB.ok, true)
    assert.ok(envelopeB.data.records.length >= 1)
    const viewed = envelopeB.data.records.find((row) => row.activityType === 'LESSON_VIEWED')
    assert.ok(viewed)
    assert.equal(viewed.durationSeconds, null)
    assert.equal(viewed.studentId, undefined)

    const tokenA = tutorToken({
      userId: studentA.userId,
      studentId: studentA.studentId,
      scopes: ['tutor:activity.read'],
    })
    const forA = await withMcpClient(mcpBase, tokenA, (client) =>
      client.callTool({ name: 'get_learning_activities', arguments: {} }),
    )
    const envelopeA = envelopeFromToolResult(forA)
    assert.equal(envelopeA.ok, true)
    assert.equal(
      envelopeA.data.records.some((row) => row.targetId === publishedLessonId),
      false,
      'student A must not see student B activity rows',
    )
  })

  it('rejects identity overrides in tool arguments', async () => {
    const token = tutorToken({
      userId: studentA.userId,
      studentId: studentA.studentId,
      scopes: ['tutor:evidence.read', 'tutor:activity.read'],
    })
    await withMcpClient(mcpBase, token, async (client) => {
      await assert.rejects(
        client.callTool({
          name: 'get_current_evidence',
          arguments: { studentId: studentB.studentId },
        }),
      )
      await assert.rejects(
        client.callTool({
          name: 'get_learning_activities',
          arguments: { userId: studentB.userId },
        }),
      )
    })
  })

  it('enforces per-tool scopes', async () => {
    const evidenceOnly = tutorToken({
      userId: studentA.userId,
      studentId: studentA.studentId,
      scopes: ['tutor:evidence.read'],
    })
    await withMcpClient(mcpBase, evidenceOnly, async (client) => {
      const ok = await client.callTool({ name: 'get_current_evidence', arguments: {} })
      assert.equal(envelopeFromToolResult(ok).ok, true)

      let activityFailed = false
      try {
        const result = await client.callTool({ name: 'get_learning_activities', arguments: {} })
        if (result.isError) activityFailed = true
        else activityFailed = envelopeFromToolResult(result).ok === false
      } catch {
        activityFailed = true
      }
      assert.equal(activityFailed, true, 'activity tool must fail without tutor:activity.read')
    })
  })
})
