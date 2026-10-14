// npm run test:integration:runner. Synthetic URLs and temporary files only: nothing here loads server/.env, imports
// the application or Prisma, or connects to a database. The child processes started here run a harmless test file
// that only records what it received.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import {
  assertGuardedEntry,
  INTEGRATION_TEST_DIR,
  IntegrationRunnerError,
  PRELOAD_PATH,
  resolveTestTargets,
  runIntegrationTests,
} from './support/integrationRunner.js'
import { createIsolatedTestEnv } from './support/testEnvironmentIsolation.js'

const USER = 'runner_user'
const PASSWORD = 'Synthetic-Runner-Secret-77'
const LOCAL_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test`
const SAFE_ENV = { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL }
// What a developer's shell or server/.env might hold; none of it may reach a test process.
const PARENT_NEO4J = {
  NEO4J_URI: 'neo4j+s://synthetic-instance.databases.example.com',
  NEO4J_USERNAME: 'synthetic_graph_user',
  NEO4J_PASSWORD: 'Synthetic-Graph-Password-19',
}
const PARENT_JWT_SECRET = 'Synthetic-Parent-Jwt-Secret-0123456789abcdef'
// PG* variables a developer's shell might hold. pg would use each to fill in or change the connection.
const PARENT_PG = {
  PGHOST: 'synthetic-pg-host.example.com',
  PGPORT: '6543',
  PGUSER: 'synthetic_pg_superuser',
  PGDATABASE: 'synthetic_pg_production',
  PGOPTIONS: '-c synthetic_option=on',
  PGSERVICE: 'synthetic-pg-service',
  pgSslMode: 'synthetic-disable',
  PgHostAddr: '192.0.2.44',
}
const PG_PASSWORD = 'Synthetic-Pg-Password-28'
const PG_PASSFILE = 'C:\\synthetic\\runner-pgpass.conf'
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const pgNames = (env) => Object.keys(env).filter((name) => name.toUpperCase().startsWith('PG')).sort()
// The first statement every integration test file must have. The temporary files live on another drive than the
// repository on some machines, so they import the guard by file URL rather than by relative path.
const GUARDED_ENTRY = `import '${pathToFileURL(PRELOAD_PATH).href}'\n`

function assertNoSecrets(text) {
  for (const secret of [PASSWORD, USER, LOCAL_URL, PARENT_JWT_SECRET, ...Object.values(PARENT_NEO4J), ...Object.values(PARENT_PG), PG_PASSWORD, PG_PASSFILE]) {
    assert.ok(!text.includes(secret), 'output contains a secret')
  }
}

// A spawn that records its calls and never starts a process; its child exits with `exitCode`.
function fakeSpawn({ exitCode = 0, signal = null, error = null } = {}) {
  const calls = []
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    setImmediate(() => (error ? child.emit('error', error) : child.emit('exit', exitCode, signal)))
    return child
  }
  return { calls, spawnProcess }
}

let workspace
let integrationDir
let outsideDir
let fileA
let fileB

before(() => {
  workspace = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'selvia-runner-')))
  integrationDir = path.join(workspace, 'integration')
  outsideDir = path.join(workspace, 'outside')
  mkdirSync(path.join(integrationDir, 'nested'), { recursive: true })
  mkdirSync(outsideDir)
  fileA = path.join(integrationDir, 'a.integration.test.js')
  fileB = path.join(integrationDir, 'nested', 'b.integration.test.js')
  for (const file of [fileA, fileB, path.join(outsideDir, 'c.integration.test.js')]) writeFileSync(file, GUARDED_ENTRY)
  writeFileSync(path.join(integrationDir, 'helper.js'), '')
  writeFileSync(path.join(integrationDir, 'plain.test.js'), '')
})

after(() => rmSync(workspace, { recursive: true, force: true }))

describe('integration test targets', () => {
  const resolve = (args, cwd = integrationDir) => resolveTestTargets(args, { cwd, integrationDir })
  const refused = (args, pattern, cwd) =>
    assert.throws(() => resolve(args, cwd), (err) => err instanceof IntegrationRunnerError && pattern.test(err.message))

  it('default to every integration test file in the directory, nested ones included', () => {
    assert.deepEqual(resolve([]), [fileA, fileB].sort())
  })

  it('accept an explicit file or subdirectory inside the directory', () => {
    assert.deepEqual(resolve(['a.integration.test.js']), [fileA])
    assert.deepEqual(resolve(['nested']), [fileB])
    assert.deepEqual(resolve([fileA, 'a.integration.test.js', '.']), [fileA, fileB].sort())
  })

  it('refuse options', () => {
    for (const option of ['--import=./evil.js', '-r', '--test-reporter=spec', '--', '--test']) {
      refused([option], /options are not accepted/)
    }
  })

  it('refuse files that are not integration tests', () => {
    refused(['helper.js'], /is not an integration test file/)
    refused(['plain.test.js'], /is not an integration test file/)
  })

  it('refuse anything outside the directory', () => {
    refused(['../outside/c.integration.test.js'], /outside the integration test directory/)
    refused([path.join(outsideDir, 'c.integration.test.js')], /outside the integration test directory/)
    refused(['..'], /outside the integration test directory/)
  })

  it('refuse missing or empty targets', () => {
    refused(['missing.integration.test.js'], /was not found/)
    refused([''], /a test target is empty/)
  })

  it('refuse a directory without integration tests, or a missing directory', () => {
    const empty = path.join(workspace, 'empty')
    mkdirSync(empty, { recursive: true })
    assert.throws(() => resolveTestTargets([], { cwd: empty, integrationDir: empty }), /no integration test files were found/)
    assert.throws(
      () => resolveTestTargets([], { cwd: workspace, integrationDir: path.join(workspace, 'absent') }),
      /The integration test directory was not found/,
    )
  })

  it('do not follow links out of the directory', (t) => {
    const link = path.join(integrationDir, 'linked')
    try {
      symlinkSync(outsideDir, link, 'junction')
    } catch {
      t.skip('this system does not allow creating a directory link')
      return
    }
    try {
      refused(['linked/c.integration.test.js'], /outside the integration test directory/)
      assert.deepEqual(resolve([]), [fileA, fileB].sort())
    } finally {
      rmSync(link, { force: true, recursive: true })
    }
  })

  it("find the repository's integration tests, each of which imports the guard first", () => {
    const files = resolveTestTargets([], { integrationDir: INTEGRATION_TEST_DIR })
    assert.ok(files.some((file) => path.basename(file) === 'exerciseSubmission.integration.test.js'))
    for (const file of files) assert.doesNotThrow(() => assertGuardedEntry(file), path.basename(file))
  })
})

describe('integration test runner, before any process starts', () => {
  async function run(options) {
    const { calls, spawnProcess } = fakeSpawn(options.child)
    const errors = []
    const code = await runIntegrationTests({
      cwd: integrationDir,
      integrationDir,
      spawnProcess,
      reportError: (message) => errors.push(message),
      ...options,
    })
    return { code, calls, errors }
  }

  it('refuses a missing DIRECT_URL without starting anything', async () => {
    const { code, calls, errors } = await run({ env: { DATABASE_URL: LOCAL_URL } })
    assert.equal(code, 1)
    assert.equal(calls.length, 0)
    assert.match(errors.join('\n'), /DIRECT_URL must be set explicitly/)
    assertNoSecrets(errors.join('\n'))
  })

  it('refuses Supabase, remote and non-test databases without starting anything', async () => {
    const refusedUrls = [
      `postgresql://${USER}:${PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
      `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`,
      `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia`,
    ]
    for (const url of refusedUrls) {
      const { code, calls, errors } = await run({ env: { DATABASE_URL: LOCAL_URL, DIRECT_URL: url } })
      assert.equal(code, 1)
      assert.equal(calls.length, 0)
      assertNoSecrets(errors.join('\n'))
      assert.ok(!errors.join('\n').includes(url))
    }
  })

  it('refuses a bad target with a safe environment without starting anything', async () => {
    const { code, calls, errors } = await run({ env: SAFE_ENV, argv: ['--import=./evil.js'] })
    assert.equal(code, 1)
    assert.equal(calls.length, 0)
    assert.match(errors.join('\n'), /options are not accepted/)
  })

  it('refuses a test file that does not import the guard first, without starting anything', async () => {
    const unguardedDir = path.join(workspace, 'unguarded')
    mkdirSync(unguardedDir, { recursive: true })
    writeFileSync(path.join(unguardedDir, 'u.integration.test.js'), `import { test } from 'node:test'\n${GUARDED_ENTRY}`)
    const { code, calls, errors } = await run({ env: SAFE_ENV, cwd: unguardedDir, integrationDir: unguardedDir })
    assert.equal(code, 1)
    assert.equal(calls.length, 0)
    assert.match(errors.join('\n'), /u\.integration\.test\.js must import tests\/support\/integrationPreload\.js as its first statement/)
  })

  it('starts exactly one node --test process, without a shell, with the checked values and the guard preloaded', async () => {
    const env = { ...SAFE_ENV, NODE_OPTIONS: '--require ./evil.cjs', NODE_TEST_CONTEXT: 'child-v8', NODE_ENV: 'production', KEEP: 'yes' }
    const { code, calls, errors } = await run({ env, argv: ['a.integration.test.js'] })
    assert.equal(code, 0)
    assert.deepEqual(errors, [])
    assert.equal(calls.length, 1)

    const [{ command, args, options }] = calls
    assert.equal(command, process.execPath)
    assert.deepEqual(args, ['--import', pathToFileURL(PRELOAD_PATH).href, '--test', '--test-concurrency=1', fileA])
    assert.equal(options.shell, false)
    assert.equal(options.env.DATABASE_URL, LOCAL_URL)
    assert.equal(options.env.DIRECT_URL, LOCAL_URL)
    assert.equal(options.env.NODE_ENV, 'test')
    assert.equal(options.env.KEEP, 'yes')
    assert.ok(!('NODE_OPTIONS' in options.env))
    assert.ok(!('NODE_TEST_CONTEXT' in options.env))
  })

  it('switches Neo4j off and gives the tests a new JWT secret, whatever the parent environment holds', async () => {
    const env = {
      ...SAFE_ENV,
      ...PARENT_NEO4J,
      JWT_SECRET: PARENT_JWT_SECRET,
      neo4j_uri: PARENT_NEO4J.NEO4J_URI,
      Jwt_Secret: PARENT_JWT_SECRET,
      database_url: 'postgresql://other_user:other@db.example.com:5432/postgres',
      node_env: 'production',
    }
    const first = await run({ env })
    const second = await run({ env })
    assert.equal(first.code, 0)
    assert.deepEqual(first.errors, [])
    assertNoSecrets(first.errors.join('\n'))

    const childEnv = first.calls[0].options.env
    for (const name of ['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD']) assert.equal(childEnv[name], '', name)
    assert.match(childEnv.JWT_SECRET, /^[A-Za-z0-9_-]{64}$/)
    assert.notEqual(childEnv.JWT_SECRET, PARENT_JWT_SECRET)
    assert.notEqual(childEnv.JWT_SECRET, second.calls[0].options.env.JWT_SECRET, 'the JWT secret is not new for each run')

    // Exactly one spelling of each replaced variable reaches the child: the one set by the runner.
    for (const name of ['NEO4J_URI', 'JWT_SECRET', 'DATABASE_URL', 'NODE_ENV']) {
      const spellings = Object.keys(childEnv).filter((key) => key.toUpperCase() === name)
      assert.deepEqual(spellings, [name])
    }
    assert.equal(childEnv.DATABASE_URL, LOCAL_URL)
    assert.equal(childEnv.NODE_ENV, 'test')
  })

  it('removes every inherited PG* variable but PGPASSWORD and PGPASSFILE, leaving the checked URLs as they are', async () => {
    const env = { ...SAFE_ENV, ...PARENT_PG, pgPort: '7654', pgservice: 'synthetic-other-service', PGPASSWORD: PG_PASSWORD, pgPassFile: PG_PASSFILE }
    const { code, calls, errors } = await run({ env })
    assert.equal(code, 0)
    assert.deepEqual(errors, [])
    const childEnv = calls[0].options.env
    assert.deepEqual(pgNames(childEnv), ['PGPASSFILE', 'PGPASSWORD'])
    assert.equal(childEnv.PGPASSWORD, PG_PASSWORD)
    assert.equal(childEnv.PGPASSFILE, PG_PASSFILE)
    assert.equal(childEnv.DATABASE_URL, LOCAL_URL)
    assert.equal(childEnv.DIRECT_URL, LOCAL_URL)
  })

  it('passes no PG* variable at all when none is permitted, and never alters the URLs', async () => {
    const { calls } = await run({ env: { ...SAFE_ENV, ...PARENT_PG } })
    assert.deepEqual(pgNames(calls[0].options.env), [])
    assert.equal(calls[0].options.env.DATABASE_URL, LOCAL_URL)
    assert.equal(calls[0].options.env.DIRECT_URL, LOCAL_URL)
  })

  it('refuses PGPASSWORD set under two spellings without starting anything or revealing either', async () => {
    const { code, calls, errors } = await run({ env: { ...SAFE_ENV, PGPASSWORD: PG_PASSWORD, PgPassword: PG_PASSFILE } })
    assert.equal(code, 1)
    assert.equal(calls.length, 0)
    assert.match(errors.join('\n'), /Refusing to use the PostgreSQL environment: PGPASSWORD is set more than once/)
    assertNoSecrets(errors.join('\n'))
  })

  it("reports the child's failure, a signal and a start error as failures", async () => {
    assert.equal((await run({ env: SAFE_ENV, child: { exitCode: 3 } })).code, 3)
    assert.equal((await run({ env: SAFE_ENV, child: { exitCode: null, signal: 'SIGTERM' } })).code, 1)
    const failed = await run({ env: SAFE_ENV, child: { error: new Error('spawn failed') } })
    assert.equal(failed.code, 1)
    assert.match(failed.errors.join('\n'), /could not be started/)
  })
})

