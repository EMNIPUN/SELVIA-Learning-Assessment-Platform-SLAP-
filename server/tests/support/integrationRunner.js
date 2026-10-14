// Runs database integration tests only against a database the test guard accepts (see tests/integration/README.md).
// Order matters: the environment is checked, the test files resolved and their entry checked before any child
// process exists, so a refused check cannot fall through to a test run. The child is `node --test` with the guard
// preloaded into every test process, started without a shell and with the checked values passed explicitly, along
// with Neo4j switched off and a JWT secret generated for this run (testEnvironmentIsolation.js), and without any PG*
// variable but PGPASSWORD and PGPASSFILE (postgresEnvironment.js).
//
// Deliberately free of imports from src/ and of Prisma: importing them could load server/.env or open a connection.
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertPostgresEnvironment,
  isPgVariable,
  permittedPgEnvironment,
  PostgresEnvironmentError,
} from './postgresEnvironment.js'
import { assertSafeTestDatabaseEnv, TEST_DATABASE_VARIABLES, TestDatabaseGuardError } from './testDatabaseGuard.js'
import {
  assertIsolatedTestEnv,
  createIsolatedTestEnv,
  ISOLATED_VARIABLES,
  TestEnvironmentError,
} from './testEnvironmentIsolation.js'

export const INTEGRATION_TEST_SUFFIX = '.integration.test.js'
export const INTEGRATION_TEST_DIR = fileURLToPath(new URL('../integration/', import.meta.url))
export const PRELOAD_PATH = fileURLToPath(new URL('./integrationPreload.js', import.meta.url))
const SERVER_ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Not passed on to the tests: NODE_OPTIONS could preload other code or an env file, and NODE_TEST_CONTEXT would make
// the child report to whichever test run started this one instead of running its own.
const DROPPED_VARIABLES = ['NODE_OPTIONS', 'NODE_TEST_CONTEXT']

// The child's environment: `env` without any of `replaced` or `DROPPED_VARIABLES` and without any PG* variable, in any
// letter case (Windows names are case-insensitive, so another spelling could otherwise reach the child beside the
// value set here), plus `values`. The permitted PG* variables come back through `values`, under one spelling.
function childEnvironment(env, replaced, values) {
  const removed = new Set([...replaced, ...DROPPED_VARIABLES].map((name) => name.toUpperCase()))
  const kept = Object.entries(env).filter(([name]) => !removed.has(name.toUpperCase()) && !isPgVariable(name))
  return { ...Object.fromEntries(kept), ...values }
}

export class IntegrationRunnerError extends Error {
  constructor(message) {
    super(`Refusing to run integration tests: ${message}`)
    this.name = 'IntegrationRunnerError'
  }
}

function isInside(directory, target) {
  const relative = path.relative(directory, target)
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
}

// Integration test files under `directory`. Symbolic links and junctions are not followed, so nothing outside the
// integration test directory can be reached through one.
function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) return []
    if (entry.isDirectory()) return collectTestFiles(entryPath)
    return entry.isFile() && entry.name.endsWith(INTEGRATION_TEST_SUFFIX) ? [entryPath] : []
  })
}

function realPathOf(target, label) {
  try {
    return realpathSync.native(target)
  } catch {
    throw new IntegrationRunnerError(`${label} was not found.`)
  }
}

// The test files to run, sorted. `args` are files or directories inside `integrationDir`, resolved from `cwd`; none
// means the whole directory. Options, anything outside the directory (after resolving links) and files that are not
// *.integration.test.js are refused, as is an empty selection.
export function resolveTestTargets(args, { cwd = process.cwd(), integrationDir = INTEGRATION_TEST_DIR } = {}) {
  const root = realPathOf(integrationDir, 'The integration test directory')
  const files = new Set()

  for (const arg of args.length === 0 ? [root] : args) {
    if (typeof arg !== 'string' || arg.trim() === '') {
      throw new IntegrationRunnerError('a test target is empty.')
    }
    if (arg.startsWith('-')) {
      throw new IntegrationRunnerError(`options are not accepted (${arg}); give test files or directories under tests/integration.`)
    }
    const target = realPathOf(path.resolve(cwd, arg), `The test target ${arg}`)
    if (!isInside(root, target)) {
      throw new IntegrationRunnerError(`${arg} is outside the integration test directory.`)
    }
    const stats = statSync(target)
    if (stats.isDirectory()) {
      for (const file of collectTestFiles(target)) files.add(file)
    } else if (stats.isFile() && target.endsWith(INTEGRATION_TEST_SUFFIX)) {
      files.add(target)
    } else {
      throw new IntegrationRunnerError(`${arg} is not an integration test file (*${INTEGRATION_TEST_SUFFIX}).`)
    }
  }

  if (files.size === 0) {
    throw new IntegrationRunnerError('no integration test files were found.')
  }
  return [...files].sort()
}

