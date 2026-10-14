// Runs database integration tests against a local *_test database only: npm run test:integration:safe [-- targets].
// Targets are *.integration.test.js files or directories under tests/integration; none means all of them.
// Usage and safety limits: tests/integration/README.md.
import { runIntegrationTests } from './support/integrationRunner.js'

process.exitCode = await runIntegrationTests({ argv: process.argv.slice(2) })
