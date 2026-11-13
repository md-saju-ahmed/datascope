import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { cpus, totalmem, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import {
  createDatabase,
  migrateDatabase,
  seedDatabase,
  seedConfiguration,
  seedIds,
  schema,
  sql,
  localMigrationUrl,
} from '../packages/db/dist/index.js';
import {
  searchRequestSchema,
  searchResponseSchema,
  datasetAnalyticsResponseSchema,
} from '../packages/contracts/dist/index.js';
import { validateSearch } from '../apps/api/dist/modules/search/search-validation.js';
import { compileSearch } from '../apps/api/dist/modules/search/search-compiler.js';
import { PermissionsService } from '../apps/api/dist/modules/permissions/permissions.service.js';

// Every mutation is confined to a database created by this invocation.
const root = new URL('../', import.meta.url);
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
requireApi('reflect-metadata');
const { NestFactory } = requireApi('@nestjs/core');
const name = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
const output = process.argv[2];
if (!output || process.argv.length !== 3)
  throw new Error('Usage: benchmark-backend.mjs <output-directory>');
const config = seedConfiguration(
  {
    NODE_ENV: 'test',
    SEED_ALLOW_LOCAL: 'true',
    DATABASE_TEST_URL: localMigrationUrl(process.env, true),
    ...Object.fromEntries(
      ['ADMIN', 'ANALYST', 'VIEWER'].flatMap((role) => [
        [`SEED_${role}_EMAIL`, `${role.toLowerCase()}@example.test`],
        [`SEED_${role}_PASSWORD`, randomBytes(24).toString('hex')],
      ]),
    ),
  },
  true,
);
const url = new URL(config.connectionString);
url.pathname = `/${name}`;
function admin(database, statement) {
  if (database !== 'postgres' && database !== name)
    throw new Error('Unsafe database');
  execFileSync(
    'docker',
    [
      'compose',
      '--project-directory',
      fileURLToPath(root),
      '--profile',
      'test',
      'exec',
      '-T',
      'postgres_test',
      'psql',
      '-U',
      'datascope_test_admin',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ],
    { stdio: 'pipe', windowsHide: true, timeout: 30000 },
  );
}
const condition = (field, op, value) => ({ field, op, value });
const workloads = [
  ['first-page', {}],
  [
    'categorical',
    {
      conditions: [
        condition('status', 'eq', 'Active'),
        condition('country', 'eq', 'Germany'),
      ],
    },
  ],
  [
    'numeric-date',
    {
      conditions: [
        condition('revenue', 'between', ['10000', '100000']),
        condition('createdAt', 'gte', '2026-01-01T00:00:00Z'),
      ],
    },
  ],
  ['full-text', { q: '"Known Match Alpha"' }],
  ['partial', { conditions: [condition('name', 'contains', 'match alpha')] }],
  [
    'four-and',
    {
      conditions: [
        condition('status', 'eq', 'Active'),
        condition('country', 'eq', 'Germany'),
        condition('revenue', 'gt', '10000'),
        condition('createdAt', 'gte', '2026-01-01T00:00:00Z'),
      ],
    },
  ],
  [
    'multi-sort',
    {
      sort: [
        { field: 'status', direction: 'asc' },
        { field: 'revenue', direction: 'desc' },
      ],
    },
  ],
  [
    'deep-offset',
    { page: 901, pageSize: 100, sort: [{ field: 'id', direction: 'asc' }] },
  ],
  [
    'repeated-exact',
    { conditions: [condition('name', 'eq', 'Known Match Alpha')] },
  ],
  ['analytics', null],
];
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) =>
    sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    n: sorted.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1),
  };
}
let created = false,
  database,
  app;
