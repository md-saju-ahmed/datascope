# DataScope — Enterprise Data Discovery & Intelligence Platform

DataScope is being built as a backend-first platform for authorized discovery of
large business datasets. The current implementation covers **workspace setup,
PostgreSQL connectivity and health** (BE-01/BE-02). Authentication, domain schema,
search, data and UI features are subsequent work. Backend gate G1 has not passed.

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
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
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
liveness only. `GET /api/v1/health/ready` runs `SELECT 1` through the shared
Drizzle/pg pool: 200 with `{"status":"ok","database":"up"}` when connected, or
503 with `{"code":"DATABASE_UNAVAILABLE","message":"Service is not ready"}`.
No connection URL, credentials, SQL error or database version is returned.
Liveness remains 200 during a database outage. Readiness currently checks
connectivity; migration readiness will accompany the schema/migrations in BE-03.
The unversioned `/health/live` returns 404.

For local changes, build shared packages with `pnpm build`. Then run
`pnpm dev:api` to rebuild the API and watch its compiled output; run the build again
after TypeScript changes. Automatic TypeScript compilation during development is
not configured yet.

## Workspace boundaries

| Path                    | Responsibility                                             |
| ----------------------- | ---------------------------------------------------------- |
| `apps/api`              | NestJS REST application, versioned under `/api/v1`         |
| `packages/contracts`    | Browser-safe Zod schemas and TypeScript API types          |
| `packages/db`           | Backend-only pooled pg client and Drizzle database factory |
| `scripts/smoke-api.mjs` | Compiled-process HTTP boot verification                    |

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

## Current limitations

- No domain schema, migration or seed exists yet. Those begin at BE-03.
- No protected business endpoint, authentication or dataset permission is implemented.
- No large-dataset test, benchmark, frontend, deployment or release acceptance is claimed.
- Required public technical artifacts will be added alongside their verified features.
