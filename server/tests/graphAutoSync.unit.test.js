// npm run test:unit. Best-effort Neo4j auto-sync — no real Neo4j or Postgres.
import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { createGraphAutoSync } from '../src/services/graphAutoSync.service.js'

const course = { id: 'course-1', code: 'SE-CAMPUS', title: 'Campus' }
const module = { id: 'module-1', courseId: 'course-1', title: 'Access control' }
const topic = { id: 'topic-1', moduleId: 'module-1', title: 'APIs' }
const concept = { id: 'concept-1', topicId: 'topic-1', code: 'concept-jwt', name: 'JWT' }
const lesson = { id: 'lesson-1', conceptId: 'concept-1', title: 'JWT auth' }

function createTestAutoSync({ configured = true, ...overrides } = {}) {
  return createGraphAutoSync({
    isNeo4jConfigured: () => configured,
    upsertCourseNode: mock.fn(async () => {}),
    upsertChildNode: mock.fn(async () => true),
    findSubtree: mock.fn(async () => null),
    removeNodes: mock.fn(async () => ({ nodes: {}, relationships: {} })),
    warn: mock.fn(),
    error: mock.fn(),
    ...overrides,
  })
}

describe('graphAutoSync', () => {
  it('skips when Neo4j is not configured', async () => {
    const upsertCourseNode = mock.fn(async () => {})
    const autoSync = createTestAutoSync({ configured: false, upsertCourseNode })
    const result = await autoSync.syncCourseToGraph(course)
    assert.deepEqual(result, { skipped: true })
    assert.equal(upsertCourseNode.mock.callCount(), 0)
  })

  it('upserts a course node after a Postgres write', async () => {
    const upsertCourseNode = mock.fn(async () => {})
    const autoSync = createTestAutoSync({ upsertCourseNode })
    const result = await autoSync.syncCourseToGraph(course)
    assert.deepEqual(result, { synced: true })
    assert.equal(upsertCourseNode.mock.callCount(), 1)
    assert.deepEqual(upsertCourseNode.mock.calls[0].arguments[0], {
      id: 'course-1',
      code: 'SE-CAMPUS',
      title: 'Campus',
    })
  })

  it('upserts child nodes with the correct parent link', async () => {
    const upsertChildNode = mock.fn(async () => true)
    const autoSync = createTestAutoSync({ upsertChildNode })

    assert.deepEqual(await autoSync.syncModuleToGraph(module), { synced: true })
    assert.deepEqual(await autoSync.syncTopicToGraph(topic), { synced: true })
    assert.deepEqual(await autoSync.syncConceptToGraph(concept), { synced: true })
    assert.deepEqual(await autoSync.syncLessonToGraph(lesson), { synced: true })

    assert.equal(upsertChildNode.mock.callCount(), 4)
    assert.deepEqual(upsertChildNode.mock.calls[0].arguments, [
      'Module',
      'course-1',
      { id: 'module-1', title: 'Access control' },
    ])
    assert.deepEqual(upsertChildNode.mock.calls[2].arguments, [
      'Concept',
      'topic-1',
      { id: 'concept-1', code: 'concept-jwt', name: 'JWT' },
    ])
  })

  it('does not throw when the parent is missing from the graph', async () => {
    const upsertChildNode = mock.fn(async () => false)
    const warn = mock.fn()
    const autoSync = createTestAutoSync({ upsertChildNode, warn })
    const result = await autoSync.syncModuleToGraph(module)
    assert.deepEqual(result, { synced: false, reason: 'parent_missing' })
    assert.equal(warn.mock.callCount(), 1)
  })

  it('does not throw when Neo4j upsert fails', async () => {
    const upsertCourseNode = mock.fn(async () => {
      throw new Error('Neo4j unavailable')
    })
    const error = mock.fn()
    const autoSync = createTestAutoSync({ upsertCourseNode, error })
    const result = await autoSync.syncCourseToGraph(course)
    assert.deepEqual(result, { synced: false, reason: 'error' })
    assert.equal(error.mock.callCount(), 1)
  })

  it('removes a graph subtree after a Postgres delete', async () => {
    const findSubtree = mock.fn(async () => ({
      descendants: [{ label: 'Module', id: 'module-1' }],
    }))
    const removeNodes = mock.fn(async () => ({ nodes: { Course: 1, Module: 1 }, relationships: {} }))
    const autoSync = createTestAutoSync({ findSubtree, removeNodes })

    const result = await autoSync.removeCourseFromGraph('course-1')
    assert.deepEqual(result, { synced: true })
    assert.deepEqual(removeNodes.mock.calls[0].arguments[0], [
      { label: 'Course', id: 'course-1' },
      { label: 'Module', id: 'module-1' },
    ])
  })

  it('treats a missing graph node as already removed', async () => {
    const findSubtree = mock.fn(async () => null)
    const removeNodes = mock.fn(async () => ({}))
    const autoSync = createTestAutoSync({ findSubtree, removeNodes })

    const result = await autoSync.removeLessonFromGraph('lesson-1')
    assert.deepEqual(result, { synced: true, reason: 'already_absent' })
    assert.equal(removeNodes.mock.callCount(), 0)
  })
})
