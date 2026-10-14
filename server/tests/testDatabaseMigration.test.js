// npm run test:db-guard. The guarded test migration (scripts/migrate-test-database.js), with synthetic URLs, a mock
// PostgreSQL client and a simulated child process. Nothing here loads server/.env, imports the application, starts
// Prisma or connects to anything: socket connections are made to fail for the whole file, every run gets a fake
// spawn, and the command-line runs below are refused before a client could be created.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'
import {
  BEGIN_READ_ONLY_SQL,
  CONTENTS_SQL,
  DISPOSABLE_DATABASE_MARKER,
  EXPECTED_APPLICATION_TABLES,
  FINGERPRINT_SQL,
  IDENTITY_SQL,
  listMigrationNames,
  MIGRATIONS_SQL,
  PRISMA_MIGRATIONS_TABLE,
  ROLLBACK_SQL,
} from './support/testDatabaseIdentity.js'
import {
  classifyMigrationState,
  createRedactor,
  MIGRATION_STATES,
  resolvePrismaCli,
  runTestDatabaseMigration,
  TEST_PRISMA_CONFIG_PATH,
  TestDatabaseMigrationError,
} from './support/testDatabaseMigration.js'

const SERVER_ROOT = fileURLToPath(new URL('../', import.meta.url))
const MODULE_PATH = fileURLToPath(new URL('./support/testDatabaseMigration.js', import.meta.url))
const FAKE_CLI = path.join(SERVER_ROOT, 'node_modules', 'prisma', 'build', 'index.js')

const USER = 'migrate_owner'
const PASSWORD = 'Synthetic-Migrate-Secret-73'
const LOCAL_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test`
const OTHER_PARAMS_URL = `${LOCAL_URL}?application_name=selvia-app`
const SUPABASE_URL = `postgresql://${USER}:${PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
const REMOTE_URL = `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`
const PARENT_SECRETS = {
  JWT_SECRET: 'Synthetic-Parent-Jwt-Secret-0123456789',
  NEO4J_PASSWORD: 'Synthetic-Parent-Graph-Password-44',
  PGPASSWORD: 'Synthetic-Parent-Pg-Password-12',
}
const RAW_ERROR = `password authentication failed for user "${USER}" at ${LOCAL_URL}`
const SECRETS = [USER, PASSWORD, LOCAL_URL, OTHER_PARAMS_URL, SUPABASE_URL, REMOTE_URL, RAW_ERROR, ...Object.values(PARENT_SECRETS)]
const SAFE_ENV = { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, PATH: 'C:\\synthetic\\bin', SystemRoot: 'C:\\Windows' }

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
  database_oid: '16384',
  server_started_at: '2026-10-14 09:00:00.000+05:30',
  server_address: '127.0.0.1/32',
  server_port: 5432,
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
const EMPTY_STAGE = { contents: EMPTY }
const MIGRATED_STAGE = { contents: MIGRATED, migrations: APPLIED }

function assertNoSecrets(text) {
  for (const secret of SECRETS) assert.ok(!text.includes(secret), 'output contains a secret or a raw driver error')
}

const driverError = (code) => Object.assign(new Error(RAW_ERROR), { code, detail: RAW_ERROR })

// A mock pg. The first `perCheck` clients (one per distinct URL) see `before`, later ones `after`; each stage may
// override identity, fingerprints, contents and migrations, and `fail` maps 'connect' or a statement to an error.
function mockDatabase({ before: first = EMPTY_STAGE, after: second = MIGRATED_STAGE, perCheck = 1 } = {}) {
  const clients = []
  const createClient = (config) => {
    const stage = clients.length < perCheck ? first : second
    const rows = new Map([
      [BEGIN_READ_ONLY_SQL, []],
      [ROLLBACK_SQL, []],
      [IDENTITY_SQL, [stage.identity ?? IDENTITY]],
      [FINGERPRINT_SQL, [stage.fingerprints ?? FINGERPRINTS]],
      [CONTENTS_SQL, [stage.contents ?? EMPTY]],
      [MIGRATIONS_SQL, stage.migrations ?? []],
    ])
    const fail = stage.fail ?? {}
    const client = {
      config,
      statements: [],
      on() {},
      async connect() {
        client.statements.push('CONNECT')
        if (fail.connect) throw fail.connect
      },
      async query(sql) {
        client.statements.push(sql)
        if (fail[sql]) throw fail[sql]
        assert.ok(rows.has(sql), 'the wrapper sent a statement the mock does not know')
        return { rows: rows.get(sql) }
      },
      async end() {
        client.statements.push('END')
      },
    }
    clients.push(client)
    return client
  }
  return { clients, createClient }
}

