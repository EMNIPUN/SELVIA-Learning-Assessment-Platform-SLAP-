// npm run test:db-guard. The read-only test database identity checker (scripts/verify-test-database.js), with
// synthetic catalog facts and a mock PostgreSQL client. Nothing here loads server/.env, imports the application,
// Prisma or pg, or connects to anything: socket connections are made to fail for the whole file, and the command-line
// runs below are refused before a client could be created.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import {
  BEGIN_READ_ONLY_SQL,
  clientConfig,
  CONTENTS_SQL,
  DISPOSABLE_DATABASE_MARKER,
  evaluateIdentity,
  EXPECTED_APPLICATION_TABLES,
  FINGERPRINT_SQL,
  IDENTITY_SQL,
  listMigrationNames,
  MIGRATIONS_DIR,
  MIGRATIONS_SQL,
  PRISMA_MIGRATIONS_TABLE,
  ROLLBACK_SQL,
  runTestDatabaseVerification,
  SUPABASE_ROLES,
  SUPABASE_SCHEMAS,
  VERIFY_MODES,
} from './support/testDatabaseIdentity.js'

const SERVER_ROOT = fileURLToPath(new URL('../', import.meta.url))
const USER = 'identity_user'
const PASSWORD = 'Synthetic-Identity-Secret-52'
const LOCAL_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test`
const MIGRATE_URL = `postgresql://migrate_owner:Synthetic-Owner-Secret-90@localhost:5432/selvia_test`
const REMOTE_URL = `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`
const SUPABASE_URL = `postgresql://${USER}:${PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
const RAW_ERROR = `password authentication failed for user "${USER}" at ${LOCAL_URL}`
const SECRETS = [USER, PASSWORD, LOCAL_URL, MIGRATE_URL, 'migrate_owner', 'Synthetic-Owner-Secret-90', REMOTE_URL, SUPABASE_URL, RAW_ERROR]
const SAFE_ENV = { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL }

const MIGRATION_NAMES = listMigrationNames()
const IDENTITY = {
  database: 'selvia_test',
  server_version_num: 180006,
  transaction_read_only: 'on',
  statement_timeout: '5s',
  superuser: false,
  create_database: false,
  create_role: false,
  replication: false,
  bypass_rls: false,
  owns_database: true,
  marker: DISPOSABLE_DATABASE_MARKER,
  privileged_memberships: 0,
}
const FINGERPRINTS = { supabase_roles: [], supabase_schemas: [] }
const EMPTY = { other_schemas: [], public_tables: [], public_relations: 0, public_functions: 0, public_types: 0 }
const MIGRATED = {
  other_schemas: [],
  public_tables: [...EXPECTED_APPLICATION_TABLES, PRISMA_MIGRATIONS_TABLE].sort(),
  public_relations: 140,
  public_functions: 2,
  public_types: 60,
}
const APPLIED = MIGRATION_NAMES.map((name) => ({ name, finished: true, rolled_back: false }))
const PRE_FACTS = { ...IDENTITY, ...FINGERPRINTS, ...EMPTY, migrations: null }
const POST_FACTS = { ...IDENTITY, ...FINGERPRINTS, ...MIGRATED, migrations: APPLIED }

function assertNoSecrets(text) {
  for (const secret of SECRETS) assert.ok(!text.includes(secret), 'output contains a secret or a raw driver error')
}

const driverError = (code) => Object.assign(new Error(RAW_ERROR), { code, detail: RAW_ERROR })

// A mock pg: records every client it creates and every statement sent; `fail` maps 'connect', 'end' or a statement to
// the error it throws.
function mockDatabase({ identity = IDENTITY, fingerprints = FINGERPRINTS, contents = EMPTY, migrations = APPLIED, fail = {} } = {}) {
  const clients = []
  const rowsFor = new Map([
    [BEGIN_READ_ONLY_SQL, []],
    [ROLLBACK_SQL, []],
    [IDENTITY_SQL, [identity]],
    [FINGERPRINT_SQL, [fingerprints]],
    [CONTENTS_SQL, [contents]],
    [MIGRATIONS_SQL, migrations],
  ])
  const createClient = (config) => {
    const client = {
      config,
      statements: [],
      params: [],
      errorListener: false,
      on(event) {
        if (event === 'error') client.errorListener = true
      },
      async connect() {
        client.statements.push('CONNECT')
        if (fail.connect) throw fail.connect
      },
      async query(sql, params) {
        client.statements.push(sql)
        client.params.push(params)
        if (fail[sql]) throw fail[sql]
        assert.ok(rowsFor.has(sql), 'the checker sent a statement the mock does not know')
        return { rows: rowsFor.get(sql) }
      },
      async end() {
        client.statements.push('END')
        if (fail.end) throw fail.end
      },
    }
    clients.push(client)
    return client
  }
  return { clients, createClient }
}

async function verify({ argv = ['--pre-migration'], env = SAFE_ENV, database = mockDatabase() } = {}) {
  const lines = []
  const errors = []
  const code = await runTestDatabaseVerification({
    argv,
    env,
    createClient: database.createClient,
    report: (line) => lines.push(line),
    reportError: (message) => errors.push(message),
  })
  const output = [...lines, ...errors].join('\n')
  assertNoSecrets(output)
  return { code, lines, errors, output, clients: database.clients }
}

const failed = (results) => results.filter((result) => !result.ok).map((result) => result.check)

// Any socket connection in this process fails the file.
let socketAttempts = 0
let originalConnect
before(() => {
  originalConnect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function () {
    socketAttempts += 1
    throw new Error('A test tried to open a network connection.')
  }
})
after(() => {
  net.Socket.prototype.connect = originalConnect
  assert.equal(socketAttempts, 0, 'a test tried to open a network connection')
})

describe('identity checker, before any client is created', () => {
  it('refuses missing or rejected URL variables', async () => {
    const cases = [
      [{}, /DATABASE_URL must be set explicitly/],
      [{ DATABASE_URL: LOCAL_URL }, /DIRECT_URL must be set explicitly/],
      [{ DATABASE_URL: LOCAL_URL, DIRECT_URL: REMOTE_URL }, /DIRECT_URL must point to localhost/],
      [{ DATABASE_URL: SUPABASE_URL, DIRECT_URL: LOCAL_URL }, /DATABASE_URL refers to Supabase/],
      [{ DATABASE_URL: LOCAL_URL, DIRECT_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/other_test` }, /same host, port and database/],
      [{ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia`, DIRECT_URL: LOCAL_URL }, /ending in "_test"/],
    ]
    for (const [env, pattern] of cases) {
      const result = await verify({ env })
      assert.equal(result.code, 1)
      assert.equal(result.clients.length, 0)
      assert.match(result.output, pattern)
    }
  })

  it('refuses anything but exactly one mode flag', async () => {
    for (const argv of [[], ['--pre-migration', '--post-migration'], ['--migrate'], ['pre-migration'], ['--pre-migration', 'extra']]) {
      const result = await verify({ argv })
      assert.equal(result.code, 1)
      assert.equal(result.clients.length, 0)
      assert.match(result.output, /give exactly one of --pre-migration or --post-migration/)
    }
  })

  it('refuses PG* variables that would let the client connect elsewhere, in any letter case', async () => {
    const extras = [
      { PGPORT: '5433' },
      { pgreplication: 'true' },
      { PGOPTIONS: '-c default_transaction_read_only=off' },
      { PgUser: 'postgres' },
      { PGHOST: 'db.example.com' },
      { pgDatabase: 'synthetic_production' },
      { PGSERVICE: 'synthetic-service' },
    ]
    for (const extra of extras) {
      const result = await verify({ env: { ...SAFE_ENV, ...extra } })
      assert.equal(result.code, 1)
      assert.equal(result.clients.length, 0)
      assert.match(result.output, new RegExp(`${Object.keys(extra)[0].toUpperCase()} is set`))
      assert.ok(!result.output.includes(Object.values(extra)[0]))
    }
  })

  it('allows PGPASSWORD and PGPASSFILE, which only supply a password', async () => {
    const result = await verify({ env: { ...SAFE_ENV, PGPASSWORD: PASSWORD, PGPASSFILE: 'C:\\synthetic\\pgpass.conf' } })
    assert.equal(result.code, 0)
    assert.equal(result.clients.length, 1)
  })

  it('refuses PGPASSWORD set under two spellings, without revealing either', async () => {
    const result = await verify({ env: { ...SAFE_ENV, PGPASSWORD: PASSWORD, pgPassword: 'Synthetic-Other-Pg-Password' } })
    assert.equal(result.code, 1)
    assert.equal(result.clients.length, 0)
    assert.match(result.output, /PGPASSWORD is set more than once/)
    assert.ok(!result.output.includes(PASSWORD) && !result.output.includes('Synthetic-Other-Pg-Password'))
  })

  it('refuses with the default client as well, without loading it, when the URLs are rejected', async () => {
    const errors = []
    const code = await runTestDatabaseVerification({ argv: ['--pre-migration'], env: {}, report: () => {}, reportError: (m) => errors.push(m) })
    assert.equal(code, 1)
    assert.match(errors.join('\n'), /DATABASE_URL must be set explicitly/)
  })
})

describe('identity decision', () => {
  const pre = (facts) => evaluateIdentity({ ...PRE_FACTS, ...facts }, { database: 'selvia_test', mode: VERIFY_MODES.PRE_MIGRATION })
  const post = (facts, expectedMigrations = MIGRATION_NAMES) =>
    evaluateIdentity({ ...POST_FACTS, ...facts }, { database: 'selvia_test', mode: VERIFY_MODES.POST_MIGRATION, expectedMigrations })

  it('accepts a fresh disposable database before migration, and a migrated one after', () => {
    assert.deepEqual(failed(pre({})), [])
    assert.deepEqual(failed(post({})), [])
  })

  it('fails every check when the facts are missing', () => {
    for (const mode of Object.values(VERIFY_MODES)) {
      const results = evaluateIdentity({}, { database: 'selvia_test', mode, expectedMigrations: MIGRATION_NAMES })
      assert.ok(results.length >= 11)
      assert.deepEqual(results.filter((r) => r.ok), [], mode)
    }
    assert.deepEqual(failed(evaluateIdentity(PRE_FACTS, { database: 'selvia_test', mode: 'other' })), ['mode'])
  })

  it('rejects a session that is not read-only or has no statement timeout', () => {
    assert.deepEqual(failed(pre({ transaction_read_only: 'off' })), ['read-only transaction'])
    assert.deepEqual(failed(pre({ statement_timeout: '0' })), ['statement timeout'])
  })

  it('rejects a different database name', () => {
    for (const database of ['postgres', 'selvia', 'SELVIA_TEST', 'selvia_test ']) {
      assert.deepEqual(failed(pre({ database })), ['database name'], database)
    }
  })

  it('rejects a server older than PostgreSQL 15 or of unknown version', () => {
    assert.deepEqual(failed(pre({ server_version_num: 140011 })), ['server version'])
    assert.deepEqual(failed(pre({ server_version_num: '150000' })), [])
    for (const server_version_num of [null, undefined, 'fifteen', 149999]) {
      assert.deepEqual(failed(pre({ server_version_num })), ['server version'], String(server_version_num))
    }
  })

  it('rejects a superuser or a role that can create databases or roles, replicate or bypass row security', () => {
    for (const key of ['superuser', 'create_database', 'create_role', 'replication', 'bypass_rls']) {
      assert.deepEqual(failed(pre({ [key]: true })), ['role attributes'], key)
      assert.deepEqual(failed(pre({ [key]: undefined })), ['role attributes'], `${key} unknown`)
    }
    const superuser = pre({ superuser: true, owns_database: true })
    assert.match(superuser.find((r) => r.check === 'role attributes').detail, /SUPERUSER/)
  })

  it('rejects membership in a privileged role', () => {
    assert.deepEqual(failed(pre({ privileged_memberships: 1 })), ['role memberships'])
    assert.deepEqual(failed(pre({ privileged_memberships: '2' })), ['role memberships'])
    assert.deepEqual(failed(pre({ privileged_memberships: null })), ['role memberships'])
  })

  it('rejects a database the role does not own', () => {
    assert.deepEqual(failed(pre({ owns_database: false })), ['database owner'])
    assert.deepEqual(failed(pre({ owns_database: 'true' })), ['database owner'])
  })

  it('rejects a missing or different marker comment, without printing what was found', () => {
    for (const marker of [null, '', 'selvia:disposable-integration-test ', 'SELVIA:DISPOSABLE-INTEGRATION-TEST', 'selvia:production']) {
      const results = pre({ marker })
      assert.deepEqual(failed(results), ['marker comment'], String(marker))
      if (marker?.trim()) assert.ok(!results.find((r) => r.check === 'marker comment').detail.includes(marker))
    }
  })

  it('rejects Supabase roles and schemas', () => {
    for (const role of SUPABASE_ROLES) assert.deepEqual(failed(pre({ supabase_roles: [role] })), ['Supabase fingerprints'], role)
    for (const schema of SUPABASE_SCHEMAS) {
      assert.deepEqual(failed(pre({ supabase_schemas: [schema], other_schemas: [schema] })), ['Supabase fingerprints', 'other schemas'], schema)
    }
    assert.deepEqual(failed(pre({ supabase_roles: null })), ['Supabase fingerprints'])
    assert.match(pre({ supabase_roles: ['supabase_admin'], supabase_schemas: ['auth'] }).find((r) => r.check === 'Supabase fingerprints').detail, /role supabase_admin, schema auth/)
  })

  it('rejects schemas besides public', () => {
    assert.deepEqual(failed(pre({ other_schemas: ['app'] })), ['other schemas'])
    assert.deepEqual(failed(post({ other_schemas: ['archive'] })), ['other schemas'])
  })

  it('before migration, rejects a public schema holding anything', () => {
    assert.deepEqual(failed(pre({ public_tables: ['users'], public_relations: 1 })), ['public schema empty'])
    assert.deepEqual(failed(pre({ public_relations: 1 })), ['public schema empty'])
    assert.deepEqual(failed(pre({ public_functions: 1 })), ['public schema empty'])
    assert.deepEqual(failed(pre({ public_types: '1' })), ['public schema empty'])
    assert.deepEqual(failed(pre({ public_tables: null })), ['public schema empty'])
    assert.deepEqual(failed(pre(MIGRATED)), ['public schema empty'])
  })

  it('after migration, rejects missing application tables or a missing _prisma_migrations', () => {
    const without = (name) => MIGRATED.public_tables.filter((table) => table !== name)
    const missing = post({ public_tables: without('assessment_attempts') })
    assert.deepEqual(failed(missing), ['application tables'])
    assert.match(missing.find((r) => r.check === 'application tables').detail, /missing assessment_attempts/)
    assert.deepEqual(failed(post({ public_tables: without(PRISMA_MIGRATIONS_TABLE) })), ['application tables'])
    assert.deepEqual(failed(post({ public_tables: [], migrations: null })), ['application tables', 'applied migrations'])
  })

  it('after migration, rejects any extra table, view or foreign table in public', () => {
    for (const extra of ['users_backup', 'real_students', 'student_report_view']) {
      const results = post({ public_tables: [...MIGRATED.public_tables, extra].sort() })
      assert.deepEqual(failed(results), ['application tables'], extra)
      assert.match(results.find((r) => r.check === 'application tables').detail, new RegExp(`unexpected ${extra}`))
    }
  })

  it('after migration, rejects migrations that are missing, unknown, unfinished or only rolled back', () => {
    const [first, ...rest] = APPLIED
    assert.deepEqual(failed(post({ migrations: rest })), ['applied migrations'])
    assert.deepEqual(failed(post({ migrations: [...APPLIED, { name: '20990101000000_other', finished: true, rolled_back: false }] })), ['applied migrations'])
    assert.deepEqual(failed(post({ migrations: [...APPLIED, { name: first.name, finished: false, rolled_back: false }] })), ['applied migrations'])
    assert.deepEqual(failed(post({ migrations: [{ ...first, rolled_back: true }, ...rest] })), ['applied migrations'])
    assert.deepEqual(failed(post({ migrations: null })), ['applied migrations'])
    assert.deepEqual(failed(post({}, [])), ['applied migrations'])
    // A rolled-back attempt followed by a successful one is how Prisma records a resolved migration.
    assert.deepEqual(failed(post({ migrations: [{ ...first, finished: false, rolled_back: true }, ...APPLIED] })), [])
  })

  it('prints only plain identifiers from the server', () => {
    const results = post({ public_tables: [...MIGRATED.public_tables, `x'; DROP TABLE users; --`, LOCAL_URL] })
    const detail = results.find((r) => r.check === 'application tables').detail
    assert.match(detail, /\(unprintable name\)/)
    assertNoSecrets(detail)
    assert.ok(!detail.includes('DROP TABLE'))
  })
})

