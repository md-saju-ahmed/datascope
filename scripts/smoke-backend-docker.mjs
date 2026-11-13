import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { localMigrationUrl } from '../packages/db/dist/index.js';

// Read-only smoke against the existing local development database.
const url = new URL(localMigrationUrl(process.env, false));
url.hostname = 'postgres';
url.port = '5432';
const directory = resolve('docs/evidence/be-19-22');
mkdirSync(directory, { recursive: true });
const name = `datascope-backend-smoke-${Date.now()}`;
const environment = resolve(directory, `${name}.env`);
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  }).trim();
let started = false;
let environmentWritten = false;
try {
  writeFileSync(
    environment,
    `DATABASE_URL=${url}\nAPP_ORIGIN=https://datascope.local.test\n`,
    { flag: 'wx' },
  );
  environmentWritten = true;
  docker(
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '--network',
    'datascope_default',
    '--env-file',
    environment,
    '-p',
    '127.0.0.1::4000',
    'datascope-api:be21',
  );
  started = true;
  const port = docker('port', name, '4000/tcp').split(':').at(-1);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/v1/health/ready`,
        { signal: AbortSignal.timeout(1000) },
      );
      if (response.ok) {
        assert.deepEqual(await response.json(), {
          status: 'ok',
          database: 'up',
        });
        ready = true;
        break;
      }
    } catch {
      /* allow startup */
    }
    await delay(500);
  }
  assert(ready, 'Container readiness failed');
  const live = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { status: 'ok' });
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/api/v1/datasets`)).status,
    401,
  );
  const user = docker('exec', name, 'id', '-u');
  assert.notEqual(user, '0');
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        image: 'datascope-api:be21',
        imageId: docker(
          'image',
          'inspect',
          'datascope-api:be21',
          '--format',
          '{{.Id}}',
        ),
        runtimeUid: user,
        liveness: 200,
        readiness: 200,
        unauthenticatedDatasets: 401,
        exposure: 'loopback ephemeral port',
        database: 'existing dev, read-only smoke; no migrations or seeds',
      },
      null,
      2,
    ),
  );
} finally {
  if (started) docker('stop', name);
  if (environmentWritten) unlinkSync(environment);
}
