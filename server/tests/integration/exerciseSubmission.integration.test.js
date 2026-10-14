// npm run test:integration:safe. A student answers a published multiple-choice exercise through the real HTTP API,
// and what the submission stored is read back from the test database. Each run registers its own lecturer and
// student and creates its own course content, with identifiers unique to the run. Nothing is removed afterwards:
// see "Test data" in README.md.
import { checkedTestDatabase } from '../support/integrationPreload.js'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { describe, it } from 'node:test'
import app from '../../src/app.js'
import prisma from '../../src/database/postgres/prisma.js'

// Importing the application loaded src/config/env.js, which fills in missing variables from server/.env.
checkedTestDatabase.assertUnchanged()

const RUN_ID = randomBytes(5).toString('hex').toUpperCase()
const CORRECT_OPTION_ID = 'a'
const MAX_SCORE = 2

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

async function registerAndLogin(api, { role, email, profile }) {
  const password = newPassword()
  const registered = await api('POST', '/auth/register', {
    body: { email, password, firstName: 'Integration', lastName: `Test ${role.toLowerCase()}`, role, ...profile },
  })
  assertStatus(`registering the ${role.toLowerCase()}`, registered, 201)
  assert.equal(registered.body.data.user.role, role)

  const loggedIn = await api('POST', '/auth/login', { body: { email, password } })
  assertStatus(`logging in the ${role.toLowerCase()}`, loggedIn, 200)
  assert.equal(loggedIn.body.data.tokenType, 'Bearer')
  assert.equal(typeof loggedIn.body.data.token, 'string', 'the login response has no token')
  return { user: registered.body.data.user, token: loggedIn.body.data.token }
}

// A student sees an exercise only when it and every one of its ancestors are PUBLISHED (courseAccess.service.js).
async function createPublished(api, token, kind, path, fields) {
  const created = await api('POST', path, { token, body: { ...fields, status: 'PUBLISHED' } })
  assertStatus(`creating the ${kind}`, created, 201)
  const entity = created.body.data[kind]
  assert.equal(entity.status, 'PUBLISHED', `the ${kind} was not published`)
  return entity
}

