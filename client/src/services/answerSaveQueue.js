import { clearQuizAnswer, saveQuizAnswer } from './api/studentQuiz.api.js'

// Saves a student's answers in one quiz attempt. At most one answer request runs at a time, and for each question
// only the newest intended response is kept while it waits, so an older value can never be written after a newer
// one. A response counts as saved only once the server has confirmed it; the server's copy is what the queue
// compares new responses with, so a response it already holds is never sent again.
//
// A response is { selectedOptionId }, { answerText } (already trimmed) or null, which clears the answer.
//
// Failures never retry on their own:
// - 409: the attempt was submitted or its time is up. Nothing more is sent; `onClosed` is told.
// - 400 or 404: that response was refused. Other questions carry on; the question waits for an edit or retry().
// - anything else (no connection, server error, 401, 403): the queue pauses, keeping every unsaved response,
//   until the next edit, resume() or retry().

export const SAVE_STATUS = Object.freeze({
  WAITING: 'WAITING',
  SAVING: 'SAVING',
  SAVED: 'SAVED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
})

export const HALT = Object.freeze({ PAUSED: 'PAUSED', CLOSED: 'CLOSED' })

export function sameResponse(a, b) {
  if (!a || !b) return !a && !b
  return a.selectedOptionId === b.selectedOptionId && a.answerText === b.answerText
}

// Per attempt, the end of the chain of answer writes. A page that was left may still be finishing its writes when
// the attempt is opened again; chaining keeps the two from ever writing at the same time.
const writeChains = new Map()

function runExclusive(attemptId, task) {
  const previous = writeChains.get(attemptId) ?? Promise.resolve()
  const run = previous.then(task)
  const settled = run.then(
    () => {},
    () => {},
  )
  writeChains.set(attemptId, settled)
  settled.then(() => {
    if (writeChains.get(attemptId) === settled) writeChains.delete(attemptId)
  })
  return run
}

// Queues detached from a page that was left, each until it has nothing left to send.
const draining = new Map()

// Resolves once the writes of pages that were left have finished, or after `timeoutMs`, so that reading the attempt
// again shows what they saved.
export function waitForAnswerWrites(attemptId, timeoutMs = 5000) {
  const waits = [...(draining.get(attemptId) ?? []), writeChains.get(attemptId)].filter(Boolean)
  if (waits.length === 0) return Promise.resolve()
  return Promise.race([Promise.all(waits), new Promise((resolve) => setTimeout(resolve, timeoutMs))])
}

export class AnswerSaveQueue {
  #attemptId
  #confirmed
  #pending = new Map()
  #timers = new Map()
  #failures = new Map()
  #saved = new Set()
  #rejected = new Set()
  #inFlight = null
  #halt = null
  #progress = null
  #held = false
  #detached = false
  #onClosed = null
  #idleWaiters = []
  #listeners = new Set()
  #snapshot

  // `questions` are the open attempt's questions, each with the response the server holds.
  constructor(attemptId, questions) {
    this.#attemptId = attemptId
    this.#confirmed = new Map(questions.map((question) => [question.id, question.response]))
    this.#snapshot = this.#buildSnapshot()
  }

  subscribe = (listener) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  // { statuses: { [questionId]: SAVE_STATUS }, errors: { [questionId]: error }, halt: null or { kind, error },
  // progress, hasUnsaved, unsavedCount, idle }.
  // `progress` is null until a write succeeds, then the server's { answeredCount, questionCount,
  // timeRemainingSeconds } from the latest one, with `receivedAt`, the performance.now() time it arrived.
  // `unsavedCount` counts the questions whose latest change the server has not confirmed. `idle` is true when
  // nothing is waiting or being sent: everything is saved, or the queue is paused, held or closed.
  getSnapshot = () => this.#snapshot

