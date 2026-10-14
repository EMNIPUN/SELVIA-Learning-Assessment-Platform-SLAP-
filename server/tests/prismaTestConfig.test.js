// npm run test:db-guard. The Prisma configuration for test migrations (prisma.test.config.js) and its package script.
// Synthetic URLs and temporary files only. The configuration is loaded in separate Node processes, never through the
// Prisma CLI; nothing here loads server/.env, starts Prisma, runs a migration or connects to a database.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, describe, it } from 'node:test'
import { testMigrationUrl, TestDatabaseGuardError } from './support/testDatabaseGuard.js'

const SERVER_ROOT = fileURLToPath(new URL('../', import.meta.url))
const CONFIG_PATH = path.join(SERVER_ROOT, 'prisma.test.config.js')
const GUARD_PATH = fileURLToPath(new URL('./support/testDatabaseGuard.js', import.meta.url))
const POSTGRES_ENV_PATH = fileURLToPath(new URL('./support/postgresEnvironment.js', import.meta.url))

const USER = 'migrate_user'
const PASSWORD = 'Synthetic-Migrate-Secret-64'
// Same database, different connection options: tells apart which of the two the configuration uses.
const APP_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test?application_name=selvia-app`
const CLI_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test?application_name=selvia-migrate`
const REMOTE_URL = `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`
const SUPABASE_URL = `postgresql://${USER}.abcdefgh:${PASSWORD}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
const OTHER_DATABASE_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/other_test`
const PG_VALUE = 'Synthetic-Pg-Value-77'
const PG_PASSWORD = 'Synthetic-Pg-Password-91'
const ENGINE_PATH = 'C:\\synthetic\\not-an-engine.exe'
const SECRETS = [USER, PASSWORD, APP_URL, CLI_URL, REMOTE_URL, SUPABASE_URL, OTHER_DATABASE_URL, PG_VALUE, PG_PASSWORD, ENGINE_PATH]
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

function assertNoSecrets(text) {
  for (const secret of SECRETS) assert.ok(!text.includes(secret), 'output contains a secret')
}

describe('test migration URL', () => {
  it('is the checked DIRECT_URL, not DATABASE_URL', () => {
    assert.equal(testMigrationUrl({ DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL }), CLI_URL)
  })

  it('reads each variable once, so a value that changes between reads cannot replace the checked one', () => {
    const reads = {}
    const env = new Proxy(
      { DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL },
      {
        get(target, name) {
          reads[name] = (reads[name] ?? 0) + 1
          return reads[name] === 1 ? target[name] : SUPABASE_URL
        },
      },
    )
    assert.equal(testMigrationUrl(env), CLI_URL)
    assert.deepEqual(reads, { DATABASE_URL: 1, DIRECT_URL: 1 })
  })

  it('is refused unless both URLs point to the same local *_test database, without revealing them', () => {
    const cases = [
      [{ DATABASE_URL: APP_URL }, /DIRECT_URL must be set explicitly/],
      [{ DIRECT_URL: CLI_URL }, /DATABASE_URL must be set explicitly/],
      [{ DATABASE_URL: APP_URL, DIRECT_URL: REMOTE_URL }, /DIRECT_URL must point to localhost/],
      [{ DATABASE_URL: APP_URL, DIRECT_URL: SUPABASE_URL }, /DIRECT_URL refers to Supabase/],
      [{ DATABASE_URL: SUPABASE_URL, DIRECT_URL: CLI_URL }, /DATABASE_URL refers to Supabase/],
      [{ DATABASE_URL: APP_URL, DIRECT_URL: OTHER_DATABASE_URL }, /must point to the same host, port and database/],
      [{ DATABASE_URL: APP_URL, DIRECT_URL: 'not a url' }, /DIRECT_URL is not a valid URL/],
    ]
    for (const [env, pattern] of cases) {
      assert.throws(
        () => testMigrationUrl(env),
        (err) => err instanceof TestDatabaseGuardError && pattern.test(err.message) && SECRETS.every((s) => !err.message.includes(s)),
      )
    }
  })
})