// A spawn that records its calls and never starts a process. Its child writes `stdout`/`stderr` chunks, then closes
// with `code` and `signal`; `error` makes it fail to start, `throws` makes spawn itself throw.
function fakeSpawn({ code = 0, signal = null, error = null, throws = false, stdout = [], stderr = [] } = {}) {
  const calls = []
  const spawnProcess = (command, args, options) => {
    calls.push({ command, args, options })
    if (throws) throw new Error(`spawn failed for ${LOCAL_URL}`)
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    setImmediate(() => {
      if (error) {
        child.emit('error', error)
        return
      }
      for (const chunk of stdout) child.stdout.write(chunk)
      for (const chunk of stderr) child.stderr.write(chunk)
      setImmediate(() => child.emit('close', code, signal))
    })
    return child
  }
  return { calls, spawnProcess }
}

async function migrate({ argv = [], env = SAFE_ENV, database = mockDatabase(), child = {}, prismaCli = () => FAKE_CLI } = {}) {
  const { calls, spawnProcess } = fakeSpawn(child)
  const lines = []
  const errors = []
  let out = ''
  let err = ''
  const code = await runTestDatabaseMigration({
    argv,
    env,
    createClient: database.createClient,
    spawnProcess,
    prismaCli,
    report: (line) => lines.push(line),
    reportError: (message) => errors.push(message),
    writeOut: (text) => {
      out += text
    },
    writeErr: (text) => {
      err += text
    },
  })
  const output = [...lines, ...errors, out, err].join('\n')
  assertNoSecrets(output)
  return { code, lines, errors, output, out, err, calls, clients: database.clients }
}

// Refused before any client is created or any process started.
async function assertRefusedEarly(options, pattern) {
  const result = await migrate(options)
  assert.equal(result.code, 1)
  assert.equal(result.clients.length, 0, 'a database client was created')
  assert.equal(result.calls.length, 0, 'a process was started')
  assert.match(result.errors.join('\n'), pattern)
  return result
}

// Refused after the check before migrating, without starting Prisma.
async function assertRefusedBeforePrisma(database, pattern) {
  const result = await migrate({ database })
  assert.equal(result.code, 1)
  assert.equal(result.calls.length, 0, 'Prisma was started')
  assert.match(result.output, pattern)
  for (const client of result.clients) assert.equal(client.statements.at(-1), 'END', 'a client was not closed')
  return result
}

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