describe('identity checker with a mock PostgreSQL client', () => {
  it('passes a fresh disposable database, sending only the read-only statements, and closes the client', async () => {
    const result = await verify()
    assert.equal(result.code, 0, result.output)
    assert.equal(result.clients.length, 1)
    const [client] = result.clients
    assert.deepEqual(client.statements, ['CONNECT', BEGIN_READ_ONLY_SQL, IDENTITY_SQL, FINGERPRINT_SQL, CONTENTS_SQL, ROLLBACK_SQL, 'END'])
    assert.deepEqual(client.params[2], [SUPABASE_ROLES, SUPABASE_SCHEMAS])
    assert.equal(client.errorListener, true)
    assert.match(result.output, /Verifying test database "selvia_test" on localhost:5432 \(pre-migration, read-only\)/)
    assert.match(result.output, /does not prove that the server behind localhost:5432 is local and isolated/)
    assert.doesNotMatch(result.output, /FAIL/)
  })

  it('connects only with the checked URL, read-only by default, with every wait bounded', async () => {
    const [client] = (await verify()).clients
    assert.deepEqual(client.config, clientConfig(LOCAL_URL))
    assert.equal(client.config.connectionString, LOCAL_URL)
    assert.match(client.config.options, /-c default_transaction_read_only=on/)
    for (const key of ['connectionTimeoutMillis', 'statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout', 'query_timeout']) {
      assert.ok(client.config[key] > 0 && client.config[key] <= 10_000, key)
    }
    for (const key of ['host', 'port', 'user', 'password', 'database', 'ssl', 'replication']) assert.ok(!(key in client.config), key)
  })

  it('never sends anything but BEGIN READ ONLY, catalog SELECTs and ROLLBACK', () => {
    assert.match(BEGIN_READ_ONLY_SQL, /^BEGIN TRANSACTION .*READ ONLY$/)
    assert.equal(ROLLBACK_SQL, 'ROLLBACK')
    for (const sql of [IDENTITY_SQL, FINGERPRINT_SQL, CONTENTS_SQL, MIGRATIONS_SQL]) {
      assert.match(sql, /^SELECT\s/)
      assert.ok(!sql.includes(';'), 'a statement contains a statement separator')
      for (const word of ['insert', 'update', 'delete', 'merge', 'create', 'alter', 'drop', 'truncate', 'grant', 'revoke', 'comment', 'set', 'commit', 'copy', 'call', 'do', 'lock', 'vacuum', 'nextval', 'setval']) {
        assert.doesNotMatch(sql, new RegExp(`\\b${word}\\b`, 'i'), `${word} in a statement`)
      }
    }
  })

  it('after migration, also reads _prisma_migrations and passes a correctly migrated database', async () => {
    const result = await verify({ argv: ['--post-migration'], database: mockDatabase({ contents: MIGRATED }) })
    assert.equal(result.code, 0, result.output)
    assert.deepEqual(result.clients[0].statements, ['CONNECT', BEGIN_READ_ONLY_SQL, IDENTITY_SQL, FINGERPRINT_SQL, CONTENTS_SQL, MIGRATIONS_SQL, ROLLBACK_SQL, 'END'])
  })

  it('after migration, fails without reading _prisma_migrations when it does not exist', async () => {
    const result = await verify({ argv: ['--post-migration'], database: mockDatabase({ contents: EMPTY }) })
    assert.equal(result.code, 1)
    assert.ok(!result.clients[0].statements.includes(MIGRATIONS_SQL))
    assert.match(result.output, /FAIL {2}application tables: missing/)
    assert.match(result.output, /Do not run migrations or integration tests against this database/)
  })

  it('fails on a failed check, after rolling back and closing the client', async () => {
    const cases = [
      [{ identity: { ...IDENTITY, superuser: true } }, /FAIL {2}role attributes: has SUPERUSER/],
      [{ identity: { ...IDENTITY, marker: null } }, /FAIL {2}marker comment/],
      [{ identity: { ...IDENTITY, database: 'postgres' } }, /FAIL {2}database name/],
      [{ identity: { ...IDENTITY, server_version_num: 140011 } }, /FAIL {2}server version: PostgreSQL 14/],
      [{ fingerprints: { supabase_roles: ['supabase_admin'], supabase_schemas: ['auth', 'storage'] } }, /FAIL {2}Supabase fingerprints/],
      [{ contents: MIGRATED }, /FAIL {2}public schema empty/],
    ]
    for (const [options, pattern] of cases) {
      const result = await verify({ database: mockDatabase(options) })
      assert.equal(result.code, 1)
      assert.match(result.output, pattern)
      assert.deepEqual(result.clients[0].statements.slice(-2), [ROLLBACK_SQL, 'END'])
    }
  })

  it('fails when the role row is missing', async () => {
    const database = mockDatabase()
    const createClient = (config) => {
      const client = database.createClient(config)
      const query = client.query
      client.query = async (sql, params) => (sql === IDENTITY_SQL ? (client.statements.push(sql), { rows: [] }) : query(sql, params))
      return client
    }
    const result = await verify({ database: { clients: database.clients, createClient } })
    assert.equal(result.code, 1)
    assert.match(result.output, /FAIL {2}database owner/)
  })

  it('reports a connection failure by step and code only, and still closes the client', async () => {
    const result = await verify({ database: mockDatabase({ fail: { connect: driverError('28P01') } }) })
    assert.equal(result.code, 1)
    assert.match(result.output, /Could not verify the test database: connecting with DATABASE_URL and DIRECT_URL failed \(28P01\)\./)
    assert.deepEqual(result.clients[0].statements, ['CONNECT', 'END'])
  })

  it('drops an error code that is not a plain code', async () => {
    const result = await verify({ database: mockDatabase({ fail: { connect: driverError(LOCAL_URL) } }) })
    assert.equal(result.code, 1)
    assert.match(result.output, /connecting with DATABASE_URL and DIRECT_URL failed\.$/m)
  })

  it('reports a failed statement by step only, after rolling back and closing the client', async () => {
    const steps = [
      [BEGIN_READ_ONLY_SQL, /starting a read-only transaction failed \(25006\)/],
      [IDENTITY_SQL, /reading the role and database failed \(25006\)/],
      [FINGERPRINT_SQL, /looking for Supabase failed \(25006\)/],
      [CONTENTS_SQL, /listing schemas and tables failed \(25006\)/],
    ]
    for (const [sql, pattern] of steps) {
      const result = await verify({ database: mockDatabase({ fail: { [sql]: driverError('25006') } }) })
      assert.equal(result.code, 1)
      assert.match(result.output, pattern)
      assert.deepEqual(result.clients[0].statements.slice(-2), [ROLLBACK_SQL, 'END'])
      assert.ok(!result.clients[0].statements.slice(result.clients[0].statements.indexOf(sql) + 1, -2).length, 'it went on after a failed statement')
    }
  })

  it('still closes the client when rolling back fails, and a failure to close does not hide the result', async () => {
    const rollbackFails = await verify({ database: mockDatabase({ fail: { [ROLLBACK_SQL]: driverError('57P01') } }) })
    assert.equal(rollbackFails.code, 0)
    assert.equal(rollbackFails.clients[0].statements.at(-1), 'END')

    const endFails = await verify({ database: mockDatabase({ identity: { ...IDENTITY, superuser: true }, fail: { end: driverError('57P01') } }) })
    assert.equal(endFails.code, 1)
    assert.match(endFails.output, /FAIL {2}role attributes/)
  })

  it('reports a client that cannot be created without its error', async () => {
    const result = await verify({
      database: {
        clients: [],
        createClient: () => {
          throw driverError('ERR_INVALID_ARG_VALUE')
        },
      },
    })
    assert.equal(result.code, 1)
    assert.match(result.output, /creating the client for DATABASE_URL and DIRECT_URL failed \(ERR_INVALID_ARG_VALUE\)/)
  })

  it('verifies DATABASE_URL and DIRECT_URL separately when they differ, since they may use different roles', async () => {
    const database = mockDatabase()
    const result = await verify({ env: { DATABASE_URL: LOCAL_URL, DIRECT_URL: MIGRATE_URL }, database })
    assert.equal(result.code, 0, result.output)
    assert.deepEqual(result.clients.map((client) => client.config.connectionString), [LOCAL_URL, MIGRATE_URL])
    assert.match(result.output, /^DATABASE_URL:$/m)
    assert.match(result.output, /^DIRECT_URL:$/m)
  })
})

