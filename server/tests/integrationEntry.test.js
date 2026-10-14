// npm run test:integration:runner. How integration test files are protected when they are started without the runner.
// Synthetic URLs and temporary files only: nothing here loads server/.env, imports the application or Prisma, or
// connects to a database. The processes started here run harmless files that only record whether they were reached.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import {
  assertGuardedEntry,
  INTEGRATION_TEST_DIR,
  INTEGRATION_TEST_SUFFIX,
  IntegrationRunnerError,
  PRELOAD_PATH,
} from './support/integrationRunner.js'
import { createIsolatedTestEnv } from './support/testEnvironmentIsolation.js'

const SERVER_ROOT = fileURLToPath(new URL('../', import.meta.url))
const TESTS_DIR = fileURLToPath(new URL('./', import.meta.url))
const PRELOAD_URL = pathToFileURL(PRELOAD_PATH).href

const USER = 'entry_user'
const PASSWORD = 'Synthetic-Entry-Secret-31'
const LOCAL_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test`
const REMOTE_URL = `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`

describe('integration test entry check', () => {
  // Beside tests/integration, so that relative specifiers resolve exactly as they do in a real integration test.
  let fixtureDir
  let count = 0

  before(() => {
    fixtureDir = mkdtempSync(path.join(TESTS_DIR, '.entry-check-'))
  })
  after(() => rmSync(fixtureDir, { recursive: true, force: true }))

  function fixture(source) {
    count += 1
    const file = path.join(fixtureDir, `entry-${count}.fixture.js`)
    writeFileSync(file, source)
    return file
  }
  const accepted = (source) => assert.doesNotThrow(() => assertGuardedEntry(fixture(source)), source)
  const refused = (source) =>
    assert.throws(
      () => assertGuardedEntry(fixture(source)),
      (err) => err instanceof IntegrationRunnerError && /must import tests\/support\/integrationPreload\.js as its first statement/.test(err.message),
      source,
    )

  it('accepts files whose first statement imports the guard', () => {
    accepted("import '../support/integrationPreload.js'\nimport { test } from 'node:test'\n")
    accepted('import "../support/integrationPreload.js";')
    accepted("import {\n  checkedTestDatabase,\n} from '../support/integrationPreload.js'\n")
    accepted("import * as guard from '../support/integrationPreload.js'")
    accepted("import '../integration/../support/integrationPreload.js'")
    accepted(`import '${PRELOAD_URL}'`)
  })

  it('accepts comments, a byte order mark and a hashbang before that statement', () => {
    accepted("// Quiz attempts.\n/* Uses the test database.\n */\n\nimport '../support/integrationPreload.js'")
    accepted("\uFEFFimport '../support/integrationPreload.js'")
    accepted("#!/usr/bin/env node\nimport '../support/integrationPreload.js'")
  })

  it('refuses files that start with anything else', () => {
    refused('')
    refused('// nothing but a comment\n')
    refused("import { test } from 'node:test'\nimport '../support/integrationPreload.js'")
    refused("// import '../support/integrationPreload.js'\nimport { test } from 'node:test'")
    refused("const ready = true\nimport '../support/integrationPreload.js'")
    refused("await import('../support/integrationPreload.js')")
    refused("export * from '../support/integrationPreload.js'")
    refused("/* unterminated comment\nimport '../support/integrationPreload.js'")
  })

  it('refuses imports of anything but the guard entry itself', () => {
    refused("import '../support/testDatabaseGuard.js'")
    refused("import '../support/integrationPreload.js?again'")
    refused("import '../support/integrationPreload.js#entry'")
    refused("import 'integrationPreload.js'")
    refused("import '#integration-preload'")
    refused("import './integrationPreload.js'")
  })

  it('refuses a file that cannot be read', () => {
    assert.throws(() => assertGuardedEntry(path.join(fixtureDir, 'missing.integration.test.js')), /could not be read/)
  })
})

describe('integration test file started without the runner', () => {
  let dir
  let file
  let marker

  before(() => {
    dir = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'selvia-entry-')))
    file = path.join(dir, 'direct.integration.test.js')
    marker = path.join(dir, 'marker')
    writeFileSync(
      file,
      `import '${PRELOAD_URL}'
import { writeFileSync } from 'node:fs'
import { test } from 'node:test'

