// Read-only identity check of the integration-test database (scripts/verify-test-database.js). It runs after the URL
// guard has accepted DATABASE_URL and DIRECT_URL, connects with each checked URL, and inside a read-only transaction
// reads catalog facts that show whether the database was set up as a disposable test database: its name, server
// version, a least-privilege owning role, the marker comment, no Supabase fingerprints, and either an empty public
// schema (before migration) or exactly the application's tables and migrations (after migration).
//
// It cannot show what is behind localhost: a port forward or tunnel to another server passes if that server is set
// up the same way. The database must be established as disposable independently; see tests/integration/README.md.
//
// Deliberately free of imports from src/ and of Prisma. `pg` is loaded only when a real client is created.
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPostgresEnvironment, PostgresEnvironmentError } from './postgresEnvironment.js'
import { assertSafeTestDatabaseEnv, TEST_DATABASE_VARIABLES, TestDatabaseGuardError } from './testDatabaseGuard.js'

export const VERIFY_MODES = Object.freeze({ PRE_MIGRATION: 'pre-migration', POST_MIGRATION: 'post-migration' })
export const DISPOSABLE_DATABASE_MARKER = 'selvia:disposable-integration-test'
export const MIN_SERVER_VERSION_NUM = 150000
export const PRISMA_MIGRATIONS_TABLE = '_prisma_migrations'
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url))

// The tables created by prisma/migrations (all in 20261003141142_init; later migrations create or drop none), which
// are the @@map names of the models in prisma/schema.prisma. tests/testDatabaseIdentity.test.js keeps this in step
// with both.
export const EXPECTED_APPLICATION_TABLES = Object.freeze([
  'assessment_attempts',
  'assessment_questions',
  'assessment_results',
  'assessments',
  'concepts',
  'content_sources',
  'course_enrollments',
  'courses',
  'examples',
  'exercises',
  'learning_activities',
  'learning_materials',
  'lecturers',
  'lessons',
  'modules',
  'questions',
  'student_answers',
  'student_evidence',
  'students',
  'topics',
  'users',
])

export const SUPABASE_ROLES = Object.freeze([
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
  'supabase_realtime_admin',
  'supabase_replication_admin',
  'authenticator',
  'service_role',
])
export const SUPABASE_SCHEMAS = Object.freeze([
  'auth',
  'storage',
  'realtime',
  'supabase_functions',
  'supabase_migrations',
  'graphql',
  'graphql_public',
  'vault',
  'extensions',
])

// Every statement the checker sends. Nothing else is ever sent: no DDL, no DML, no COMMIT.
export const BEGIN_READ_ONLY_SQL = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'
export const ROLLBACK_SQL = 'ROLLBACK'

export const IDENTITY_SQL = `SELECT
  pg_catalog.current_database()::text AS database,
  pg_catalog.current_setting('server_version_num')::int AS server_version_num,
  pg_catalog.current_setting('transaction_read_only') AS transaction_read_only,
  pg_catalog.current_setting('statement_timeout') AS statement_timeout,
  r.rolsuper AS superuser,
  r.rolcreatedb AS create_database,
  r.rolcreaterole AS create_role,
  r.rolreplication AS replication,
  r.rolbypassrls AS bypass_rls,
  d.datdba = r.oid AS owns_database,
  pg_catalog.shobj_description(d.oid, 'pg_database') AS marker,
  d.oid::text AS database_oid,
  pg_catalog.pg_postmaster_start_time()::text AS server_started_at,
  pg_catalog.inet_server_addr()::text AS server_address,
  pg_catalog.inet_server_port() AS server_port,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_roles g
    WHERE g.oid <> r.oid
      AND pg_catalog.pg_has_role(r.oid, g.oid, 'MEMBER')
      AND (g.rolsuper OR g.rolcreatedb OR g.rolcreaterole OR g.rolreplication OR g.rolbypassrls
        OR g.rolname::text IN ('pg_execute_server_program', 'pg_read_server_files', 'pg_write_server_files',
          'pg_read_all_data', 'pg_write_all_data'))
  )::int AS privileged_memberships
FROM pg_catalog.pg_roles r
JOIN pg_catalog.pg_database d ON d.datname = pg_catalog.current_database()
WHERE r.rolname = CURRENT_USER`

export const FINGERPRINT_SQL = `SELECT
  ARRAY(SELECT rolname::text FROM pg_catalog.pg_roles WHERE rolname::text = ANY ($1::text[]) ORDER BY 1) AS supabase_roles,
  ARRAY(SELECT nspname::text FROM pg_catalog.pg_namespace WHERE nspname::text = ANY ($2::text[]) ORDER BY 1) AS supabase_schemas`

