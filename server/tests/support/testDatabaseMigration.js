// Guarded migration of the integration-test database (scripts/migrate-test-database.js, npm run test:db:migrate).
// Order matters, and every refusal happens before the step after it:
//   1. no arguments; the environment is read once and only that snapshot is used afterwards;
//   2. the URL guard, explicit credentials in both URLs, the PG* policy, and no Prisma debug, engine or telemetry
//      overrides; the migration folders and the local Prisma CLI are found, and the child environment is built;
//   3. the identity check (testDatabaseIdentity.js), read-only, with the exact checked URLs: an empty disposable
//      database is migrated, a fully migrated one is left alone, anything else is refused;
//   4. `prisma migrate deploy --config prisma.test.config.js`, started with process.execPath, without a shell, with an
//      environment built from scratch, its output passed on with credentials removed;
//   5. after Prisma succeeds, the identity check again: the same database must now hold exactly the migrations.
// Nothing is retried, repaired, reset or removed. It never loads server/.env.
//
// Deliberately free of imports from src/ and of Prisma. `pg` is loaded only when a real client is created.
import { spawn } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPostgresEnvironment, PostgresEnvironmentError } from './postgresEnvironment.js'
import { assertSafeTestDatabaseEnv, TEST_DATABASE_VARIABLES, TestDatabaseGuardError } from './testDatabaseGuard.js'
import {
  collectFacts,
  connectionsToVerify,
  createPgClient,
  evaluateIdentity,
  listMigrationNames,
  MIGRATIONS_DIR,
  TestDatabaseIdentityError,
  VERIFY_MODES,
} from './testDatabaseIdentity.js'

const SERVER_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const TEST_PRISMA_CONFIG_PATH = path.join(SERVER_ROOT, 'prisma.test.config.js')

// Refused when set: Prisma's debug output prints the configuration, URL included; the first two replace the
// migration engine with another program; the last sends the CLI's update check somewhere else.
export const REFUSED_PRISMA_VARIABLES = Object.freeze([
  'DEBUG',
  'PRISMA_SCHEMA_ENGINE_BINARY',
  'PRISMA_MIGRATION_ENGINE_BINARY',
  'PRISMA_TELEMETRY_ENDPOINT',
])

// What Node and the Prisma CLI need from the platform to start. Nothing else is inherited.
export const RUNTIME_VARIABLES = Object.freeze(['PATH', 'SystemRoot', 'SystemDrive', 'windir', 'TEMP', 'TMP', 'TMPDIR'])

export const MIGRATION_STATES = Object.freeze({ EMPTY: 'empty', MIGRATED: 'migrated', UNEXPECTED: 'unexpected', REFUSED: 'refused' })

const SERVER_IDENTITY_KEYS = ['database_oid', 'server_started_at', 'server_address', 'server_port']

export class TestDatabaseMigrationError extends Error {
  constructor(message) {
    super(`Refusing to migrate the test database: ${message}`)
    this.name = 'TestDatabaseMigrationError'
  }
}

// Variables are looked up by name in any letter case: Windows names are case-insensitive.
const namesLike = (env, name) => Object.keys(env).filter((key) => key.toUpperCase() === name.toUpperCase())

function assertNoArguments(argv) {
  if (argv.length > 0) {
    throw new TestDatabaseMigrationError('it takes no arguments; set DATABASE_URL and DIRECT_URL in the terminal instead.')
  }
}

function assertNoRefusedPrismaVariables(env) {
  for (const name of REFUSED_PRISMA_VARIABLES) {
    if (namesLike(env, name).some((key) => env[key] !== undefined && env[key] !== '')) {
      throw new TestDatabaseMigrationError(`${name} is set; unset it before migrating the test database.`)
    }
  }
}

// The identity check connects with pg and the migration with Prisma's engine. With the user, password and port in
// the URL, neither falls back to anything else (PG* variables, a password file, the operating-system user name or
// a default port), so both connect as the same role to the same address.
function assertExplicitCredentials(databaseEnv) {
  for (const name of TEST_DATABASE_VARIABLES) {
    const url = new URL(databaseEnv[name])
    if (url.username === '' || url.password === '' || url.port === '') {
      throw new TestDatabaseMigrationError(
        `${name} must include the user name, password and port, so that the identity check and Prisma connect the same way.`,
      )
    }
  }
}

