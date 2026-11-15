// Local-only REL-01 acceptance. Never connects to a production host or volume.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import {
  createDatabase,
  localMigrationUrl,
  migrateDatabase,
  seedConfiguration,
  seedDatabase,
  seedIds,
} from '../packages/db/dist/index.js';
import { administerDisposableDatabase } from '../apps/api/dist/test/test/support/disposable-database.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const id = randomUUID().replaceAll('-', '');
const project = `datascope_rel01_${id}`;
const work = join(root, 'apps/web/test-results/containers', id);
const envFile = join(work, '.env.verification');
const override = join(work, 'override.yml');
const fixtureName = `datascope_test_seed_${id}`;
let fixtureCreated = false,
  stackCreated = false,
  fixture;
const results = [];
const requireWeb = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const { chromium } = requireWeb('@playwright/test');
function docker(args, options = {}) {
  return execFileSync('docker', args, {
    cwd: root,
    windowsHide: true,
    timeout: 180000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}
function compose(args, options) {
  assert(/^datascope_rel01_[a-f0-9]{32}$/.test(project));
  return docker(
    [
      'compose',
      '--project-name',
      project,
      '--env-file',
      envFile,
      '-f',
      'compose.prod.yml',
      '-f',
      override,
      ...args,
    ],
    options,
  );
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitFor(check) {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      if (await check()) return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw last ?? new Error('Container readiness timeout');
}

await mkdir(join(work, 'tls'), { recursive: true });
await mkdir(join(work, 'backups'));
const httpPort = await freePort(),
  httpsPort = await freePort();
const origin = `https://localhost:${String(httpsPort)}`;
const apiImage = process.env.REL_API_IMAGE ?? 'datascope-api:rel01-verify';
const webImage = process.env.REL_WEB_IMAGE ?? 'datascope-web:rel01-verify';
const env = {
  APP_ORIGIN: origin,
  API_IMAGE: apiImage,
  WEB_IMAGE: webImage,
  PROD_APP_DB_PASSWORD: randomBytes(32).toString('hex'),
  PROD_POSTGRES_ADMIN_PASSWORD: randomBytes(32).toString('hex'),
  TLS_DIR: join(work, 'tls').replaceAll('\\', '/'),
  BACKUP_DIR: join(work, 'backups').replaceAll('\\', '/'),
  HTTP_BIND: '127.0.0.1',
  HTTPS_BIND: '127.0.0.1',
  HTTP_PORT: String(httpPort),
  HTTPS_PORT: String(httpsPort),
};
await writeFile(
  envFile,
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
await writeFile(
  override,
  'services:\n  nginx:\n    ports: !override\n      - "127.0.0.1:' +
    String(httpPort) +
    ':80"\n      - "127.0.0.1:' +
    String(httpsPort) +
    ':443"\n',
);
const openssl = process.env.OPENSSL_BIN ?? 'openssl';
execFileSync(
  openssl,
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout',
    join(work, 'tls/privkey.pem'),
    '-out',
    join(work, 'tls/fullchain.pem'),
  ],
  { windowsHide: true, stdio: 'pipe' },
);
const ca = await readFile(join(work, 'tls/fullchain.pem'));
function client() {
  const cookies = new Map();
  return async (path, method = 'GET', body, headers = {}) => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const content = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          method,
          ca,
          headers: {
            ...headers,
            ...(content ? { 'Content-Type': 'application/json' } : {}),
            Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          },
        },
        (response) => {
          for (const cookie of response.headers['set-cookie'] ?? []) {
            const pair = cookie.split(';')[0],
              at = pair.indexOf('=');
            cookies.set(pair.slice(0, at), pair.slice(at + 1));
          }
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      request.setTimeout(20000, () =>
        request.destroy(new Error('HTTPS request timeout')),
      );
      request.on('error', reject);
      request.end(content);
    });
  };
}
try {
  for (const image of [apiImage, webImage]) docker(['image', 'inspect', image]);
  compose(['config', '-q']);
  // Production configuration itself must publish neither API nor DB nor web.
  const config = JSON.parse(
    docker(
      [
        'compose',
        '--env-file',
        envFile,
        '-f',
        'compose.prod.yml',
        'config',
        '--format',
        'json',
      ],
      { encoding: 'utf8' },
    ),
  );
  for (const service of ['api', 'web', 'postgres'])
    assert.equal(config.services[service].ports, undefined);
  for (const image of [apiImage, webImage]) {
    const imageConfig = JSON.parse(
      docker(['image', 'inspect', image], { encoding: 'utf8' }),
    )[0];
    assert.equal(imageConfig.Config.User, 'node');
    docker([
      'run',
      '--rm',
      '--entrypoint',
      'node',
      image,
      '-e',
      "const fs=require('fs');for(const p of ['/app/.env','/app/docs','/app/apps/web/test-results'])if(fs.existsSync(p))process.exit(1)",
    ]);
  }
  compose(['up', '-d', '--wait', 'postgres']);
  stackCreated = true;
  const refused = (() => {
    try {
      compose(['--profile', 'ops', 'run', '--rm', 'migrate']);
      return false;
    } catch {
      return true;
    }
  })();
  assert(refused, 'Migration must require explicit opt-in');
  compose([
    '--profile',
    'ops',
    'run',
    '--rm',
    '-e',
    'DATASCOPE_MIGRATION_APPROVED=true',
    'migrate',
  ]);
  compose([
    '--profile',
    'ops',
    'run',
    '--rm',
    '-e',
    'DATASCOPE_MIGRATION_APPROVED=true',
    'migrate',
  ]);
  results.push(
    'Production migrations guarded and idempotent; canonical files packaged',
  );
  administerDisposableDatabase(fixtureName, true);
  fixtureCreated = true;
  const url = new URL(localMigrationUrl(process.env, true));
  url.pathname = `/${fixtureName}`;
  fixture = createDatabase({
    connectionString: url.toString(),
    max: 2,
    connectionTimeoutMillis: 2000,
    statementTimeoutMillis: 60000,
  });
  await migrateDatabase(fixture.pool);
  const password = randomBytes(24).toString('hex');
  const seed = seedConfiguration(
    {
      ...process.env,
      NODE_ENV: 'test',
      SEED_ALLOW_LOCAL: 'true',
      ...Object.fromEntries(
        ['admin', 'analyst', 'viewer'].flatMap((role) => [
          [`SEED_${role.toUpperCase()}_EMAIL`, `${role}@rel01.test`],
          [`SEED_${role.toUpperCase()}_PASSWORD`, `${password}-${role}`],
        ]),
      ),
    },
    true,
  );
  await seedDatabase(fixture.pool, seed);
  const dump = docker([
    'compose',
    '--profile',
    'test',
    'exec',
    '-T',
    'postgres_test',
    'pg_dump',
    '-U',
    'datascope_test_admin',
    '-d',
    fixtureName,
    '--format=custom',
    '--data-only',
    '--no-owner',
    '--no-acl',
    '--exclude-table=public.__drizzle_migrations',
  ]);
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      'datascope_admin',
      '-d',
      'datascope',
      '--data-only',
      '--disable-triggers',
      '--no-owner',
      '--exit-on-error',
    ],
    { input: dump },
  );
  compose(['up', '-d', '--wait', 'api', 'web', 'nginx']);
  compose(['exec', '-T', 'nginx', 'nginx', '-t']);
  const anonymous = client();
  await waitFor(
    async () => (await anonymous('/api/v1/health/ready')).status === 200,
  );
  assert.equal((await anonymous('/api/v1/auth/me')).status, 401);
  assert.equal((await anonymous('/')).status, 200);
  const agents = {};
  async function send(agent, path, method, body, extra = {}) {
    const csrf = JSON.parse((await agent('/api/v1/auth/csrf')).text).csrfToken;
    return agent('/api/v1' + path, method, body, {
      Origin: origin,
      'X-CSRF-Token': csrf,
      ...extra,
    });
  }
  for (const role of ['admin', 'analyst', 'viewer']) {
    const agent = client();
    agents[role] = agent;
    const signed = await send(agent, '/auth/login', 'POST', {
      email: `${role}@rel01.test`,
      password: `${password}-${role}`,
    });
    assert.equal(signed.status, 200);
    assert(
      signed.headers['set-cookie'].some(
        (c) =>
          c.startsWith('__Host-datascope_session=') &&
          /Secure/i.test(c) &&
          /HttpOnly/i.test(c),
      ),
    );
    assert.equal((await agent('/api/v1/auth/me')).status, 200);
    assert.equal(
      (await agent(`/datasets/${seedIds.primary}/explore`)).status,
      200,
    );
    const search = await send(
      agent,
      `/datasets/${seedIds.primary}/search`,
      'POST',
      { pageSize: 10 },
    );
    assert.equal(search.status, 200);
    assert.equal(JSON.parse(search.text).data.length, 10);
    assert.equal(search.headers['cache-control'], 'no-store');
  }
  const selection = {
    recordIds: ['1000000000001'],
    columns: ['id', 'name', 'revenue'],
  };
  assert.equal(
    (
      await send(
        agents.viewer,
        `/datasets/${seedIds.primary}/exports/selected`,
        'POST',
        selection,
      )
    ).status,
    403,
  );
  assert.equal(
    (await agents.viewer(`/api/v1/datasets/${seedIds.restricted}`)).status,
    404,
  );
  const csv = await send(
    agents.analyst,
    `/datasets/${seedIds.primary}/exports/selected`,
    'POST',
    selection,
  );
  assert.equal(csv.status, 200);
  assert(csv.text.includes('Known Match Alpha'));
  assert(csv.text.includes('10000.01'));
  assert(csv.headers['content-type'].includes('text/csv'));
  const rejected = await agents.analyst(
    '/api/v1/preferences/me',
    'PATCH',
    {},
    { Origin: 'https://untrusted.invalid' },
  );
  assert.equal(rejected.status, 403);
  results.push(
    'TLS trust/secure cookies, SSR auth, bounded search, role/dataset/CSRF denials and selected CSV through real NGINX',
  );
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true }); // Only this owned one-day localhost certificate.
    const page = await context.newPage();
    await page.goto(origin + '/login');
    await page.getByLabel('Email address').fill('analyst@rel01.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill(`${password}-analyst`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.goto(origin + `/datasets/${seedIds.primary}/explore`);
    await page.getByRole('region', { name: 'Dataset records' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 25);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // eslint-disable-next-line no-undef
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: join(work, `containers-${String(width)}.png`),
        fullPage: true,
      });
    }
    await context.close();
  } finally {
    await browser.close();
  }
  results.push(
    'Real Chrome HTTPS login, SSR dashboard, hydrated Explorer/static assets and desktop/mobile rendering',
  );
  compose(['--profile', 'ops', 'run', '--rm', 'backup']);
  const backup = (await readdir(join(work, 'backups'))).find((name) =>
    name.endsWith('.dump'),
  );
  assert(backup);
  // Restore into a NEW database inside the owned stack; never replace existing data.
  compose([
    'exec',
    '-T',
    'postgres',
    'createdb',
    '-U',
    'datascope_admin',
    '--owner=datascope_app',
    'datascope_restore_verify',
  ]);
  compose(
    [
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      'datascope_admin',
      '--role=datascope_app',
      '-d',
      'datascope_restore_verify',
      '--no-owner',
      '--exit-on-error',
    ],
    { input: await readFile(join(work, 'backups', backup)) },
  );
  const count = compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'datascope_admin',
      '-d',
      'datascope_restore_verify',
      '-Atc',
      'select count(*) from dataset_records',
    ],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(count, '100128');
  const volumeBefore = compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'datascope_admin',
      '-d',
      'datascope',
      '-Atc',
      'select count(*) from dataset_records',
    ],
    { encoding: 'utf8' },
  ).trim();
  compose(['up', '-d', '--force-recreate', '--wait', 'postgres']);
  const volumeAfter = compose(
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'datascope_admin',
      '-d',
      'datascope',
      '-Atc',
      'select count(*) from dataset_records',
    ],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(volumeAfter, volumeBefore);
  compose(['restart', 'api', 'web']);
  // Recreate proxy after app replacement, refreshing its upstream DNS addresses.
  compose(['up', '-d', '--force-recreate', '--wait', 'nginx']);
  await waitFor(
    async () => (await anonymous('/api/v1/health/ready')).status === 200,
  );
  assert.equal((await anonymous('/')).status, 200);
  results.push(
    'Custom-format backup restored to a new DB (100128 rows); persisted volume survives DB recreation; application/proxy restart recovery',
  );
  await writeFile(
    join(work, 'summary.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        project,
        origin,
        apiImage,
        webImage,
        checks: results,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ artifactDirectory: work, checks: results }, null, 2),
  );
} finally {
  if (fixture) await fixture.pool.end();
  if (fixtureCreated) administerDisposableDatabase(fixtureName, false);
  if (stackCreated) compose(['down', '--volumes', '--remove-orphans']);
}
