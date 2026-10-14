# Database integration tests

Integration tests run against a real PostgreSQL database. The supported way to run them is the safe runner:

```powershell
# In the server folder, in a terminal where both variables are set for this session only.
# Use your own local test database; never paste the shared (Supabase) connection strings.
$env:DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/selvia_test"
$env:DIRECT_URL   = $env:DATABASE_URL

npm run test:db:check                                   # checks the two variables, runs nothing
npm run test:db:verify -- --pre-migration               # read-only identity check of the empty database
npm run test:db:migrate                                 # verify, prisma migrate deploy, verify again
npm run test:db:verify -- --post-migration              # read-only check of the migrated database
npm run test:integration:safe                           # every *.integration.test.js in this folder
npm run test:integration:safe -- tests/integration/<subject>.integration.test.js
```

**Never run any of this against Supabase or any shared database.** Only use a PostgreSQL database you created for
these tests and have independently established as local and disposable; the checks below cannot prove that for you.

## Verifying the test database

`npm run test:db:verify` (`scripts/verify-test-database.js`) checks that the database behind the two URLs was set up
as a disposable test database. It is a preflight, not a proof: see "What it cannot prove" below.

### Setting up a database it accepts

- PostgreSQL 15 or later (the migrations use `NULLS NOT DISTINCT`).
- A dedicated role that owns the test database and has none of `SUPERUSER`, `CREATEDB`, `CREATEROLE`,
  `REPLICATION` or `BYPASSRLS`, and is not a member of a role that has one of them or of `pg_execute_server_program`,
  `pg_read_server_files`, `pg_write_server_files`, `pg_read_all_data` or `pg_write_all_data`. Ownership is required: it is what lets migrations create the
  tables without any server-wide privilege. A superuser is always refused.
- The database comment set to exactly `selvia:disposable-integration-test`
  (`COMMENT ON DATABASE selvia_test IS 'selvia:disposable-integration-test'`, run by whoever creates the database).
- No Supabase roles (`supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_realtime_admin`,
  `supabase_replication_admin`, `authenticator`, `service_role`) and no schemas besides `public`.
- No `PG*` environment variables other than `PGPASSWORD` and `PGPASSFILE` (see "`PG*` environment variables" below).

### Modes

Exactly one is required.

- `--pre-migration`: also requires the `public` schema to be completely empty (no tables, views, sequences, functions
  or types).
- `--post-migration`: also requires `public` to hold exactly the 21 application tables created by `prisma/migrations`
  plus `_prisma_migrations` (any other table, view or foreign table fails), and every migration folder in
  `prisma/migrations` to be recorded as applied, with none unknown or unfinished.

When `DATABASE_URL` and `DIRECT_URL` differ (for example, different roles), each is checked separately.

### Read-only

The URLs must pass the test guard before a client is created. The checker then connects with `pg`, using only the
checked URL, with `default_transaction_read_only=on`, a 5-second statement timeout and bounded connection, lock and
query waits. Inside `BEGIN TRANSACTION ... READ ONLY` it sends only fixed catalog `SELECT`s, then `ROLLBACK`, and it
closes the connection on every path, including failures. It never loads `server/.env`, runs Prisma, or sends DDL,
DML or `COMMIT`. Output names the database, host and port and the result of each check; it never includes a URL,
user name, password or driver error message (only a step and an error code such as `28P01`).

### What it cannot prove

- **A loopback URL does not prove isolation.** `localhost:5432` may be a port forward or tunnel to another server.
  If that server is set up the same way (an owning role, the marker, an empty `public`), the checker passes. Only use
  a PostgreSQL server you started for testing, and confirm that independently before migrating.
- It trusts what the server reports about itself. It reads facts; it does not and cannot verify that nobody else
  uses the database.

## `PG*` environment variables

