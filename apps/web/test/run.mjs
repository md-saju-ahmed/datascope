// Real Nest/PostgreSQL fixture. No existing database is written or reseeded.
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  unlink,
  rm,
} from 'node:fs/promises';
import { resolve, join, basename, dirname, relative } from 'node:path';
import {
  createDatabase,
  migrateDatabase,
  localMigrationUrl,
  schema,
  seedConfiguration,
  seedDatabase,
  seedIds,
} from '../../../packages/db/dist/index.js';
import { administerDisposableDatabase } from '../../api/dist/test/test/support/disposable-database.js';
const apiRequire = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { hash, argon2id } = apiRequire('argon2');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const web = fileURLToPath(new URL('../', import.meta.url));
const devCopy = join(web, '.next', `verification-dev-${randomUUID()}`);
let devCopyCreated = false;
async function cleanDevelopmentCopy() {
  const target = resolve(devCopy),
    parent = resolve(web, '.next');
  if (
    dirname(target) !== parent ||
    !/^verification-dev-[0-9a-f-]{36}$/.test(basename(target))
  )
    throw new Error('Refusing unsafe disposable-source cleanup');
  await unlink(join(target, 'node_modules')).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await rm(target, { recursive: true, maxRetries: 3, retryDelay: 200 });
}
const database = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
const url = new URL(localMigrationUrl(process.env, true));
url.pathname = `/${database}`;
const password = randomBytes(24).toString('hex');
const expired = randomBytes(32).toString('hex');
const children = [];
let fixture;
let created = false;
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}
function start(file, args, cwd, env) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: 'inherit',
  });
  children.push(child);
  return child;
}
async function ready(address) {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(address, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch {
      /* Server is still starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Test server did not start');
}
try {
  administerDisposableDatabase(database, true);
  created = true;
  fixture = createDatabase({
    connectionString: url.toString(),
    max: 2,
    statementTimeoutMillis: 60000,
    connectionTimeoutMillis: 1000,
  });
  await migrateDatabase(fixture.pool);
  const seed = seedConfiguration(
    {
      ...process.env,
      NODE_ENV: 'test',
      SEED_ALLOW_LOCAL: 'true',
      ...Object.fromEntries(
        ['admin', 'analyst', 'viewer'].flatMap((role) => [
          [`SEED_${role.toUpperCase()}_EMAIL`, `${role}@fe03.test`],
          [`SEED_${role.toUpperCase()}_PASSWORD`, `${password}-${role}`],
        ]),
      ),
    },
    true,
  );
  await seedDatabase(fixture.pool, seed);
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const roleIds = {};
  for (const role of ['admin', 'analyst', 'viewer']) {
    const id = randomUUID();
    roleIds[role] = id;
    await fixture.db
      .insert(schema.users)
      .values({ id, email: `${role}@fe01.test`, role, passwordHash });
    if (role === 'viewer' || role === 'analyst')
      await fixture.db.insert(schema.datasetPermissions).values({
        datasetId: seedIds.primary,
        userId: id,
        permission: role === 'viewer' ? 'read' : 'analyze',
      });
    if (role === 'viewer')
      await fixture.db.insert(schema.authSessions).values({
        userId: id,
        tokenHash: createHash('sha256').update(expired).digest('hex'),
        createdAt: new Date(Date.now() - 7200000),
        expiresAt: new Date(Date.now() - 3600000),
      });
  }
  const emptyId = randomUUID();
  await fixture.db.insert(schema.users).values({
    id: emptyId,
    email: 'empty@fe01.test',
    role: 'viewer',
    passwordHash,
  });
  const readAnalyst = randomUUID();
  await fixture.db.insert(schema.users).values({
    id: readAnalyst,
    email: 'read-analyst@fe01.test',
    role: 'analyst',
    passwordHash,
  });
  await fixture.db.insert(schema.datasetPermissions).values({
    datasetId: seedIds.primary,
    userId: readAnalyst,
    permission: 'read',
  });
  async function addDetailFixtures() {
    // Real mutations precede each history entry; only this disposable fixture is changed.
    for (let i = 0; i < 11; i++) {
      await fixture.pool.query(
        "update dataset_records set attributes=attributes || jsonb_build_object('verificationNote',$1::text) where id=1000000000001",
        [`Verified browser fixture ${String(i + 1)}`],
      );
      await fixture.db.insert(schema.recordChanges).values({
        recordId: 1000000000001n,
        actorUserId: roleIds.analyst,
        changes: {
          verificationNote: {
            from: i === 0 ? null : `Verified browser fixture ${String(i)}`,
            to: `Verified browser fixture ${String(i + 1)}`,
          },
        },
      });
      await fixture.db.insert(schema.recordRelationships).values({
        sourceRecordId: 1000000000001n,
        targetRecordId: 1000000000011n + BigInt(i),
        relationType: 'browser_verified',
      });
    }
    await fixture.pool.query(
      "update dataset_records set attributes=attributes || jsonb_build_object('largeNote',$1::text) where id=1000000000001",
      ['Long authorized attribute '.repeat(400)],
    );
  }
  let api = start('apps/api/dist/main.js', [], root, {
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    PORT: '4100',
    APP_ORIGIN: 'http://localhost:3100',
  });
  await ready('http://127.0.0.1:4100/api/v1/health/ready');
  // A distinct project root avoids the existing user-owned next dev lock and
  // leaves its generated files untouched. Only task-owned files are copied.
  await mkdir(devCopy);
  devCopyCreated = true;
  for (const entry of [
    'src',
    'package.json',
    'next.config.ts',
    'postcss.config.mjs',
    'next-env.d.ts',
  ])
    await cp(join(web, entry), join(devCopy, entry), { recursive: true });
  const copiedTsConfig = JSON.parse(
    await readFile(join(web, 'tsconfig.json'), 'utf8'),
  );
  copiedTsConfig.extends = relative(
    devCopy,
    join(root, 'tsconfig.base.json'),
  ).replaceAll('\\', '/');
  await writeFile(
    join(devCopy, 'tsconfig.json'),
    JSON.stringify(copiedTsConfig, null, 2),
  );
  await symlink(
    join(web, 'node_modules'),
    join(devCopy, 'node_modules'),
    'junction',
  );
  start(
    'node_modules/next/dist/bin/next',
    ['start', '--hostname', '127.0.0.1', '--port', '3100'],
    web,
    {
      NODE_ENV: 'production',
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:4100',
      API_SESSION_COOKIE_NAME: 'datascope_session',
    },
  );
  await ready('http://localhost:3100');
  start(
    'node_modules/next/dist/bin/next',
    ['start', '--hostname', '127.0.0.1', '--port', '3101'],
    web,
    {
      NODE_ENV: 'production',
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:4101',
      API_SESSION_COOKIE_NAME: 'datascope_session',
    },
  );
  await ready('http://localhost:3101');
  start(
    'node_modules/next/dist/bin/next',
    ['dev', devCopy, '--hostname', '127.0.0.1', '--port', '3102'],
    web,
    {
      NODE_ENV: 'development',
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:4100',
      API_SESSION_COOKIE_NAME: 'datascope_session',
    },
  );
  await ready('http://localhost:3102');
  const runtime = start(
    'node_modules/jest/bin/jest.js',
    ['--config', 'jest.runtime.config.cjs', '--runInBand'],
    web,
    {
      NODE_OPTIONS: '--experimental-vm-modules',
      FE03_PASSWORD: password,
      FE03_PRIMARY: seedIds.primary,
      FE03_RESTRICTED: seedIds.restricted,
      FE03_ADMIN: seedIds.admin,
      FE03_ANALYST: seedIds.analyst,
      FE03_VIEWER: seedIds.viewer,
    },
  );
  const runtimeCode = await new Promise((resolve) =>
    runtime.once('exit', (code) => resolve(code ?? 1)),
  );
  const tests = start(
    'node_modules/@playwright/test/cli.js',
    [
      'test',
      '--grep-invert',
      'FE05/06|FE07|FE08|FE09',
      '--output',
      'test-results/regressions',
    ],
    web,
    {
      FE01_PASSWORD: password,
      FE01_EXPIRED: expired,
    },
  );
  const browserCode = await new Promise((resolve) =>
    tests.once('exit', (code) => resolve(code ?? 1)),
  );
  await stop(api);
  api = start('apps/api/dist/main.js', [], root, {
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    PORT: '4100',
    APP_ORIGIN: 'http://localhost:3100',
  });
  await ready('http://127.0.0.1:4100/api/v1/health/ready');
  const explorerTests = start(
    'node_modules/@playwright/test/cli.js',
    ['test', '--grep', 'FE05/06', '--output', 'test-results/explorer'],
    web,
    {
      FE01_PASSWORD: password,
      FE05_PRIMARY: seedIds.primary,
      FE05_RESTRICTED: seedIds.restricted,
    },
  );
  const explorerCode = await new Promise((resolve) =>
    explorerTests.once('exit', (code) => resolve(code ?? 1)),
  );
  let featureCode = 0;
  for (const phase of ['FE07', 'FE08', 'FE09']) {
    if (phase === 'FE08') await addDetailFixtures();
    await stop(api);
    api = start('apps/api/dist/main.js', [], root, {
      NODE_ENV: 'test',
      DATABASE_URL: url.toString(),
      PORT: '4100',
      APP_ORIGIN: 'http://localhost:3100',
    });
    await ready('http://127.0.0.1:4100/api/v1/health/ready');
    const featureTests = start(
      'node_modules/@playwright/test/cli.js',
      ['test', '--grep', phase, '--output', `test-results/${phase}`],
      web,
      {
        FE01_PASSWORD: password,
        FE05_PRIMARY: seedIds.primary,
        FE05_RESTRICTED: seedIds.restricted,
        FE07_VIEWER: roleIds.viewer,
        FE07_ANALYST: roleIds.analyst,
        FE07_EMPTY: emptyId,
      },
    );
    const code = await new Promise((resolve) =>
      featureTests.once('exit', (value) => resolve(value ?? 1)),
    );
    featureCode ||= code;
  }
  process.exitCode = runtimeCode || browserCode || explorerCode || featureCode;
} finally {
  for (const child of children.reverse()) await stop(child);
  if (fixture) await fixture.pool.end();
  if (created) administerDisposableDatabase(database, false);
  if (devCopyCreated) {
    await cleanDevelopmentCopy();
  }
}
