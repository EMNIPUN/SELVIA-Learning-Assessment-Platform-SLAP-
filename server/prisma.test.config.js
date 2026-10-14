// Prisma configuration for the disposable integration-test database only: npm run test:db:migrate, which runs
// `prisma migrate deploy --config prisma.test.config.js`. Prisma never picks this file up by itself.
//
// Unlike prisma.config.js it does not import src/config/env.js, so server/.env is never loaded (Prisma 7 loads this
// file with .env loading switched off). DATABASE_URL and DIRECT_URL must both be set for the command and pass the
// test database guard; the migration URL is the DIRECT_URL value that passed. No seed is configured.
//
// Prisma runs migrations in its schema engine, started with this process's environment. The same PG* policy as for
// the tests applies (tests/support/postgresEnvironment.js), and the engine cannot be swapped for another program.
import { defineConfig } from 'prisma/config'
import { assertPostgresEnvironment } from './tests/support/postgresEnvironment.js'
import { TestDatabaseGuardError, testMigrationUrl } from './tests/support/testDatabaseGuard.js'

// Prisma's debug output (DEBUG=prisma*) prints the loaded configuration, connection URL included.
if (process.env.DEBUG || globalThis.DEBUG) {
  throw new TestDatabaseGuardError('DEBUG is set, and Prisma debug output would print the migration URL.')
}

const url = testMigrationUrl(process.env)
assertPostgresEnvironment(process.env)
for (const name of ['PRISMA_SCHEMA_ENGINE_BINARY', 'PRISMA_MIGRATION_ENGINE_BINARY']) {
  if (process.env[name]) {
    throw new TestDatabaseGuardError(`${name} is set, and would replace Prisma's migration engine with another program.`)
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url,
  },
})