The PostgreSQL client `pg` (used by the application through Prisma's adapter, and by the checker) fills in whatever a
connection URL leaves out from `PG*` variables: `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGOPTIONS`, `PGSSLMODE`,
`PGREPLICATION`, `PGSERVICE` and others. Any of them could connect a test somewhere, as someone or with options other
than what the guard checked. One policy (`tests/support/postgresEnvironment.js`) applies to the runner, every test
process, the checker and `test:db:migrate`:

- Every `PG*` variable is restricted, in any letter case, except `PGPASSWORD` and `PGPASSFILE`. Empty values are
  ignored, as `pg` ignores them.
- `PGPASSWORD` supplies the password when the URL has none; `PGPASSFILE` names the password file in which `pg` looks
  up the host, port, database and user it is already connecting to. Neither can change those, the options or the
  role, so the guard's checks and the checker's role checks still apply to the connection actually made.
- A permitted variable set under two spellings (`PGPASSWORD` and `PgPassword`) is refused, since which value a client
  would see is unclear.
- Values are never printed; refusals name the variable only.

Where it is enforced:

- **The runner** does not pass on any `PG*` variable it inherits; `PGPASSWORD` and `PGPASSFILE` are passed on under
  their upper-case names. The checked `DATABASE_URL` and `DIRECT_URL` are passed on unchanged.
- **Every test process** (the preload) refuses a restricted `PG*` variable, so a test file started without the runner
  stops too, and `checkedTestDatabase.assertUnchanged()` fails if one appears later or `PGPASSWORD` or `PGPASSFILE`
  changes.
- **The checker** refuses a restricted `PG*` variable before creating a client.
- **`test:db:migrate`** refuses a restricted `PG*` variable, and `PRISMA_SCHEMA_ENGINE_BINARY` and
  `PRISMA_MIGRATION_ENGINE_BINARY`, which would replace Prisma's migration engine with another program; it starts
  Prisma without any `PG*` variable. `prisma.test.config.js` refuses the same again. Unset them in your shell before
  migrating.

What is known about Prisma 7.10.0 here, from reading the installed package (not from running it):

- The CLI's JavaScript reads no `PG*` variable. It runs migrations in a separate native program, its schema engine,
  started with the CLI's whole environment and given the migration URL as a command-line argument.
- Whether that engine (compiled Rust) uses any `PG*` variable, or a password or service file, cannot be established
  by reading it: none of those names appears in it as text, which suggests but does not prove that it does not. The
  policy above is therefore applied to the migration command too, on the assumption that it might.
- Because the URL is a command-line argument of the engine, other programs on the machine that can list processes
  can see it while a migration runs. Use a test-only password.

## Migrating the test database

`npm run test:db:migrate` runs `scripts/migrate-test-database.js` (`tests/support/testDatabaseMigration.js`). It takes
no arguments and never loads `server/.env`. In this order, each step only after the previous one passed:

1. **Settings.** Reads the environment once and uses only that snapshot. `DATABASE_URL` and `DIRECT_URL` must pass
   the test guard and must both include the user name, password and port, so that the identity check (which
   connects with `pg`) and Prisma's migration engine connect as the same role to the same address, with nothing
   filled in from elsewhere. The `PG*` policy applies, and `DEBUG`, `PRISMA_SCHEMA_ENGINE_BINARY`,
   `PRISMA_MIGRATION_ENGINE_BINARY` and `PRISMA_TELEMETRY_ENDPOINT` must not be set (in any letter case).
2. **Check before migrating (mandatory).** The same read-only identity check as `test:db:verify`, with the exact
   checked URLs, each distinct URL separately. It also reads which database and server instance it reached (the
   database's internal id, the server's start time, address and port); both URLs must reach the same one.
   - Identity checks fail (role, owner, marker, Supabase, other schemas, ...): refused.
   - `public` is empty: migrations are applied.
   - `public` holds exactly the application's tables and every migration in `prisma/migrations`, all finished:
     **already migrated**. It reports this and exits successfully **without starting Prisma**, so running it
     again is harmless.
   - Anything else (some tables, unfinished, missing or unknown migrations, extra objects): refused.
3. **Migration.** Starts the Prisma CLI installed in `server/node_modules` (the entry point its package declares,
   Prisma 7 only) with `node`, without a shell or `npx`, as exactly
   `prisma migrate deploy --config <server>/prisma.test.config.js`. Its environment is built from nothing: the
   checked `DATABASE_URL` and `DIRECT_URL`, `CHECKPOINT_DISABLE=1` (no update check over the network), and only
   `PATH`, `SystemRoot`, `SystemDrive`, `windir`, `TEMP`, `TMP` and `TMPDIR`. No `PG*` (not even `PGPASSWORD` or
   `PGPASSFILE`, which the URLs make unnecessary), `PRISMA_*`, `NODE_OPTIONS`, Neo4j, JWT or other settings reach it.
   Its output is passed on with the URLs, user names and passwords replaced by `[redacted]`.
4. **Check after migrating (mandatory).** Only when Prisma exits with code 0. It passes only if the same database on
   the same server instance (not restarted) now holds exactly the application's tables and every migration.

`prisma.test.config.js`, which Prisma loads in step 3, checks again on its own: it does not import
`src/config/env.js` (and Prisma 7 loads configuration files with `.env` loading switched off), checks both URLs
with the guard and uses the `DIRECT_URL` value that passed, refuses `DEBUG`, restricted `PG*` variables and engine
replacements, and has no seed. Prisma never picks the file up by itself.

### When it fails

Nothing is ever retried, repaired, reset or removed automatically.

- **Refused before Prisma starts:** nothing was changed. Fix the settings or the database setup and run it again.
- **Prisma fails** (non-zero exit code, which becomes the command's exit code, or stopped by a signal): the database
  may be partly migrated, and both the check before migrating and `--post-migration` will refuse it from now on.
- **The check after migrating fails**, or reaches a different database or a restarted server: investigate manually.

To recover a disposable test database, drop it and create it again (see "Setting up a database it accepts"), as
whoever administers that local server, after confirming that the database is the local `*_test` one with the marker
comment. Never use `prisma migrate reset`, `migrate resolve`, `db push` or `migrate dev` on it, and never do any of
this on a database that is not your own disposable test database.

### Not protected

Only `npm run test:db:migrate` is guarded. The ordinary `db:*` scripts and bare Prisma CLI commands (`npx prisma
...`) use `prisma.config.js`, which loads `server/.env` and prefers its `DIRECT_URL`: they can reach the shared
database, and none of the checks above apply to them. Running `prisma migrate deploy --config prisma.test.config.js`
yourself keeps the URL and environment checks of that file but skips both identity checks. Never run Prisma
commands against the test database any other way, and never run `db:*` scripts in a terminal set up for tests.

## Every integration test file starts with the guard

The first statement of every `*.integration.test.js` must import the guard entry:

```js
import '../support/integrationPreload.js'
// or, when the test needs it later:
import { checkedTestDatabase } from '../support/integrationPreload.js'
```

Only comments may come before it. An ES module evaluates its static imports in the order they appear and before
its own code, so this import checks `DATABASE_URL` and `DIRECT_URL` in the process where the file runs before any
other module the file imports (the application, Prisma) is loaded, and before any test code. If they are refused,
the process exits at once.

This is enforced, not just recommended:

- The runner refuses to start when a selected file does not begin with that import.
- `npm run test:integration:runner` includes a check that every `*.integration.test.js` under `server/` is in this
  folder and begins with that import.

## What the runner does

1. Reads `DATABASE_URL` and `DIRECT_URL` from the environment it was started with, and checks them with
   `tests/support/testDatabaseGuard.js`. Both must be set explicitly, point to `localhost` or `127.0.0.1`, name the
   same database, and that database's name must end in `_test`. Supabase and other hosts are refused. `server/.env`
   is never read, and a missing value is never filled in from it.
2. Accepts only `*.integration.test.js` files, or directories, inside this folder (after resolving links). Options
   such as `--import` or `--test-reporter` are refused. With no target it runs every integration test here, and it
   refuses to run when there is none.
3. Checks that each selected file imports the guard as its first statement.
4. Only then starts `node --test --test-concurrency=1` on those files, without a shell. The checked values are
   passed to it explicitly, with `NODE_ENV=test`, and without `NODE_OPTIONS` or `NODE_TEST_CONTEXT`. Neo4j is
   switched off (`NEO4J_URI`, `NEO4J_USERNAME` and `NEO4J_PASSWORD` set to empty strings) and `JWT_SECRET` is a new
   random value for each run, never printed (`tests/support/testEnvironmentIsolation.js`). Whatever the parent
   environment holds for these variables, in any letter case, is not passed on. No `PG*` variable is passed on
   except `PGPASSWORD` and `PGPASSFILE`.
5. Preloads `tests/support/integrationPreload.js` into every test process as well, so the database variables, the
   Neo4j and JWT settings and the `PG*` policy are checked again before any test file is loaded.

Any refusal exits with status 1 before a test process exists. Messages never include a URL, user name or password.

## Starting a test file without the runner

`node --test <file>`, `node <file>` and a bare `node --test` in `server/` (which finds `*.integration.test.js` files
by itself) all run the file's first import, so without acceptable settings they stop before any test code runs:
both database variables, the three Neo4j variables set to empty strings, a `JWT_SECRET` of at least 32
characters and no `PG*` variable other than `PGPASSWORD` and `PGPASSFILE`. A bare `node --test` therefore reports integration test files as failed unless all of these are set; run
unit tests through their own npm scripts instead.

Starting files this way is not supported: the target allow-list and the removal of `NODE_OPTIONS` apply only to the
runner, and code preloaded with `--import`, `--require` or `NODE_OPTIONS` runs before the guard.

## Writing an integration test

- Name it `<subject>.integration.test.js`, put it in this folder and begin it with the guard import above.
- Importing the application loads `server/.env` (`src/config/env.js`); variables already set are kept, empty ones
  included, and missing ones are filled in. Right after importing anything from `src/`, call
  `checkedTestDatabase.assertUnchanged()`: it fails if any database, Neo4j or JWT setting no longer holds the checked
  value, or a `PG*` variable appeared or changed.
- Create every fixture the test needs through the application's public API (register and log in its own users,
  create its own content as their owner), with identifiers unique to the run; never rely on existing data. Do not
  remove anything afterwards (see "Test data" below).
- Close the HTTP server and call `prisma.$disconnect()` on the application's client in a `finally` block, so the test
  process can exit. Report a teardown failure; never try to repair the database after one.
- Never print tokens, passwords, URLs or whole responses in assertion messages.
- Never run Prisma CLI commands (migrations, resets, seeds) from a test.

## Test data

Integration tests leave their data in the test database. They never send `DELETE`, `TRUNCATE` or DDL, and never
disable or change triggers, to remove it:

- `learning_activities` rejects every `UPDATE` and `DELETE`, and `student_evidence` allows only setting
  `superseded_by_evidence_id` once (database triggers). Their foreign keys are `ON DELETE RESTRICT`, so the
  students, courses and concepts they refer to cannot be deleted either, nor the users and lecturers behind those.
- Removing only part of a fixture would leave activities and evidence whose `target_id` or `source_id` (which have
  no foreign key) point at nothing.

Instead, every run creates its own data with identifiers derived from a random run id (for example
`it-<run>-student@example.test` and course code `IT-<RUN>`), and every assertion is limited to the rows of that
run's own users and content. Never assert table-wide counts.

The test database therefore grows with every run. To start again from an empty database, the operator drops and
recreates it, then runs `npm run test:db:verify -- --pre-migration` and `npm run test:db:migrate`, as described in
"Setting up a database it accepts" and "When it fails" above. This is a manual step: no test or script does it, and
it is only ever done to your own local, disposable `*_test` database.

## Limits

- **`_test` does not prove the database is disposable.** The guard only checks names: any database whose name ends
  in `_test` on `localhost` is accepted, whatever it holds. `npm run test:db:verify` checks more, but it is not run
  by the integration runner; run it yourself before migrating and before the first test run.
- **Local is not necessarily local.** An SSH tunnel or port forward on `localhost:5432` can lead to a shared or remote
  server, including Supabase, and the guard cannot tell. Only use a PostgreSQL server you started for testing.
- **The first-import check is a text check.** It reads the start of each file rather than parsing JavaScript, and
  refuses anything it does not recognise. A file that skips the import is still caught by the runner and by
  `npm run test:integration:runner`, but if it is started directly before either has run, nothing stops it.
- The runner does not create, migrate or reset the test database. `npm run test:db:migrate` is the only guarded
  Prisma command; Prisma commands run any other way are not protected.
- **The checks around a migration are separate connections.** They show that the database checked before and after
  is the same one and that it went from empty to exactly migrated, which Prisma could only have done by connecting
  there; they cannot watch Prisma's own connection.
- `server/.env` still supplies the other settings it holds (for example `JWT_EXPIRES_IN`) to a test that imports the
  application. Only the database, Neo4j and JWT secret settings are fixed by the runner. A `PG*` variable it held
  would be caught by `checkedTestDatabase.assertUnchanged()`, provided the test calls it.
- **The migration engine's own use of the environment is unverified.** See "`PG*` environment variables" above.
