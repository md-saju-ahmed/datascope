#!/usr/bin/env node
/**
 * scripts/smoke-deployment.mjs
 *
 * End-to-end smoke tests for the live Vercel + Render + Neon production deployment.
 * All requests target real HTTPS endpoints — no mocks, no localhost.
 *
 * Usage:
 *   API_BASE_URL=https://datascope-api.onrender.com \
 *   WEB_BASE_URL=https://datascope.vercel.app \
 *   SMOKE_ADMIN_EMAIL=admin@example.com \
 *   SMOKE_ADMIN_PASSWORD=<password> \
 *   node scripts/smoke-deployment.mjs
 *
 * Required environment variables:
 *   API_BASE_URL          — Render API base URL (no trailing slash)
 *   WEB_BASE_URL          — Vercel web base URL (no trailing slash)
 *   SMOKE_ADMIN_EMAIL     — Admin user email for authenticated checks
 *   SMOKE_ADMIN_PASSWORD  — Admin user password for authenticated checks
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

const API_BASE = process.env.API_BASE_URL?.replace(/\/$/, '');
const WEB_BASE = process.env.WEB_BASE_URL?.replace(/\/$/, '');
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

const REQUIRED_VARS = ['API_BASE_URL', 'WEB_BASE_URL'];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length) {
  console.error(`❌  Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

/**
 * @param {string} label
 * @param {() => Promise<void>} fn
 */
