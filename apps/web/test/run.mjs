// Real Nest/PostgreSQL fixture. No existing database is written or reseeded.
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
      const r = await fetch(address);
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
  for (const role of ['admin', 'analyst', 'viewer']) {
    const id = randomUUID();
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
  await fixture.db.insert(schema.users).values({
    id: randomUUID(),
    email: 'empty@fe01.test',
    role: 'viewer',
    passwordHash,
  });
  let api = start('apps/api/dist/main.js', [], root, {
    NODE_ENV: 'test',
    DATABASE_URL: url.toString(),
    PORT: '4100',
    APP_ORIGIN: 'http://localhost:3100',
  });
  await ready('http://127.0.0.1:4100/api/v1/health/ready');
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
    ['dev', '--hostname', '127.0.0.1', '--port', '3102'],
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
    ['test', '--grep-invert', 'FE05/06'],
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
    ['test', '--grep', 'FE05/06'],
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
  process.exitCode = runtimeCode || browserCode || explorerCode;
} finally {
  for (const child of children.reverse()) await stop(child);
  if (fixture) await fixture.pool.end();
  if (created) administerDisposableDatabase(database, false);
}
