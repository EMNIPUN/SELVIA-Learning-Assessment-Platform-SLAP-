// npm run test:integration:safe -- tests/integration/courseGraph.integration.test.js. Who may synchronize a course into
// the knowledge graph, and what the API answers while Neo4j is switched off. The runner always switches it off for
// integration tests (testEnvironmentIsolation.js), so no request here reaches Neo4j: the application refuses before
// creating a driver. Each run registers its own users and creates its own course, with identifiers unique to the
// run; nothing is removed afterwards (README.md, "Test data").
import { checkedTestDatabase } from '../support/integrationPreload.js';
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { after, before, describe, it } from 'node:test'
import app from '../../src/app.js'
import prisma from '../../src/database/postgres/prisma.js'

// Importing the application loaded src/config/env.js, which fills in missing variables from server/.env.
checkedTestDatabase.assertUnchanged()

const RUN_ID = randomBytes(5).toString('hex').toUpperCase()
const GRAPH_UNAVAILABLE = 'The knowledge graph database is unavailable. Try again later.'

// Parts of the internal error, and of Neo4j connection settings, that the public response must not contain.
const INTERNAL_DETAILS = ['not configured', 'NEO4J_', 'bolt://', 'neo4j://', 'neo4j+s://', 'neo4j+ssc://', 'databases.neo4j.io']

// Meets the registration password rules. Never printed or put in an assertion message.
const newPassword = () => `Aa1-${randomBytes(18).toString('base64url')}`

async function request(baseUrl, method, path, { token, body } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token !== undefined) headers.authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

// Reports only the error message and details of a refused request: a successful login response holds a token, and
// a server error's message may describe the database connection.
function assertStatus(label, response, expected) {
  if (response.status === expected) return
  const summary =
    response.status >= 500
      ? 'server error, details withheld'
      : JSON.stringify({ message: response.body?.message, details: response.body?.details })
  assert.fail(`${label}: expected HTTP ${expected}, got ${response.status} (${summary})`)
}

// The error envelope (middleware/errorHandler.js). A server error's actual message is never echoed.
function assertError(label, response, expectedStatus, expectedMessage) {
  assertStatus(label, response, expectedStatus)
  assert.equal(response.body.success, false, `${label}: success should be false`)
  if (expectedStatus >= 500) {
    assert.ok(response.body.message === expectedMessage, `${label}: the message is not the expected one`)
  } else {
    assert.equal(response.body.message, expectedMessage, label)
  }
}

async function registerAndLogin(api, { role, email, profile }) {
  const password = newPassword()
  const registered = await api('POST', '/auth/register', {
    body: { email, password, firstName: 'Integration', lastName: `Test ${role.toLowerCase()}`, role, ...profile },
  })
  assertStatus(`registering a ${role.toLowerCase()}`, registered, 201)
  assert.equal(registered.body.data.user.role, role)

  const loggedIn = await api('POST', '/auth/login', { body: { email, password } })
  assertStatus(`logging in a ${role.toLowerCase()}`, loggedIn, 200)
  assert.equal(typeof loggedIn.body.data.token, 'string', 'the login response has no token')
  return { user: registered.body.data.user, token: loggedIn.body.data.token }
}

// Returns what failed, so that a teardown failure never hides the test's own failure.
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
    failures.push(`disconnecting Prisma: ${err.name}`)
  }
  return failures
}

describe('course graph synchronization while Neo4j is switched off', { timeout: 120_000 }, () => {
  let server
  let api
  let owner
  let otherLecturer
  let student
  let course

  const syncHierarchy = (courseId, token) => api('POST', `/graph/courses/${courseId}/sync-hierarchy`, { token })

  before(async () => {
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
    api = (method, path, options) => request(baseUrl, method, path, options)
    const emailPrefix = `it-${RUN_ID.toLowerCase()}`

    owner = await registerAndLogin(api, {
      role: 'LECTURER',
      email: `${emailPrefix}-owner@example.test`,
      profile: { staffNumber: `IT-L1-${RUN_ID}` },
    })
    otherLecturer = await registerAndLogin(api, {
      role: 'LECTURER',
      email: `${emailPrefix}-lecturer@example.test`,
      profile: { staffNumber: `IT-L2-${RUN_ID}` },
    })
    student = await registerAndLogin(api, {
      role: 'STUDENT',
      email: `${emailPrefix}-student@example.test`,
      profile: { studentNumber: `IT-S-${RUN_ID}` },
    })

    const created = await api('POST', '/courses', {
      token: owner.token,
      body: { code: `IT-${RUN_ID}`, title: `Integration test graph course ${RUN_ID}` },
    })
    assertStatus('creating the course', created, 201)
    course = created.body.data.course
    assert.equal(typeof course?.id, 'string', 'the course response has no id')
    assert.equal(course.lecturer.id, owner.user.lecturer.id, 'the course should belong to the owner lecturer')
  })

  after(async () => {
    const failures = await teardown(server)
    if (failures.length > 0) {
      assert.fail(`Teardown failed: ${failures.join('; ')}`)
    }
  })

  it('answers the owner with 503 and a fixed message, without revealing why', async () => {
    const response = await syncHierarchy(course.id, owner.token)
    assertError('syncing as the owner', response, 503, GRAPH_UNAVAILABLE)
    const text = JSON.stringify(response.body)
    for (const detail of INTERNAL_DETAILS) {
      assert.ok(!text.includes(detail), `the response reveals an internal detail (${detail})`)
    }
  })

  it('refuses a student before looking at the course', async () => {
    const response = await syncHierarchy(course.id, student.token)
    assertError('syncing as a student', response, 403, 'You do not have permission to perform this action')
  })

  it('refuses a lecturer who does not own the course', async () => {
    const response = await syncHierarchy(course.id, otherLecturer.token)
    assertError('syncing as another lecturer', response, 403, 'Only the lecturer who owns this course can modify it')
  })

  it('answers 404 for a course that does not exist', async () => {
    const response = await syncHierarchy(randomUUID(), owner.token)
    assertError('syncing an unknown course', response, 404, 'Course not found')
  })

  it('requires authentication', async () => {
    const response = await syncHierarchy(course.id)
    assertError('syncing without a token', response, 401, 'Authentication required')
  })
})
