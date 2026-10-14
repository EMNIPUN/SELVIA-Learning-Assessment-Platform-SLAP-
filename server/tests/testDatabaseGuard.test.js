// npm run test:db-guard. Synthetic URLs only: nothing here loads server/.env, imports the application or Prisma,
// or connects to a database.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertSafeTestDatabaseEnv, TestDatabaseGuardError } from './support/testDatabaseGuard.js'

const USER = 'guard_user'
const PASSWORD = 'Synthetic-Secret-Pa55'
const LOCAL_URL = `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test`

const envWith = (overrides) => ({ DATABASE_URL: LOCAL_URL, DIRECT_URL: LOCAL_URL, ...overrides })

// Asserts that the guard refuses `env` with a message matching `pattern` that reveals none of the URLs' secrets.
function assertRefused(env, pattern) {
  assert.throws(
    () => assertSafeTestDatabaseEnv(env),
    (err) => {
      assert.ok(err instanceof TestDatabaseGuardError, `expected a TestDatabaseGuardError, got ${err?.name}`)
      assert.match(err.message, pattern)
      assert.equal(err.cause, undefined)
      for (const value of Object.values(env)) {
        if (typeof value === 'string' && value !== '') assert.ok(!err.message.includes(value), 'message contains a URL')
      }
      for (const secret of [PASSWORD, USER, encodeURIComponent(PASSWORD)]) {
        assert.ok(!err.message.includes(secret), 'message contains a credential')
        assert.ok(!String(err.stack).includes(secret), 'stack contains a credential')
      }
      return true
    },
  )
}