describe('test migration, before anything connects or starts', () => {
  it('refuses missing, invalid, remote, Supabase and mismatched URLs', async () => {
    const cases = [
      [{}, /DATABASE_URL must be set explicitly/],
      [{ DATABASE_URL: LOCAL_URL }, /DIRECT_URL must be set explicitly/],
      [{ DATABASE_URL: LOCAL_URL, DIRECT_URL: 'not a url' }, /DIRECT_URL is not a valid URL/],
      [{ DATABASE_URL: LOCAL_URL, DIRECT_URL: REMOTE_URL }, /DIRECT_URL must point to localhost/],
      [{ DATABASE_URL: SUPABASE_URL, DIRECT_URL: LOCAL_URL }, /DATABASE_URL refers to Supabase/],
      [{ DATABASE_URL: LOCAL_URL, DIRECT_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/other_test` }, /same host, port and database/],
      [{ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia`, DIRECT_URL: LOCAL_URL }, /ending in "_test"/],
    ]
    for (const [env, pattern] of cases) await assertRefusedEarly({ env: { PATH: SAFE_ENV.PATH, ...env } }, pattern)
  })

  it('refuses URLs without an explicit user name, password and port', async () => {
    for (const url of [
      `postgresql://localhost:5432/selvia_test`,
      `postgresql://${USER}@localhost:5432/selvia_test`,
      `postgresql://${USER}:${PASSWORD}@localhost/selvia_test`,
    ]) {
      await assertRefusedEarly({ env: { ...SAFE_ENV, DIRECT_URL: url, DATABASE_URL: url } }, /must include the user name, password and port/)
    }
  })

  it('refuses PG* variables that could redirect the connection, in any letter case', async () => {
    const cases = [
      [{ PGPORT: '6543' }, /PGPORT is set/],
      [{ pgHost: 'db.example.com' }, /PGHOST is set/],
      [{ PgService: 'synthetic-service' }, /PGSERVICE is set/],
      [{ PGOPTIONS: '-c search_path=other' }, /PGOPTIONS is set/],
      [{ PGPASSWORD: PARENT_SECRETS.PGPASSWORD, pgPassword: 'other' }, /PGPASSWORD is set more than once/],
    ]
    for (const [extra, pattern] of cases) await assertRefusedEarly({ env: { ...SAFE_ENV, ...extra } }, pattern)
  })

  it('refuses Prisma debug output, engine replacements and a telemetry endpoint, in any letter case', async () => {
    const cases = [
      [{ DEBUG: 'prisma*' }, /DEBUG is set/],
      [{ debug: '*' }, /DEBUG is set/],
      [{ PRISMA_SCHEMA_ENGINE_BINARY: 'C:\\synthetic\\engine.exe' }, /PRISMA_SCHEMA_ENGINE_BINARY is set/],
      [{ prisma_migration_engine_binary: 'C:\\synthetic\\engine.exe' }, /PRISMA_MIGRATION_ENGINE_BINARY is set/],
      [{ PRISMA_TELEMETRY_ENDPOINT: 'https://telemetry.example.com' }, /PRISMA_TELEMETRY_ENDPOINT is set/],
    ]
    for (const [extra, pattern] of cases) await assertRefusedEarly({ env: { ...SAFE_ENV, ...extra } }, pattern)
    const emptyDebug = await migrate({ env: { ...SAFE_ENV, DEBUG: '' } })
    assert.equal(emptyDebug.code, 0, emptyDebug.output)
  })

  it('refuses every command-line argument', async () => {
    for (const argv of [['--force'], ['--config', 'prisma.config.js'], ['--schema=other.prisma'], ['deploy'], ['']]) {
      await assertRefusedEarly({ argv }, /it takes no arguments/)
    }
  })

  it('refuses when the local Prisma CLI cannot be found', async () => {
    const prismaCli = () => {
      throw new TestDatabaseMigrationError('the Prisma 7 CLI installed in server/node_modules could not be found.')
    }
    await assertRefusedEarly({ prismaCli }, /Prisma 7 CLI installed in server\/node_modules could not be found/)
  })
})

