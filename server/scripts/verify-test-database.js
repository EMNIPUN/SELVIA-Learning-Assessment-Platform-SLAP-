// Read-only identity check of the integration-test database:
//   npm run test:db:verify -- --pre-migration    before npm run test:db:migrate: the public schema must be empty
//   npm run test:db:verify -- --post-migration   afterwards: exactly the application's tables and migrations
// DATABASE_URL and DIRECT_URL must pass the test database guard first. It never loads server/.env, never writes, and
// cannot prove that the server behind localhost is isolated. Checks and limits: tests/integration/README.md.
import { runTestDatabaseVerification } from '../tests/support/testDatabaseIdentity.js'

process.exitCode = await runTestDatabaseVerification({ argv: process.argv.slice(2) })