// Whitespace and comments before a module's first statement. An unterminated comment is not matched, so the file is
// then refused.
const LEADING_TRIVIA = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/
// `import '<specifier>'` or `import <bindings> from '<specifier>'`.
const FIRST_IMPORT = /^import\s*(?:[\w$\s{},*]*?\s*from\s*)?(['"])([^'"\r\n]+)\1/

function isPreloadSpecifier(specifier, file) {
  if (/[?#]/.test(specifier)) return false
  let target
  if (specifier.startsWith('file:')) {
    try {
      target = fileURLToPath(specifier)
    } catch {
      return false
    }
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    target = path.resolve(path.dirname(file), specifier)
  } else {
    return false
  }
  try {
    return realpathSync.native(target) === realpathSync.native(PRELOAD_PATH)
  } catch {
    return false
  }
}

// An ES module evaluates its static imports in the order they appear, before its own code, so a test file whose
// first statement imports integrationPreload.js runs the guard before anything else it imports or does, however it
// is started: through this runner, `node --test` or plain `node`. Refuses any file that does not begin that way.
export function assertGuardedEntry(file) {
  let source
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    throw new IntegrationRunnerError(`${path.basename(file)} could not be read.`)
  }
  let text = source.replace(/^\uFEFF/, '')
  if (text.startsWith('#!')) {
    const end = text.indexOf('\n')
    text = end === -1 ? '' : text.slice(end + 1)
  }
  const match = text.slice(text.match(LEADING_TRIVIA)[0].length).match(FIRST_IMPORT)
  if (!match || !isPreloadSpecifier(match[2], file)) {
    throw new IntegrationRunnerError(
      `${path.basename(file)} must import tests/support/integrationPreload.js as its first statement.`,
    )
  }
}

const safeMessage = (err) =>
  err instanceof TestDatabaseGuardError ||
  err instanceof TestEnvironmentError ||
  err instanceof PostgresEnvironmentError ||
  err instanceof IntegrationRunnerError
    ? err.message
    : 'Refusing to run integration tests: the safety check failed.'

// Resolves to the exit code: the child's, or 1 when anything is refused or the child cannot run. `argv` are the
// test targets. The rest exist for the runner's own tests.
export async function runIntegrationTests({
  argv = [],
  env = process.env,
  cwd = process.cwd(),
  integrationDir = INTEGRATION_TEST_DIR,
  spawnProcess = spawn,
  stdio = 'inherit',
  reportError = (message) => console.error(message),
} = {}) {
  // Read once, so that what is checked is exactly what the child receives.
  const databaseEnv = Object.fromEntries(TEST_DATABASE_VARIABLES.map((name) => [name, env[name]]))
  let files
  let childEnv
  try {
    const checked = assertSafeTestDatabaseEnv(databaseEnv)
    files = resolveTestTargets(argv, { cwd, integrationDir })
    for (const file of files) assertGuardedEntry(file)
    childEnv = childEnvironment(env, [...TEST_DATABASE_VARIABLES, ...ISOLATED_VARIABLES, 'NODE_ENV'], {
      ...permittedPgEnvironment(env),
      ...databaseEnv,
      ...createIsolatedTestEnv(),
      NODE_ENV: 'test',
    })
    checked.assertUnchanged(env)
    checked.assertUnchanged(childEnv)
    assertIsolatedTestEnv(childEnv)
    assertPostgresEnvironment(childEnv)
  } catch (err) {
    reportError(safeMessage(err))
    return 1
  }

  const args = ['--import', pathToFileURL(PRELOAD_PATH).href, '--test', '--test-concurrency=1', ...files]
  return new Promise((resolve) => {
    let settled = false
    const finish = (code, message) => {
      if (settled) return
      settled = true
      if (message) reportError(message)
      resolve(code)
    }
    const fail = () => finish(1, 'Refusing to run integration tests: the test process could not be started.')
    let child
    try {
      child = spawnProcess(process.execPath, args, { cwd: SERVER_ROOT, env: childEnv, stdio, shell: false, windowsHide: true })
    } catch {
      fail()
      return
    }
    child.once('error', fail)
    child.once('exit', (code, signal) => finish(signal || code === null ? 1 : code))
  })
}
