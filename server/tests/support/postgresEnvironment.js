// The PostgreSQL environment policy for everything that connects to the test database. pg (the application's driver
// through Prisma's adapter, and the identity checker's) fills in whatever a connection URL leaves out from PG*
// variables: PGHOST, PGPORT, PGUSER, PGDATABASE, PGOPTIONS, PGREPLICATION, PGSSLMODE, PGSERVICE, ... Any of them could
// make a client connect somewhere, as someone or with options other than what the URL guard checked. So no PG*
// variable may be present, in any letter case, except the two that can only supply a password:
//
// - PGPASSWORD: the password, used only when the URL has none.
// - PGPASSFILE: where pg looks up a password for the host, port, database and user it is already connecting to.
//
// Neither can change the host, port, database, user or options of a connection. Values are never printed.
export const PERMITTED_PG_VARIABLES = Object.freeze(['PGPASSWORD', 'PGPASSFILE'])

export class PostgresEnvironmentError extends Error {
  constructor(message) {
    super(`Refusing to use the PostgreSQL environment: ${message}`)
    this.name = 'PostgresEnvironmentError'
  }
}

export const isPgVariable = (name) => name.toUpperCase().startsWith('PG')
export const isRestrictedPgVariable = (name) => isPgVariable(name) && !PERMITTED_PG_VARIABLES.includes(name.toUpperCase())

// Restricted PG* variables set in `env`, by upper-case name, sorted. Empty values are left out: pg ignores them.
export function restrictedPgVariables(env) {
  const names = Object.entries(env)
    .filter(([name, value]) => isRestrictedPgVariable(name) && value !== undefined && value !== '')
    .map(([name]) => name.toUpperCase())
  return [...new Set(names)].sort()
}

// The permitted PG* variables in `env`, each under its upper-case name. One set under more than one spelling is
// refused, since which value a client would see is unclear.
export function permittedPgEnvironment(env) {
  const values = {}
  for (const [name, value] of Object.entries(env)) {
    const upper = name.toUpperCase()
    if (!PERMITTED_PG_VARIABLES.includes(upper) || value === undefined) continue
    if (Object.hasOwn(values, upper)) {
      throw new PostgresEnvironmentError(`${upper} is set more than once, in different letter case.`)
    }
    values[upper] = value
  }
  return values
}

// Checks that `env` holds no restricted PG* variable and returns { assertUnchanged(env) }, which throws if one has
// appeared since (for example from server/.env) or a permitted one was added, changed or removed.
export function assertPostgresEnvironment(env = process.env) {
  const [restricted] = restrictedPgVariables(env)
  if (restricted) {
    throw new PostgresEnvironmentError(`${restricted} is set, and the PostgreSQL client would use it to change the connection. Unset it.`)
  }
  const checked = permittedPgEnvironment(env)
  return Object.freeze({
    assertUnchanged(current = process.env) {
      const [appeared] = restrictedPgVariables(current)
      if (appeared) {
        throw new PostgresEnvironmentError(`${appeared} appeared after the check; something loaded another configuration.`)
      }
      const now = permittedPgEnvironment(current)
      for (const name of PERMITTED_PG_VARIABLES) {
        if (now[name] !== checked[name]) {
          throw new PostgresEnvironmentError(`${name} changed after it was checked; something loaded another configuration.`)
        }
      }
    },
  })
}
