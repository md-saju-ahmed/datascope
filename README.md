# DataScope — Enterprise Data Discovery & Intelligence Platform

DataScope is being built as a backend-first platform for authorized discovery of
large business datasets. The current implementation covers **workspace setup,
PostgreSQL schema, migrations, deterministic seed, search indexes, authentication,
dataset permissions/management, record detail/relationships/history, validated
search, saved views/sharing, search history, SQL analytics, administration,
preferences/settings and selected-record CSV export** (BE-01–BE-18).
Backend acceptance and reproducible benchmark/documentation tooling are available.
Backend gate G1 was owner approved against `f64574bd3accc73652c9b97855d350b1a008dfba`.
FE-01 provides the frontend foundation described below. G2/G3 remain unapproved.

## Backend acceptance, API documentation and benchmarks

Run the complete backend checks from the repository root after the setup below:

```sh
pnpm build
pnpm test
pnpm test:integration -- --verbose
pnpm lint
pnpm typecheck
pnpm format:check
pnpm smoke:db
pnpm docs:api
pnpm benchmark:backend docs/evidence/backend-benchmark
```

The consolidated OpenAPI 3.1 document and read-only Swagger viewer are generated
into `technical-docs/api/` by default. The generator checks all 42 operations
against actual Nest controller decorators and derives structural schemas from
the current Zod contracts. Open `index.html` to inspect the embedded spec; the
viewer downloads pinned Swagger UI assets from unpkg and needs internet access.
The JSON document works with offline OpenAPI tools. These generated artifacts
remain local under the owner's current private-documentation policy. Generate
elsewhere with `pnpm docs:api <directory>`. Public artifact publication remains
a release prerequisite requiring an owner decision; no ignored documents are
automatically staged or published.

`benchmark:backend` requires the healthy local Compose test service and Docker
access. It validates the local test URL, creates a unique disposable database,
installs pg_trgm, applies all migrations and seeds 100000 primary plus 128
restricted records. It removes only its own database after closing all pools.
Do not run alongside the integration suite, which tests PostgreSQL restart.
Existing databases, volumes and environment files are preserved.

The native Node HTTP driver uses a real loopback TCP Nest listener. It retains
the real session, CSRF, role and dataset guards, statement timeouts and rate
limits. Eighty temporary Analyst users have legitimate analyze grants and random
hashed sessions provisioned directly in the disposable database; login is tested
in acceptance and excluded from timed search. Users rotate to stay within the
unchanged 60-search/user/minute limit. This models multiple active users, not
unlimited throughput for one account. No history intent is sent during repeated
retrieval. No query-result cache is claimed.

Ten workloads cover first-page, categorical, numeric/date, FTS, partial-name,
four-condition AND, multi-sort, deep offset (90000), repeated exact and analytics.
Two repetitions at concurrency 1/5/10/20 contain 40 requests per workload/case.
`benchmark.json` includes individual latencies/statuses, schema/count checks,
p50/p95/p99, errors, throughput, CPU/RAM/OS/Node/PostgreSQL, index definitions,
seed evidence and three generated row/count EXPLAIN ANALYZE BUFFERS samples per
search shape. Initial first-touch measurements are distinct from warm runs:
database/OS caches are not flushed, so they are **not cold-cache measurements**.
The driver and server share a host; short runs are local capacity evidence,
not production guarantees or ten-million-record proof. Errors and target misses
must be reviewed, never omitted from the report.

For a fresh source replay, run
`node --env-file=.env scripts/replay-backend.mjs`. It copies only Git-visible
source into a new temporary directory, verifies SHA256s, installs the frozen
lockfile and runs the complete `pnpm verify:backend` sequence: build, lint,
typecheck, formatting, unit/HTTP and real PostgreSQL integration/API tests,
compiled readiness and OpenAPI generation. It uses the inherited local DB
configuration and requires Docker access plus healthy local dev/test services.
The integration suite briefly restarts only the test PostgreSQL service; run
the replay without concurrent test-service clients or benchmarks. It copies no
private environment files and records commands/logs/manifest under
`docs/evidence/be-19-22/replay.json`. The pnpm store can be reused; this is not a
cold network install. Tests create their own artifact directories; no private
evidence directory from the working copy is required.

### Backend Docker image

```sh
docker build -f apps/api/Dockerfile -t datascope-api:local .
```

The two-stage Node 24 image runs as the unprivileged `node` user. The build context
excludes `.git`, local environment files, private documents, caches and existing
build outputs. The image retains canonical SQL migrations for readiness. It
currently retains build tooling/development dependencies; pruning is a future
image-size improvement, not a production-minimal claim.

For a local smoke run on the existing Compose network, supply a restricted
application-role `DATABASE_URL` using the PostgreSQL service name and port 5432
through a private runtime env file. Set `APP_ORIGIN=https://your-local-origin.test`
and publish only `127.0.0.1:<chosen-port>:4000`. Check `/api/v1/health/live` and
`/api/v1/health/ready`, then stop/remove only that smoke container. Never bake
credentials into the image, run production seeds automatically, or use a host
loopback DB URL from inside a container. Production deployment is not authorized
by this build procedure; proxy IP-rate-limit behavior still needs release work.

