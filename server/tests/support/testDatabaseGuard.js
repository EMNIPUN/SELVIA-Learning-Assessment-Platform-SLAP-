// Fail-closed guard for database integration tests. Load it, and call assertSafeTestDatabaseEnv(), before
// importing anything that reads the configuration (src/config/env.js loads server/.env, and prisma.config.js
// prefers DIRECT_URL over DATABASE_URL), so that a test run can only ever reach a local *_test database.
//
// It reads only the environment it is given: it never loads server/.env and never substitutes a missing value.
// Errors name the variable and the rule that failed, never a URL, host, user name or password.
//
// Deliberately free of imports from src/ and of Prisma: importing them could load server/.env or open a connection.

export const TEST_DATABASE_VARIABLES = Object.freeze(['DATABASE_URL', 'DIRECT_URL'])

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])
const DEFAULT_PORT = '5432'
const TEST_DATABASE_SUFFIX = '_test'

// Query parameters that cannot redirect the connection. Anything else (host, hostaddr, service, dbname, ...)
// could point the client at another server or database than the URL's own host and path, so it is refused.
const ALLOWED_PARAMETERS = new Set([
  'schema',
  'sslmode',
  'connect_timeout',
  'application_name',
  'connection_limit',
  'pool_timeout',
])

export class TestDatabaseGuardError extends Error {
  constructor(message) {
    super(`Refusing to use a database for tests: ${message}`)
    this.name = 'TestDatabaseGuardError'
  }
}

// `new URL` errors carry the input, so the original error is dropped rather than kept as a cause.
function parseUrl(name, value) {
  try {
    return new URL(value)
  } catch {
    throw new TestDatabaseGuardError(`${name} is not a valid URL.`)
  }
}

function databaseNameOf(name, url) {
  let database
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    throw new TestDatabaseGuardError(`${name} has an invalid database name.`)
  }
  if (database === '' || database.includes('/')) {
    throw new TestDatabaseGuardError(`${name} must name exactly one database.`)
  }
  return database
}

// Checks one variable and returns where it points: { host, port, database }.
function checkTestDatabaseUrl(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TestDatabaseGuardError(`${name} must be set explicitly for the test process.`)
  }
  if (/supabase/i.test(value)) {
    throw new TestDatabaseGuardError(`${name} refers to Supabase; tests may only use a local database.`)
  }

  const url = parseUrl(name, value)
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new TestDatabaseGuardError(`${name} must use the postgresql:// or postgres:// protocol.`)
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new TestDatabaseGuardError(`${name} must point to localhost or 127.0.0.1; its host is not local.`)
  }
  for (const parameter of url.searchParams.keys()) {
    if (!ALLOWED_PARAMETERS.has(parameter)) {
      throw new TestDatabaseGuardError(`${name} has the query parameter "${parameter}", which is not allowed for tests.`)
    }
  }

  const database = databaseNameOf(name, url)
  if (!database.endsWith(TEST_DATABASE_SUFFIX) || database === TEST_DATABASE_SUFFIX) {
    throw new TestDatabaseGuardError(`${name} must name a database ending in "${TEST_DATABASE_SUFFIX}".`)
  }
  return { host: url.hostname, port: url.port || DEFAULT_PORT, database }
}

// Validates DATABASE_URL and DIRECT_URL in `env` (process.env by default) and returns
// { host, port, database, assertUnchanged(env) }. assertUnchanged throws if either variable no longer holds the
// value checked here, for use after importing modules that load server/.env. The checked values are kept private
// so that logging the result cannot reveal them.
export function assertSafeTestDatabaseEnv(env = process.env) {
  const [databaseUrl, directUrl] = TEST_DATABASE_VARIABLES.map((name) => env[name])
  const app = checkTestDatabaseUrl('DATABASE_URL', databaseUrl)
  const cli = checkTestDatabaseUrl('DIRECT_URL', directUrl)

  if (app.host !== cli.host || app.port !== cli.port || app.database !== cli.database) {
    throw new TestDatabaseGuardError('DATABASE_URL and DIRECT_URL must point to the same host, port and database.')
  }

  const checked = { DATABASE_URL: databaseUrl, DIRECT_URL: directUrl }
  return Object.freeze({
    ...app,
    assertUnchanged(current = process.env) {
      for (const name of TEST_DATABASE_VARIABLES) {
        if (current[name] !== checked[name]) {
          throw new TestDatabaseGuardError(`${name} changed after it was checked; something loaded another configuration.`)
        }
      }
    },
  })
}

// The URL for test migrations (prisma.test.config.js): both variables are read once, checked together, and the
// DIRECT_URL value that passed is returned, so nothing read later can take its place.
export function testMigrationUrl(env = process.env) {
  const databaseEnv = Object.fromEntries(TEST_DATABASE_VARIABLES.map((name) => [name, env[name]]))
  assertSafeTestDatabaseEnv(databaseEnv)
  return databaseEnv.DIRECT_URL
}
