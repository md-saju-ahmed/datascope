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
} from '../../../packages/db/dist/index.js';
import { administerDisposableDatabase } from '../../api/dist/test/test/support/disposable-database.js';
const apiRequire = createRequire(
  new URL('../../api/package.json', import.meta.url),
);
const { hash, argon2id } = apiRequire('argon2');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const web = fileURLToPath(new URL('../', import.meta.url));
const database = `datascope_test_auth_${randomUUID().replaceAll('-', '')}`;
const url = new URL(localMigrationUrl(process.env, true));
url.pathname = `/${database}`;
const password = randomBytes(24).toString('hex');
const expired = randomBytes(32).toString('hex');
const children = [];
let fixture;
let created = false;
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
    statementTimeoutMillis: 5000,
    connectionTimeoutMillis: 1000,
  });
  await migrateDatabase(fixture.pool);
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
    if (role === 'viewer')
      await fixture.db.insert(schema.authSessions).values({
        userId: id,
        tokenHash: createHash('sha256').update(expired).digest('hex'),
        createdAt: new Date(Date.now() - 7200000),
        expiresAt: new Date(Date.now() - 3600000),
      });
  }
  start('apps/api/dist/main.js', [], root, {
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
  const tests = start('node_modules/@playwright/test/cli.js', ['test'], web, {
    FE01_PASSWORD: password,
    FE01_EXPIRED: expired,
  });
  process.exitCode = await new Promise((resolve) =>
    tests.once('exit', (code) => resolve(code ?? 1)),
  );
} finally {
  for (const child of children.reverse())
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
  if (fixture) await fixture.pool.end();
  if (created) administerDisposableDatabase(database, false);
}