const report = {
  workloads,
  sourceFingerprints: Object.fromEntries(
    [
      'scripts/benchmark-backend.mjs',
      'apps/api/dist/modules/search/search.service.js',
      'apps/api/dist/modules/analytics/analytics.service.js',
    ].map((path) => [
      path,
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  ),
  startedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  environment: {
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length,
    ramBytes: totalmem(),
    poolMax: 10,
    statementTimeoutMs: 3000,
  },
  method:
    'Native Node fetch closed-loop HTTP driver on same host; real Nest TCP listener; provisioned random hashed sessions for 80 Analyst users with analyze grants. Login is covered by acceptance, excluded from timed search. Limits/guards/CSRF remain enabled. First-touch is not a cold PostgreSQL/OS cache. Two warm repetitions, 40 requests/case/concurrency; no result cache. No history intent header.',
  firstTouch: [],
  runs: [],
  plans: [],
};
try {
  admin('postgres', `CREATE DATABASE "${name}" OWNER datascope_test_admin`);
  created = true;
  admin(
    name,
    `GRANT CONNECT,TEMPORARY ON DATABASE "${name}" TO datascope_test_app; GRANT USAGE,CREATE ON SCHEMA public TO datascope_test_app; CREATE EXTENSION pg_trgm WITH SCHEMA public`,
  );
  database = createDatabase({
    connectionString: url.toString(),
    max: 4,
    connectionTimeoutMillis: 2000,
    statementTimeoutMillis: 30000,
  });
  await migrateDatabase(database.pool);
  report.seed = await seedDatabase(database.pool, config);
  report.database = name;
  report.postgres = (await database.pool.query('show server_version')).rows;
  report.postgresSettings = (
    await database.pool.query(
      "select name,setting,unit from pg_settings where name in ('shared_buffers','work_mem','jit','max_connections','max_parallel_workers_per_gather') order by name",
    )
  ).rows;
  report.docker = execFileSync(
    'docker',
    [
      'info',
      '--format',
      '{{.NCPU}} CPUs; {{.MemTotal}} bytes RAM; {{.OperatingSystem}}; server {{.ServerVersion}}',
    ],
    { encoding: 'utf8', windowsHide: true },
  ).trim();
  report.count = (
    await database.pool.query(
      'select count(*)::text as count from dataset_records where dataset_id=$1',
      [seedIds.primary],
    )
  ).rows[0].count;
  if (report.count !== '100000') throw new Error('Expected 100k');
  await database.pool.query('analyze dataset_records');
  report.indexes = (
    await database.pool.query(
      "select indexname,indexdef from pg_indexes where tablename='dataset_records' order by indexname",
    )
  ).rows;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = url.toString();
  process.env.DB_POOL_MAX = '10';
  process.env.DB_STATEMENT_TIMEOUT_MS = '3000';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  const { AppModule } = await import('../apps/api/dist/app.module.js');
  const { configureApp } = await import('../apps/api/dist/configure-app.js');
  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const clients = [];
  for (let i = 0; i < 80; i++) {
    const id = randomUUID(),
      token = randomBytes(32).toString('hex');
    await database.pool.query(
      "insert into users(id,email,password_hash,role) select $1,$2,password_hash,'analyst' from users where id=$3",
      [id, `bench${i}@example.test`, seedIds.analyst],
    );
    await database.pool.query(
      "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'analyze')",
      [seedIds.primary, id],
    );
    await database.pool.query(
      "insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')",
      [id, createHash('sha256').update(token).digest('hex')],
    );
    const cookie = `datascope_session=${token}`;
    const response = await fetch(`${base}/api/v1/auth/csrf`, {
      headers: { Cookie: cookie },
    });
    if (response.status !== 200) throw new Error('CSRF bootstrap failed');
    const body = await response.json();
    clients.push({
      id,
      cookie: `${cookie}; ${response.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ')}`,
      csrf: body.csrfToken,
    });
  }
  let serial = 0;
  async function sample(workload) {
    const client = clients[serial++ % clients.length],
      started = performance.now();
    const [label, body] = workload;
    try {
      const response = await fetch(
        `${base}/api/v1/datasets/${seedIds.primary}/${body === null ? 'analytics?days=30' : 'search'}`,
        {
          method: body === null ? 'GET' : 'POST',
          headers: {
            Cookie: client.cookie,
            Origin: 'http://localhost:3000',
            'X-CSRF-Token': client.csrf,
            'Content-Type': 'application/json',
          },
          ...(body === null ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const value = await response.json();
      const expectedTotal = {
        'first-page': 100000,
        'full-text': 1,
        partial: 1,
        'four-and': 1082,
        'repeated-exact': 1,
        'deep-offset': 100000,
        'multi-sort': 100000,
      }[label];
      const valid =
        response.status === 200 &&
        (body === null
          ? datasetAnalyticsResponseSchema
          : searchResponseSchema
        ).safeParse(value).success &&
        (body === null
          ? value.data.totalRecords === '100000'
          : value.data.length <= (body.pageSize ?? 25) &&
            (expectedTotal === undefined ||
              value.pageInfo.total === expectedTotal));
      return {
        ms: performance.now() - started,
        status: response.status,
        valid,
        label,
      };
    } catch {
      return {
        ms: performance.now() - started,
        status: 0,
        valid: false,
        label,
      };
    }
  }
  for (const workload of workloads)
    report.firstTouch.push(await sample(workload));
  for (let repetition = 1; repetition <= 2; repetition++)
    for (const concurrency of [1, 5, 10, 20])
      for (const workload of workloads) {
        const samples = [],
          started = performance.now();
        let next = 0;
        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            while (next++ < 40) samples.push(await sample(workload));
          }),
        );
        const elapsedMs = performance.now() - started;
        const run = {
          workload: workload[0],
          repetition,
          concurrency,
          elapsedMs,
          requestsPerSecond: samples.length / (elapsedMs / 1000),
          latencyMs: distribution(samples.map((s) => s.ms)),
          errors: samples.filter((s) => !s.valid).length,
          samples,
        };
        report.runs.push(run);
        console.log(JSON.stringify({ ...run, samples: undefined }));
      }
  const fields = await database.db
    .select()
    .from(schema.datasetFields)
    .where(sql`${schema.datasetFields.datasetId}=${seedIds.primary}`);
  for (const [label, body] of workloads) {
    if (body === null) continue;
    const compiled = compileSearch(
      seedIds.primary,
      validateSearch(searchRequestSchema.parse(body), fields),
      fields,
      app
        .get(PermissionsService)
        .visible(
          { id: clients[0].id, role: 'analyst', email: 'bench0@example.test' },
          sql`${seedIds.primary}::uuid`,
        ),
    );
    const plans = {
      label,
      input: body,
      scope:
        'Generated row/count SQL with dataset predicate and live Analyst authorization using a bound dataset constant',
      rows: [],
      count: [],
    };
    for (const kind of ['rows', 'count'])
      for (let i = 0; i < 3; i++)
        plans[kind].push(
          (
            await database.db.execute(
              sql`explain (analyze,buffers,format json) ${compiled[kind]}`,
            )
          ).rows,
        );
    report.plans.push(plans);
    if (
      ['first-page', 'multi-sort', 'deep-offset', 'repeated-exact'].includes(
        label,
      )
    ) {
      const previous = compileSearch(
        seedIds.primary,
        validateSearch(searchRequestSchema.parse(body), fields),
        fields,
        app.get(PermissionsService).visible(
          {
            id: clients[0].id,
            role: 'analyst',
            email: 'bench0@example.test',
          },
          schema.datasetRecords.datasetId,
        ),
      );
      plans.previousCorrelatedRows = (
        await database.db.execute(
          sql`explain (analyze,buffers,format json) ${previous.rows}`,
        )
      ).rows;
    }
  }
  report.errors =
    report.runs.reduce((sum, r) => sum + r.errors, 0) +
    report.firstTouch.filter((s) => !s.valid).length;
  if (report.errors) process.exitCode = 1;
} finally {
  if (app) await app.close();
  if (database) await database.pool.end();
  if (created) admin('postgres', `DROP DATABASE "${name}"`);
  report.completedAt = new Date().toISOString();
  report.disposableDatabaseRemoved = created;
  mkdirSync(output, { recursive: true });
  writeFileSync(
    `${output}/benchmark.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
}
