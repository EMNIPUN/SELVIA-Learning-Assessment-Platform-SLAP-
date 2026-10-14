// The guard's entry point for integration tests. Every *.integration.test.js imports this module as its first
// statement, and the runner also preloads it with --import, so the settings are checked in the process where the
// tests run before any other module the test imports is evaluated and before any test code: the database settings
// (testDatabaseGuard.js), the isolated Neo4j and JWT settings (testEnvironmentIsolation.js) and the absence of PG*
// variables other than PGPASSWORD and PGPASSFILE (postgresEnvironment.js). If they are refused, the process exits at
// once. Tests that import modules reading the configuration (src/config/env.js loads server/.env) call
// checkedTestDatabase.assertUnchanged() right after those imports; it covers all of them.
import { assertPostgresEnvironment, PostgresEnvironmentError } from './postgresEnvironment.js'
import { assertSafeTestDatabaseEnv, TestDatabaseGuardError } from './testDatabaseGuard.js'
import { assertIsolatedTestEnv, TestEnvironmentError } from './testEnvironmentIsolation.js'

export const TEST_DATABASE_CHECKED = Symbol.for('selvia.testDatabaseChecked')

let checked
try {
  const database = assertSafeTestDatabaseEnv(process.env)
  const isolation = assertIsolatedTestEnv(process.env)
  const postgres = assertPostgresEnvironment(process.env)
  checked = Object.freeze({
    host: database.host,
    port: database.port,
    database: database.database,
    assertUnchanged(current = process.env) {
      database.assertUnchanged(current)
      isolation.assertUnchanged(current)
      postgres.assertUnchanged(current)
    },
  })
} catch (err) {
  const safe = err instanceof TestDatabaseGuardError || err instanceof TestEnvironmentError || err instanceof PostgresEnvironmentError
  console.error(safe ? err.message : 'Refusing to use a database for tests: the check failed.')
  process.exit(1)
}
globalThis[TEST_DATABASE_CHECKED] = true

export const checkedTestDatabase = checked