  // Records the newest intended response for a question. With `delay` it is sent only after that many milliseconds
  // without another change, or on flush().
  change(questionId, response, { delay = 0 } = {}) {
    if (this.#halt?.kind === HALT.CLOSED) return
    this.#failures.delete(questionId)
    this.#cancelTimer(questionId)
    if (delay > 0) {
      const handle = setTimeout(() => {
        this.#timers.delete(questionId)
        this.#enqueue(questionId, response)
      }, delay)
      this.#timers.set(questionId, { handle, response })
      this.#emit()
      return
    }
    this.#enqueue(questionId, response)
  }

  // Sends a delayed change now.
  flush(questionId) {
    const timer = this.#timers.get(questionId)
    if (!timer) return
    this.#cancelTimer(questionId)
    this.#enqueue(questionId, timer.response)
  }

  flushAll() {
    for (const questionId of [...this.#timers.keys()]) this.flush(questionId)
  }

  // Resolves once the queue is idle (see getSnapshot). Delayed changes are not sent by waiting; flushAll() first.
  whenIdle() {
    if (this.#isIdle()) return Promise.resolve()
    return new Promise((resolve) => this.#idleWaiters.push(resolve))
  }

  // While held, nothing is sent; changes are still recorded and sent after release(). For a submission, which
  // must not race an answer write.
  hold() {
    this.#held = true
    this.#emit()
    this.#settleIfIdle()
  }

  release() {
    if (!this.#held) return
    this.#held = false
    this.#emit()
    this.#pump()
  }

  // Continues after a pause, for example when the connection is back. Refused responses stay refused.
  resume() {
    if (this.#halt?.kind !== HALT.PAUSED) return
    this.#halt = null
    this.#emit()
    this.#pump()
  }

  // Sends every unsaved response again, including refused ones. Only ever called by the student.
  retry() {
    if (this.#halt?.kind === HALT.CLOSED) return
    for (const [questionId, { response }] of this.#failures) {
      if (!this.#pending.has(questionId)) this.#pending.set(questionId, response)
    }
    this.#failures.clear()
    this.#halt = null
    this.#emit()
    this.#pump()
  }

  // `onClosed(error, unsavedCount)` is called once if the server stops accepting changes.
  attach(onClosed) {
    this.#detached = false
    this.#onClosed = onClosed
  }

  // The page is going away: delayed changes are sent now, one more try is made after a pause, and the queue
  // finishes on its own without telling anyone. Any failure then stops it.
  detach() {
    this.#detached = true
    this.#onClosed = null
    this.flushAll()
    if (this.#halt?.kind === HALT.PAUSED) {
      this.#halt = null
      this.#pump()
    }
    if (this.#isIdle()) return

    const done = new Promise((resolve) => this.#idleWaiters.push(resolve))
    const waits = draining.get(this.#attemptId) ?? new Set()
    waits.add(done)
    draining.set(this.#attemptId, waits)
    done.then(() => {
      waits.delete(done)
      if (waits.size === 0 && draining.get(this.#attemptId) === waits) draining.delete(this.#attemptId)
    })
  }

  #cancelTimer(questionId) {
    const timer = this.#timers.get(questionId)
    if (!timer) return
    clearTimeout(timer.handle)
    this.#timers.delete(questionId)
  }

  #enqueue(questionId, response) {
    // Re-inserted so that questions are sent in the order they were last changed.
    this.#pending.delete(questionId)
    this.#pending.set(questionId, response)
    if (this.#halt?.kind === HALT.PAUSED && !this.#detached) this.#halt = null
    this.#emit()
    this.#pump()
  }

  async #pump() {
    if (this.#inFlight || this.#halt || this.#held) {
      this.#settleIfIdle()
      return
    }
    const next = this.#pending.entries().next()
    if (next.done) {
      this.#settleIfIdle()
      return
    }
    const [questionId, response] = next.value
    this.#pending.delete(questionId)

    if (sameResponse(response, this.#confirmed.get(questionId))) {
      this.#saved.add(questionId)
      this.#emit()
      this.#pump()
      return
    }

    this.#inFlight = { questionId, response }
    this.#emit()
    const attemptId = this.#attemptId
    let result
    let failure
    try {
      result = await runExclusive(attemptId, () =>
        response ? saveQuizAnswer(attemptId, questionId, response) : clearQuizAnswer(attemptId, questionId),
      )
    } catch (error) {
      failure = error
    }
    this.#inFlight = null

    if (failure) {
      this.#fail(questionId, response, failure)
    } else {
      this.#confirmed.set(questionId, result.answer.response)
      this.#saved.add(questionId)
      const { answeredCount, questionCount, timeRemainingSeconds } = result.progress
      this.#progress = { answeredCount, questionCount, timeRemainingSeconds, receivedAt: performance.now() }
    }
    this.#emit()
    this.#pump()
  }

  #fail(questionId, response, error) {
    const superseded = this.#pending.has(questionId) || this.#timers.has(questionId)

    if (error?.status === 409) {
      const unsaved = new Set([questionId, ...this.#pending.keys(), ...this.#timers.keys(), ...this.#failures.keys()])
      for (const id of [...this.#timers.keys()]) this.#cancelTimer(id)
      this.#pending.clear()
      this.#failures.clear()
      this.#rejected = unsaved
      this.#halt = { kind: HALT.CLOSED, error }
      this.#onClosed?.(error, unsaved.size)
      return
    }

    if (error?.status === 400 || error?.status === 404) {
      if (!superseded) this.#failures.set(questionId, { response, error })
      return
    }

    if (!superseded) this.#pending.set(questionId, response)
    this.#halt = { kind: HALT.PAUSED, error }
  }

  #isIdle() {
    return (
      !this.#inFlight && this.#timers.size === 0 && (this.#pending.size === 0 || this.#halt !== null || this.#held)
    )
  }

  #settleIfIdle() {
    if (!this.#isIdle() || this.#idleWaiters.length === 0) return
    const waiters = this.#idleWaiters
    this.#idleWaiters = []
    for (const resolve of waiters) resolve()
  }

  #statusOf(questionId) {
    if (this.#rejected.has(questionId)) return SAVE_STATUS.REJECTED
    if (this.#failures.has(questionId)) return SAVE_STATUS.FAILED
    if (this.#timers.has(questionId)) return SAVE_STATUS.WAITING
    if (this.#inFlight?.questionId === questionId) return SAVE_STATUS.SAVING
    if (this.#pending.has(questionId)) {
      return this.#halt?.kind === HALT.PAUSED ? SAVE_STATUS.FAILED : SAVE_STATUS.SAVING
    }
    if (this.#saved.has(questionId)) return SAVE_STATUS.SAVED
    return null
  }

  #buildSnapshot() {
    const statuses = {}
    const errors = {}
    let unsavedCount = 0
    for (const questionId of this.#confirmed.keys()) {
      const status = this.#statusOf(questionId)
      if (status) statuses[questionId] = status
      if (status && status !== SAVE_STATUS.SAVED) unsavedCount += 1
      const failure = this.#failures.get(questionId)
      if (failure) errors[questionId] = failure.error
    }
    const closed = this.#halt?.kind === HALT.CLOSED
    return {
      statuses,
      errors,
      halt: this.#halt,
      progress: this.#progress,
      hasUnsaved:
        !closed &&
        (this.#inFlight !== null || this.#pending.size > 0 || this.#timers.size > 0 || this.#failures.size > 0),
      unsavedCount,
      idle: this.#isIdle(),
    }
  }

  #emit() {
    this.#snapshot = this.#buildSnapshot()
    if (this.#detached) return
    for (const listener of this.#listeners) listener()
  }
}
