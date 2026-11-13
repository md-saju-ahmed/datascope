import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// Reserve an available loopback port, then release it for the compiled API.
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const address = reservation.address();
assert(address && typeof address === 'object');
const port = address.port;
await new Promise((resolve, reject) => {
  reservation.close((error) => (error ? reject(error) : resolve()));
});

const child = spawn(
  process.execPath,
  ['--env-file-if-exists=../../.env', 'dist/main.js'],
  {
    cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let output = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + String(chunk)).slice(-10000);
  });
}
let spawnError;
child.on('error', (error) => {
  spawnError = error;
});
const exited = new Promise((resolve) => child.once('exit', resolve));

try {
  let response;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    assert.equal(
      child.exitCode,
      null,
      `API exited before liveness succeeded:\n${output}`,
    );
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`, {
        signal: AbortSignal.timeout(1000),
      });
      break;
    } catch {
      await delay(100);
    }
  }
  assert(response, `API did not become live within 15 seconds:\n${output}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  if (process.argv.includes('--ready')) {
    const ready = await fetch(`http://127.0.0.1:${port}/api/v1/health/ready`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ok', database: 'up' });
    console.log(
      'PASS: compiled API readiness confirmed the configured PostgreSQL connection',
    );
  }
  console.log(
    'PASS: compiled Nest API booted; GET /api/v1/health/live returned 200 {"status":"ok"}',
  );
} finally {
  if (child.exitCode === null && child.pid) {
    child.kill();
  }
  if (child.pid) await exited;
}