export const CONTENTS_SQL = `SELECT
  ARRAY(SELECT n.nspname::text FROM pg_catalog.pg_namespace n
    WHERE n.nspname::text NOT IN ('public', 'pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname::text !~ '^pg_(toast_)?temp_[0-9]+$'
    ORDER BY 1) AS other_schemas,
  ARRAY(SELECT c.relname::text FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ORDER BY 1) AS public_tables,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public')::int AS public_relations,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')::int AS public_functions,
  (SELECT pg_catalog.count(*) FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public')::int AS public_types`

export const MIGRATIONS_SQL = `SELECT migration_name::text AS name,
  finished_at IS NOT NULL AS finished,
  rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations
ORDER BY migration_name`

export class TestDatabaseIdentityError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TestDatabaseIdentityError'
  }
}

const refuse = (message) => new TestDatabaseIdentityError(`Refusing to verify the test database: ${message}`)

export function parseVerifyMode(argv) {
  const modes = { '--pre-migration': VERIFY_MODES.PRE_MIGRATION, '--post-migration': VERIFY_MODES.POST_MIGRATION }
  if (argv.length !== 1 || !Object.hasOwn(modes, argv[0])) {
    throw refuse('give exactly one of --pre-migration or --post-migration.')
  }
  return modes[argv[0]]
}

// The migration folders in prisma/migrations, by name.
export function listMigrationNames(migrationsDir = MIGRATIONS_DIR) {
  let names
  try {
    names = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && statSync(path.join(migrationsDir, entry.name, 'migration.sql'), { throwIfNoEntry: false })?.isFile())
      .map((entry) => entry.name)
      .sort()
  } catch {
    throw refuse('the migrations folder could not be read.')
  }
  if (names.length === 0) throw refuse('no migrations were found.')
  return names
}

// Client settings: the checked URL and nothing from the environment that could redirect it (PG* variables other than
// PGPASSWORD and PGPASSFILE are refused beforehand, by postgresEnvironment.js). Every transaction is read-only by default as well as explicitly, and every wait is bounded.
export function clientConfig(url) {
  return {
    connectionString: url,
    application_name: 'selvia-test-db-verify',
    options: '-c default_transaction_read_only=on -c search_path=pg_catalog',
    connectionTimeoutMillis: 5_000,
    statement_timeout: 5_000,
    lock_timeout: 2_000,
    idle_in_transaction_session_timeout: 10_000,
    query_timeout: 10_000,
    keepAlive: false,
  }
}

export async function createPgClient(config) {
  const { default: pg } = await import('pg')
  return new pg.Client(config)
}

// Names from the server are printed only when they look like plain identifiers.
const printable = (name) => (typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(name) ? name : '(unprintable name)')
const listOf = (names) => names.map(printable).join(', ')
const count = (value) => (value === null || value === undefined || value === '' ? NaN : Number(value))