describe('integration test runner, with a real child process', () => {
  let markerDir
  let markerFile

  before(() => {
    markerDir = path.join(workspace, 'child')
    mkdirSync(markerDir)
    markerFile = path.join(workspace, 'marker.json')
    writeFileSync(
      path.join(markerDir, 'marker.integration.test.js'),
      `${GUARDED_ENTRY}import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { test } from 'node:test'
const sha256 = (value) => (value === undefined ? null : createHash('sha256').update(value).digest('hex'))
test('records what the test process received', () => {
  writeFileSync(process.env.SELVIA_RUNNER_MARKER, JSON.stringify({
    preloadChecked: globalThis[Symbol.for('selvia.testDatabaseChecked')] === true,
    databaseUrl: sha256(process.env.DATABASE_URL),
    directUrl: sha256(process.env.DIRECT_URL),
    nodeOptions: process.env.NODE_OPTIONS ?? null,
    nodeEnv: process.env.NODE_ENV,
    neo4j: [process.env.NEO4J_URI, process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD],
    jwtSecretLength: process.env.JWT_SECRET?.length ?? null,
    jwtSecret: sha256(process.env.JWT_SECRET),
    pgVariables: Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('PG')).sort(),
    pgPassword: sha256(process.env.PGPASSWORD),
  }))
})
`,
    )
  })

  // This process's own environment, without its PG* variables, so that the expected result does not depend on the
  // developer's shell; the synthetic ones are added on top.
  const inherited = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('PG')))
  const runChild = (env) =>
    runIntegrationTests({
      env: { ...inherited(), SELVIA_RUNNER_MARKER: markerFile, ...PARENT_NEO4J, JWT_SECRET: PARENT_JWT_SECRET, ...PARENT_PG, ...env },
      cwd: markerDir,
      integrationDir: markerDir,
      stdio: 'ignore',
      reportError: () => {},
    })

  it('runs the test file with the guard preloaded and the checked values', { timeout: 60_000 }, async () => {
    rmSync(markerFile, { force: true })
    const code = await runChild({ ...SAFE_ENV, NODE_OPTIONS: '--no-deprecation', PGPASSWORD: PG_PASSWORD })
    assert.equal(code, 0)
    const { jwtSecret, ...marker } = JSON.parse(readFileSync(markerFile, 'utf8'))
    assert.deepEqual(marker, {
      preloadChecked: true,
      databaseUrl: sha256(LOCAL_URL),
      directUrl: sha256(LOCAL_URL),
      nodeOptions: null,
      nodeEnv: 'test',
      neo4j: ['', '', ''],
      jwtSecretLength: 64,
      pgVariables: ['PGPASSWORD'],
      pgPassword: sha256(PG_PASSWORD),
    })
    assert.notEqual(jwtSecret, sha256(PARENT_JWT_SECRET))
  })

  it('never reaches the test file when the check fails', { timeout: 60_000 }, async () => {
    rmSync(markerFile, { force: true })
    const code = await runChild({ DATABASE_URL: LOCAL_URL, DIRECT_URL: undefined })
    assert.equal(code, 1)
    assert.equal(existsSync(markerFile), false)
  })
})