// The Prisma CLI installed for this server, as its own package declares it. Nothing from the environment can
// choose another program.
export function resolvePrismaCli({ serverRoot = SERVER_ROOT } = {}) {
  try {
    const requireFromServer = createRequire(path.join(serverRoot, 'package.json'))
    const packageJson = requireFromServer.resolve('prisma/package.json')
    const { version, bin } = JSON.parse(readFileSync(packageJson, 'utf8'))
    const entry = typeof bin === 'string' ? bin : bin?.prisma
    if (!/^7\./.test(version) || typeof entry !== 'string') throw new Error('unexpected package')
    const cli = realpathSync.native(path.join(path.dirname(packageJson), entry))
    const relative = path.relative(realpathSync.native(path.join(serverRoot, 'node_modules')), cli)
    if (relative.startsWith('..') || path.isAbsolute(relative) || !statSync(cli).isFile()) throw new Error('outside')
    return cli
  } catch {
    throw new TestDatabaseMigrationError('the Prisma 7 CLI installed in server/node_modules could not be found.')
  }
}

// The child's environment, built from nothing: the platform's runtime variables, the checked URLs exactly as they
// were checked, and the update check switched off. No PG*, PRISMA_*, NODE_OPTIONS or application settings, and no
// PGPASSWORD or PGPASSFILE either, which are not needed since both URLs carry the password.
export function migrationEnvironment(snapshot, databaseEnv) {
  const childEnv = {}
  for (const name of RUNTIME_VARIABLES) {
    const key = Object.hasOwn(snapshot, name) ? name : namesLike(snapshot, name)[0]
    if (key !== undefined && typeof snapshot[key] === 'string' && snapshot[key] !== '') childEnv[name] = snapshot[key]
  }
  return { ...childEnv, DATABASE_URL: databaseEnv.DATABASE_URL, DIRECT_URL: databaseEnv.DIRECT_URL, CHECKPOINT_DISABLE: '1' }
}

function assertMigrationEnvironment(childEnv, databaseEnv) {
  const allowed = new Set([...RUNTIME_VARIABLES, ...TEST_DATABASE_VARIABLES, 'CHECKPOINT_DISABLE'])
  const unexpected = Object.keys(childEnv).find((name) => !allowed.has(name))
  if (unexpected) throw new TestDatabaseMigrationError(`${unexpected} would be passed to Prisma.`)
  for (const name of TEST_DATABASE_VARIABLES) {
    if (childEnv[name] !== databaseEnv[name]) throw new TestDatabaseMigrationError(`${name} would not reach Prisma as checked.`)
  }
  assertPostgresEnvironment(childEnv)
  assertNoRefusedPrismaVariables(childEnv)
}

const serverIdentityOf = (facts) => JSON.stringify(SERVER_IDENTITY_KEYS.map((key) => facts?.[key] ?? null))
const hasServerIdentity = (facts) => typeof facts?.database_oid === 'string' && typeof facts?.server_started_at === 'string'

// Which state the database is in, from facts read by collectFacts: { state, results }. Pure. The identity checks
// (role, marker, Supabase, schemas, ...) must all pass; then an empty public schema is EMPTY, exactly the
// application's tables and migrations is MIGRATED, and anything in between is UNEXPECTED.
export function classifyMigrationState(facts, { database, expectedMigrations }) {
  const pre = evaluateIdentity(facts, { database, mode: VERIFY_MODES.PRE_MIGRATION })
  const post = evaluateIdentity(facts, { database, mode: VERIFY_MODES.POST_MIGRATION, expectedMigrations })
  const empty = pre.find((result) => result.check === 'public schema empty')
  const common = pre.filter((result) => result !== empty)
  const migrated = post.filter((result) => !common.some((other) => other.check === result.check))
  const identity = {
    check: 'server identity',
    ok: hasServerIdentity(facts),
    detail: hasServerIdentity(facts) ? 'read' : 'unknown',
  }

  if (!common.every((result) => result.ok) || !identity.ok) {
    return { state: MIGRATION_STATES.REFUSED, results: [...common, identity, empty, ...migrated] }
  }
  if (empty.ok) return { state: MIGRATION_STATES.EMPTY, results: [...common, identity, empty] }
  if (migrated.every((result) => result.ok)) return { state: MIGRATION_STATES.MIGRATED, results: [...common, identity, ...migrated] }
  return { state: MIGRATION_STATES.UNEXPECTED, results: [...common, identity, empty, ...migrated] }
}