async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✅  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ❌  ${label}: ${err.message}`);
    failed++;
  }
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * @param {number} expected
 * @param {number} actual
 * @param {string} url
 */
function assertStatus(expected, actual, url) {
  if (actual !== expected) {
    throw new Error(`Expected HTTP ${expected} but got ${actual} for ${url}`);
  }
}

async function main() {
  console.log('\n📡  DataScope Production Smoke Tests');
  console.log(`    API: ${API_BASE}`);
  console.log(`    Web: ${WEB_BASE}\n`);

  // ─────────────────────────────────────────────
  // 1. API health checks
  // ─────────────────────────────────────────────
  console.log('── API Health ──────────────────────────────────────');

  await check('GET /api/v1/health/live → 200', async () => {
    const url = `${API_BASE}/api/v1/health/live`;
    const res = await fetchWithTimeout(url);
    assertStatus(200, res.status, url);
  });

  await check('GET /api/v1/health/ready → 200 with database:up', async () => {
    const url = `${API_BASE}/api/v1/health/ready`;
    const res = await fetchWithTimeout(url);
    assertStatus(200, res.status, url);
    const body = await res.json();
    if (body.database !== 'up') {
      throw new Error(`Expected database:up but got database:${body.database}`);
    }
  });

  // ─────────────────────────────────────────────
  // 2. Web (Vercel) availability
  // ─────────────────────────────────────────────
  console.log('\n── Web Availability ────────────────────────────────');

  await check('GET / (Vercel web) → 200 or 302 redirect to login', async () => {
    const url = `${WEB_BASE}/`;
    const res = await fetchWithTimeout(url, { redirect: 'manual' });
    if (![200, 301, 302, 307, 308].includes(res.status)) {
      throw new Error(`Got HTTP ${res.status}`);
    }
  });

  await check(
    'GET /login (Vercel web) → 200 (public auth page served)',
    async () => {
      const url = `${WEB_BASE}/login`;
      const res = await fetchWithTimeout(url);
      assertStatus(200, res.status, url);
      const html = await res.text();
      if (!html.includes('DataScope') && !html.includes('datascope')) {
        throw new Error('Response body does not appear to be the DataScope UI');
      }
    },
  );

  await check('GET /api/v1/health/live (via Vercel proxy) → 200', async () => {
    const url = `${WEB_BASE}/api/v1/health/live`;
    const res = await fetchWithTimeout(url);
    assertStatus(200, res.status, url);
  });

  // ─────────────────────────────────────────────
  // 3. Unauthenticated access control
  // ─────────────────────────────────────────────
  console.log('\n── Unauthenticated Security ────────────────────────');

  await check('GET /api/v1/datasets → 401 without session cookie', async () => {
    const url = `${API_BASE}/api/v1/datasets`;
    const res = await fetchWithTimeout(url);
    assertStatus(401, res.status, url);
  });

  await check(
    'GET /api/v1/analytics/platform → 401 without session cookie',
    async () => {
      const url = `${API_BASE}/api/v1/analytics/platform`;
      const res = await fetchWithTimeout(url);
      assertStatus(401, res.status, url);
    },
  );

  // ─────────────────────────────────────────────
  // 4. Authenticated checks (require SMOKE_ADMIN_* vars)
  // ─────────────────────────────────────────────
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    console.log('\n── Authenticated Smoke Tests ───────────────────────');

    let sessionCookies = '';
    let csrfToken = '';

    await check('POST /api/v1/auth/login → 200 (admin login)', async () => {
      const csrfRes = await fetchWithTimeout(`${API_BASE}/api/v1/auth/csrf`);
      assertStatus(200, csrfRes.status, `${API_BASE}/api/v1/auth/csrf`);
      const csrfBody = await csrfRes.json();
      csrfToken = csrfBody.csrfToken;
      const initialCookie =
        csrfRes.headers.get('set-cookie')?.split(';')[0] ?? '';

      const loginRes = await fetchWithTimeout(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: initialCookie,
          'X-CSRF-Token': csrfToken,
          Origin: WEB_BASE,
          Referer: `${WEB_BASE}/login`,
        },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      });
      assertStatus(200, loginRes.status, `${API_BASE}/api/v1/auth/login`);
      const loginBody = await loginRes.json();
      csrfToken = loginBody.csrfToken ?? csrfToken;
      const setCookies = loginRes.headers.getSetCookie?.() ?? [
        loginRes.headers.get('set-cookie') ?? '',
      ];
      sessionCookies = setCookies
        .map((c) => c.split(';')[0])
        .filter(Boolean)
        .join('; ');
    });

    if (sessionCookies) {
      await check(
        'GET /api/v1/datasets → 200 with real session (bounded list)',
        async () => {
          const url = `${API_BASE}/api/v1/datasets`;
          const res = await fetchWithTimeout(url, {
            headers: { Cookie: sessionCookies },
          });
          assertStatus(200, res.status, url);
          const body = await res.json();
          if (!Array.isArray(body.data)) {
            throw new Error('Expected body.data to be an array');
          }
        },
      );

      await check(
        'GET analytics (platform or dataset) → 200 (real SQL aggregation)',
        async () => {
          let total = 0;
          const platRes = await fetchWithTimeout(
            `${API_BASE}/api/v1/analytics/platform`,
            { headers: { Cookie: sessionCookies } },
          );
          if (platRes.status === 200) {
            const body = await platRes.json();
            total = Number(body.data?.totalRecords);
          } else if (platRes.status === 403) {
            // Role is not admin, query dataset analytics
            const listRes = await fetchWithTimeout(
              `${API_BASE}/api/v1/datasets`,
              {
                headers: { Cookie: sessionCookies },
              },
            );
            const { data: datasets } = await listRes.json();
            const datasetId = datasets[0]?.id;
            const dsRes = await fetchWithTimeout(
              `${API_BASE}/api/v1/datasets/${datasetId}/analytics?days=30`,
              { headers: { Cookie: sessionCookies } },
            );
            assertStatus(
              200,
              dsRes.status,
              `${API_BASE}/api/v1/datasets/${datasetId}/analytics`,
            );
            const dsBody = await dsRes.json();
            total = Number(dsBody.data?.totalRecords);
          } else {
            assertStatus(
              200,
              platRes.status,
              `${API_BASE}/api/v1/analytics/platform`,
            );
          }

          if (isNaN(total) || total < 100_000) {
            throw new Error(
              `Expected ≥ 100,000 records but analytics reports ${total}`,
            );
          }
        },
      );

      await check(
        'POST /api/v1/datasets/:id/search → 200 bounded results',
        async () => {
          // first get a dataset id
          const listUrl = `${API_BASE}/api/v1/datasets`;
          const listRes = await fetchWithTimeout(listUrl, {
            headers: { Cookie: sessionCookies },
          });
          const { data: datasets } = await listRes.json();
          if (!datasets || datasets.length === 0) {
            throw new Error('No datasets visible to admin user');
          }
          const datasetId = datasets[0].id;
          const searchUrl = `${API_BASE}/api/v1/datasets/${datasetId}/search`;
          const searchRes = await fetchWithTimeout(searchUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: sessionCookies,
              'X-CSRF-Token': csrfToken,
              Origin: WEB_BASE,
              Referer: `${WEB_BASE}/datasets`,
            },
            body: JSON.stringify({
              q: '',
              page: 1,
              pageSize: 25,
              sort: [{ field: 'revenue', direction: 'desc' }],
            }),
          });
          assertStatus(200, searchRes.status, searchUrl);
          const body = await searchRes.json();
          if (!Array.isArray(body.data)) {
            throw new Error('Expected body.data to be an array');
          }
          if (body.data.length > 100) {
            throw new Error(
              `Results are not bounded — received ${body.data.length} rows`,
            );
          }
        },
      );
    }
  } else {
    console.log(
      '\n⚠️   SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD not set — skipping authenticated checks.',
    );
    console.log(
      '    Set them to run the full smoke suite including dataset, search and analytics checks.',
    );
  }

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`  Smoke results: ${passed}/${total} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  ✅  All smoke tests PASS — deployment is healthy.\n');
  } else {
    console.log(
      '  ❌  Some checks failed — review output above before claiming REL-03 DONE.\n',
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal smoke test error:', err.message ?? err);
  process.exit(1);
});