describe('prisma.test.config.js, loaded in a separate process', () => {
  // The working directory holds a synthetic .env with valid-looking settings: if anything loaded it, a run without
  // the variables would succeed. process.loadEnvFile is replaced by a recorder, so that even a configuration that
  // wrongly imported src/config/env.js could not load server/.env here.
  let workspace

  before(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'selvia-prisma-config-'))
    writeFileSync(path.join(workspace, '.env'), `DATABASE_URL=${APP_URL}\nDIRECT_URL=${CLI_URL}\nSELVIA_DOTENV_SENTINEL=loaded\n`)
  })
  after(() => rmSync(workspace, { recursive: true, force: true }))

  const LOADER = `import { createHash } from 'node:crypto'
let loadEnvFileCalls = 0
process.loadEnvFile = () => { loadEnvFileCalls += 1 }
const before = new Set(Object.keys(process.env))
const sha256 = (value) => (typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : null)
try {
  const { default: config } = await import(${JSON.stringify(pathToFileURL(CONFIG_PATH).href)})
  console.log(JSON.stringify({
    url: sha256(config.datasource?.url),
    datasourceKeys: Object.keys(config.datasource ?? {}),
    schema: config.schema ?? null,
    migrations: config.migrations ?? null,
    loadEnvFileCalls,
    sentinel: process.env.SELVIA_DOTENV_SENTINEL ?? null,
    addedVariables: Object.keys(process.env).filter((name) => !before.has(name)).length,
  }))
} catch (err) {
  console.error(String(err))
  process.exitCode = 1
}
`

  function loadConfig(env) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', LOADER], {
      cwd: workspace,
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...env },
      encoding: 'utf8',
      shell: false,
      timeout: 60_000,
    })
    assertNoSecrets(`${result.stdout}\n${result.stderr}`)
    return result
  }

  it('uses the checked DIRECT_URL as the migration URL, configures no seed and loads no env file', { timeout: 60_000 }, () => {
    const result = loadConfig({ DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      url: sha256(CLI_URL),
      datasourceKeys: ['url'],
      schema: 'prisma/schema.prisma',
      migrations: { path: 'prisma/migrations' },
      loadEnvFileCalls: 0,
      sentinel: null,
      addedVariables: 0,
    })
  })

  it('refuses unless both URLs are given, although an env file in the working directory holds both', { timeout: 60_000 }, () => {
    const cases = [
      [{}, /DATABASE_URL must be set explicitly/],
      [{ DATABASE_URL: APP_URL }, /DIRECT_URL must be set explicitly/],
      [{ DIRECT_URL: CLI_URL }, /DATABASE_URL must be set explicitly/],
    ]
    for (const [env, pattern] of cases) {
      const result = loadConfig(env)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /^TestDatabaseGuardError: Refusing to use a database for tests: /)
      assert.match(result.stderr, pattern)
    }
  })

  it('refuses remote, Supabase and mismatched URLs without revealing them', { timeout: 60_000 }, () => {
    const cases = [
      [{ DATABASE_URL: APP_URL, DIRECT_URL: REMOTE_URL }, /DIRECT_URL must point to localhost/],
      [{ DATABASE_URL: REMOTE_URL, DIRECT_URL: CLI_URL }, /DATABASE_URL must point to localhost/],
      [{ DATABASE_URL: APP_URL, DIRECT_URL: SUPABASE_URL }, /DIRECT_URL refers to Supabase/],
      [{ DATABASE_URL: APP_URL, DIRECT_URL: OTHER_DATABASE_URL }, /must point to the same host, port and database/],
    ]
    for (const [env, pattern] of cases) {
      const result = loadConfig(env)
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, pattern)
    }
  })

  it('refuses while Prisma debug output, which would print the URL, is switched on', { timeout: 60_000 }, () => {
    const result = loadConfig({ DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL, DEBUG: 'prisma*' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /DEBUG is set, and Prisma debug output would print the migration URL/)
  })

  // Prisma starts its schema engine with this process's environment, so the PG* policy of the tests applies here too.
  it('refuses PG* variables that could redirect the migration engine, in any letter case', { timeout: 60_000 }, () => {
    for (const [name, upper] of [['PGPORT', 'PGPORT'], ['PGSERVICE', 'PGSERVICE'], ['pgHost', 'PGHOST'], ['PgOptions', 'PGOPTIONS']]) {
      const result = loadConfig({ DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL, [name]: PG_VALUE })
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, /^PostgresEnvironmentError: Refusing to use the PostgreSQL environment: /)
      assert.match(result.stderr, new RegExp(`${upper} is set`))
    }
  })

  it('allows PGPASSWORD and PGPASSFILE, which cannot change where the engine connects', { timeout: 60_000 }, () => {
    const result = loadConfig({ DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL, PGPASSWORD: PG_PASSWORD, PGPASSFILE: PG_VALUE })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(JSON.parse(result.stdout).url, sha256(CLI_URL))
  })

  it('refuses a replacement for Prisma’s migration engine', { timeout: 60_000 }, () => {
    for (const name of ['PRISMA_SCHEMA_ENGINE_BINARY', 'PRISMA_MIGRATION_ENGINE_BINARY']) {
      const result = loadConfig({ DATABASE_URL: APP_URL, DIRECT_URL: CLI_URL, [name]: ENGINE_PATH })
      assert.equal(result.status, 1)
      assert.equal(result.stdout, '')
      assert.match(result.stderr, new RegExp(`${name} is set, and would replace Prisma's migration engine`))
    }
  })
})