writeFileSync(process.env.SELVIA_ENTRY_MARKER + '.module', 'reached')
test('database work would happen here', () => {
  writeFileSync(process.env.SELVIA_ENTRY_MARKER + '.test', 'reached')
})
`,
    )
  })
  after(() => rmSync(dir, { recursive: true, force: true }))

  // Only what Node needs to run, plus the marker path: no inherited database settings, NODE_OPTIONS or test context.
  function start(args, databaseEnv) {
    for (const suffix of ['.module', '.test']) rmSync(marker + suffix, { force: true })
    const env = { SELVIA_ENTRY_MARKER: marker, ...databaseEnv }
    for (const name of ['PATH', 'SystemRoot', 'TEMP', 'TMP']) {
      if (process.env[name] !== undefined) env[name] = process.env[name]
    }
    const result = spawnSync(process.execPath, args, { cwd: dir, env, encoding: 'utf8', shell: false, timeout: 60_000 })
    return {
      status: result.status,
      output: `${result.stdout}\n${result.stderr}`,
      moduleReached: existsSync(`${marker}.module`),
      testReached: existsSync(`${marker}.test`),
    }
  }

  function assertStoppedBeforeTestCode(result) {
    assert.notEqual(result.status, 0)
    assert.equal(result.moduleReached, false, 'the test module body ran')
    assert.equal(result.testReached, false, 'a test body ran')
    for (const secret of [PASSWORD, USER, LOCAL_URL, REMOTE_URL]) assert.ok(!result.output.includes(secret), 'output contains a secret')
  }

  it('with node --test <file> and no database settings, stops before any test code', { timeout: 60_000 }, () => {
    const result = start(['--test', file], {})
    assertStoppedBeforeTestCode(result)
    assert.match(result.output, /DATABASE_URL must be set explicitly/)
  })

  it('with a bare node --test, which finds integration test files by itself, stops before any test code', { timeout: 60_000 }, () => {
    assertStoppedBeforeTestCode(start(['--test'], { DATABASE_URL: LOCAL_URL }))
  })

  it('with plain node <file> and a remote database, stops before any test code', { timeout: 60_000 }, () => {
    const result = start([file], { DATABASE_URL: LOCAL_URL, DIRECT_URL: REMOTE_URL })
    assertStoppedBeforeTestCode(result)
    assert.equal(result.status, 1)
    assert.match(result.output, /DIRECT_URL must point to localhost or 127\.0\.0\.1/)
  })

  it('with safe database settings but Neo4j and the JWT secret not isolated, stops before any test code', { timeout: 60_000 }, () => {
    const result = start(['--test', file], { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL })
    assertStoppedBeforeTestCode(result)
    assert.match(result.output, /NEO4J_URI must be set to an empty string/)
  })

  it('with safe, isolated settings but a PG* variable that could redirect the connection, stops before any test code', { timeout: 60_000 }, () => {
    const safe = { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, ...createIsolatedTestEnv() }
    for (const [extra, pattern] of [[{ PGPORT: '6543' }, /PGPORT is set/], [{ pgDatabase: 'synthetic_production' }, /PGDATABASE is set/]]) {
      const result = start(['--test', file], { ...safe, ...extra })
      assertStoppedBeforeTestCode(result)
      assert.match(result.output, pattern)
      assert.ok(!result.output.includes(Object.values(extra)[0]))
    }
  })

  it('runs normally once the settings pass the guard', { timeout: 60_000 }, () => {
    const safe = { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, ...createIsolatedTestEnv() }
    const direct = start(['--test', file], safe)
    assert.equal(direct.status, 0)
    assert.ok(direct.moduleReached && direct.testReached)
    const discovered = start(['--test'], safe)
    assert.equal(discovered.status, 0)
    assert.ok(discovered.testReached, 'a bare node --test did not find the integration test file')
  })
})

describe('integration test files in the repository', () => {
  // Every *.integration.test.js under server/, outside node_modules and hidden folders.
  function findIntegrationTests(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.isSymbolicLink()) return []
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) return findIntegrationTests(entryPath)
      return entry.isFile() && entry.name.endsWith(INTEGRATION_TEST_SUFFIX) ? [entryPath] : []
    })
  }

  it('are all in tests/integration and import the guard first', () => {
    const integrationDir = realpathSync.native(INTEGRATION_TEST_DIR)
    for (const file of findIntegrationTests(SERVER_ROOT)) {
      const relative = path.relative(integrationDir, realpathSync.native(file))
      assert.ok(relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative), `${path.relative(SERVER_ROOT, file)} is outside tests/integration`)
      assert.doesNotThrow(() => assertGuardedEntry(file), path.relative(SERVER_ROOT, file))
    }
  })
})
