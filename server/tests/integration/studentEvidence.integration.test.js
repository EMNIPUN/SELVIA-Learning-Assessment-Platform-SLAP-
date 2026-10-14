// npm run test:integration:safe -- tests/integration/studentEvidence.integration.test.js. Reads a student's current
// evidence with getCurrentEvidence (studentEvidence.service.js) after creating that evidence through the real HTTP
// API: a correct and a wrong exercise answer in one course, a correct one in another, and a quiz submitted with both
// of its questions unanswered. A second student answers one of the same exercises. Each run registers its own users
// and creates its own content, with identifiers unique to the run; nothing is removed afterwards (README.md,
// "Test data").
//
// Not covered here, because no supported workflow can produce it:
// - Superseded evidence. No application code sets superseded_by_evidence_id, so every row this test creates is
//   current. Writing a superseding row directly would bypass the application, so the exclusion of superseded rows is
//   only covered by the query's unit tests (tests/studentEvidence.test.js).
// - Unlisted metadata keys. The evidence writers record only listed keys, so dropping unlisted ones is likewise only
//   covered by the unit tests.
import { checkedTestDatabase } from '../support/integrationPreload.js'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { after, before, describe, it } from 'node:test'
import app from '../../src/app.js'
import prisma from '../../src/database/postgres/prisma.js'
import { EVIDENCE_METADATA_KEYS } from '../../src/repositories/studentEvidence.query.js'
import { getCurrentEvidence } from '../../src/services/studentEvidence.service.js'

// Importing the application loaded src/config/env.js, which fills in missing variables from server/.env.
checkedTestDatabase.assertUnchanged()

const RUN_ID = randomBytes(5).toString('hex').toUpperCase()
const CORRECT_OPTION_ID = 'a'
const WRONG_OPTION_ID = 'b'
const EXERCISE_MAX_SCORE = 2
const QUESTION_POINTS = 3
const ANSWER_CONFIG = {
  options: [
    { id: CORRECT_OPTION_ID, text: 'The first option' },
    { id: WRONG_OPTION_ID, text: 'The second option' },
  ],
  correct_option_ids: [CORRECT_OPTION_ID],
}

const VIEW_FIELDS = [
  'attemptNumber',
  'conceptId',
  'courseId',
  'errorsCount',
  'hintsUsed',
  'id',
  'maxScore',
  'metadata',
  'observedAt',
  'percentage',
  'score',
  'sourceId',
  'sourceType',
  'status',
  'timeSpentSeconds',
]

// Names of answer keys and responses that evidence must never carry. Only the names appear in assertion messages.
const PRIVATE_KEYS = ['answerConfig', 'answer_config', 'correct_option_ids', 'accepted_answers', 'selected_option_id', 'answer_text', 'response']

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
  assertStatus(`registering a ${role.toLowerCase()}`, registered, 201)
  assert.equal(registered.body.data.user.role, role)

  const loggedIn = await api('POST', '/auth/login', { body: { email, password } })
  assertStatus(`logging in a ${role.toLowerCase()}`, loggedIn, 200)
  assert.equal(typeof loggedIn.body.data.token, 'string', 'the login response has no token')
  return { user: registered.body.data.user, token: loggedIn.body.data.token }
}

async function registerStudent(api, label) {
  const student = await registerAndLogin(api, {
    role: 'STUDENT',
    email: `it-${RUN_ID.toLowerCase()}-student-${label}@example.test`,
    profile: { studentNumber: `IT-S${label}-${RUN_ID}` },
  })
  assert.equal(typeof student.user.student?.id, 'string', 'the registration response has no student profile')
  return { token: student.token, studentId: student.user.student.id }
}

// A student sees an exercise only when it and every one of its ancestors are PUBLISHED (courseAccess.service.js).
async function createPublished(api, token, kind, path, fields) {
  const created = await api('POST', path, { token, body: { ...fields, status: 'PUBLISHED' } })
  assertStatus(`creating the ${kind}`, created, 201)
  const entity = created.body.data[kind]
  assert.equal(entity.status, 'PUBLISHED', `the ${kind} was not published`)
  return entity
}

