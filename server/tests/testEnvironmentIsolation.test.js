// npm run test:integration:runner. The Neo4j and JWT settings integration test processes get, and whether loading an
// env file can replace them. Synthetic values and temporary files only: nothing here loads server/.env, imports the
// application or Prisma, or connects to anything.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { PRELOAD_PATH } from './support/integrationRunner.js'
import {
  assertIsolatedTestEnv,
  createIsolatedTestEnv,
  ISOLATED_MCP_RESOURCE_URL,
  ISOLATED_VARIABLES,
  NEO4J_CONNECTION_VARIABLES,
  TestEnvironmentError,
} from './support/testEnvironmentIsolation.js'

// What server/.env or a developer's shell might hold.
const FILE_VALUES = {
  NEO4J_URI: 'neo4j+s://synthetic-from-file.databases.example.com',
  NEO4J_USERNAME: 'synthetic_file_user',
  NEO4J_PASSWORD: 'Synthetic-File-Graph-Password-42',
  JWT_SECRET: 'Synthetic-File-Jwt-Secret-abcdefghijklmnopqrstuvwxyz',
  MCP_TUTOR_TOKEN_SECRET: 'Synthetic-File-Tutor-Secret-abcdefghijklmnopqrstuvwxyz',
  MCP_RESOURCE_URL: 'http://localhost:5000/mcp',
}
const LOCAL_URL = 'postgresql://isolation_user:Synthetic-Isolation-Secret-08@localhost:5432/selvia_test'
const REMOTE_URL = 'postgresql://file_user:Synthetic-File-Db-Secret-13@db.example.com:5432/postgres'
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function assertNoValues(text, values) {
  for (const value of values) assert.ok(!text.includes(value), 'output contains a guarded value')
}

describe('isolated test settings', () => {
  it('switch Neo4j off and generate a new JWT and tutor MCP secrets each time', () => {
    const first = createIsolatedTestEnv()
    const second = createIsolatedTestEnv()
    assert.deepEqual(Object.keys(first).sort(), [...ISOLATED_VARIABLES].sort())
    for (const name of NEO4J_CONNECTION_VARIABLES) assert.equal(first[name], '')
    assert.match(first.JWT_SECRET, /^[A-Za-z0-9_-]{64}$/)
    assert.match(first.MCP_TUTOR_TOKEN_SECRET, /^[A-Za-z0-9_-]{64}$/)
    assert.equal(first.MCP_RESOURCE_URL, ISOLATED_MCP_RESOURCE_URL)
    assert.notEqual(first.JWT_SECRET, first.MCP_TUTOR_TOKEN_SECRET)
    assert.notEqual(first.JWT_SECRET, second.JWT_SECRET)
    assert.notEqual(first.MCP_TUTOR_TOKEN_SECRET, second.MCP_TUTOR_TOKEN_SECRET)
    assert.doesNotThrow(() => assertIsolatedTestEnv(first))
  })

  it('are refused when missing, filled in or too weak, without revealing a value', () => {
    const cases = []
    for (const name of NEO4J_CONNECTION_VARIABLES) {
      cases.push([name, undefined], [name, FILE_VALUES[name]], [name, ' '])
    }
    cases.push(['JWT_SECRET', undefined], ['JWT_SECRET', ''], ['JWT_SECRET', 'change-this-in-production'])
    cases.push(
      ['MCP_TUTOR_TOKEN_SECRET', undefined],
      ['MCP_TUTOR_TOKEN_SECRET', ''],
      ['MCP_TUTOR_TOKEN_SECRET', 'short'],
      ['MCP_RESOURCE_URL', undefined],
      ['MCP_RESOURCE_URL', ''],
      ['MCP_RESOURCE_URL', FILE_VALUES.MCP_RESOURCE_URL],
    )
    for (const [name, value] of cases) {
      const env = { ...createIsolatedTestEnv(), [name]: value }
      assert.throws(
        () => assertIsolatedTestEnv(env),
        (err) => {
          assert.ok(err instanceof TestEnvironmentError)
          assert.ok(err.message.includes(name) || err.message.includes('MCP_'), err.message)
          if (value?.trim()) assert.ok(!err.message.includes(value), 'the message contains the value')
          return true
        },
        `${name}=${JSON.stringify(value)}`,
      )
    }

    const sameSecret = createIsolatedTestEnv()
    sameSecret.MCP_TUTOR_TOKEN_SECRET = sameSecret.JWT_SECRET
    assert.throws(() => assertIsolatedTestEnv(sameSecret), /MCP_TUTOR_TOKEN_SECRET must differ from JWT_SECRET/)
  })

  it('detect a later change, removal or replacement, without revealing a value', () => {
    const env = createIsolatedTestEnv()
    const checked = assertIsolatedTestEnv(env)
    assert.doesNotThrow(() => checked.assertUnchanged({ ...env, UNRELATED: 'yes' }))

    for (const name of ISOLATED_VARIABLES) {
      for (const current of [{ ...env, [name]: FILE_VALUES[name] }, { ...env, [name]: undefined }]) {
        assert.throws(
          () => checked.assertUnchanged(current),
          (err) => {
            assert.ok(err instanceof TestEnvironmentError)
            assert.match(err.message, new RegExp(`${name} changed after it was checked`))
            assertNoValues(err.message, [...Object.values(FILE_VALUES), env.JWT_SECRET])
            return true
          },
        )
      }
    }

    // The checked values are copies: changing the object that was checked is detected too.
    env.JWT_SECRET = FILE_VALUES.JWT_SECRET
    assert.throws(() => checked.assertUnchanged(env), /JWT_SECRET changed after it was checked/)
  })
})