describe('test database guard', () => {
  describe('refuses', () => {
    it('a missing DATABASE_URL', () => {
      assertRefused({ DIRECT_URL: LOCAL_URL }, /DATABASE_URL must be set explicitly/)
    })

    it('a missing DIRECT_URL', () => {
      assertRefused({ DATABASE_URL: LOCAL_URL }, /DIRECT_URL must be set explicitly/)
    })

    it('empty or blank values', () => {
      assertRefused(envWith({ DATABASE_URL: '' }), /DATABASE_URL must be set explicitly/)
      assertRefused(envWith({ DIRECT_URL: '   ' }), /DIRECT_URL must be set explicitly/)
    })

    it('an invalid URL', () => {
      assertRefused(envWith({ DATABASE_URL: `${USER}:${PASSWORD}@localhost/selvia_test` }), /DATABASE_URL is not a valid URL/)
      assertRefused(envWith({ DIRECT_URL: 'not a url' }), /DIRECT_URL is not a valid URL/)
    })

    it('a protocol other than PostgreSQL', () => {
      assertRefused(envWith({ DATABASE_URL: `mysql://${USER}:${PASSWORD}@localhost:3306/selvia_test` }), /postgresql:\/\/ or postgres:\/\//)
      assertRefused(envWith({ DIRECT_URL: `https://${USER}:${PASSWORD}@localhost/selvia_test` }), /DIRECT_URL must use/)
    })

    it('a remote host', () => {
      const remote = `postgresql://${USER}:${PASSWORD}@db.example.com:5432/selvia_test`
      assertRefused(envWith({ DATABASE_URL: remote }), /DATABASE_URL must point to localhost or 127\.0\.0\.1/)
      assertRefused(envWith({ DIRECT_URL: remote }), /DIRECT_URL must point to localhost or 127\.0\.0\.1/)
    })

    it('other spellings of the local machine', () => {
      for (const host of ['[::1]', 'LOCALHOST', '127.0.0.2', 'localhost.example.com', '0.0.0.0']) {
        assertRefused(envWith({ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@${host}:5432/selvia_test` }), /host is not local/)
      }
    })

    it('a Supabase host, including its pooler', () => {
      for (const host of ['db.abcdefghijklmnop.supabase.co', 'aws-0-ap-south-1.pooler.supabase.com']) {
        assertRefused(envWith({ DIRECT_URL: `postgresql://${USER}:${PASSWORD}@${host}:5432/postgres` }), /DIRECT_URL refers to Supabase/)
      }
    })

    it('Supabase anywhere in an otherwise local URL', () => {
      assertRefused(
        envWith({ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia_test?application_name=supabase` }),
        /DATABASE_URL refers to Supabase/,
      )
    })

    it('query parameters that could redirect the connection', () => {
      for (const parameter of ['host=db.example.com', 'hostaddr=203.0.113.5', 'service=shared', 'dbname=postgres']) {
        assertRefused(envWith({ DATABASE_URL: `${LOCAL_URL}?${parameter}` }), /query parameter "[a-z]+", which is not allowed/)
      }
    })

    it('a database name without the _test suffix', () => {
      assertRefused(envWith({ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/selvia` }), /ending in "_test"/)
      assertRefused(envWith({ DIRECT_URL: `postgresql://${USER}:${PASSWORD}@127.0.0.1/selvia_test_copy` }), /ending in "_test"/)
      assertRefused(envWith({ DIRECT_URL: `postgresql://${USER}:${PASSWORD}@localhost/_test` }), /ending in "_test"/)
    })

    it('a URL without exactly one database', () => {
      assertRefused(envWith({ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432` }), /must name exactly one database/)
      assertRefused(envWith({ DATABASE_URL: `postgresql://${USER}:${PASSWORD}@localhost/a/b_test` }), /must name exactly one database/)
    })

    it('different databases, hosts or ports', () => {
      const same = 'DATABASE_URL and DIRECT_URL must point to the same host, port and database'
      const pattern = new RegExp(same)
      assertRefused(envWith({ DIRECT_URL: `postgresql://${USER}:${PASSWORD}@localhost:5432/other_test` }), pattern)
      assertRefused(envWith({ DIRECT_URL: `postgresql://${USER}:${PASSWORD}@127.0.0.1:5432/selvia_test` }), pattern)
      assertRefused(envWith({ DIRECT_URL: `postgresql://${USER}:${PASSWORD}@localhost:5433/selvia_test` }), pattern)
    })
  })

  describe('accepts', () => {
    it('the same local _test database in both variables', () => {
      const result = assertSafeTestDatabaseEnv(envWith({}))
      assert.deepEqual({ host: result.host, port: result.port, database: result.database }, {
        host: 'localhost',
        port: '5432',
        database: 'selvia_test',
      })
    })

    it('127.0.0.1, the postgres:// protocol, the default port and allowed parameters', () => {
      const url = `postgres://${USER}:${PASSWORD}@127.0.0.1/selvia_test?schema=public&connect_timeout=5`
      const result = assertSafeTestDatabaseEnv({ DATABASE_URL: url, DIRECT_URL: `postgres://${USER}:${PASSWORD}@127.0.0.1:5432/selvia_test` })
      assert.equal(result.port, '5432')
      assert.equal(result.database, 'selvia_test')
    })

    it('without revealing the checked values when the result is logged', () => {
      const result = assertSafeTestDatabaseEnv(envWith({}))
      const logged = `${JSON.stringify(result)} ${Object.keys(result).join(' ')}`
      assert.ok(!logged.includes(PASSWORD))
      assert.ok(!logged.includes(USER))
    })
  })

  describe('after validation', () => {
    it('reads only the environment it is given', () => {
      assert.throws(() => assertSafeTestDatabaseEnv({}), TestDatabaseGuardError)
    })

    it('accepts an unchanged environment', () => {
      const env = envWith({})
      assertSafeTestDatabaseEnv(env).assertUnchanged(env)
    })

    it('detects a variable replaced afterwards, for example by loading server/.env', () => {
      const env = envWith({})
      const checked = assertSafeTestDatabaseEnv(env)
      assert.throws(
        () => checked.assertUnchanged({ ...env, DIRECT_URL: `postgresql://${USER}:${PASSWORD}@db.example.com:5432/postgres` }),
        (err) => err instanceof TestDatabaseGuardError && /DIRECT_URL changed/.test(err.message) && !err.message.includes(PASSWORD),
      )
      assert.throws(() => checked.assertUnchanged({ DIRECT_URL: env.DIRECT_URL }), /DATABASE_URL changed/)
    })
  })
})