// Returns what failed, so that a teardown failure never hides the test's own failure.
async function teardown(server) {
  const failures = []
  if (server.listening) {
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

describe('exercise submission', () => {
  it('records one activity and one linked evidence row for a correct multiple-choice answer', { timeout: 60_000 }, async (t) => {
    const server = app.listen(0, '127.0.0.1')
    let completed = false
    try {
      await once(server, 'listening')
      const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
      const api = (method, path, options) => request(baseUrl, method, path, options)
      const emailPrefix = `it-${RUN_ID.toLowerCase()}`

      const lecturer = await registerAndLogin(api, {
        role: 'LECTURER',
        email: `${emailPrefix}-lecturer@example.test`,
        profile: { staffNumber: `IT-L-${RUN_ID}` },
      })
      const student = await registerAndLogin(api, {
        role: 'STUDENT',
        email: `${emailPrefix}-student@example.test`,
        profile: { studentNumber: `IT-S-${RUN_ID}` },
      })
      const studentId = student.user.student.id
      assert.equal(typeof studentId, 'string', 'the registration response has no student profile')

      const create = (kind, path, fields) => createPublished(api, lecturer.token, kind, path, fields)
      const course = await create('course', '/courses', { code: `IT-${RUN_ID}`, title: `Integration test course ${RUN_ID}` })
      const courseModule = await create('module', `/courses/${course.id}/modules`, { title: 'Integration test module' })
      const topic = await create('topic', `/modules/${courseModule.id}/topics`, { title: 'Integration test topic' })
      const concept = await create('concept', `/topics/${topic.id}/concepts`, {
        code: `IT-CONCEPT-${RUN_ID}`,
        name: 'Integration test concept',
      })
      const lesson = await create('lesson', `/concepts/${concept.id}/lessons`, {
        title: 'Integration test lesson',
        body: 'A lesson created by the exercise submission integration test.',
      })
      const exercise = await create('exercise', `/lessons/${lesson.id}/exercises`, {
        title: 'Integration test exercise',
        instructions: 'Choose the first option.',
        exerciseType: 'MULTIPLE_CHOICE',
        difficulty: 'EASY',
        bloomLevel: 'REMEMBER',
        answerConfig: {
          options: [
            { id: CORRECT_OPTION_ID, text: 'The first option' },
            { id: 'b', text: 'The second option' },
          ],
          correct_option_ids: [CORRECT_OPTION_ID],
        },
        maxScore: MAX_SCORE,
      })

      const submitted = await api('POST', `/exercises/${exercise.id}/attempts`, {
        token: student.token,
        body: { selectedOptionId: CORRECT_OPTION_ID },
      })
      assertStatus('submitting the answer', submitted, 201)
      assert.equal(submitted.body.success, true)
      assert.equal(submitted.body.message, 'Answer evaluated')
      const { attempt } = submitted.body.data
      assert.deepEqual(Object.keys(attempt).sort(), [
        'attemptNumber',
        'exerciseId',
        'feedback',
        'id',
        'isCorrect',
        'maxScore',
        'response',
        'score',
        'submittedAt',
      ])
      assert.equal(attempt.exerciseId, exercise.id)
      assert.equal(attempt.attemptNumber, 1)
      assert.equal(attempt.isCorrect, true)
      assert.equal(attempt.score, MAX_SCORE)
      assert.equal(attempt.maxScore, MAX_SCORE)
      assert.deepEqual(attempt.response, { selectedOptionId: CORRECT_OPTION_ID })
      assert.equal(attempt.feedback, null)
      const responseText = JSON.stringify(submitted.body)
      for (const answerKey of ['answerConfig', 'correct_option_ids', 'correctOptionIds']) {
        assert.ok(!responseText.includes(answerKey), `the submission response exposes ${answerKey}`)
      }

      // The student is new to this run, so every row found for them comes from this submission.
      const activities = await prisma.learningActivity.findMany({ where: { studentId } })
      assert.equal(activities.length, 1, "the submission should be the test student's only learning activity")
      const [activity] = activities
      assert.equal(activity.id, attempt.id)
      assert.equal(activity.activityType, 'EXERCISE_SUBMITTED')
      assert.equal(activity.targetType, 'EXERCISE')
      assert.equal(activity.targetId, exercise.id)
      assert.equal(activity.courseId, course.id)
      assert.equal(activity.conceptId, concept.id)
      assert.equal(activity.occurredAt.toISOString(), attempt.submittedAt)
      assert.deepEqual(activity.metadata, {
        attempt_number: 1,
        selected_option_id: CORRECT_OPTION_ID,
        is_correct: true,
        score: MAX_SCORE,
        max_score: MAX_SCORE,
      })

      const evidenceRows = await prisma.studentEvidence.findMany({ where: { studentId } })
      assert.equal(evidenceRows.length, 1, "the submission should be the test student's only evidence")
      const [evidence] = evidenceRows
      assert.equal(evidence.sourceType, 'EXERCISE_SUBMISSION')
      assert.equal(evidence.sourceId, activity.id)
      assert.equal(evidence.courseId, course.id)
      assert.equal(evidence.conceptId, concept.id)
      assert.equal(Number(evidence.score), MAX_SCORE)
      assert.equal(Number(evidence.maxScore), MAX_SCORE)
      assert.equal(Number(evidence.percentage), 100)
      assert.equal(evidence.attemptNumber, 1)
      assert.equal(evidence.status, 'COMPLETED')
      assert.equal(evidence.supersededByEvidenceId, null)
      assert.equal(evidence.observedAt.getTime(), activity.occurredAt.getTime())
      assert.deepEqual(evidence.metadata, {
        exercise_id: exercise.id,
        lesson_id: lesson.id,
        exercise_type: 'MULTIPLE_CHOICE',
        difficulty: 'EASY',
        bloom_level: 'REMEMBER',
        is_correct: true,
      })
      completed = true
    } finally {
      const failures = await teardown(server)
      for (const failure of failures) t.diagnostic(`Teardown failed: ${failure}`)
      if (completed && failures.length > 0) {
        assert.fail(`Teardown failed: ${failures.join('; ')}`)
      }
    }
  })
})
