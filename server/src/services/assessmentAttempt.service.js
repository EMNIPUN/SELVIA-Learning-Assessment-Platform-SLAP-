import { createHash, randomUUID } from 'node:crypto'
import {
  ActivityTargetType,
  ActivityType,
  AttemptStatus,
  EvidenceSourceType,
  EvidenceStatus,
  Prisma,
  QuestionType,
  ResultsReleasePolicy,
  ResultStatus,
} from '@prisma/client'
import { QUIZ_AVAILABILITY, QUIZ_TYPE } from '../constants/assessment.js'
import { CONTENT_STATUS } from '../constants/contentStatus.js'
import * as attemptRepository from '../repositories/assessmentAttempt.repository.js'
import { findStudentByUserId } from '../repositories/student.repository.js'
import { parseAnswerConfig } from '../schemas/question.schemas.js'
import { ApiError } from '../utils/ApiError.js'
import { isUniqueViolation } from '../utils/prismaErrors.js'
import { ineligibilityReasons } from './assessment.service.js'
import { gradeResponse, toStoredResponse } from './assessmentGrading.service.js'

// Students taking quizzes. The student always comes from the authenticated user, never from the request, and
// nothing a student receives before their result is released reveals answers, explanations or scores.

const COURSE_NOT_FOUND = 'Course not found'
const QUIZ_NOT_FOUND = 'Quiz not found'
const ATTEMPT_NOT_FOUND = 'Attempt not found'
const QUESTION_NOT_IN_ATTEMPT = 'Question not found in this attempt'

const VISIBLE_QUIZZES = { assessmentType: QUIZ_TYPE, status: CONTENT_STATUS.PUBLISHED }

// Only these mean that another request started the attempt first; any other conflict is a fault, not a race.
const CONCURRENT_START_INDEXES = [
  'assessment_attempts_one_in_progress_key',
  'assessment_attempts_assessment_id_student_id_attempt_number_key',
]

const ZERO = new Prisma.Decimal(0)

// Decimal columns would serialise as strings.
const toNumber = (value) => (value === null || value === undefined ? null : Number(value))

const isPublished = (item) => item.status === CONTENT_STATUS.PUBLISHED

async function getStudentProfile(user) {
  const student = await findStudentByUserId(user.id)
  if (!student) {
    throw ApiError.forbidden('A student profile is required to take quizzes')
  }
  return student
}

// Students see published quizzes of published courses. Drafts, archived quizzes, tests and examinations are
// reported as not found, exactly as hidden content is.
function isVisibleQuiz(quiz) {
  return Boolean(quiz) && quiz.assessmentType === QUIZ_TYPE && isPublished(quiz) && isPublished(quiz.course)
}

async function getVisibleQuiz(assessmentId) {
  const quiz = await attemptRepository.findQuiz(assessmentId)
  if (!isVisibleQuiz(quiz)) {
    throw ApiError.notFound(QUIZ_NOT_FOUND)
  }
  return quiz
}

function availabilityOf(quiz, now) {
  if (quiz.availableFrom && now < quiz.availableFrom) {
    return QUIZ_AVAILABILITY.UPCOMING
  }
  if (quiz.availableUntil && now >= quiz.availableUntil) {
    return QUIZ_AVAILABILITY.CLOSED
  }
  return QUIZ_AVAILABILITY.OPEN
}

const isExpired = (attempt, now) => attempt.expiresAt !== null && attempt.expiresAt <= now

const elapsedSeconds = (from, to) => Math.max(0, Math.round((to - from) / 1000))

// The time limit runs from the start, and no attempt outlasts the quiz's window. Null when neither applies.
function deadlineOf(quiz, startedAt) {
  const deadlines = [
    quiz.timeLimitMinutes === null ? null : startedAt.getTime() + quiz.timeLimitMinutes * 60_000,
    quiz.availableUntil?.getTime() ?? null,
  ].filter((deadline) => deadline !== null)
  return deadlines.length === 0 ? null : new Date(Math.min(...deadlines))
}

