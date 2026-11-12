# DataScope — Enterprise Data Discovery & Intelligence Platform

DataScope is being built as a backend-first platform for authorized discovery of
large business datasets. The current implementation covers **BE-01: workspace and
API liveness only**. Database connectivity, authentication, search, data and UI
features are subsequent work. Backend gate G1 has not passed.

## Prerequisites

- Node.js 24.x (validated environment: 24.21.0).
- pnpm 12.18.0, matching the root `packageManager` field.
- Windows PowerShell or a compatible terminal. Commands run from the repository root.

## Install and verify

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:api
```

The smoke command starts the compiled API on an available loopback port, checks its
HTTP liveness response, then stops its child process. Run `pnpm build` first.
Tests compile TypeScript to native ES modules, then use Jest and Supertest against
Nest's HTTP application. Jest's ESM runner requires Node's
`--experimental-vm-modules` flag (included in the test script). They require no database
at this stage; PostgreSQL integration tests will accompany persistence work.

## Run the API

```sh
pnpm build
pnpm --filter @datascope/api start
```

The API listens at `http://127.0.0.1:4000`. Optional `PORT` must be an integer
between 1 and 65535; no credentials or environment file are needed for BE-01.

```sh
curl http://127.0.0.1:4000/api/v1/health/live
```

Expected liveness response: `200` with `{"status":"ok"}`. This proves process
liveness only. Database readiness is not implemented and `/api/v1/health/ready`
returns 404. The unversioned `/health/live` also returns 404.

For local changes, build shared packages with `pnpm build`. Then run
`pnpm dev:api` to rebuild the API and watch its compiled output; run the build again
after TypeScript changes. Automatic TypeScript compilation during development is
not configured yet.

## Workspace boundaries

| Path                    | Responsibility                                                  |
| ----------------------- | --------------------------------------------------------------- |
| `apps/api`              | NestJS REST application, versioned under `/api/v1`              |
| `packages/contracts`    | Browser-safe Zod schemas and TypeScript API types               |
| `packages/db`           | Backend-only package foundation; no database implementation yet |
| `scripts/smoke-api.mjs` | Compiled-process HTTP boot verification                         |

Turborepo builds dependencies before their consumers. Strict TypeScript and ESLint
checks apply to source and tests. Runtime dependencies use exact versions and the
workspace has one root lockfile. Frontend implementation requires separate G1 approval.

## Current limitations

- No PostgreSQL service, schema, migration or seed exists yet. Those begin at BE-02.
- No protected business endpoint, authentication or dataset permission is implemented.
- No large-dataset test, benchmark, frontend, deployment or release acceptance is claimed.
- Required public technical artifacts will be added alongside their verified features.