// A published course with one module and topic, and one concept per entry of `conceptLabels`, each with a lesson
// holding one multiple-choice exercise.
async function createCourse(create, label, conceptLabels) {
  const course = await create('course', '/courses', { code: `IT-${RUN_ID}-${label}`, title: `Integration test course ${RUN_ID} ${label}` })
  const courseModule = await create('module', `/courses/${course.id}/modules`, { title: 'Integration test module' })
  const topic = await create('topic', `/modules/${courseModule.id}/topics`, { title: 'Integration test topic' })
  const concepts = {}
  for (const conceptLabel of conceptLabels) {
    const concept = await create('concept', `/topics/${topic.id}/concepts`, {
      code: `IT-${RUN_ID}-${conceptLabel}`,
      name: `Integration test concept ${conceptLabel}`,
    })
    const lesson = await create('lesson', `/concepts/${concept.id}/lessons`, {
      title: 'Integration test lesson',
      body: 'A lesson created by the student evidence integration test.',
    })
    const exercise = await create('exercise', `/lessons/${lesson.id}/exercises`, {
      title: 'Integration test exercise',
      instructions: 'Choose the first option.',
      exerciseType: 'MULTIPLE_CHOICE',
      difficulty: 'EASY',
      bloomLevel: 'REMEMBER',
      answerConfig: ANSWER_CONFIG,
      maxScore: EXERCISE_MAX_SCORE,
    })
    concepts[conceptLabel] = { concept, lesson, exercise }
  }
  return { course, concepts }
}