describe('integration preload', () => {
  const runWithPreload = (env) =>
    spawnSync(
      process.execPath,
      ['--import', pathToFileURL(PRELOAD_PATH).href, '--input-type=module', '-e', "process.stdout.write('reached')"],
      { env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...env }, encoding: 'utf8', shell: false, timeout: 30_000 },
    )

  it('lets the process continue when the variables are safe', () => {
    const result = runWithPreload({ ...SAFE_ENV, ...createIsolatedTestEnv() })
    assert.equal(result.status, 0)
    assert.equal(result.stdout, 'reached')
  })

  it('exits before any other code runs when they are not, without revealing them', () => {
    const remote = `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`
    for (const env of [{ DATABASE_URL: LOCAL_URL }, { DATABASE_URL: LOCAL_URL, DIRECT_URL: remote }]) {
      const result = runWithPreload({ ...env, ...createIsolatedTestEnv() })
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /Refusing to use a database for tests/)
      assertNoSecrets(result.stderr)
      assert.ok(!result.stderr.includes(remote))
    }
  })

  it('exits before any other code runs when Neo4j or the JWT secret are not isolated, without revealing them', () => {
    const isolated = createIsolatedTestEnv()
    const cases = [
      [{}, /NEO4J_URI must be set to an empty string/],
      [{ ...isolated, ...PARENT_NEO4J }, /NEO4J_URI must be set to an empty string/],
      [{ ...isolated, NEO4J_PASSWORD: PARENT_NEO4J.NEO4J_PASSWORD }, /NEO4J_PASSWORD must be set to an empty string/],
      [{ ...isolated, JWT_SECRET: undefined }, /JWT_SECRET must be a generated test secret/],
      [{ ...isolated, JWT_SECRET: 'change-this-in-production' }, /JWT_SECRET must be a generated test secret/],
    ]
    for (const [env, pattern] of cases) {
      const result = runWithPreload({ ...SAFE_ENV, ...env })
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, pattern)
      assertNoSecrets(result.stderr)
    }
  })

  // A test file started without the runner gets whatever PG* variables the shell holds; the preload refuses them.
  it('exits before any other code runs when a PG* variable could redirect the connection, without revealing it', () => {
    const cases = [
      [{ PGPORT: PARENT_PG.PGPORT }, /PGPORT is set/],
      [{ pgHost: PARENT_PG.PGHOST }, /PGHOST is set/],
      [{ PgService: PARENT_PG.PGSERVICE }, /PGSERVICE is set/],
    ]
    // Windows passes a process only one spelling of a name, so two spellings can only reach it elsewhere.
    if (process.platform !== 'win32') {
      cases.push([{ PGPASSWORD: PG_PASSWORD, pgPassword: PG_PASSFILE }, /PGPASSWORD is set more than once/])
    }
    for (const [env, pattern] of cases) {
      const result = runWithPreload({ ...SAFE_ENV, ...createIsolatedTestEnv(), ...env })
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /^Refusing to use the PostgreSQL environment: /)
      assert.match(result.stderr, pattern)
      assertNoSecrets(result.stderr)
    }
  })

  it('lets the process continue with PGPASSWORD and PGPASSFILE', () => {
    const result = runWithPreload({ ...SAFE_ENV, ...createIsolatedTestEnv(), PGPASSWORD: PG_PASSWORD, PGPASSFILE: PG_PASSFILE })
    assert.equal(result.status, 0)
    assert.equal(result.stdout, 'reached')
  })

  it('makes checkedTestDatabase.assertUnchanged() fail when a PG* variable appears or PGPASSWORD changes later', () => {
    const script = `const { checkedTestDatabase } = await import(${JSON.stringify(pathToFileURL(PRELOAD_PATH).href)})
const outcome = (change) => { change(); try { checkedTestDatabase.assertUnchanged(); return 'unchanged' } catch (err) { return err.message } }
const results = [outcome(() => {})]
results.push(outcome(() => { process.env.PGHOST = 'db.example.com' }))
delete process.env.PGHOST
results.push(outcome(() => { process.env.PGPASSWORD = 'changed' }))
process.stdout.write(JSON.stringify(results))
`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...SAFE_ENV, ...createIsolatedTestEnv(), PGPASSWORD: PG_PASSWORD },
      encoding: 'utf8',
      shell: false,
      timeout: 30_000,
    })
    assert.equal(result.status, 0, result.stderr)
    const [unchanged, appeared, changed] = JSON.parse(result.stdout)
    assert.equal(unchanged, 'unchanged')
    assert.match(appeared, /PGHOST appeared after the check/)
    assert.match(changed, /PGPASSWORD changed after it was checked/)
    assertNoSecrets(result.stdout)
  })
})
