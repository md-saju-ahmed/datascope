# DataScope — Enterprise Data Discovery & Intelligence Platform

DataScope is being built as a backend-first platform for authorized discovery of
large business datasets. The current implementation covers **workspace setup,
PostgreSQL schema, migrations and health** (BE-01–BE-03). Authentication, seed,
search, data APIs and UI features are subsequent work. Backend gate G1 has not passed.

## Prerequisites

- Node.js 24.x (validated environment: 24.21.0).
- pnpm 12.18.0, matching the root `packageManager` field.
- Docker with Compose, running Linux containers (validated: Docker 29.8.2, Compose 5.5.1).
- Windows PowerShell or a compatible terminal. Commands run from the repository root.

## Install and verify

```sh
pnpm install --frozen-lockfile
pnpm env:init
pnpm db:up
pnpm db:test:up
pnpm build
pnpm db:migrate
pnpm db:migrate:test
pnpm db:check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm smoke:api
pnpm smoke:db
```

The smoke command starts the compiled API on an available loopback port, checks its
HTTP liveness response, then stops its child process. Run `pnpm build` first.
`env:init` creates an ignored `.env` with independent random development/test
credentials and refuses to overwrite an existing file. `.env.example` documents
the keys using placeholders. Never reuse these local credentials in production.
Run `env:init` only on first setup; keep your existing `.env` when rerunning checks.

Tests compile TypeScript to native ES modules, then use Jest and Supertest against
Nest's HTTP application. Jest's ESM runner requires Node's
`--experimental-vm-modules` flag (included in the test script). They require no database
for the default `pnpm test` suite. `pnpm test:integration` requires the dedicated
Compose test database and tests real SQL, restricted roles, pool reuse/bounds,
server statement timeouts, database stop/start recovery and connection cleanup.
It briefly stops **only** `postgres_test` and restarts it in a `finally` block;
do not run it alongside another test client using that service. It does not reset
or delete database data. `smoke:db` also checks readiness through the compiled API.

## Run the API

```sh
pnpm build
pnpm --filter @datascope/api start
```

The API listens at `http://127.0.0.1:4000` by default. Its start/dev scripts load the
root `.env` with Node's environment-file support; explicit process variables take
precedence. `DATABASE_URL` is required and must be a PostgreSQL URL containing a
host, username, password and database. `PORT` is bounded to 1–65535 and
`DB_POOL_MAX` to 1–20. Configuration errors identify invalid field names without
printing supplied values. See `.env.example` for pool/timeouts and bind address.

```sh
curl http://127.0.0.1:4000/api/v1/health/live
```

Expected liveness response: `200` with `{"status":"ok"}`. This proves process
liveness only. `GET /api/v1/health/ready` uses the shared PostgreSQL pool:
200 with `{"status":"ok","database":"up"}` when ready, or
503 with `{"code":"DATABASE_UNAVAILABLE","message":"Service is not ready"}`.
No connection URL, credentials, SQL error or database version is returned.
Liveness remains 200 during a database outage. Readiness currently checks
connectivity, exact migration-history hashes and the presence of all 13 core
tables. Pending/mismatched/incomplete migrations also return the safe 503 above.
Startup never applies or repairs migrations automatically.
The unversioned `/health/live` returns 404.

For local changes, build shared packages with `pnpm build`. Then run
`pnpm dev:api` to rebuild the API and watch its compiled output; run the build again
after TypeScript changes. Automatic TypeScript compilation during development is
not configured yet.

## Workspace boundaries

| Path                    | Responsibility                                            |
| ----------------------- | --------------------------------------------------------- |
| `apps/api`              | NestJS REST application, versioned under `/api/v1`        |
| `packages/contracts`    | Browser-safe Zod schemas and TypeScript API types         |
| `packages/db`           | Backend-only Drizzle schema, pooled client and migrations |
| `scripts/smoke-api.mjs` | Compiled-process HTTP boot verification                   |

Turborepo builds dependencies before their consumers. Strict TypeScript and ESLint
checks apply to source and tests. Runtime dependencies use exact versions and the
workspace has one root lockfile. Frontend implementation requires separate G1 approval.

`skipLibCheck` skips checking dependency declaration files: Drizzle 0.45.4's
published declarations reference unused database-driver peers and contain internal
type inconsistencies under these compiler settings. All workspace TypeScript
source and tests retain strict checking, typed lint and `noEmitOnError`; no source
diagnostics are suppressed. Real PostgreSQL tests verify the selected pg adapter.

## Local PostgreSQL and connection lifecycle

`compose.yml` pins PostgreSQL 17.12 Alpine. Development and test use separate
containers, roles, credentials and named data volumes. Ports are exposed only on
loopback (defaults 55431 and 55432, mapped to PostgreSQL's container port 5432).
The API uses non-superuser application roles
without role/database creation privileges. Bootstrap administrator credentials
stay in `.env`; the API connection pool receives only the application credentials
from `DATABASE_URL`. Application roles may create objects
in the local database's public schema for the upcoming migrations.

Each Nest application owns one pool, injected through `DatabaseService`. Connection
acquisition and SQL statement times are bounded; idle connection failures are
handled without exposing connection details. Shutdown closes the pool. Readiness
can recover after PostgreSQL restarts without restarting Nest.

```sh
docker compose --profile test ps
docker compose stop postgres postgres_test
```

Stopping containers preserves their named volumes. No automatic seed, schema reset
or volume deletion occurs on application startup. Editing `.env` does not rotate
credentials already stored in an initialized PostgreSQL volume; do not overwrite
credentials or delete a populated volume as a troubleshooting shortcut.

## Schema and migration workflow

The schema is declared under `packages/db/src/schema/`; the only canonical SQL
migration directory is `packages/db/src/migrations/`, including its journal and
snapshots. [Schema and deletion decisions](technical-docs/database-schema.md)
describe the model, integrity rules, decimal/bigint handling and migration runner.

```sh
# Only when intentionally changing the schema:
pnpm db:generate --name=describe_change
pnpm db:check
pnpm build
pnpm db:migrate
pnpm db:migrate:test
```

Review generated SQL before applying it. SQL files retain LF line endings for
stable hashes; never edit an already applied migration. Trigger SQL lives in a
separate custom migration in the same directory. No reset or data deletion is
part of these commands. Local migration CLI commands reject production mode,
remote hosts, wrong database names and administrator credentials; the test
command never falls back to development. Production migration execution needs a
separately approved deployment procedure. API runtime packaging must retain the
db package's `src/migrations` next to its `dist` directory.

The integration suite additionally creates/removes its own generated-name
disposable database to test fresh migrations, replay/concurrency, failure
rollback, schema drift, real constraints and ORM relations. The existing
development/test databases are not reset. No tests may run concurrently with
another client restarting the test service.

## Current limitations

- The 13-table schema and migrations exist; the 100k deterministic seed starts at BE-04.
- Search-vector synchronization and workload indexes remain BE-05; search is not implemented.
- No protected business endpoint, authentication or dataset permission is implemented.
- No large-dataset test, benchmark, frontend, deployment or release acceptance is claimed.
- Required public technical artifacts will be added alongside their verified features.