// Removes every credential-bearing value (the URLs, and the user names and passwords in them, raw and decoded) from
// text passed on from Prisma. Longest first, so that a URL is removed whole.
export function createRedactor(databaseEnv) {
  const secrets = new Set()
  for (const name of TEST_DATABASE_VARIABLES) {
    const value = databaseEnv[name]
    secrets.add(value)
    const url = new URL(value)
    for (const part of [url.username, url.password]) {
      secrets.add(part)
      try {
        secrets.add(decodeURIComponent(part))
      } catch {
        // The raw form is removed in any case.
      }
    }
  }
  const ordered = [...secrets].filter((secret) => secret.length > 0).sort((a, b) => b.length - a.length)
  return (text) => ordered.reduce((result, secret) => result.split(secret).join('[redacted]'), text)
}

// Passes a stream on line by line, so that a value split across chunks is still removed.
function passRedacted(stream, redact, write) {
  if (!stream) return () => {}
  let pending = ''
  stream.setEncoding?.('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const end = pending.lastIndexOf('\n')
    if (end === -1) return
    write(redact(pending.slice(0, end + 1)))
    pending = pending.slice(end + 1)
  })
  return () => {
    if (pending) write(redact(pending))
    pending = ''
  }
}

function runPrisma({ spawnProcess, cli, childEnv, redact, writeOut, writeErr }) {
  return new Promise((resolve) => {
    let settled = false
    let flush = []
    const finish = (outcome) => {
      if (settled) return
      settled = true
      for (const done of flush) done()
      resolve(outcome)
    }
    let child
    try {
      child = spawnProcess(process.execPath, [cli, 'migrate', 'deploy', '--config', TEST_PRISMA_CONFIG_PATH], {
        cwd: SERVER_ROOT,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      })
    } catch {
      finish({ started: false })
      return
    }
    flush = [passRedacted(child.stdout, redact, writeOut), passRedacted(child.stderr, redact, writeErr)]
    child.once('error', () => finish({ started: false }))
    child.once('close', (code, signal) => finish({ started: true, code, signal }))
  })
}

const safeMessage = (err) =>
  err instanceof TestDatabaseGuardError ||
  err instanceof PostgresEnvironmentError ||
  err instanceof TestDatabaseIdentityError ||
  err instanceof TestDatabaseMigrationError
    ? err.message
    : 'Refusing to migrate the test database: the safety check failed.'

const MANUAL = 'Nothing was retried, repaired or removed; investigate manually (see tests/integration/README.md).'