Search and dataset analytics use the already constrained dataset ID as a bound
constant in their live SQL permission predicate. This allows PostgreSQL to check
permission once per statement rather than correlating it to every scanned record;
the same snapshot, current-user/grant checks and dataset predicate remain enforced.

## Views, history, analytics, administration and CSV (BE-14–BE-18)

All routes use `/api/v1` and require a valid session. POST/PATCH/DELETE also require
trusted Origin/Referer, JSON and session-bound `X-CSRF-Token`. Unknown fields are
rejected. Paginated JSON lists use the existing `data/pageInfo` envelope and bounded
10/25/50/100 page sizes. Shared browser-safe schemas live in `packages/contracts/src/`.

| Route                                                   | Behavior                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /saved-views`, `POST /saved-views`                 | List authorized views; create an owned view as Analyst/Admin. Optional list datasetId filter.                           |
| `GET`, `PATCH`, `DELETE /saved-views/:viewId`           | Authorized read; owner/Admin update/delete. Dataset and owner cannot be reassigned.                                     |
| `POST /saved-views/:viewId/apply`                       | HTTP 200; re-execute stored state with optional page/pageSize overrides only.                                           |
| `POST /saved-views/:viewId/shares`                      | Owner/Admin shares with `{ "userId": "uuid" }`; recipient must already have dataset access. Idempotent.                 |
| `DELETE /saved-views/:viewId/shares/:userId`            | Owner/Admin revokes the share without changing dataset grants.                                                          |
| `GET`, `DELETE /search-history`                         | Read/clear only current user's actual history. Optional GET datasetId filter.                                           |
| `GET /datasets/:datasetId/analytics?days=30`            | Admin or Analyst with analyze/manage; real dataset totals, category/status groups, growth, search activity and filters. |
| `GET /analytics/platform`                               | Admin-only actual dataset/record/user/active-user counts, including archived datasets.                                  |
| `GET /analytics/search-activity?days=30&datasetId=uuid` | Analyst's own visible activity or Admin dataset/platform activity. Viewer denied.                                       |
| `GET /users?q=text`, `PATCH /users/:userId`             | Admin list/search and strict role/isActive changes. No password/session material returned.                              |
| `GET`, `PATCH /preferences/me`                          | Own density, defaultPageSize and defaultDatasetId.                                                                      |
| `GET`, `PATCH /system/settings`                         | Admin allowlisted settings only; internal seed settings remain private.                                                 |
| `POST /datasets/:datasetId/exports/selected`            | Admin or Analyst with analyze/manage; bounded authorized CSV attachment.                                                |

Create a view using `{ name, datasetId, config }`; config is `{ version: 1, q,
conditions, sort, columns, pageSize }` following the search contract. It stores
configuration, not a snapshot. Creation and updates validate live field metadata
and advanced-authoring permissions. Apply restores page 1 unless explicitly
overridden and rechecks metadata, view access and dataset permission in the search
transaction. Invalid/stale fields fail with 400; hidden/missing resources use safe
404s. Share revocation, grant revocation, inactive users and archives affect access.
Share deletion cascades when a view is deleted.

A Viewer may consume an authorized shared advanced view read-only through Apply;
the endpoint never accepts replacement predicates, columns, sorting or dataset.
The normal search endpoint continues denying arbitrary Viewer advanced queries.
Sharing does not create dataset permission. Lists/counts filter ownership/shares
and dataset visibility in SQL before pagination. Admin can manage views according
to the declared administrative bypass policy.

Applied view executions use the same bounded/deduplicated history writer as search.
Their history includes `savedViewId` so later clients can replay through the trusted
Apply endpoint. History listing hides inaccessible datasets and unavailable view
origins before pagination/count. Clearing serializes with concurrent recording and
deletes only the current user's rows, including entries currently hidden by revoked
access. It accepts an empty JSON body. No history endpoint accepts another user ID.

Analytics use PostgreSQL aggregations over persisted rows/history, with snapshot
consistency and string counts. The `days` window is 1–366, UTC; growth and activity
are daily counts in that window. Total records/category/status cover the entire
dataset. Category/status return the top 50 buckets plus `otherCount`, including a
null bucket when present, so totals still reconcile. Search activity exposes its
scope/from/to/total/byDay/filters; filters are the top 50 actually executed filter
keys. Analyst activity is own-user only; Admin dataset activity includes authorized
dataset executions. Empty datasets/history return real zeros/empty arrays. Activity
reflects retained history, including the existing 60-second deduplication policy;
it is not a permanent all-time search counter. No full-record collection is loaded
into Node for aggregation. The reproducible backend benchmark includes analytics.

User access updates serialize under a transaction lock and preserve at least one
active Admin, including concurrent demotions/deactivations. Deactivation revokes
sessions; reactivation requires fresh login. Role changes are enforced by the next
request. Preferences merge only supplied fields under a per-user lock; omitted
fields retain persisted values. defaultDatasetId must be accessible when selected;
GET returns null if its grant was subsequently revoked. Defaults are comfortable
density, 25 rows and no selected dataset. Another user's preferences cannot be
addressed through these endpoints.

System settings currently support only:

- `registration.enabled`: boolean, default true; false blocks actual registration.
- `exports.max_selected_rows`: integer 1–1000, default 1000; enforced at export time.

Lowercase keys follow the existing database constraint. PATCH preserves omitted
settings; arbitrary/internal keys are rejected and never enumerated. Registration
and the registration setting serialize their decisions without changing existing
credentials. Role, share, settings and export operations emit structured audit
events with request IDs; operational collection/retention remains deployment work.

Export body: `{ "recordIds": ["1000000000001"], "columns": ["name","revenue"] }`.
IDs are unique decimal strings, 1–1000 per request (or the lower configured limit).
The backend requeries every ID in the authorized dataset and validates columns
against metadata. Any missing/cross-dataset ID fails the whole request with safe
404; no partial unauthorized selection is returned. Rows use numeric ID order;
headers/columns follow the request. Revenue/numeric values retain decimal strings,
dates use UTC and null becomes an empty cell. Every CSV cell is quoted, embedded
quotes doubled, and rows use CRLF. Leading spreadsheet formula/control prefixes
receive an apostrophe, including negative-looking strings; consumers should treat
the result as protected text. No server-generated filenames contain user input.
Exports use `no-store`; queues/full-filtered exports remain optional and absent.

Focused real PostgreSQL verification:
`pnpm test:integration -- --testPathPatterns=workflows.integration --verbose`.
It creates/disposes only a new isolated `datascope_test_seed_*` database and includes
100000 primary rows. Existing populated dev/test databases are preserved. Full
regression, independent SQL reconciliation, concurrency, cross-user denials and CSV
boundary evidence are required before the commit checkpoint; G1 remains separate.

## Search API (BE-10–BE-13)

`POST /api/v1/datasets/:datasetId/search` returns HTTP 200 with a bounded page.
Use the session cookie, trusted Origin and `X-CSRF-Token` from the authentication
bootstrap/login flow. Even this retrieval POST requires CSRF verification because
an explicitly applied query can record private history. Responses use `no-store`.

```json
{
  "q": "",
  "conditions": [
    { "field": "status", "op": "eq", "value": "Active" },
    { "field": "country", "op": "eq", "value": "Germany" },
    { "field": "revenue", "op": "gt", "value": "10000.00" },
    { "field": "createdAt", "op": "gte", "value": "2026-01-01T00:00:00Z" }
  ],
  "sort": [{ "field": "revenue", "direction": "desc" }],
  "columns": ["name", "country", "revenue"],
  "page": 1,
  "pageSize": 25
}
```

Shared strict schemas are in `packages/contracts/src/search.ts`. Conditions are
AND-combined. The field must belong to the dataset, be filterable and advertise
the operator. Basic access permits global `q` and `eq`/`in` on registered
`status`, `country`, `category` fields. Other conditions require Admin or Analyst
with analyze/manage permission. Viewer remains basic even with a higher grant.
Sorting and metadata-approved projections are available to all dataset readers.
There is no client-supplied permission or advanced-mode bypass.

- Global search uses metadata-maintained `simple` PostgreSQL full-text vectors
  and `websearch_to_tsquery`, including phrases/web-search syntax. It searches
  declared searchable text, including configured custom fields; it does not search
  every attribute, perform substring matching or rank results. Blank `q` lists data.
- `eq`/`neq` use case-sensitive exact text equality. `contains` is a literal,
  case-insensitive substring: `%`, `_` and backslash are escaped. The lower(name)
  trigram index supports eligible name patterns; short terms and other unindexed
  fields may scan scoped rows. No universal indexed-latency claim is made.
- Typed operators are `eq`, `neq`, `contains`, `gt`, `gte`, `lt`, `lte`, `between`
  and `in`, restricted by metadata. Between is inclusive and requires two ordered
  bounds; in accepts 1–50 values. Numeric inputs are decimal strings (up to 38
  integer and 18 fractional digits), never floating-point JSON numbers. Boolean
  inputs are JSON booleans. Dates require explicit timezone-bearing ISO timestamps
  and normalize to UTC. Relative dates must be resolved by the caller to concrete
  intervals before execution, URL serialization or reuse.
- Dynamic JSONB uses guarded typed expressions. Missing, wrong-type or invalid
  values project as null and do not match comparisons, including `neq`.
  Numeric JSON values project as strings; date/boolean/text values keep their
  declared representation. Request text rejects NUL characters.
- At most 12 conditions, 3 explicit sort fields, 200 global-search characters,
  500 characters per text value and 100 explicitly projected fields. Page is
  1–4000; page size is 10/25/50/100 (default 25); offset is at most 100000.
  Invalid requests return 400 rather than falling back to an unfiltered listing.
- Sort priority follows the request, with NULLS LAST, text collation C, and a
  unique ID tie-breaker if absent. Default ordering is the immutable common
  `createdAt DESC, id DESC`, including when timestamp metadata is not exposed.
  Explicit non-ID sorts require registered sortable metadata.
- Projection always includes string `id`; omitted columns use metadata-visible
  defaults. `isVisible` controls defaults, not a separate field-security grant.
  Only registered fields may be explicitly selected. Unregistered JSON/internal
  vectors are never exposed through search; full detail remains a separate API.

Response: `{ data, pageInfo: { page, pageSize, total, totalPages, hasNextPage },
sort, queryId }`. Sort includes the effective tie-breaker; queryId matches the
`X-Request-Id` header. Record IDs/decimals remain strings; page totals are checked
safe integers under the existing pagination contract. One short repeatable-read
transaction keeps permissions, metadata, rows and exact count on the same snapshot.
No matches return an empty page/count zero; beyond-last pages return an empty page
while retaining the exact total. Deep offset and exact counts cost more as data
grows. No complete dataset is transported to Node or the browser.

Ordinary browsing, pagination and automatic refresh **omit** `X-Search-Intent`.
Only a completed user-initiated Apply/Enter execution sends `X-Search-Intent: apply`.
Successful zero-match queries count as executions. History stores a normalized,
versioned configuration (not records); equivalent AND/in ordering is normalized.
The same criteria per user/dataset deduplicate for 60 seconds, excluding page,
sort and columns from duplicate detection. An intentional identical repeat inside
that window is also deduplicated. A per-user transaction lock serializes writers;
only the latest 100 entries per user remain, across datasets. Failed queries write
no history. Recording failure fails the request safely; the bounded history write
is synchronous. History listing/clearing and saved-view execution are implemented.

Search uses the configured database statement timeout and a 10-second overall
service deadline (including pool acquisition, after route authentication/guards).
The deadline destroys the active connection rather than returning running work to
the pool. Timeouts return controlled 503 `DATABASE_TIMEOUT`/`SEARCH_TIMEOUT` errors;
other errors use the common safe envelope. There are 60 searches/user/minute and a
bounded 10000-user rate-window store; 429 includes Retry-After. These counters are
per process and reset on restart; distributed enforcement is future work.
HTTP and execution logs include request IDs, outcomes and durations, without query
values, SQL, cookies or record contents. Authorization changes apply to subsequent
request snapshots; an already admitted read uses its consistent snapshot.

Focused verification:
`pnpm test:integration -- --testPathPatterns=search.integration --verbose`.
This creates/seeds/disposes only a random `datascope_test_seed_*` verifier database,
including 100000 primary records. It does not reset populated dev/test databases.
Real tests reconcile the combined fixture against SQL, verify concurrent count/page
consistency, history deduplication/retention, denial paths and actual timeout cleanup.
Generated SQL plans, API load benchmarks and consolidated OpenAPI are available
through the commands above; G1 owner approval is recorded for the backend snapshot.

## Dataset and record APIs (BE-07–BE-09)

All routes below use the `/api/v1` prefix and require a valid session. Admin writes
also require the same origin, JSON and CSRF checks as authentication POSTs.
Shared strict contracts are in `packages/contracts/src/datasets.ts` and `records.ts`.

| Method and route                                     | Behavior                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /datasets`                                      | Authorized library, ordered by name then UUID.                                        |
| `GET /datasets/:datasetId`                           | Authorized metadata/count/effective permission.                                       |
| `POST /datasets`                                     | Admin creates metadata with zero records.                                             |
| `PATCH /datasets/:datasetId`                         | Admin updates name/slug/description/category/source.                                  |
| `DELETE /datasets/:datasetId`                        | Admin archives; no physical record deletion.                                          |
| `GET /datasets/:datasetId/fields`                    | Authorized, paginated typed field metadata.                                           |
| `POST /datasets/:datasetId/fields`                   | Admin adds a validated field definition.                                              |
| `PATCH /datasets/:datasetId/fields/:fieldId`         | Admin validates the merged definition; field ID is dataset-scoped.                    |
| `GET /datasets/:datasetId/permissions`               | Admin-only paginated grant list.                                                      |
| `PUT /datasets/:datasetId/permissions/:userId`       | Admin upserts `{ permission: "read" \| "analyze" \| "manage" }` for an active user.   |
| `DELETE /datasets/:datasetId/permissions/:userId`    | Admin revokes a grant; repeated revocation is safe.                                   |
| `GET /datasets/:datasetId/records/:recordId`         | Complete authorized record, attributes and UTC timestamps; no internal search vector. |
| `GET /datasets/:datasetId/records/:recordId/related` | Authorized incoming/outgoing targets, filtered in SQL before pagination/count.        |
| `GET /datasets/:datasetId/records/:recordId/changes` | Real history, newest first with ID tie-break; empty if unavailable.                   |

