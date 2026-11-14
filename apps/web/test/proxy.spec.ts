import { test, expect } from '@playwright/test';

test('browser uses one origin for HttpOnly cookies, CSRF rotation and safe proxy errors', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  const result = await page.evaluate(async (password) => {
    const csrf = await fetch('/api/v1/auth/csrf');
    const bootstrap: unknown = await csrf.json();
    if (
      typeof bootstrap !== 'object' ||
      bootstrap === null ||
      !('csrfToken' in bootstrap) ||
      typeof bootstrap.csrfToken !== 'string'
    )
      throw new Error('Invalid CSRF bootstrap');
    const login = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': bootstrap.csrfToken,
      },
      body: JSON.stringify({ email: 'viewer@fe01.test', password }),
    });
    const body: unknown = await login.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('csrfToken' in body) ||
      typeof body.csrfToken !== 'string'
    )
      throw new Error('Invalid login response');
    const me = await fetch('/api/v1/auth/me');
    const identity: unknown = await me.json();
    const stale = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': bootstrap.csrfToken,
      },
      body: '{}',
    });
    const logout = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': body.csrfToken,
      },
      body: '{}',
    });
    const expired = await fetch('/api/v1/auth/me');
    return {
      login: login.status,
      me: me.status,
      identity,
      stale: stale.status,
      logout: logout.status,
      expired: expired.status,
      cache: me.headers.get('Cache-Control'),
      cookies: document.cookie,
    };
  }, process.env.FE01_PASSWORD);
  expect(result).toMatchObject({
    login: 200,
    me: 200,
    identity: { data: { email: 'viewer@fe01.test', role: 'viewer' } },
    stale: 403,
    logout: 200,
    expired: 401,
    cache: 'no-store',
    cookies: '',
  });
  const evil = await context.request.get('/api/v1/auth/csrf', {
    headers: { Origin: 'https://untrusted.example' },
  });
  expect(evil.status()).toBe(403);
  const unavailable = await context.request.get(
    'http://localhost:3101/api/v1/health/ready',
  );
  expect(unavailable.status()).toBe(502);
  expect(await unavailable.json()).toEqual({
    message: 'API unavailable; try again',
  });
});