// The decision, from the facts read from the server: [{ check, ok, detail }]. Pure, so that it can be tested without
// a database. Anything missing or of the wrong kind fails.
export function evaluateIdentity(facts, { database, mode, expectedMigrations = [] }) {
  const results = []
  const add = (check, ok, detail) => results.push({ check, ok: ok === true, detail })
  const f = facts ?? {}

  add('read-only transaction', f.transaction_read_only === 'on', f.transaction_read_only === 'on' ? 'active' : 'not active')
  add(
    'statement timeout',
    typeof f.statement_timeout === 'string' && f.statement_timeout !== '0',
    typeof f.statement_timeout === 'string' && f.statement_timeout !== '0' ? 'active' : 'not active',
  )
  add('database name', f.database === database, f.database === database ? `"${database}"` : `not "${database}"`)

  const version = count(f.server_version_num)
  add(
    'server version',
    Number.isInteger(version) && version >= MIN_SERVER_VERSION_NUM,
    Number.isInteger(version) ? `PostgreSQL ${Math.floor(version / 10_000)} (15 or later required)` : 'unknown',
  )

  const attributes = [
    ['superuser', 'SUPERUSER'],
    ['create_database', 'CREATEDB'],
    ['create_role', 'CREATEROLE'],
    ['replication', 'REPLICATION'],
    ['bypass_rls', 'BYPASSRLS'],
  ]
  const unknownAttributes = attributes.filter(([key]) => typeof f[key] !== 'boolean')
  const grantedAttributes = attributes.filter(([key]) => f[key] === true).map(([, label]) => label)
  add(
    'role attributes',
    unknownAttributes.length === 0 && grantedAttributes.length === 0,
    unknownAttributes.length > 0 ? 'unknown' : grantedAttributes.length > 0 ? `has ${grantedAttributes.join(', ')}` : 'none of SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS',
  )
  const memberships = count(f.privileged_memberships)
  add(
    'role memberships',
    memberships === 0,
    memberships === 0 ? 'no privileged roles' : Number.isInteger(memberships) ? `member of ${memberships} privileged role(s)` : 'unknown',
  )
  add('database owner', f.owns_database === true, f.owns_database === true ? 'the connected role' : 'not the connected role')
  add(
    'marker comment',
    f.marker === DISPOSABLE_DATABASE_MARKER,
    f.marker === DISPOSABLE_DATABASE_MARKER ? `"${DISPOSABLE_DATABASE_MARKER}"` : `missing or not "${DISPOSABLE_DATABASE_MARKER}"`,
  )

  const supabaseRoles = Array.isArray(f.supabase_roles) ? f.supabase_roles : null
  const supabaseSchemas = Array.isArray(f.supabase_schemas) ? f.supabase_schemas : null
  const fingerprints = [...(supabaseRoles ?? []).map((n) => `role ${printable(n)}`), ...(supabaseSchemas ?? []).map((n) => `schema ${printable(n)}`)]
  add(
    'Supabase fingerprints',
    supabaseRoles !== null && supabaseSchemas !== null && fingerprints.length === 0,
    supabaseRoles === null || supabaseSchemas === null ? 'unknown' : fingerprints.length > 0 ? `found ${fingerprints.join(', ')}` : 'none',
  )

  const otherSchemas = Array.isArray(f.other_schemas) ? f.other_schemas : null
  add(
    'other schemas',
    otherSchemas !== null && otherSchemas.length === 0,
    otherSchemas === null ? 'unknown' : otherSchemas.length > 0 ? `found ${listOf(otherSchemas)}` : 'none besides public',
  )

  const tables = Array.isArray(f.public_tables) ? f.public_tables : null
  if (mode === VERIFY_MODES.PRE_MIGRATION) {
    const objects = [count(f.public_relations), count(f.public_functions), count(f.public_types)]
    const empty = tables !== null && tables.length === 0 && objects.every((n) => n === 0)
    add(
      'public schema empty',
      empty,
      empty ? 'no tables, other relations, functions or types' : objects.some(Number.isNaN) || tables === null ? 'unknown' : `holds ${objects[0]} relation(s), ${objects[1]} function(s), ${objects[2]} type(s)`,
    )
  } else if (mode === VERIFY_MODES.POST_MIGRATION) {
    const expected = [...EXPECTED_APPLICATION_TABLES, PRISMA_MIGRATIONS_TABLE]
    const missing = tables === null ? expected : expected.filter((name) => !tables.includes(name))
    const unexpected = tables === null ? [] : tables.filter((name) => !expected.includes(name))
    add(
      'application tables',
      tables !== null && missing.length === 0 && unexpected.length === 0,
      tables === null
        ? 'unknown'
        : [missing.length > 0 && `missing ${listOf(missing)}`, unexpected.length > 0 && `unexpected ${listOf(unexpected)}`].filter(Boolean).join('; ') ||
            `exactly the ${EXPECTED_APPLICATION_TABLES.length} application tables and ${PRISMA_MIGRATIONS_TABLE}`,
    )

    const rows = Array.isArray(f.migrations) ? f.migrations : null
    const applied = new Set((rows ?? []).filter((row) => row.finished === true && row.rolled_back !== true).map((row) => row.name))
    const unfinished = (rows ?? []).filter((row) => row.finished !== true && row.rolled_back !== true).length
    const missingMigrations = expectedMigrations.filter((name) => !applied.has(name))
    const unknownMigrations = [...applied].filter((name) => !expectedMigrations.includes(name))
    add(
      'applied migrations',
      rows !== null && expectedMigrations.length > 0 && missingMigrations.length === 0 && unknownMigrations.length === 0 && unfinished === 0,
      rows === null
        ? `${PRISMA_MIGRATIONS_TABLE} could not be read`
        : [
            missingMigrations.length > 0 && `not applied ${listOf(missingMigrations)}`,
            unknownMigrations.length > 0 && `unknown ${listOf(unknownMigrations)}`,
            unfinished > 0 && `${unfinished} unfinished`,
          ]
            .filter(Boolean)
            .join('; ') || `all ${expectedMigrations.length} in prisma/migrations`,
    )
  } else {
    add('mode', false, 'unknown')
  }
  return results
}

// A driver error becomes a message naming only the step and, when it is a plain code (SQLSTATE or errno), the code.
function failedStep(label, err) {
  const code = typeof err?.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(err.code) ? ` (${err.code})` : ''
  return new TestDatabaseIdentityError(`Could not verify the test database: ${label} failed${code}.`)
}