List endpoints accept one-based `page` (1–4000) and `pageSize` (10/25/50/100,
default 25), returning `{ data, pageInfo: { page, pageSize, total, totalPages,
hasNextPage } }`. Detail/mutation responses wrap one item in `data`. Record IDs,
dataset record counts and money use strings to retain bigint/decimal precision.
The dataset library defaults to excluding archives; only Admin may request
`includeArchived=true`. Admin retains direct access to archived metadata/records;
all other users lose access to archived datasets and related targets.

Admin bypasses individual dataset grants, with structured audit events. Analyst
needs a dataset grant: read permits browsing/details, analyze includes read and
advanced analysis, manage includes both. Viewer can only read, even with a higher
grant. A manage grant never enables platform management endpoints for a non-Admin.
Authorization resolves current active roles/grants from PostgreSQL at request
time and again in domain services; no user-scoped permission cache is authoritative.
Shared guards and ownership/share resolvers live in the permissions module.
Owning or sharing a view never grants dataset access; saved-view CRUD is implemented.

Inaccessible and nonexistent dataset/record IDs return the same safe 404 envelope.
Record IDs are always checked against the route's dataset. Hidden relationships
expose no target/relation IDs, labels, types or hidden counts. Related/history
requests verify source identity without loading its large attributes. API responses
use no-store and server-generated request IDs; security audit events carry the
same request ID, actor, action and resource IDs. Audit is structured server logging,
not a newly persisted audit table; deployment must configure log collection and
retention. Neither secrets nor full record/query contents are logged.