// A pseudo-random order that depends only on the seed and the items' keys.
function seededOrder(seed, items, keyOf) {
  return items
    .map((item) => ({ item, rank: createHash('sha256').update(`${seed}:${keyOf(item)}`).digest('hex') }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map(({ item }) => item)
}

// The attempt's answers, in the order the attempt will show its questions. That order is fixed when the attempt
// starts and must not follow later changes to the quiz's shuffle setting, but there is no column to keep it in.
// So the answer ids are generated in ascending order along it, and answers are always read back sorted by id.
function answersInDisplayOrder(attemptId, quiz, entries) {
  const ordered = quiz.shuffleQuestions ? seededOrder(attemptId, entries, (entry) => entry.id) : entries
  const ids = ordered.map(() => randomUUID()).sort()
  return ordered.map((entry, index) => ({ id: ids[index], assessmentQuestionId: entry.id, maxScore: entry.points }))
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

// A score is shown only once its attempt is closed and the result released.
function releasedResult(attempt) {
  const { result } = attempt
  if (attempt.status === AttemptStatus.IN_PROGRESS || !result?.releasedAt) {
    return null
  }
  return {
    totalScore: Number(result.totalScore),
    maxScore: Number(result.maxScore),
    percentage: toNumber(result.percentage),
    passed: result.passed,
    releasedAt: result.releasedAt,
  }
}

function toAttemptSummary(attempt) {
  const { id, attemptNumber, status, startedAt, expiresAt, submittedAt, timeSpentSeconds } = attempt
  return { id, attemptNumber, status, startedAt, expiresAt, submittedAt, timeSpentSeconds, result: releasedResult(attempt) }
}

// `attempts` are the student's own attempts at this quiz, newest first.
function toStudentQuiz(quiz, totalPoints, attempts, now) {
  const { id, courseId, moduleId, topicId, title, description, instructions, timeLimitMinutes, maxAttempts } = quiz
  const availability = availabilityOf(quiz, now)
  const inProgress = attempts.find((attempt) => attempt.status === AttemptStatus.IN_PROGRESS)
  const remaining = maxAttempts === null ? null : Math.max(0, maxAttempts - attempts.length)
  const latest = attempts.find((attempt) => releasedResult(attempt))

  return {
    id,
    courseId,
    moduleId,
    topicId,
    title,
    description,
    instructions,
    timeLimitMinutes,
    maxAttempts,
    passPercentage: toNumber(quiz.passPercentage),
    availableFrom: quiz.availableFrom,
    availableUntil: quiz.availableUntil,
    availability,
    questionCount: quiz._count.questions,
    totalPoints: Number(totalPoints ?? 0),
    myAttempts: {
      used: attempts.length,
      remaining,
      inProgressAttemptId: inProgress?.id ?? null,
      canStart: availability === QUIZ_AVAILABILITY.OPEN && !inProgress && remaining !== 0,
      latestResult: latest
        ? { attemptId: latest.id, attemptNumber: latest.attemptNumber, submittedAt: latest.submittedAt, ...releasedResult(latest) }
        : null,
    },
  }
}

function toStudentResponse(response) {
  if (response === null) {
    return null
  }
  return response.selected_option_id !== undefined
    ? { selectedOptionId: response.selected_option_id }
    : { answerText: response.answer_text }
}

// A choice question's options as id and text only; which of them is correct stays on the server. Their order
// depends on the attempt, the quiz question and the options with their shuffle_options flag, none of which can
// change once the question is in a quiz.
function studentOptions(seed, questionType, answerConfig) {
  const parsed = parseAnswerConfig(questionType, answerConfig)
  if (!parsed.success) {
    throw ApiError.conflict('This quiz cannot be shown because one of its questions is invalid. Please contact your lecturer.')
  }
  const options = parsed.data.options.map(({ id, text }) => ({ id, text }))
  return parsed.data.shuffle_options ? seededOrder(seed, options, (option) => option.id) : options
}

function toStudentQuestion(attemptId, answer, position) {
  const { assessmentQuestionId, response, maxScore, assessmentQuestion } = answer
  const { questionType, questionText, answerConfig } = assessmentQuestion.question
  return {
    id: assessmentQuestionId,
    position,
    sectionLabel: assessmentQuestion.sectionLabel,
    points: Number(maxScore),
    questionType,
    questionText,
    ...(questionType === QuestionType.MULTIPLE_CHOICE_SINGLE && {
      options: studentOptions(`${attemptId}:${assessmentQuestionId}`, questionType, answerConfig),
    }),
    response: toStudentResponse(response),
  }
}

// `answers` are in the attempt's display order. Questions are listed only while the attempt is in progress; after
// it closes, only the summary and any released result are returned.
function toAttemptView(quiz, attempt, answers, now) {
  const inProgress = attempt.status === AttemptStatus.IN_PROGRESS
  return {
    ...toAttemptSummary(attempt),
    quiz: { id: quiz.id, title: quiz.title, timeLimitMinutes: quiz.timeLimitMinutes },
    timeRemainingSeconds: inProgress && attempt.expiresAt ? elapsedSeconds(now, attempt.expiresAt) : null,
    questionCount: answers.length,
    answeredCount: answers.filter((answer) => answer.response !== null).length,
    totalPoints: answers.reduce((sum, answer) => sum.plus(answer.maxScore), ZERO).toNumber(),
    questions: inProgress ? answers.map((answer, index) => toStudentQuestion(attempt.id, answer, index + 1)) : null,
  }
}

// ---------------------------------------------------------------------------
// Locking and finalisation
// ---------------------------------------------------------------------------

// Takes the student's locks on a quiz in the shared order: advisory lock, the quiz's course and the quiz, then its
// questions. `quiz` is null when the quiz does not exist.
async function lockQuizForStudent(tx, studentId, assessmentId) {
  await attemptRepository.lockStudentQuiz(tx, studentId, assessmentId)
  const quiz = await attemptRepository.lockQuiz(tx, assessmentId)
  const entries = quiz ? await attemptRepository.lockQuizQuestions(tx, assessmentId) : []
  return { quiz, entries }
}

// Compared on the percentage the database stores, which is rounded to two places.
function passedOf(quiz, totalScore, maxScore) {
  if (quiz.passPercentage === null) {
    return null
  }
  const percentage = totalScore.div(maxScore).times(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  return percentage.gte(quiz.passPercentage)
}

// One evidence row per answer, about the question's concept. It records what was observed, not what it says about
// the student. An unanswered question is not a wrong one: its score stays NULL (not 0, even though the result
// counts 0 marks for it), and its status says why it went unanswered: SKIPPED when the student submitted, TIMED_OUT
// when the time ran out. No answer key or response is copied into the metadata.
function answerEvidence(quiz, attempt, { answer, grade }, { status, submittedAt }) {
  const { question } = answer.assessmentQuestion
  const unanswered = status === AttemptStatus.AUTO_SUBMITTED ? EvidenceStatus.TIMED_OUT : EvidenceStatus.SKIPPED
  return {
    studentId: attempt.studentId,
    courseId: quiz.courseId,
    conceptId: question.conceptId,
    sourceType: EvidenceSourceType.ASSESSMENT_ANSWER,
    sourceId: answer.id,
    score: grade.answered ? grade.scoreAwarded : null,
    maxScore: grade.maxScore,
    attemptNumber: attempt.attemptNumber,
    status: grade.answered ? EvidenceStatus.COMPLETED : unanswered,
    observedAt: answer.answeredAt ?? submittedAt,
    metadata: {
      question_id: question.id,
      question_version: question.version,
      question_type: question.questionType,
      difficulty: question.difficulty,
      bloom_level: question.bloomLevel,
      assessment_id: quiz.id,
      assessment_type: quiz.assessmentType,
      assessment_question_id: answer.assessmentQuestionId,
      attempt_id: attempt.id,
      ...(grade.answered && { is_correct: grade.isCorrect }),
    },
  }
}

// The attempt as a whole spans several concepts, so the activity has none.
function submissionActivity(quiz, attempt, graded, { status, submittedAt, timeSpentSeconds }) {
  return {
    studentId: attempt.studentId,
    courseId: quiz.courseId,
    conceptId: null,
    activityType: ActivityType.ASSESSMENT_SUBMITTED,
    targetType: ActivityTargetType.ASSESSMENT,
    targetId: quiz.id,
    startedAt: attempt.startedAt,
    endedAt: submittedAt,
    durationSeconds: timeSpentSeconds,
    occurredAt: submittedAt,
    metadata: {
      attempt_id: attempt.id,
      attempt_number: attempt.attemptNumber,
      auto_submitted: status === AttemptStatus.AUTO_SUBMITTED,
      question_count: graded.length,
      answered_count: graded.filter(({ grade }) => grade.answered).length,
    },
  }
}

// Closes an attempt: grades every answer, closes the attempt, records its result, one evidence row per answer and
// the ASSESSMENT_SUBMITTED activity. It runs in the caller's transaction, which must already hold the student's
// locks on the quiz (lockQuizForStudent) and the attempt row (lockInProgressAttempt). Every write is checked, and
// any failure throws, so all of it commits or none of it does. Closing only succeeds while the attempt is still in
// progress, so the evidence and activity are written once per attempt.
async function finalizeAttempt(tx, quiz, attempt, { status, submittedAt }) {
  const answers = await attemptRepository.findAnswersForFinalisation(tx, attempt.id)
  if (answers.length === 0) {
    throw new Error(`Attempt ${attempt.id} has no answers to grade`)
  }

  const gradedAt = new Date()
  const graded = answers.map((answer) => ({
    answer,
    grade: gradeResponse(answer.assessmentQuestion.question, answer.maxScore, answer.response),
  }))
  const groups = new Map()
  let totalScore = ZERO
  let maxScore = ZERO
  for (const { answer, grade } of graded) {
    const key = `${grade.isCorrect}:${grade.scoreAwarded.toString()}`
    if (!groups.has(key)) {
      groups.set(key, { ids: [], isCorrect: grade.isCorrect, scoreAwarded: grade.scoreAwarded })
    }
    groups.get(key).ids.push(answer.id)
    totalScore = totalScore.plus(grade.scoreAwarded)
    maxScore = maxScore.plus(grade.maxScore)
  }

  // Throwing rolls the transaction back, so a mismatch never leaves a partly closed attempt.
  const gradedCount = await attemptRepository.saveAutomaticGrades(tx, attempt.id, [...groups.values()], gradedAt)
  if (gradedCount !== answers.length) {
    throw new Error(`Graded ${gradedCount} of the ${answers.length} answers of attempt ${attempt.id}`)
  }
  const timeSpentSeconds = elapsedSeconds(attempt.startedAt, submittedAt)
  const closed = await attemptRepository.closeAttempt(tx, attempt.id, { status, submittedAt, timeSpentSeconds })
  if (closed !== 1) {
    throw new Error(`Attempt ${attempt.id} is no longer in progress`)
  }
  await attemptRepository.createResult(tx, {
    attemptId: attempt.id,
    totalScore,
    maxScore,
    passed: passedOf(quiz, totalScore, maxScore),
    status: ResultStatus.FINAL,
    gradedAt,
    releasedAt: quiz.resultsReleasePolicy === ResultsReleasePolicy.IMMEDIATE ? gradedAt : null,
  })

  const recorded = await attemptRepository.createEvidence(
    tx,
    graded.map((entry) => answerEvidence(quiz, attempt, entry, { status, submittedAt })),
  )
  if (recorded !== answers.length) {
    throw new Error(`Recorded evidence for ${recorded} of the ${answers.length} answers of attempt ${attempt.id}`)
  }
  await attemptRepository.createActivity(tx, submissionActivity(quiz, attempt, graded, { status, submittedAt, timeSpentSeconds }))
}

// An expired attempt is closed as AUTO_SUBMITTED, at its deadline, the next time it is touched; there is no
// background job.
function autoSubmit(tx, quiz, attempt) {
  return finalizeAttempt(tx, quiz, attempt, { status: AttemptStatus.AUTO_SUBMITTED, submittedAt: attempt.expiresAt })
}

// Re-checks the attempt under its locks, since another request may have closed it in the meantime.
function finalizeExpiredAttempt(studentId, assessmentId) {
  return attemptRepository.transaction(async (tx) => {
    const { quiz } = await lockQuizForStudent(tx, studentId, assessmentId)
    const attempt = quiz && (await attemptRepository.lockInProgressAttempt(tx, assessmentId, studentId))
    if (attempt && isExpired(attempt, new Date())) {
      await autoSubmit(tx, quiz, attempt)
    }
  })
}

// Why a new attempt cannot start now, as a 409, or null when it can.
function startRefusal(quiz, entries, attemptCount, now) {
  const availability = availabilityOf(quiz, now)
  if (availability === QUIZ_AVAILABILITY.UPCOMING) {
    return ApiError.conflict('This quiz is not open yet', [{ field: 'availableFrom', message: 'The quiz opens later' }])
  }
  if (availability === QUIZ_AVAILABILITY.CLOSED) {
    return ApiError.conflict('This quiz has closed', [{ field: 'availableUntil', message: 'The quiz is no longer open' }])
  }
  if (quiz.maxAttempts !== null && attemptCount >= quiz.maxAttempts) {
    return ApiError.conflict('You have used all the attempts allowed for this quiz', [
      { field: 'maxAttempts', message: `${quiz.maxAttempts} attempt(s) allowed` },
    ])
  }
  if (entries.length === 0 || entries.some((entry) => ineligibilityReasons(entry.question, quiz.courseId).length > 0)) {
    return ApiError.conflict('This quiz cannot be attempted right now. Please contact your lecturer.', [
      { field: 'questions', message: 'The quiz has no questions that can be graded' },
    ])
  }
  return null
}

// One transaction: resume the student's attempt, or close an expired one and start the next. A refusal is
// returned rather than thrown so that closing the expired attempt is still committed.
function startOrResume(studentId, assessmentId) {
  return attemptRepository.transaction(async (tx) => {
    const { quiz, entries } = await lockQuizForStudent(tx, studentId, assessmentId)
    if (!isVisibleQuiz(quiz)) {
      throw ApiError.notFound(QUIZ_NOT_FOUND)
    }
    const now = new Date()

    const current = await attemptRepository.lockInProgressAttempt(tx, assessmentId, studentId)
    if (current && !isExpired(current, now)) {
      const answers = await attemptRepository.findAttemptQuestions(current.id, tx)
      return { resumed: true, attempt: toAttemptView(quiz, current, answers, now) }
    }
    if (current) {
      await autoSubmit(tx, quiz, current)
    }

    const { count, lastAttemptNumber } = await attemptRepository.countAttempts(tx, assessmentId, studentId)
    const refusal = startRefusal(quiz, entries, count, now)
    if (refusal) {
      return { refusal }
    }

    const attemptId = randomUUID()
    const attempt = await attemptRepository.createAttempt(
      tx,
      { id: attemptId, assessmentId, studentId, attemptNumber: lastAttemptNumber + 1, startedAt: now, expiresAt: deadlineOf(quiz, now) },
      answersInDisplayOrder(attemptId, quiz, entries),
    )
    const answers = await attemptRepository.findAttemptQuestions(attempt.id, tx)
    return { resumed: false, attempt: toAttemptView(quiz, attempt, answers, now) }
  })
}

// ---------------------------------------------------------------------------
// Student operations
// ---------------------------------------------------------------------------

// Enrolment is not required yet: every student can take the published quizzes of a published course.
export async function listCourseQuizzes(user, courseId) {
  const student = await getStudentProfile(user)
  const course = await attemptRepository.findCourse(courseId)
  if (!course || !isPublished(course)) {
    throw ApiError.notFound(COURSE_NOT_FOUND)
  }

  const expired = await attemptRepository.findQuizzesWithExpiredAttempts(student.id, new Date(), { courseId, ...VISIBLE_QUIZZES })
  for (const assessmentId of expired) {
    await finalizeExpiredAttempt(student.id, assessmentId)
  }

  const quizzes = await attemptRepository.findQuizzesInCourse(courseId, VISIBLE_QUIZZES)
  const ids = quizzes.map((quiz) => quiz.id)
  const [points, attempts] = await Promise.all([
    attemptRepository.sumQuizPoints(ids),
    attemptRepository.findStudentAttempts(student.id, ids),
  ])
  const now = new Date()
  return {
    quizzes: quizzes.map((quiz) =>
      toStudentQuiz(quiz, points.get(quiz.id), attempts.filter((attempt) => attempt.assessmentId === quiz.id), now),
    ),
  }
}

// The quiz's settings and the student's own attempts. Its questions are only shown inside an attempt.
export async function getQuiz(user, assessmentId) {
  const student = await getStudentProfile(user)
  const quiz = await getVisibleQuiz(assessmentId)

  let attempts = await attemptRepository.findStudentAttempts(student.id, [assessmentId])
  if (attempts.some((attempt) => attempt.status === AttemptStatus.IN_PROGRESS && isExpired(attempt, new Date()))) {
    await finalizeExpiredAttempt(student.id, assessmentId)
    attempts = await attemptRepository.findStudentAttempts(student.id, [assessmentId])
  }

  const points = await attemptRepository.sumQuizPoints([assessmentId])
  return { ...toStudentQuiz(quiz, points.get(assessmentId), attempts, new Date()), attempts: attempts.map(toAttemptSummary) }
}

// Resumes the student's unexpired attempt or starts a new one. `resumed` tells the two apart.
export async function startAttempt(user, assessmentId) {
  const student = await getStudentProfile(user)
  let outcome
  try {
    outcome = await startOrResume(student.id, assessmentId)
  } catch (err) {
    if (!isUniqueViolation(err, CONCURRENT_START_INDEXES)) {
      throw err
    }
    // A concurrent request created the attempt first; trying again resumes it.
    try {
      outcome = await startOrResume(student.id, assessmentId)
    } catch (retryErr) {
      throw isUniqueViolation(retryErr, CONCURRENT_START_INDEXES)
        ? ApiError.conflict('This attempt is already being started. Please try again.')
        : retryErr
    }
  }
  if (outcome.refusal) {
    throw outcome.refusal
  }
  return outcome
}

// Another student's attempt, or one at a quiz the student can no longer see, is not found.
async function getOwnAttempt(student, attemptId) {
  const attempt = await attemptRepository.findAttemptById(attemptId)
  if (!attempt || attempt.studentId !== student.id) {
    throw ApiError.notFound(ATTEMPT_NOT_FOUND)
  }
  const quiz = await attemptRepository.findQuiz(attempt.assessmentId)
  if (!isVisibleQuiz(quiz)) {
    throw ApiError.notFound(ATTEMPT_NOT_FOUND)
  }
  return { attempt, quiz }
}

async function toCurrentAttemptView(quiz, attemptId) {
  const attempt = await attemptRepository.findAttemptById(attemptId)
  const answers = await attemptRepository.findAttemptQuestions(attemptId)
  return toAttemptView(quiz, attempt, answers, new Date())
}

export async function getAttempt(user, attemptId) {
  const student = await getStudentProfile(user)
  const { attempt, quiz } = await getOwnAttempt(student, attemptId)
  if (attempt.status === AttemptStatus.IN_PROGRESS && isExpired(attempt, new Date())) {
    await finalizeExpiredAttempt(student.id, attempt.assessmentId)
  }
  return toCurrentAttemptView(quiz, attemptId)
}

// Submits the student's attempt and returns it as getAttempt does. Submitting again is safe: an attempt is closed
// only once, and a repeat changes nothing. An attempt whose deadline has passed is closed as AUTO_SUBMITTED at its
// deadline, exactly as if it had been found expired, rather than as a late submission.
export async function submitAttempt(user, attemptId) {
  const student = await getStudentProfile(user)
  const { attempt, quiz } = await getOwnAttempt(student, attemptId)

  await attemptRepository.transaction(async (tx) => {
    const { quiz: locked } = await lockQuizForStudent(tx, student.id, attempt.assessmentId)
    if (!isVisibleQuiz(locked)) {
      throw ApiError.notFound(ATTEMPT_NOT_FOUND)
    }
    const current = await attemptRepository.lockInProgressAttempt(tx, attempt.assessmentId, student.id)
    if (current?.id !== attemptId) {
      return
    }
    const now = new Date()
    if (isExpired(current, now)) {
      await autoSubmit(tx, locked, current)
    } else {
      await finalizeAttempt(tx, locked, current, { status: AttemptStatus.SUBMITTED, submittedAt: now })
    }
  })
  return toCurrentAttemptView(quiz, attemptId)
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

const closedAttempt = () =>
  ApiError.conflict('This attempt has already been submitted', [{ field: 'attemptId', message: 'The attempt is closed' }])

const timedOutAttempt = (attempt) =>
  ApiError.conflict('Time is up: your attempt was submitted automatically', [
    { field: 'expiresAt', message: `The attempt ended at ${attempt.expiresAt.toISOString()}` },
  ])

// Runs `work(tx, attempt, now)` on the student's own attempt while it is still open, holding the same locks as a
// submission, since finding the attempt expired closes it. Everything getOwnAttempt read is checked again once the
// locks are held. An expired attempt is closed as AUTO_SUBMITTED, and the refusal is thrown only after that commits.
async function changeOpenAttempt(student, attemptId, work) {
  const { attempt } = await getOwnAttempt(student, attemptId)
  if (attempt.status !== AttemptStatus.IN_PROGRESS) {
    throw closedAttempt()
  }

  const outcome = await attemptRepository.transaction(async (tx) => {
    const { quiz } = await lockQuizForStudent(tx, student.id, attempt.assessmentId)
    if (!isVisibleQuiz(quiz)) {
      throw ApiError.notFound(ATTEMPT_NOT_FOUND)
    }
    const current = await attemptRepository.lockInProgressAttempt(tx, attempt.assessmentId, student.id)
    if (current?.id !== attemptId) {
      return { refusal: closedAttempt() }
    }
    // Read under the locks, so a request that waited for them cannot change an attempt past its deadline.
    const now = new Date()
    if (isExpired(current, now)) {
      await autoSubmit(tx, quiz, current)
      return { refusal: timedOutAttempt(current) }
    }
    return { value: await work(tx, current, now) }
  })
  if (outcome.refusal) {
    throw outcome.refusal
  }
  return outcome.value
}

async function findAnswerToChange(tx, attempt, assessmentQuestionId) {
  const answer = await attemptRepository.findAttemptAnswer(tx, attempt.id, assessmentQuestionId)
  if (!answer) {
    throw ApiError.notFound(QUESTION_NOT_IN_ATTEMPT)
  }
  return answer
}

// Stored responses have a single field: selected_option_id or answer_text.
const sameResponse = (stored, response) =>
  stored !== null &&
  stored.selected_option_id === response.selected_option_id &&
  stored.answer_text === response.answer_text

async function writeResponse(tx, attempt, answer, change) {
  const saved = await attemptRepository.saveAnswerResponse(tx, attempt.id, answer.id, change)
  if (saved !== 1) {
    throw new Error(`Answer ${answer.id} of attempt ${attempt.id} could not be saved`)
  }
  return { ...answer, ...change }
}

// The student's own response and the attempt's progress; never whether it is correct or what it scores.
async function toSavedAnswer(tx, attempt, answer, now) {
  const responses = await attemptRepository.findAttemptResponses(tx, attempt.id)
  return {
    answer: {
      assessmentQuestionId: answer.assessmentQuestionId,
      response: toStudentResponse(answer.response),
      answeredAt: answer.answeredAt,
    },
    progress: {
      attemptId: attempt.id,
      questionCount: responses.length,
      answeredCount: responses.filter(({ response }) => response !== null).length,
      expiresAt: attempt.expiresAt,
      timeRemainingSeconds: attempt.expiresAt ? elapsedSeconds(now, attempt.expiresAt) : null,
    },
  }
}

// `input` is a validated save-answer body. Saving the response already stored writes nothing, so its answeredAt
// stays the time it was first given.
export async function saveAnswer(user, attemptId, assessmentQuestionId, input) {
  const student = await getStudentProfile(user)
  return changeOpenAttempt(student, attemptId, async (tx, attempt, now) => {
    const answer = await findAnswerToChange(tx, attempt, assessmentQuestionId)
    const response = toStoredResponse(answer.assessmentQuestion.question, input)
    const saved = sameResponse(answer.response, response)
      ? answer
      : await writeResponse(tx, attempt, answer, { response, answeredAt: now })
    return toSavedAnswer(tx, attempt, saved, now)
  })
}

// Clearing an unanswered question changes nothing.
export async function clearAnswer(user, attemptId, assessmentQuestionId) {
  const student = await getStudentProfile(user)
  return changeOpenAttempt(student, attemptId, async (tx, attempt, now) => {
    const answer = await findAnswerToChange(tx, attempt, assessmentQuestionId)
    const cleared =
      answer.response === null ? answer : await writeResponse(tx, attempt, answer, { response: null, answeredAt: null })
    return toSavedAnswer(tx, attempt, cleared, now)
  })
}
