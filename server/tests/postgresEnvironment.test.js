// npm run test:db-guard. The PG* variable policy shared by the integration runner, the preload, the identity checker
// and the test migration configuration. Synthetic environments only; nothing here connects to anything.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  assertPostgresEnvironment,
  isPgVariable,
  isRestrictedPgVariable,
  PERMITTED_PG_VARIABLES,
  permittedPgEnvironment,
  PostgresEnvironmentError,
  restrictedPgVariables,
} from './support/postgresEnvironment.js'

const PG_PASSWORD = 'Synthetic-Pg-Password-53'
const PASSFILE = 'C:\\synthetic\\pgpass.conf'
// Each would let pg connect to another host, port, database or service, as another user or with other options.
const REDIRECTING = {
  PGHOST: 'db.example.com',
  PGPORT: '5433',
  PGUSER: 'synthetic_superuser',
  PGDATABASE: 'synthetic_production',
  PGOPTIONS: '-c default_transaction_read_only=off',
  PGSERVICE: 'synthetic-service',
  PGSSLMODE: 'disable',
  PGREPLICATION: 'true',
  PGHOSTADDR: '192.0.2.10',
}
const VALUES = [PG_PASSWORD, PASSFILE, ...Object.values(REDIRECTING)]

const refused = (fn, pattern) =>
  assert.throws(fn, (err) => {
    assert.ok(err instanceof PostgresEnvironmentError)
    assert.match(err.message, /^Refusing to use the PostgreSQL environment: /)
    assert.match(err.message, pattern)
    for (const value of VALUES) assert.ok(!err.message.includes(value), 'the message contains a value')
    return true
  })

describe('PG* variable policy', () => {
  it('permits only PGPASSWORD and PGPASSFILE', () => {
    assert.deepEqual([...PERMITTED_PG_VARIABLES], ['PGPASSWORD', 'PGPASSFILE'])
    assert.ok(Object.isFrozen(PERMITTED_PG_VARIABLES))
  })

  it('treats every name starting with PG as a PostgreSQL variable, in any letter case', () => {
    for (const name of ['PGHOST', 'pgport', 'PgUser', 'pG_ANYTHING', 'PGPASSWORD', 'pgPassFile']) assert.ok(isPgVariable(name), name)
    for (const name of ['DATABASE_URL', 'APGHOST', 'PATH', 'P_G']) assert.ok(!isPgVariable(name), name)
    assert.ok(!isRestrictedPgVariable('pgPassword') && !isRestrictedPgVariable('PGPASSFILE'))
    assert.ok(isRestrictedPgVariable('pgService') && isRestrictedPgVariable('PGSSLMODE'))
  })

  it('refuses each variable that could redirect a connection, without revealing its value', () => {
    for (const [name, value] of Object.entries(REDIRECTING)) {
      refused(() => assertPostgresEnvironment({ [name]: value }), new RegExp(`^.*: ${name} is set, and the PostgreSQL client would use it`))
    }
  })

  it('refuses them in mixed or lower case, naming them in upper case', () => {
    refused(() => assertPostgresEnvironment({ pgPort: '5433' }), /PGPORT is set/)
    refused(() => assertPostgresEnvironment({ PgHost: 'db.example.com' }), /PGHOST is set/)
    refused(() => assertPostgresEnvironment({ pgservice: 'synthetic-service' }), /PGSERVICE is set/)
    assert.deepEqual(restrictedPgVariables({ pgPort: '1', PGPORT: '2', PgHost: '3' }), ['PGHOST', 'PGPORT'])
  })

  it('ignores empty and undefined values, which pg ignores as well', () => {
    assert.doesNotThrow(() => assertPostgresEnvironment({ PGPORT: '', pgHost: undefined }))
  })

  it('allows PGPASSWORD and PGPASSFILE and returns them under their upper-case names', () => {
    assert.doesNotThrow(() => assertPostgresEnvironment({ PGPASSWORD: PG_PASSWORD, pgPassFile: PASSFILE, DATABASE_URL: 'x' }))
    assert.deepEqual(permittedPgEnvironment({ pgPassword: PG_PASSWORD, PGPASSFILE: PASSFILE, PGPORT: '5433', OTHER: 'x' }), {
      PGPASSWORD: PG_PASSWORD,
      PGPASSFILE: PASSFILE,
    })
  })

  it('refuses a permitted variable set under two spellings, since which one a client sees is unclear', () => {
    refused(() => permittedPgEnvironment({ PGPASSWORD: PG_PASSWORD, pgPassword: 'other' }), /PGPASSWORD is set more than once/)
    refused(() => assertPostgresEnvironment({ PGPASSFILE: PASSFILE, PgPassFile: PASSFILE }), /PGPASSFILE is set more than once/)
  })
})

describe('PG* variable consistency check', () => {
  it('passes while nothing changes', () => {
    const env = { PGPASSWORD: PG_PASSWORD, OTHER: 'x' }
    const checked = assertPostgresEnvironment(env)
    assert.ok(Object.isFrozen(checked))
    assert.doesNotThrow(() => checked.assertUnchanged({ ...env, OTHER: 'y', PGPORT: '' }))
  })

  it('fails when a redirecting variable appears later, as loading server/.env could do', () => {
    const checked = assertPostgresEnvironment({})
    refused(() => checked.assertUnchanged({ PGHOST: 'db.example.com' }), /PGHOST appeared after the check/)
    refused(() => checked.assertUnchanged({ pgPort: '5433' }), /PGPORT appeared after the check/)
  })

  it('fails when a permitted variable is added, changed or removed', () => {
    refused(() => assertPostgresEnvironment({}).assertUnchanged({ PGPASSWORD: PG_PASSWORD }), /PGPASSWORD changed after it was checked/)
    const checked = assertPostgresEnvironment({ PGPASSWORD: PG_PASSWORD, PGPASSFILE: PASSFILE })
    refused(() => checked.assertUnchanged({ PGPASSWORD: 'other', PGPASSFILE: PASSFILE }), /PGPASSWORD changed/)
    refused(() => checked.assertUnchanged({ PGPASSWORD: PG_PASSWORD }), /PGPASSFILE changed/)
    refused(() => checked.assertUnchanged({ PGPASSWORD: PG_PASSWORD, PGPASSFILE: PASSFILE, pgPassFile: PASSFILE }), /set more than once/)
  })
})