Field creation requires `fieldKey`, `label` and `dataType`; defaults disable search,
filtering and sorting, enable visibility, and set order to zero. A filterable field
must explicitly declare compatible operators. Common typed keys enforce their
types; dynamic keys cannot name transport/internal/prototype properties or supply
SQL. Global search participation is text/enum only. Partial updates preserve other
properties and validate the whole merged definition. There are at most 100 fields
per dataset, enforced under a parent-row lock. Metadata mutations can synchronously
rebuild FTS vectors and hit the configured statement timeout on large datasets;
they return controlled failures rather than partial success. Search compilation
and query execution now use the validated search endpoint above.

Focused verification: `pnpm test:integration -- --testPathPatterns=access.integration --verbose`.
It creates and disposes only its own `datascope_test_access_*` database. Test-only
guard probe routes are absent from the production application. Run the full
regression suite before proposing a commit; frontend implementation remains gated.

## Authentication API (BE-06)

NestJS is the only authentication authority. Routes below are relative to `/api/v1`.
Shared strict request/response schemas live in `packages/contracts/src/auth.ts`.

| Route                 | Request / result                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/csrf`      | Returns `{ csrfToken }` and sets an HttpOnly CSRF nonce cookie. No login required.                                         |
| `POST /auth/register` | JSON `{ email, password }`; 201 `{ data: { id, email, role } }`. Always creates an active Viewer; explicit login follows.  |
| `POST /auth/login`    | JSON `{ email, password }`; 200 `{ data: { id, email, role }, expiresAt, csrfToken }`; sets a new session and CSRF cookie. |
| `GET /auth/me`        | Session required; 200 `{ data: { id, email, role } }`. Dataset permissions are resolved by dataset-scoped endpoints.       |
| `POST /auth/logout`   | Session required, JSON `{}`; 200 `{ data: { loggedOut: true }, csrfToken }`; revokes the session and clears its cookie.    |

Configure `APP_ORIGIN` as the exact trusted browser origin, without a path or trailing
slash. Local default: `http://localhost:3000`. Production requires an explicitly
configured HTTPS origin. Existing local environment files need no rewrite for the
default. For direct local API clients, send the configured origin explicitly;
do not infer it from a supplied Host or forwarding header. CORS is not enabled.

