// Guarded migration of the integration-test database: npm run test:db:migrate (no arguments).
// DATABASE_URL and DIRECT_URL must be set in the terminal and pass the test database guard. The database is verified
// read-only, migrated with prisma.test.config.js only when it is an empty disposable test database, and verified
// again. It never loads server/.env and never repairs, resets or removes anything. Sequence and limits:
// tests/integration/README.md.
import { runTestDatabaseMigration } from '../tests/support/testDatabaseMigration.js'

process.exitCode = await runTestDatabaseMigration({ argv: process.argv.slice(2) })