describe('loading an env file into an integration test process', () => {
  let dir
  let envFile
  let isolated

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'selvia-isolation-'))
    envFile = path.join(dir, 'synthetic.env')
    const lines = Object.entries({ ...FILE_VALUES, DATABASE_URL: REMOTE_URL, DIRECT_URL: REMOTE_URL, SELVIA_FILE_ONLY: 'loaded' })
    writeFileSync(envFile, lines.map(([name, value]) => `${name}=${value}`).join('\n'))
    isolated = createIsolatedTestEnv()
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  // A test process as the runner starts it: the guard preloaded, the checked database URLs and the isolated settings.
  // `script` runs as an ES module after the preload and prints one line of JSON.
  function runTestProcess(script) {
    const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, ...isolated, SELVIA_ENV_FILE: envFile }
    const preloadUrl = pathToFileURL(PRELOAD_PATH).href
    const source = `import { createHash } from 'node:crypto'
const { checkedTestDatabase } = await import(${JSON.stringify(preloadUrl)})
const sha256 = (value) => (value === undefined ? null : createHash('sha256').update(value).digest('hex'))
${script}`
    const result = spawnSync(process.execPath, ['--import', preloadUrl, '--input-type=module', '-e', source], {
      env,
      encoding: 'utf8',
      shell: false,
      timeout: 30_000,
    })
    assertNoValues(`${result.stdout}\n${result.stderr}`, [...Object.values(FILE_VALUES), isolated.JWT_SECRET, LOCAL_URL, REMOTE_URL])
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }

  it('keeps the empty Neo4j settings, the JWT secret and the database URLs, so the guard sees no change', () => {
    const result = runTestProcess(`process.loadEnvFile(process.env.SELVIA_ENV_FILE)
let unchanged = true
try { checkedTestDatabase.assertUnchanged() } catch { unchanged = false }
console.log(JSON.stringify({
  fileLoaded: process.env.SELVIA_FILE_ONLY === 'loaded',
  neo4j: ${JSON.stringify(NEO4J_CONNECTION_VARIABLES)}.map((name) => [Object.hasOwn(process.env, name), process.env[name]]),
  jwtSecret: sha256(process.env.JWT_SECRET),
  databaseUrl: sha256(process.env.DATABASE_URL),
  directUrl: sha256(process.env.DIRECT_URL),
  unchanged,
}))`)
    assert.deepEqual(result, {
      fileLoaded: true,
      neo4j: [[true, ''], [true, ''], [true, '']],
      jwtSecret: sha256(isolated.JWT_SECRET),
      databaseUrl: sha256(LOCAL_URL),
      directUrl: sha256(LOCAL_URL),
      unchanged: true,
    })
  })

  it('reports any guarded setting replaced afterwards, without revealing it', () => {
    const replacements = { ...FILE_VALUES, DATABASE_URL: REMOTE_URL, DIRECT_URL: REMOTE_URL }
    const result = runTestProcess(`const replacements = ${JSON.stringify(replacements)}
const messages = {}
for (const [name, value] of Object.entries(replacements)) {
  const original = process.env[name]
  process.env[name] = value
  try { checkedTestDatabase.assertUnchanged(); messages[name] = null } catch (err) { messages[name] = err.message }
  process.env[name] = original
}
console.log(JSON.stringify(messages))`)
    for (const name of Object.keys(replacements)) {
      assert.match(result[name] ?? '', new RegExp(`^Refusing to .*: ${name} changed after it was checked`), name)
    }
  })
})