describe('expected application tables', () => {
  it('are exactly the tables the migrations create', () => {
    const tables = new Set()
    for (const name of MIGRATION_NAMES) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
      for (const [, table] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/gi)) tables.add(table)
      for (const [, table] of sql.matchAll(/DROP TABLE (?:IF EXISTS )?"?(\w+)"?/gi)) tables.delete(table)
      for (const [, from, to] of sql.matchAll(/ALTER TABLE "?(\w+)"? RENAME TO "?(\w+)"?/gi)) {
        tables.delete(from)
        tables.add(to)
      }
    }
    assert.deepEqual([...tables].sort(), [...EXPECTED_APPLICATION_TABLES])
  })

  it('are exactly the table names of the models in prisma/schema.prisma', () => {
    const schema = readFileSync(path.join(SERVER_ROOT, 'prisma', 'schema.prisma'), 'utf8')
    const mapped = [...schema.matchAll(/^model \w+ \{[\s\S]*?^\}/gm)].map(([block]) => block.match(/@@map\("(\w+)"\)/)?.[1])
    assert.ok(mapped.every(Boolean), 'a model has no @@map')
    assert.deepEqual(mapped.sort(), [...EXPECTED_APPLICATION_TABLES])
  })

  it('come with the migration folders that post-migration mode expects to be applied', () => {
    const folders = readdirSync(MIGRATIONS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    assert.deepEqual(MIGRATION_NAMES, folders)
    assert.ok(MIGRATION_NAMES.length >= 1)
  })
})