describe('test migration, the check before migrating', () => {
  it('never starts Prisma when the identity checks fail', async () => {
    const cases = [
      [{ identity: { ...IDENTITY, superuser: true } }, /FAIL {2}role attributes: has SUPERUSER/],
      [{ identity: { ...IDENTITY, owns_database: false } }, /FAIL {2}database owner/],
      [{ identity: { ...IDENTITY, marker: null } }, /FAIL {2}marker comment/],
      [{ fingerprints: { supabase_roles: ['supabase_admin'], supabase_schemas: ['auth'] } }, /FAIL {2}Supabase fingerprints/],
      [{ identity: { ...IDENTITY, database_oid: null } }, /FAIL {2}server identity: unknown/],
    ]
    for (const [stage, pattern] of cases) {
      const result = await assertRefusedBeforePrisma(mockDatabase({ before: { ...EMPTY_STAGE, ...stage } }), pattern)
      assert.deepEqual(result.clients[0].statements.slice(-2), [ROLLBACK_SQL, 'END'])
      assert.match(result.output, /failed the identity checks above/)
      assert.match(result.output, /Nothing was retried, repaired or removed/)
    }
  })

  it('never starts Prisma when the database cannot be reached, without revealing the driver error', async () => {
    const result = await assertRefusedBeforePrisma(
      mockDatabase({ before: { ...EMPTY_STAGE, fail: { connect: driverError('28P01') } } }),
      /connecting with DATABASE_URL and DIRECT_URL failed \(28P01\)/,
    )
    assert.deepEqual(result.clients[0].statements, ['CONNECT', 'END'])
    assert.match(result.output, /it could not be verified/)
  })

  it('never starts Prisma for a partial, unfinished or unknown migration state', async () => {
    const partialTables = { ...MIGRATED, public_tables: ['users', PRISMA_MIGRATIONS_TABLE] }
    const cases = [
      { contents: partialTables, migrations: APPLIED.slice(0, 1) },
      { contents: MIGRATED, migrations: APPLIED.slice(0, -1) },
      { contents: MIGRATED, migrations: [...APPLIED.slice(0, -1), { ...APPLIED.at(-1), finished: false }] },
      { contents: MIGRATED, migrations: [...APPLIED, { name: '20991231000000_unknown', finished: true, rolled_back: false }] },
      { contents: { ...MIGRATED, public_tables: [...MIGRATED.public_tables, 'extra_table'].sort() }, migrations: APPLIED },
      { contents: { ...EMPTY, public_functions: 1 } },
    ]
    for (const stage of cases) {
      await assertRefusedBeforePrisma(mockDatabase({ before: stage }), /neither empty nor exactly migrated/)
    }
  })

  it('leaves an already fully migrated database alone, without starting Prisma', async () => {
    const result = await migrate({ database: mockDatabase({ before: MIGRATED_STAGE }) })
    assert.equal(result.code, 0, result.output)
    assert.equal(result.calls.length, 0)
    assert.equal(result.clients.length, 1)
    assert.match(result.output, /Every migration is already applied to "selvia_test" on localhost:5432 and verified; Prisma was not started/)
  })

  it('checks both URLs when they differ, and refuses when they reach different databases', async () => {
    const env = { ...SAFE_ENV, DATABASE_URL: OTHER_PARAMS_URL }
    const ok = await migrate({ env, database: mockDatabase({ perCheck: 2 }) })
    assert.equal(ok.code, 0, ok.output)
    assert.deepEqual(ok.clients.map((client) => client.config.connectionString), [OTHER_PARAMS_URL, LOCAL_URL, OTHER_PARAMS_URL, LOCAL_URL])

    let created = 0
    const database = mockDatabase({ perCheck: 2 })
    const createClient = database.createClient
    database.createClient = (config) => {
      created += 1
      const client = createClient(config)
      if (created === 2) {
        const query = client.query
        client.query = async (sql) => (sql === IDENTITY_SQL ? (client.statements.push(sql), { rows: [{ ...IDENTITY, database_oid: '99999' }] }) : query(sql))
      }
      return client
    }
    const refused = await migrate({ env, database })
    assert.equal(refused.code, 1)
    assert.equal(refused.calls.length, 0)
    assert.match(refused.output, /DATABASE_URL and DIRECT_URL reach different databases/)
  })
})

