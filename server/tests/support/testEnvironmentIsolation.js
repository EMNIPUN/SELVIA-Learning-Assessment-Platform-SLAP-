// Settings an integration test process must never take from the developer's environment or from server/.env (which
// src/config/env.js loads, filling in only variables that are not set): the Neo4j connection, so that no test can
// reach the course graph, and the JWT secret, so that no token made in a test is valid anywhere else. The runner sets
// them for every test process, the preload refuses a process without them, and assertUnchanged() detects a later
// replacement. Errors name the variable and the rule, never a value.
import { randomBytes } from 'node:crypto'

// Empty strings, not absent: an empty value counts as set, so loading server/.env leaves it empty, and the
// application treats Neo4j as not configured.
export const NEO4J_CONNECTION_VARIABLES = Object.freeze(['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD'])
export const ISOLATED_VARIABLES = Object.freeze([...NEO4J_CONNECTION_VARIABLES, 'JWT_SECRET'])
const MIN_JWT_SECRET_LENGTH = 32

export class TestEnvironmentError extends Error {
  constructor(message) {
    super(`Refusing to start a test process: ${message}`)
    this.name = 'TestEnvironmentError'
  }
}

// New values for every run: Neo4j switched off and a random JWT secret that exists only in the test processes.
export function createIsolatedTestEnv() {
  return {
    ...Object.fromEntries(NEO4J_CONNECTION_VARIABLES.map((name) => [name, ''])),
    JWT_SECRET: randomBytes(48).toString('base64url'),
  }
}

// Checks that `env` has the isolated settings and returns { assertUnchanged(env) }, which throws if any of them no
// longer holds the value checked here. The checked values are kept private.
export function assertIsolatedTestEnv(env = process.env) {
  for (const name of NEO4J_CONNECTION_VARIABLES) {
    if (env[name] !== '') {
      throw new TestEnvironmentError(`${name} must be set to an empty string for integration tests.`)
    }
  }
  const secret = env.JWT_SECRET
  if (typeof secret !== 'string' || secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new TestEnvironmentError(`JWT_SECRET must be a generated test secret of at least ${MIN_JWT_SECRET_LENGTH} characters.`)
  }

  const checked = Object.fromEntries(ISOLATED_VARIABLES.map((name) => [name, env[name]]))
  return Object.freeze({
    assertUnchanged(current = process.env) {
      for (const name of ISOLATED_VARIABLES) {
        if (current[name] !== checked[name]) {
          throw new TestEnvironmentError(`${name} changed after it was checked; something loaded another configuration.`)
        }
      }
    },
  })
}