All auth POSTs require `Content-Type: application/json`, an exact allowed `Origin`
(or an allowed `Referer` when Origin is absent), the issued cookies, and the token
in `X-CSRF-Token`. Cross-site Fetch Metadata is rejected. Bootstrap first, keep
cookies in the client cookie jar, then send the returned token as a header. After
login/logout, replace it with the token from that response. Never put tokens or
passwords in URLs, logs, localStorage or public examples. `GET /auth/csrf` can
refresh the token after a restart or session change; repeated bootstrap with the
same nonce/session is stable for multiple tabs.

CSRF uses an HMAC-SHA-256 signature over the random nonce and the current opaque
session's SHA-256 hash (anonymous binding before login). The server key is random
per API process. Login/logout rotate the nonce and binding. A restart requires
CSRF bootstrap again while persisted auth sessions remain valid. This deliberately
supports the initial single API process; multiple instances require a shared
protected CSRF key or sticky routing and a reviewed limiter deployment policy.
The design follows the [OWASP session-bound signed CSRF pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Passwords are not trimmed. Registration requires at least 16 characters and at
most 128 UTF-8 bytes; login accepts existing nonempty passwords up to that same
byte bound. Email is trimmed/lowercased. Unknown properties, including role/status,
are rejected. API password hashes use Argon2id with 19 MiB memory, two iterations
and parallelism one, matching an [OWASP documented configuration](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Existing seed Argon2id hashes remain compatible and are not rewritten. Missing
accounts perform a dummy hash verification; unknown, incorrect and inactive
credentials receive the same 401 error. This does not claim constant-time HTTP
responses or an independent security audit.

Sessions use random 256-bit tokens, with only SHA-256 hashes persisted. Their
**24-hour absolute lifetime** does not slide on `/auth/me`. Login revokes the prior
browser session, issues a fresh token, and rechecks activity/password state inside
a transaction. Every authenticated call joins the current active user and checks
session expiry/revocation, so role/status changes apply immediately. Successful
logout revokes server-side before clearing the cookie. Separate browser sessions
remain independent. Cookies are host-only, HttpOnly, SameSite=Lax and Path=/;
production adds Secure and `__Host-` names. Local HTTP uses `datascope_session`
and `datascope_csrf`. Production names are `__Host-datascope_session` and
`__Host-datascope_csrf`. Never use development cookie settings for deployment.

Limits count **all admitted attempts**, including successes and invalid inputs:
login 10/IP/minute and 5/normalized account/15 minutes; registration 5/IP/hour.
429 responses include `Retry-After`. Counters reserve synchronously, retain at most
10,000 windows, expire old entries and fail closed at capacity. These are in-memory
per-process counters and reset on restart. The socket peer is the IP authority;
forwarding headers are ignored. Behind NGINX, users therefore share the proxy's IP
bucket until an explicitly trusted proxy configuration is implemented and tested
for deployment. No Redis dependency or distributed protection is claimed.

Auth responses use `Cache-Control: no-store`; auth errors contain only
`{ code, message, details, requestId }`, including malformed/oversized JSON and real
database failures. Existing health response bodies remain compatible. Request IDs
are server-generated. No password hashes, raw sessions or SQL errors are returned.

Run the auth unit/HTTP suite through `pnpm test`. Run only its real PostgreSQL API
suite with `pnpm test:integration -- --testPathPatterns=auth.integration --verbose`;
the command compiles tests first. The test creates a new random-name
`datascope_test_auth_*` database, migrates it as the restricted app role, uses real
password hashing/cookies/SQL, and removes only that new database after closing its
pools. Existing dev/test records, volumes and environment files are preserved.
The full regression suite remains `pnpm test:integration -- --verbose`.

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
pnpm db:extensions
pnpm db:extensions:test
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
snapshots. Record IDs use bigint and revenue uses numeric(18,2); serialize IDs and
decimal amounts as strings at API boundaries. Foreign keys retain record history
and prevent deleting a dataset containing records. Migrations and readiness run
with the existing restricted application role, without granting schema creation
at the database level.

```sh
# Only when intentionally changing the schema:
pnpm db:generate --name=describe_change
pnpm db:check
pnpm build
pnpm db:extensions
pnpm db:extensions:test
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
disposable databases to test fresh migrations, replay/concurrency, failure
rollback, schema drift, real constraints and ORM relations. Their administrator
owns each database and installs `pg_trgm`; app grants mirror the existing local
databases, including no database-level CREATE privilege. The existing
development/test databases are not reset. No tests may run concurrently with
another client restarting the test service.

## Deterministic local seed

After migrations, explicitly create the **local-only** account configuration and
seed development:

```sh
pnpm seed:env:init
pnpm build
pnpm db:seed
# Optional: seed the separate local test database explicitly.
pnpm db:seed:test
```

`seed:env:init` creates ignored `.env.seed.local` with three distinct random
passwords and admin/analyst/viewer email addresses. It refuses to overwrite an
existing file and never prints the credentials. Read or customize that file
locally; do not commit it, copy it into production or publish its contents.
The seed CLI loads `.env` followed by `.env.seed.local`; explicit process
environment variables take precedence. It requires `NODE_ENV=development|test`,
`SEED_ALLOW_LOCAL=true`, three distinct emails and distinct passwords of at least
16 characters and at most 128 UTF-8 bytes. It rejects production mode, external
hosts, other database names, admin database roles and URL connection options.
Test mode requires `DATABASE_TEST_URL` and never falls back to development.
Seed commands are never run on API startup or automatically in production.

The primary `business-directory-v1` dataset has **100,000 persisted rows**;
`restricted-partners-v1` has 128. Both have searchable/filterable/sortable field
metadata, including numeric, enum, date and JSONB boolean fields. Two genuine
record relationships include a cross-dataset target. No change-history events
are fabricated: these newly inserted records have no change history.

The business generator uses fixed seed `0xdecafbad` and reference date
`2026-11-01T00:00:00.000Z`, with dates distributed over the preceding 1,400 days.
Results do not depend on today's date. Primary IDs run from `1000000000001` to
`1000000100000`; restricted IDs follow through `1000000100128`. Explicit IDs
leave PostgreSQL's normal identity sequence usable for subsequent records.
Metadata UUIDs and Argon2id password salts are randomized; business rows and
fixture identifiers are reproducible. Passwords are stored only as Argon2id hashes.

The first ten primary records are deliberate boundary/null/blank fixtures. This
SQL isolates their four-condition AND case and must return IDs
`1000000000001`, `1000000000007`, `1000000000008`:

```sql
SELECT id FROM dataset_records
WHERE dataset_id = 'dada0004-0000-4000-8000-000000000101'
  AND attributes->>'fixture' = 'true'
  AND status = 'Active' AND country = 'Germany'
  AND revenue > 10000 AND created_at >= TIMESTAMPTZ '2026-01-01T00:00:00Z'
ORDER BY id;

SELECT d.slug, count(r.id), d.record_count
FROM datasets d LEFT JOIN dataset_records r ON r.dataset_id = d.id
WHERE d.source = 'datascope-seed-v1'
GROUP BY d.id ORDER BY d.slug;
```

Seeded grants: the Viewer can read Business Directory; the Analyst has analyze
grants on both datasets. The Admin has the platform role for the later admin
authorization policy. The Viewer has no grant on Restricted Partners. These are
persisted fixtures; authenticated API enforcement is implemented separately by the
shared session and dataset permission services.

Inserts use parameterized JSON batches of at most 1,000 rows, converted by
PostgreSQL's `jsonb_to_recordset` inside one Drizzle transaction, serialized by an
advisory lock. Any failed batch rolls back accounts, metadata, grants and records.
Rerun `pnpm db:seed` to verify/reuse the existing seed: it returns `applied:false`
without updating data, hashes or timestamps. A versioned settings marker guards
replay. Conflicting IDs/emails, changed bootstrap identities/passwords or drift
in counts/known fixtures cause refusal rather than reset, role escalation or
automatic repair. The JSON result includes SQL counts, matching fixture IDs and
a checksum of persisted business data; it contains no account credentials.
Use the existing configured credentials for a rerun. Regenerating credentials
does not rotate existing database accounts.

`pnpm test:integration` creates its own disposable databases, exercises a failure
after the first inserted batch, verifies serial/concurrent replay, preserves
unrelated rows, and compares complete business-data checksums across two freshly
migrated databases. It drops only those generated test databases after closing
their clients. Existing dev/test databases are never reset. Seed timing is not a
search-performance benchmark; sample SQL plans are captured separately below.

## PostgreSQL search indexes and vector synchronization

`pnpm db:extensions` / `pnpm db:extensions:test` explicitly install `pg_trgm`
through the designated local Compose administrator. They require development/test
mode, accept only `--test`, never print credentials and do not change app-role
grants. PostgreSQL requires database CREATE privilege even for trusted extensions;
the application intentionally lacks it. Migration `0002_search_indexes.sql`
checks that `pg_trgm` exists in `public` and fails transactionally if missing.
Production extension installation and migration remain separately approved work.

The migration backfills existing rows, then makes `search_vector` non-null with
an empty-vector default and installs these indexes:

| Index suffix (`dataset_records_…`) | Definition / intended query                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `dataset_id_id_idx`                | B-tree `(dataset_id, id)` for scoped listing and deterministic ties                          |
| `dataset_created_id_idx`           | B-tree `(dataset_id, created_at DESC NULLS LAST, id DESC NULLS LAST)` for newest-first pages |
| `dataset_status_country_id_idx`    | B-tree `(dataset_id, status, country, id)` for categorical combinations                      |
| `dataset_revenue_id_idx`           | B-tree `(dataset_id, revenue, id)` for numeric ranges and ordering                           |
| `search_vector_gin_idx`            | GIN `(search_vector)` for `@@ websearch_to_tsquery('simple', $query)`                        |
| `name_trgm_gin_idx`                | GIN `(lower(name) gin_trgm_ops)` for `lower(name) LIKE $lowercasePattern`                    |

The old single-column dataset index is replaced by its composite prefix; the
primary key remains. No blanket JSONB index or unmeasured custom-field index is
added. Trigram indexing covers name only; short/broad patterns or other fields
may legitimately scan. The query planner chooses its own path; index existence
does not guarantee every query will use it.

Full-text configuration is **`simple`**, which normalizes tokens without English
stemming. `dataset_fields.is_searchable` selects string/enum fields: `name`,
`status`, `country` and `category` map to typed columns; other keys read only
string-valued JSONB properties. Unregistered/disabled fields, numbers, booleans,
arrays, objects and arbitrary JSONB secrets are excluded. Field sort order then
key determines token order, including phrase-search behavior across field
boundaries. All query text/patterns remain bound values. The search endpoint above
defines validation and empty-query semantics.

Database triggers maintain vectors on insert and relevant record updates,
including dataset changes and attempted direct vector writes. Metadata
insert/delete and changes to key/type/scope/searchability/order refresh existing
records once per affected dataset per statement. Label-only changes need no
rebuild. Derived-only refreshes preserve business `updated_at`; actual record
edits still advance it. The vector trigger intentionally sorts after the existing
timestamp trigger. Seed records, hashes and business timestamps survive backfill.

Metadata changes lock parent dataset rows for update; vector-writing records
hold parent key-share locks. Volatile SQL functions read the committed metadata
after a wait under the default READ COMMITTED isolation level. Metadata writes
can block record writes, and conflicting multi-resource updates may require a
transaction retry after PostgreSQL deadlock/serialization errors. Keep transactions
short. Metadata refresh is synchronous and proportional to dataset size; a
versioned background rebuild would need a future documented design if measured
workloads outgrow this approach. These triggers synchronize indexes and enforce
no user-facing authorization policy.

Index builds and backfill are transactional and non-concurrent. They may block
writers while migrating; they are not an online production migration procedure.
Business rows are retained and no database reset is part of the migration.

After migrating and seeding, capture reproducible sample plans:

```sh
pnpm db:explain
pnpm db:explain --test
```

The command requires local development/test configuration, current migrations and
100k primary rows. It runs ANALYZE, then eight `EXPLAIN (ANALYZE, BUFFERS, FORMAT
JSON)` cases: listing, newest-first, categorical, revenue range, full text,
trigram partial name, combined AND and deep offset. Output includes SQL, bound
fixture parameters, PostgreSQL version, count, index definitions and full plans.
It never disables sequential scans or forces an index. These single-run SQL
samples are separate from the API p50/p95/concurrency benchmark above.
PostgreSQL tests separately verify actual selective B-tree and GIN paths
over a freshly seeded 100k database.

Reference: PostgreSQL 17 documents [extension privileges](https://www.postgresql.org/docs/17/sql-createextension.html),
[trigger ordering](https://www.postgresql.org/docs/17/trigger-definition.html), and
[function snapshots](https://www.postgresql.org/docs/17/xfunc-volatility.html).

## Current limitations

- Backend acceptance, load benchmarks, consolidated OpenAPI and Docker/source replay are verified; owner G1 review remains required.
- Local 100k tests do not prove production or ten-million-record capacity. Deep offset misses the proposed pagination latency target; genuine cold database caches were not measured.
- Backend G1 is owner approved; frontend feature verification (G2), integrated deployment and final release remain pending.
- Full-scale seed verification is separate from search benchmarks, frontend, deployment and release acceptance.
- Required public technical artifacts will be added alongside their verified features.

## Frontend foundation (FE-01)

`apps/web` uses Next.js App Router, React, TypeScript, Tailwind CSS and locally owned shadcn/ui Button/Sheet/Skeleton primitives (Radix dialog for modal focus management). Run `pnpm dev:api` and `pnpm dev:web` in separate terminals; open `http://localhost:3000`. Public entry/login/registration screens are foundation boundaries; complete authentication flows are FE-04. Application destinations explicitly identify pending workflows. Redux slices, RTK Query, Explorer and business pages remain separate later tasks.

The protected server layout and route pages validate `/api/v1/auth/me` using the frozen shared response schema, a five-second timeout and `cache: 'no-store'`. Only the session cookie is forwarded to the configured Nest origin. React render-scoped memoization avoids duplicate validation within a request. Navigation uses full document requests so session/role changes are checked on every navigation. Admin layout and pages both check the current backend role. Nest remains the authority for all resource permissions. No database package is imported by the web application; the separate browser-test process uses the existing disposable PostgreSQL fixture helpers.

Server-only environment: `API_INTERNAL_ORIGIN` defaults to `http://127.0.0.1:4000`; `API_SESSION_COOKIE_NAME` defaults to the Nest production `__Host-datascope_session` in production and `datascope_session` in development. To run `next start` against a **local development** Nest server, explicitly set `API_SESSION_COOKIE_NAME=datascope_session`. Production requires the secure cookie and HTTPS. Next does not automatically load the repository-root `.env`; export the web settings in its process environment when overriding defaults. Never use `NEXT_PUBLIC_` for these settings. No frontend session token is stored in browser JavaScript storage.

Validation: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`. After building, `pnpm test:web` compiles/runs the existing API unit suite, creates and migrates a new regex-validated disposable test database, starts real Nest and production Next servers on loopback ports 4100/3100 (3101 exercises an unavailable backend on 4101), runs Chromium route/access/responsive checks, then stops its processes and removes only its own disposable database. Docker test PostgreSQL and root `.env` configuration are required. Install the matching browser once with `pnpm --filter @datascope/web exec playwright install chromium`. Tests never reset populated dev/test databases. Browser checks cover foundation behavior only and do not constitute G2 approval.