describe('verify-test-database.js from the command line', () => {
  // A preload that makes any socket connection end the process, as a second guard against reaching a database.
  const TRIPWIRE = `data:text/javascript,${encodeURIComponent(
    "import net from 'node:net'; net.Socket.prototype.connect = function () { process.stderr.write('NETWORK ATTEMPT'); process.exit(97) }",
  )}`

  function start(args, env) {
    const result = spawnSync(process.execPath, ['--import', TRIPWIRE, path.join('scripts', 'verify-test-database.js'), ...args], {
      cwd: SERVER_ROOT,
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...env },
      encoding: 'utf8',
      shell: false,
      timeout: 60_000,
    })
    const output = `${result.stdout}\n${result.stderr}`
    assertNoSecrets(output)
    assert.ok(!output.includes('NETWORK ATTEMPT'))
    return { status: result.status, output }
  }

  it('refuses before connecting when the URLs are missing or rejected, or a PG* variable is set', { timeout: 120_000 }, () => {
    const cases = [
      [['--pre-migration'], {}, /DATABASE_URL must be set explicitly/],
      [['--post-migration'], { DATABASE_URL: LOCAL_URL, DIRECT_URL: SUPABASE_URL }, /DIRECT_URL refers to Supabase/],
      [[], SAFE_ENV, /give exactly one of --pre-migration or --post-migration/],
      [['--pre-migration'], { ...SAFE_ENV, PGPORT: '5433' }, /PGPORT is set/],
    ]
    for (const [args, env, pattern] of cases) {
      const result = start(args, env)
      assert.equal(result.status, 1)
      assert.match(result.output, pattern)
      assert.doesNotMatch(result.output, /Verifying test database/)
    }
  })
})