describe('prisma.test.config.js, by inspection', () => {
  const codeOf = (file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')
  // Every module specifier: `import '...'`, `... from '...'` and `import('...')`.
  const importsOf = (file) => [...codeOf(file).matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])

  it('imports only prisma/config, the PostgreSQL environment policy and the test database guard, and none loads an env file', () => {
    assert.deepEqual(importsOf(CONFIG_PATH), [
      'prisma/config',
      './tests/support/postgresEnvironment.js',
      './tests/support/testDatabaseGuard.js',
    ])
    assert.deepEqual(importsOf(GUARD_PATH), [])
    assert.deepEqual(importsOf(POSTGRES_ENV_PATH), [])
    for (const file of [CONFIG_PATH, GUARD_PATH, POSTGRES_ENV_PATH]) {
      const code = codeOf(file)
      for (const pattern of [/loadEnvFile/, /dotenv/, /src\//, /readFileSync|readFile\(/, /\bimport\(/]) {
        assert.doesNotMatch(code, pattern, `${path.basename(file)} matches ${pattern}`)
      }
    }
  })

  it('is loaded by the installed Prisma with .env loading switched off', () => {
    // Resolved from the CLI package, so that this is the copy the CLI itself loads.
    const requireFromServer = createRequire(path.join(SERVER_ROOT, 'package.json'))
    const requireFromCli = createRequire(requireFromServer.resolve('prisma/package.json'))
    const configPackage = path.dirname(requireFromCli.resolve('@prisma/config/package.json'))
    const { version } = JSON.parse(readFileSync(path.join(configPackage, 'package.json'), 'utf8'))
    const source = readFileSync(path.join(configPackage, 'dist', 'index.js'), 'utf8')
    assert.match(version, /^7\./)
    assert.match(source, /loadConfigWithC12\(\{[\s\S]*?\bdotenv: false,[\s\S]*?\}\)/)
  })

  // What source inspection of the installed CLI showed: its JavaScript reads no PG* variable itself (what the compiled
  // schema engine does with the environment it inherits cannot be established this way), and it lets two variables
  // replace the engine, which the configuration refuses.
  it('runs with an installed Prisma CLI that names no PG* variable and honours the engine replacement variables', () => {
    const requireFromServer = createRequire(path.join(SERVER_ROOT, 'package.json'))
    const cli = readFileSync(path.join(path.dirname(requireFromServer.resolve('prisma/package.json')), 'build', 'cli.js'), 'utf8')
    assert.deepEqual(cli.match(/\bPG[A-Z_]{2,}\b/g), null)
    for (const name of ['PRISMA_SCHEMA_ENGINE_BINARY', 'PRISMA_MIGRATION_ENGINE_BINARY']) assert.ok(cli.includes(name), name)
  })

  it('is not a file name Prisma picks up by itself, so other Prisma commands keep using prisma.config.js', () => {
    assert.doesNotMatch(path.basename(CONFIG_PATH), /^prisma7?\.config\.[cm]?[jt]s$/)
  })
})

describe('package scripts', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8'))

  it('test:db:migrate runs the guarded migration script, and no script starts Prisma with the test configuration itself', () => {
    assert.equal(scripts['test:db:migrate'], 'node scripts/migrate-test-database.js')
    const usingTestConfig = Object.entries(scripts).filter(([, command]) => command.includes('prisma.test.config'))
    assert.deepEqual(usingTestConfig.map(([name]) => name), [])
  })

  it('leaves the existing Prisma scripts unchanged', () => {
    assert.deepEqual(
      Object.fromEntries(Object.entries(scripts).filter(([name]) => name.startsWith('db:'))),
      {
        'db:format': 'prisma format',
        'db:validate': 'prisma validate',
        'db:generate': 'prisma generate',
        'db:migrate': 'prisma migrate dev',
        'db:deploy': 'prisma migrate deploy',
        'db:status': 'prisma migrate status',
        'db:seed': 'prisma db seed',
        'db:studio': 'prisma studio',
      },
    )
  })
})