async function submitExercise(api, token, exercise, selectedOptionId) {
  const submitted = await api('POST', `/exercises/${exercise.id}/attempts`, { token, body: { selectedOptionId } })
  assertStatus('submitting an exercise answer', submitted, 201)
  return submitted.body.data.attempt
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

const byObservedAtThenId = (a, b) =>
  a.observedAt.getTime() - b.observedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// The ids of `rows` in the order getCurrentEvidence must return them. Lower-case UUID text sorts as PostgreSQL sorts
// the uuid values.
const expectedIds = (...rows) => rows.toSorted(byObservedAtThenId).map((row) => row.id)
const idsOf = (views) => views.map((view) => view.id)

describe('getCurrentEvidence on evidence recorded through the API', { timeout: 180_000 }, () => {
  let server
  // Set up in before(): the courses and concepts, and the stored evidence rows by what produced them.
  const fixture = {}

  before(async () => {
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`
    const api = (method, path, options) => request(baseUrl, method, path, options)

    const lecturer = await registerAndLogin(api, {
      role: 'LECTURER',
      email: `it-${RUN_ID.toLowerCase()}-lecturer@example.test`,
      profile: { staffNumber: `IT-L-${RUN_ID}` },
    })
    const first = await registerStudent(api, '1')
    const second = await registerStudent(api, '2')

    const create = (kind, path, fields) => createPublished(api, lecturer.token, kind, path, fields)
    const courseA = await createCourse(create, 'A', ['A1', 'A2'])
    const courseB = await createCourse(create, 'B', ['B1'])

    // A quiz in course A with one question on each of its concepts.
    const questions = {}
    for (const conceptLabel of ['A1', 'A2']) {
      questions[conceptLabel] = await create('question', `/concepts/${courseA.concepts[conceptLabel].concept.id}/questions`, {
        questionText: `Integration test question ${conceptLabel}`,
        questionType: 'MULTIPLE_CHOICE_SINGLE',
        difficulty: 'EASY',
        bloomLevel: 'REMEMBER',
        answerConfig: ANSWER_CONFIG,
      })
    }
    const createdQuiz = await api('POST', `/courses/${courseA.course.id}/assessments`, {
      token: lecturer.token,
      body: { title: 'Integration test quiz' },
    })
    assertStatus('creating the quiz', createdQuiz, 201)
    const quiz = createdQuiz.body.data.assessment
    for (const question of Object.values(questions)) {
      const added = await api('POST', `/assessments/${quiz.id}/questions`, {
        token: lecturer.token,
        body: { questionId: question.id, points: QUESTION_POINTS },
      })
      assertStatus('adding a question to the quiz', added, 201)
    }
    const published = await api('PATCH', `/assessments/${quiz.id}`, { token: lecturer.token, body: { status: 'PUBLISHED' } })
    assertStatus('publishing the quiz', published, 200)
    assert.equal(published.body.data.assessment.status, 'PUBLISHED')

    // The first student's evidence, in the order it is observed.
    const correctA1 = await submitExercise(api, first.token, courseA.concepts.A1.exercise, CORRECT_OPTION_ID)
    const wrongA2 = await submitExercise(api, first.token, courseA.concepts.A2.exercise, WRONG_OPTION_ID)
    const correctB1 = await submitExercise(api, first.token, courseB.concepts.B1.exercise, CORRECT_OPTION_ID)
    assert.equal(wrongA2.score, 0, 'the wrong answer should score zero')

    const started = await api('POST', `/quizzes/${quiz.id}/attempts`, { token: first.token })
    assertStatus('starting the quiz', started, 201)
    const quizAttemptId = started.body.data.attempt.id
    const submittedQuiz = await api('POST', `/assessment-attempts/${quizAttemptId}/submit`, { token: first.token })
    assertStatus('submitting the quiz', submittedQuiz, 200)
    assert.equal(submittedQuiz.body.data.attempt.status, 'SUBMITTED')

    // The second student answers one of the same exercises.
    const otherCorrectA1 = await submitExercise(api, second.token, courseA.concepts.A1.exercise, CORRECT_OPTION_ID)

    // Every query is limited to this run's students. Each is new, so every row found for them comes from above.
    const firstRows = await prisma.studentEvidence.findMany({ where: { studentId: first.studentId } })
    const secondRows = await prisma.studentEvidence.findMany({ where: { studentId: second.studentId } })
    assert.equal(firstRows.length, 5, "the first student's evidence should be three exercise answers and two quiz answers")
    assert.equal(secondRows.length, 1, "the second student's evidence should be one exercise answer")

    const answers = await prisma.studentAnswer.findMany({
      where: { attemptId: quizAttemptId },
      select: { id: true, assessmentQuestionId: true, assessmentQuestion: { select: { questionId: true } } },
    })
    const answerFor = (conceptLabel) => answers.find((answer) => answer.assessmentQuestion.questionId === questions[conceptLabel].id)
    const rowFrom = (rows, sourceId) => {
      const matching = rows.filter((row) => row.sourceId === sourceId)
      assert.equal(matching.length, 1, 'expected exactly one evidence row per source')
      return matching[0]
    }

    Object.assign(fixture, {
      firstStudentId: first.studentId,
      secondStudentId: second.studentId,
      courseA,
      courseB,
      quiz,
      quizAttemptId,
      questions,
      answers: { A1: answerFor('A1'), A2: answerFor('A2') },
      firstRows,
      rows: {
        correctA1: rowFrom(firstRows, correctA1.id),
        wrongA2: rowFrom(firstRows, wrongA2.id),
        correctB1: rowFrom(firstRows, correctB1.id),
        skippedA1: rowFrom(firstRows, answerFor('A1').id),
        skippedA2: rowFrom(firstRows, answerFor('A2').id),
        otherCorrectA1: rowFrom(secondRows, otherCorrectA1.id),
      },
    })
  })

  after(async () => {
    const failures = await teardown(server)
    if (failures.length > 0) {
      assert.fail(`Teardown failed: ${failures.join('; ')}`)
    }
  })

  it('returns only current evidence, oldest first, with the id breaking ties', async () => {
    const { rows, firstRows } = fixture
    for (const row of firstRows) {
      assert.equal(row.supersededByEvidenceId, null, 'the fixture evidence should all be current')
    }
    // Both unanswered quiz questions are observed at the submission, so the order between them rests on the id.
    assert.equal(rows.skippedA1.observedAt.getTime(), rows.skippedA2.observedAt.getTime())

    const views = await getCurrentEvidence({ studentId: fixture.firstStudentId })
    assert.deepEqual(idsOf(views), expectedIds(...firstRows))
    for (const view of views) {
      assert.deepEqual(Object.keys(view).sort(), VIEW_FIELDS)
    }
  })

  it('filters by course and by concept, separately and together', async () => {
    const { courseA, courseB, rows } = fixture
    const studentId = fixture.firstStudentId
    const A = courseA.course.id
    const B = courseB.course.id
    const A1 = courseA.concepts.A1.concept.id
    const A2 = courseA.concepts.A2.concept.id
    const B1 = courseB.concepts.B1.concept.id

    const cases = [
      ['course A', { courseId: A }, [rows.correctA1, rows.wrongA2, rows.skippedA1, rows.skippedA2]],
      ['course B', { courseId: B }, [rows.correctB1]],
      ['concept A1', { conceptId: A1 }, [rows.correctA1, rows.skippedA1]],
      ['concept A2', { conceptId: A2 }, [rows.wrongA2, rows.skippedA2]],
      ['concept B1', { conceptId: B1 }, [rows.correctB1]],
      ['course A and concept A1', { courseId: A, conceptId: A1 }, [rows.correctA1, rows.skippedA1]],
      ['course B and concept B1', { courseId: B, conceptId: B1 }, [rows.correctB1]],
      ['course A and concept B1', { courseId: A, conceptId: B1 }, []],
      ['course B and concept A2', { courseId: B, conceptId: A2 }, []],
    ]
    for (const [label, filters, expected] of cases) {
      const views = await getCurrentEvidence({ studentId, ...filters })
      assert.deepEqual(idsOf(views), expectedIds(...expected), label)
      for (const view of views) {
        if (filters.courseId) assert.equal(view.courseId, filters.courseId, label)
        if (filters.conceptId) assert.equal(view.conceptId, filters.conceptId, label)
      }
    }
  })

  it('keeps a missing score null and a zero score zero', async () => {
    const { rows } = fixture
    const views = new Map((await getCurrentEvidence({ studentId: fixture.firstStudentId })).map((view) => [view.id, view]))

    const correct = views.get(rows.correctA1.id)
    assert.equal(correct.status, 'COMPLETED')
    assert.equal(correct.score, EXERCISE_MAX_SCORE)
    assert.equal(correct.maxScore, EXERCISE_MAX_SCORE)
    assert.equal(correct.percentage, 100)

    const wrong = views.get(rows.wrongA2.id)
    assert.equal(wrong.status, 'COMPLETED')
    assert.equal(wrong.score, 0)
    assert.equal(wrong.maxScore, EXERCISE_MAX_SCORE)
    assert.equal(wrong.percentage, 0)

    for (const row of [rows.skippedA1, rows.skippedA2]) {
      const skipped = views.get(row.id)
      assert.equal(skipped.status, 'SKIPPED')
      assert.equal(skipped.score, null)
      assert.equal(skipped.percentage, null)
      assert.equal(skipped.maxScore, QUESTION_POINTS)
      assert.equal(skipped.attemptNumber, 1)
    }

    // The writers measure none of these, so they stay null rather than becoming 0.
    for (const view of views.values()) {
      assert.equal(view.timeSpentSeconds, null)
      assert.equal(view.hintsUsed, null)
      assert.equal(view.errorsCount, null)
    }
  })

  it('returns only the listed metadata keys, and no answer key or response', async () => {
    const { courseA, quiz, quizAttemptId, questions, answers, rows } = fixture
    const views = await getCurrentEvidence({ studentId: fixture.firstStudentId })
    const byId = new Map(views.map((view) => [view.id, view]))

    for (const view of views) {
      for (const key of Object.keys(view.metadata)) {
        assert.ok(EVIDENCE_METADATA_KEYS.includes(key), `unlisted metadata key ${key}`)
      }
    }
    const text = JSON.stringify(views)
    for (const key of PRIVATE_KEYS) {
      assert.ok(!text.includes(key), `the evidence exposes ${key}`)
    }

    const { exercise, lesson } = courseA.concepts.A2
    assert.deepEqual(byId.get(rows.wrongA2.id).metadata, {
      exercise_id: exercise.id,
      lesson_id: lesson.id,
      exercise_type: 'MULTIPLE_CHOICE',
      difficulty: 'EASY',
      bloom_level: 'REMEMBER',
      is_correct: false,
    })
    // An unanswered question was not judged, so it has no is_correct.
    assert.deepEqual(byId.get(rows.skippedA1.id).metadata, {
      question_id: questions.A1.id,
      question_version: 1,
      question_type: 'MULTIPLE_CHOICE_SINGLE',
      difficulty: 'EASY',
      bloom_level: 'REMEMBER',
      assessment_id: quiz.id,
      assessment_type: 'QUIZ',
      assessment_question_id: answers.A1.assessmentQuestionId,
      attempt_id: quizAttemptId,
    })
  })

  it("never returns another student's evidence", async () => {
    const { courseA, rows } = fixture
    const filters = [{}, { courseId: courseA.course.id }, { conceptId: courseA.concepts.A1.concept.id }]
    for (const filter of filters) {
      const views = await getCurrentEvidence({ studentId: fixture.firstStudentId, ...filter })
      assert.ok(!idsOf(views).includes(rows.otherCorrectA1.id), "the first student's evidence includes the second student's")
    }

    const secondViews = await getCurrentEvidence({ studentId: fixture.secondStudentId })
    assert.deepEqual(idsOf(secondViews), [rows.otherCorrectA1.id])

    assert.deepEqual(await getCurrentEvidence({ studentId: randomUUID() }), [])
  })
})