// Resolves to the exit code: 0 when the database was migrated and verified, or was already fully migrated; 1
// otherwise, or Prisma's own non-zero code. The options exist for the wrapper's own tests.
export async function runTestDatabaseMigration({
  argv = [],
  env = process.env,
  createClient = createPgClient,
  spawnProcess = spawn,
  migrationsDir = MIGRATIONS_DIR,
  prismaCli = resolvePrismaCli,
  report = (line) => console.log(line),
  reportError = (message) => console.error(message),
  writeOut = (text) => process.stdout.write(text),
  writeErr = (text) => process.stderr.write(text),
} = {}) {
  let target
  let databaseEnv
  let expectedMigrations
  let cli
  let childEnv
  let connections
  try {
    assertNoArguments(argv)
    // Every variable is read exactly once, here; only this snapshot is used afterwards.
    const snapshot = Object.fromEntries(Object.entries(env))
    databaseEnv = Object.fromEntries(TEST_DATABASE_VARIABLES.map((name) => [name, snapshot[name]]))
    target = assertSafeTestDatabaseEnv(databaseEnv)
    assertExplicitCredentials(databaseEnv)
    assertPostgresEnvironment(snapshot)
    assertNoRefusedPrismaVariables(snapshot)
    expectedMigrations = listMigrationNames(migrationsDir)
    cli = prismaCli()
    childEnv = migrationEnvironment(snapshot, databaseEnv)
    assertMigrationEnvironment(childEnv, databaseEnv)
    connections = connectionsToVerify(databaseEnv)
  } catch (err) {
    reportError(safeMessage(err))
    return 1
  }

  const where = `"${target.database}" on ${target.host}:${target.port}`
  const check = async (when) => {
    const checked = []
    for (const { label, url } of connections) {
      const facts = await collectFacts({ url, label, mode: VERIFY_MODES.POST_MIGRATION, createClient })
      const { state, results } = classifyMigrationState(facts, { database: target.database, expectedMigrations })
      report(`${label} (${when}):`)
      for (const { check: name, ok, detail } of results) report(`  ${ok ? 'pass' : 'FAIL'}  ${name}: ${detail}`)
      checked.push({ label, state, identity: serverIdentityOf(facts) })
    }
    return checked
  }

  let before
  try {
    report(`Checking test database ${where} before migrating (read-only).`)
    before = await check('before migrating')
  } catch (err) {
    reportError(safeMessage(err))
    reportError(`Refusing to migrate the test database: it could not be verified. ${MANUAL}`)
    return 1
  }
  const states = new Set(before.map((entry) => entry.state))
  const identities = new Set(before.map((entry) => entry.identity))
  if (identities.size !== 1) {
    reportError(`Refusing to migrate the test database: DATABASE_URL and DIRECT_URL reach different databases. ${MANUAL}`)
    return 1
  }
  if (states.size === 1 && states.has(MIGRATION_STATES.MIGRATED)) {
    report(`Every migration is already applied to ${where} and verified; Prisma was not started.`)
    return 0
  }
  if (states.has(MIGRATION_STATES.REFUSED)) {
    reportError(`Refusing to migrate the test database: it failed the identity checks above. ${MANUAL}`)
    return 1
  }
  if (states.size !== 1 || !states.has(MIGRATION_STATES.EMPTY)) {
    reportError(
      'Refusing to migrate the test database: it is neither empty nor exactly migrated (a partial or unknown state). ' +
        MANUAL,
    )
    return 1
  }

  report(`Running prisma migrate deploy on ${where} with prisma.test.config.js.`)
  const outcome = await runPrisma({ spawnProcess, cli, childEnv, redact: createRedactor(databaseEnv), writeOut, writeErr })
  if (!outcome.started) {
    reportError(`The Prisma CLI could not be started. ${MANUAL}`)
    return 1
  }
  if (outcome.signal || outcome.code !== 0) {
    const how = outcome.signal ? `was stopped by ${outcome.signal}` : `exited with code ${outcome.code}`
    reportError(`prisma migrate deploy ${how}. The database may be partly migrated. ${MANUAL}`)
    return Number.isInteger(outcome.code) && outcome.code > 0 ? outcome.code : 1
  }

  let after
  try {
    report(`Checking test database ${where} after migrating (read-only).`)
    after = await check('after migrating')
  } catch (err) {
    reportError(safeMessage(err))
    reportError(`Prisma reported success, but the database could not be verified afterwards. ${MANUAL}`)
    return 1
  }
  const sameDatabase = after.every((entry, index) => entry.identity === before[index].identity)
  if (!sameDatabase) {
    reportError(`The database checked after migrating is not the one checked before (or its server restarted). ${MANUAL}`)
    return 1
  }
  if (!after.every((entry) => entry.state === MIGRATION_STATES.MIGRATED)) {
    reportError(`Prisma reported success, but the database does not hold exactly the expected migrations. ${MANUAL}`)
    return 1
  }
  report(
    `Test database ${where} migrated and verified. This does not prove that the server behind ${target.host}:${target.port} ` +
      'is local and isolated; only use a database you set up for testing.',
  )
  return 0
}