async function step(label, action) {
  try {
    return await action()
  } catch (err) {
    throw failedStep(label, err)
  }
}

// Connects with `url`, reads the facts inside a read-only transaction, and always rolls back and closes the client.
export async function collectFacts({ url, label, mode, createClient }) {
  const client = await step(`creating the client for ${label}`, () => createClient(clientConfig(url)))
  // pg reports a broken connection as an 'error' event; unhandled, it would end the process with the raw error.
  client.on?.('error', () => {})
  let connected = false
  try {
    await step(`connecting with ${label}`, () => client.connect())
    connected = true
    await step('starting a read-only transaction', () => client.query(BEGIN_READ_ONLY_SQL))
    const identity = await step('reading the role and database', () => client.query(IDENTITY_SQL))
    const fingerprints = await step('looking for Supabase', () => client.query(FINGERPRINT_SQL, [SUPABASE_ROLES, SUPABASE_SCHEMAS]))
    const contents = await step('listing schemas and tables', () => client.query(CONTENTS_SQL))
    const facts = { ...identity?.rows?.[0], ...fingerprints?.rows?.[0], ...contents?.rows?.[0], migrations: null }
    if (mode === VERIFY_MODES.POST_MIGRATION && Array.isArray(facts.public_tables) && facts.public_tables.includes(PRISMA_MIGRATIONS_TABLE)) {
      facts.migrations = (await step(`reading ${PRISMA_MIGRATIONS_TABLE}`, () => client.query(MIGRATIONS_SQL)))?.rows ?? null
    }
    return facts
  } finally {
    if (connected) {
      try {
        await client.query(ROLLBACK_SQL)
      } catch {
        // Closing the connection below ends the transaction on the server anyway.
      }
    }
    try {
      await client.end()
    } catch {
      // Nothing more can be done; the process exits afterwards.
    }
  }
}

// Each distinct checked URL: one connection when both variables hold the same value, otherwise one for each, since
// the application (DATABASE_URL) and migrations (DIRECT_URL) may connect as different roles.
export function connectionsToVerify(databaseEnv) {
  return databaseEnv.DATABASE_URL === databaseEnv.DIRECT_URL
    ? [{ label: 'DATABASE_URL and DIRECT_URL', url: databaseEnv.DATABASE_URL }]
    : TEST_DATABASE_VARIABLES.map((name) => ({ label: name, url: databaseEnv[name] }))
}

const safeMessage = (err) =>
  err instanceof TestDatabaseGuardError || err instanceof TestDatabaseIdentityError || err instanceof PostgresEnvironmentError
    ? err.message
    : 'Could not verify the test database: the check failed.'

// Resolves to the exit code: 0 only when every check passed for every connection. `argv` is the mode flag. The other
// options exist for the checker's own tests.
export async function runTestDatabaseVerification({
  argv = [],
  env = process.env,
  createClient = createPgClient,
  migrationsDir = MIGRATIONS_DIR,
  report = (line) => console.log(line),
  reportError = (message) => console.error(message),
} = {}) {
  let mode
  let target
  let connections
  let expectedMigrations = []
  try {
    mode = parseVerifyMode(argv)
    // Read once, so that what is checked is exactly what is connected to.
    const databaseEnv = Object.fromEntries(TEST_DATABASE_VARIABLES.map((name) => [name, env[name]]))
    target = assertSafeTestDatabaseEnv(databaseEnv)
    assertPostgresEnvironment(env)
    if (mode === VERIFY_MODES.POST_MIGRATION) expectedMigrations = listMigrationNames(migrationsDir)
    connections = connectionsToVerify(databaseEnv)
  } catch (err) {
    reportError(safeMessage(err))
    return 1
  }

  report(`Verifying test database "${target.database}" on ${target.host}:${target.port} (${mode}, read-only).`)
  let passed = true
  for (const { label, url } of connections) {
    let results
    try {
      const facts = await collectFacts({ url, label, mode, createClient })
      results = evaluateIdentity(facts, { database: target.database, mode, expectedMigrations })
    } catch (err) {
      reportError(safeMessage(err))
      passed = false
      break
    }
    report(`${label}:`)
    for (const { check, ok, detail } of results) report(`  ${ok ? 'pass' : 'FAIL'}  ${check}: ${detail}`)
    if (results.some((result) => !result.ok)) passed = false
  }

  if (!passed) {
    reportError('Test database verification failed. Do not run migrations or integration tests against this database.')
    return 1
  }
  report(
    `Test database verification passed (${mode}). This does not prove that the server behind ${target.host}:${target.port} ` +
      'is local and isolated; only use a database you set up for testing.',
  )
  return 0
}
