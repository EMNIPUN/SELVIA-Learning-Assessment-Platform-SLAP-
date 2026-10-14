// Checks that DATABASE_URL and DIRECT_URL, as given to this process, are safe for database integration tests:
// npm run test:db:check. Exits 0 only when both point to the same local *_test database. It does not load
// server/.env, connect to a database or run anything else.
import { assertSafeTestDatabaseEnv, TestDatabaseGuardError } from '../tests/support/testDatabaseGuard.js'

try {
  const { host, port, database } = assertSafeTestDatabaseEnv(process.env)
  console.log(`Test database settings are safe: database "${database}" on ${host}:${port}.`)
} catch (err) {
  console.error(err instanceof TestDatabaseGuardError ? err.message : 'Refusing to use a database for tests: the check failed.')
  process.exitCode = 1
}