describe('test migration, starting Prisma', () => {
  it('migrates an empty disposable database and verifies it afterwards', async () => {
    const result = await migrate()
    assert.equal(result.code, 0, result.output)
    assert.equal(result.calls.length, 1)
    assert.equal(result.clients.length, 2)
    for (const client of result.clients) {
      assert.equal(client.config.connectionString, LOCAL_URL)
      assert.equal(client.statements[0], 'CONNECT')
      assert.deepEqual(client.statements.slice(-2), [ROLLBACK_SQL, 'END'])
    }
    assert.match(result.output, /Checking test database "selvia_test" on localhost:5432 before migrating \(read-only\)/)
    assert.match(result.output, /Checking test database "selvia_test" on localhost:5432 after migrating \(read-only\)/)
    assert.match(result.output, /migrated and verified/)
    assert.doesNotMatch(result.output, /FAIL/)
  })

  it('starts exactly the local Prisma CLI with migrate deploy and the test configuration, without a shell', async () => {
    const [{ command, args, options }] = (await migrate()).calls
    assert.equal(command, process.execPath)
    assert.deepEqual(args, [FAKE_CLI, 'migrate', 'deploy', '--config', path.join(SERVER_ROOT, 'prisma.test.config.js')])
    assert.equal(TEST_PRISMA_CONFIG_PATH, path.join(SERVER_ROOT, 'prisma.test.config.js'))
    assert.equal(options.shell, false)
    assert.equal(options.cwd, SERVER_ROOT)
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe'])
  })

  it('gives Prisma an environment built from scratch: the checked URLs, runtime variables and CHECKPOINT_DISABLE=1', async () => {
    const env = {
      ...SAFE_ENV,
      PATH: undefined,
      Path: 'C:\\synthetic\\bin;C:\\Windows',
      TEMP: 'C:\\synthetic\\temp',
      TMP: 'C:\\synthetic\\tmp',
      NODE_OPTIONS: '--require ./evil.cjs',
      NODE_ENV: 'production',
      ...PARENT_SECRETS,
      PGPASSFILE: 'C:\\synthetic\\pgpass.conf',
      NEO4J_URI: 'neo4j+s://synthetic.example.com',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      PRISMA_ENGINES_MIRROR: 'https://mirror.example.com',
      HOME: 'C:\\synthetic\\home',
      APPDATA: 'C:\\synthetic\\appdata',
      npm_config_registry: 'https://registry.example.com',
      CHECKPOINT_DISABLE: '0',
    }
    delete env.PATH
    const result = await migrate({ env })
    assert.equal(result.code, 0, result.output)
    const childEnv = result.calls[0].options.env
    assert.deepEqual(Object.keys(childEnv).sort(), ['CHECKPOINT_DISABLE', 'DATABASE_URL', 'DIRECT_URL', 'PATH', 'SystemRoot', 'TEMP', 'TMP'])
    assert.equal(childEnv.CHECKPOINT_DISABLE, '1')
    assert.equal(childEnv.PATH, env.Path)
    assert.equal(childEnv.DATABASE_URL, LOCAL_URL)
    assert.equal(childEnv.DIRECT_URL, LOCAL_URL)
    assert.ok(!Object.keys(childEnv).some((name) => /^(PG|PRISMA_|NODE_|NEO4J|JWT)/i.test(name)))
  })

  it('reads each variable once and gives Prisma and the checks exactly the values that were checked', async () => {
    const reads = {}
    const target = { ...SAFE_ENV }
    const env = new Proxy(target, {
      get(object, name) {
        reads[name] = (reads[name] ?? 0) + 1
        return reads[name] === 1 ? object[name] : SUPABASE_URL
      },
    })
    const result = await migrate({ env })
    assert.equal(result.code, 0, result.output)
    assert.equal(reads.DATABASE_URL, 1)
    assert.equal(reads.DIRECT_URL, 1)
    assert.equal(result.calls[0].options.env.DATABASE_URL, LOCAL_URL)
    assert.equal(result.calls[0].options.env.DIRECT_URL, LOCAL_URL)
    for (const client of result.clients) assert.equal(client.config.connectionString, LOCAL_URL)
  })

  it('passes Prisma’s output on without credentials, even when a value is split across chunks', async () => {
    const encoded = 'Synthetic%40Pass-61'
    const url = `postgresql://${USER}:${encoded}@localhost:5432/selvia_test`
    const child = {
      stdout: [`Datasource at ${url.slice(0, 30)}`, `${url.slice(30)}\n`, `user ${USER} and Synthetic@Pass-61\n`, 'No pending migrations'],
      stderr: [`warning for ${USER}\n`],
    }
    const result = await migrate({ env: { ...SAFE_ENV, DATABASE_URL: url, DIRECT_URL: url }, child })
    assert.equal(result.code, 0, result.output)
    for (const secret of [url, encoded, 'Synthetic@Pass-61', USER]) assert.ok(!result.output.includes(secret), secret)
    assert.match(result.out, /Datasource at \[redacted\]\n/)
    assert.match(result.out, /No pending migrations$/)
    assert.match(result.err, /warning for \[redacted\]/)
  })

  it('stops with Prisma’s exit code when it fails, without checking again or retrying', async () => {
    const result = await migrate({ child: { code: 3 } })
    assert.equal(result.code, 3)
    assert.equal(result.calls.length, 1)
    assert.equal(result.clients.length, 1)
    assert.match(result.output, /prisma migrate deploy exited with code 3\. The database may be partly migrated/)
    assert.match(result.output, /Nothing was retried, repaired or removed/)
  })

  it('fails when Prisma is stopped by a signal, cannot start, or spawn throws', async () => {
    const signal = await migrate({ child: { code: null, signal: 'SIGTERM' } })
    assert.equal(signal.code, 1)
    assert.match(signal.output, /was stopped by SIGTERM/)
    for (const child of [{ error: new Error(`spawn ENOENT ${LOCAL_URL}`) }, { throws: true }]) {
      const result = await migrate({ child })
      assert.equal(result.code, 1)
      assert.equal(result.clients.length, 1)
      assert.match(result.output, /The Prisma CLI could not be started/)
    }
  })
})

describe('test migration, the check after migrating', () => {
  it('fails when the database does not hold exactly the migrations afterwards', async () => {
    for (const stage of [EMPTY_STAGE, { contents: MIGRATED, migrations: APPLIED.slice(0, -1) }]) {
      const result = await migrate({ database: mockDatabase({ after: stage }) })
      assert.equal(result.code, 1)
      assert.equal(result.calls.length, 1)
      assert.match(result.output, /Prisma reported success, but the database does not hold exactly the expected migrations/)
      assert.match(result.output, /investigate manually/)
    }
  })

  it('fails when the database checked afterwards is not the one checked before', async () => {
    for (const identity of [{ ...IDENTITY, database_oid: '99999' }, { ...IDENTITY, server_started_at: '2026-10-14 10:00:00+05:30' }]) {
      const result = await migrate({ database: mockDatabase({ after: { ...MIGRATED_STAGE, identity } }) })
      assert.equal(result.code, 1)
      assert.match(result.output, /not the one checked before/)
    }
  })

  it('fails when the database cannot be checked afterwards', async () => {
    const result = await migrate({ database: mockDatabase({ after: { ...MIGRATED_STAGE, fail: { [CONTENTS_SQL]: driverError('57P01') } } }) })
    assert.equal(result.code, 1)
    assert.match(result.output, /listing schemas and tables failed \(57P01\)/)
    assert.match(result.output, /could not be verified afterwards/)
    assert.deepEqual(result.clients[1].statements.slice(-2), [ROLLBACK_SQL, 'END'])
  })
})

describe('migration state', () => {
  const classify = (facts) => classifyMigrationState(facts, { database: 'selvia_test', expectedMigrations: MIGRATION_NAMES }).state
  const facts = (stage) => ({ ...IDENTITY, ...FINGERPRINTS, ...(stage.contents ?? EMPTY), migrations: stage.migrations ?? null })

  it('is empty, migrated, unexpected or refused', () => {
    assert.equal(classify(facts(EMPTY_STAGE)), MIGRATION_STATES.EMPTY)
    assert.equal(classify(facts(MIGRATED_STAGE)), MIGRATION_STATES.MIGRATED)
    assert.equal(classify(facts({ contents: MIGRATED, migrations: [] })), MIGRATION_STATES.UNEXPECTED)
    assert.equal(classify({ ...facts(MIGRATED_STAGE), bypass_rls: true }), MIGRATION_STATES.REFUSED)
    assert.equal(classify({ ...facts(EMPTY_STAGE), server_started_at: undefined }), MIGRATION_STATES.REFUSED)
    assert.equal(classify(undefined), MIGRATION_STATES.REFUSED)
  })
})

describe('credential redaction', () => {
  it('removes the URLs and their user names and passwords, raw and decoded', () => {
    const url = `postgresql://${USER}:Synthetic%40Pass-61@localhost:5432/selvia_test`
    const redact = createRedactor({ DATABASE_URL: url, DIRECT_URL: url })
    assert.equal(redact(`a ${url} b`), 'a [redacted] b')
    assert.equal(redact(`${USER} Synthetic%40Pass-61 Synthetic@Pass-61`), '[redacted] [redacted] [redacted]')
    assert.equal(redact('selvia_test on localhost:5432'), 'selvia_test on localhost:5432')
  })
})

describe('local Prisma CLI', () => {
  it('is the entry point the installed prisma package declares, inside server/node_modules', () => {
    const cli = resolvePrismaCli()
    const expected = realpathSync.native(path.join(SERVER_ROOT, 'node_modules', 'prisma', JSON.parse(readFileSync(path.join(SERVER_ROOT, 'node_modules', 'prisma', 'package.json'), 'utf8')).bin.prisma))
    assert.equal(cli, expected)
  })

  it('is refused when it is not installed beside the given server', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'selvia-no-prisma-'))
    try {
      assert.throws(() => resolvePrismaCli({ serverRoot: empty }), TestDatabaseMigrationError)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('test migration module, by inspection', () => {
  it('imports only Node built-ins and the test support modules, and loads no env file', () => {
    const code = readFileSync(MODULE_PATH, 'utf8').split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n')
    const imports = [...code.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
    assert.deepEqual(imports.filter((specifier) => !specifier.startsWith('node:')).sort(), [
      './postgresEnvironment.js',
      './testDatabaseGuard.js',
      './testDatabaseIdentity.js',
    ])
    for (const pattern of [/loadEnvFile/, /dotenv/, /src\//, /npx/, /shell:\s*true/, /\bexec(?:Sync)?\(/]) {
      assert.doesNotMatch(code, pattern, `${pattern}`)
    }
  })
})

describe('migrate-test-database.js from the command line', () => {
  const TRIPWIRE = `data:text/javascript,${encodeURIComponent(
    "import net from 'node:net'; net.Socket.prototype.connect = function () { process.stderr.write('NETWORK ATTEMPT'); process.exit(97) }",
  )}`

  function start(args, env) {
    const result = spawnSync(process.execPath, ['--import', TRIPWIRE, path.join('scripts', 'migrate-test-database.js'), ...args], {
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

  it('refuses before connecting or starting Prisma', { timeout: 180_000 }, () => {
    const cases = [
      [['--force'], { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL }, /it takes no arguments/],
      [[], {}, /DATABASE_URL must be set explicitly/],
      [[], { DATABASE_URL: LOCAL_URL, DIRECT_URL: SUPABASE_URL }, /DIRECT_URL refers to Supabase/],
      [[], { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, PGPORT: '6543' }, /PGPORT is set/],
      [[], { DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, DEBUG: 'prisma*' }, /DEBUG is set/],
    ]
    for (const [args, env, pattern] of cases) {
      const result = start(args, env)
      assert.equal(result.status, 1)
      assert.match(result.output, pattern)
      assert.doesNotMatch(result.output, /Checking test database|Running prisma/)
    }
  })
})
