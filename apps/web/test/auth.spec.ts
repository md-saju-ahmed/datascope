import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('development Strict Mode session bootstrap settles and preserves form input', async ({
  page,
}) => {
  await page.goto('http://localhost:3102/login');
  await page.getByLabel('Email address').fill('draft@example.test');
  await expect(
    page.getByRole('heading', { name: 'Session verification unavailable' }),
  ).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Email address')).toHaveValue(
    'draft@example.test',
  );
});

test('registration validates, creates Viewer without session, explicitly signs in, and logs out on mobile', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `new-${randomUUID()}@fe04.test`;
  const password = process.env.FE01_PASSWORD;
  if (!password) throw new Error('Missing fixture');
  let registrations = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/auth/register')) registrations++;
  });
  await page.goto('/register?returnTo=%2Fsettings');
  await page
    .getByRole('button', { name: 'Create Viewer account', exact: true })
    .click();
  await expect(
    page.getByText('Enter a valid email address', { exact: false }),
  ).toBeVisible();
  expect(registrations).toBe(0);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('é'.repeat(65));
  await page.getByLabel('Confirm password').fill('different');
  await page
    .getByRole('button', { name: 'Create Viewer account', exact: true })
    .click();
  await expect(page.getByText('Passwords must match.')).toBeVisible();
  expect(registrations).toBe(0);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/register', async (route) => {
    await gate;
    await route.continue();
  });
  await page
    .getByRole('button', { name: 'Create Viewer account', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Creating account…' }),
  ).toBeDisabled();
  await page.locator('form').evaluate((form) => {
    if (!(form instanceof HTMLFormElement)) throw new Error('Missing form');
    form.requestSubmit();
  });
  release();
  await expect(
    page.getByRole('heading', { name: 'Account created' }),
  ).toBeVisible();
  expect(registrations).toBe(1);
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'datascope_session',
    ),
  ).toBe(false);
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('viewer', { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (item) => item.name === 'datascope_session',
  );
  expect(cookie?.httpOnly).toBe(true);
  await page.screenshot({
    path: info.outputPath('auth-shell-mobile.png'),
    fullPage: true,
  });
  await page.route('**/api/v1/auth/logout', (route) => route.abort());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Sign out failed' }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await page.unroute('**/api/v1/auth/logout');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  if (!cookie) throw new Error('Missing cookie');
  await context.addCookies([cookie]);
  expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings$/);
});

test('login failure recovers, rejects malicious return path, restores valid session and hides expired content', async ({
  page,
  context,
}) => {
  const password = process.env.FE01_PASSWORD;
  if (!password) throw new Error('Missing fixture');
  await page.goto('/login?returnTo=%2F%2Fevil.test');
  await page.getByLabel('Email address').fill('analyst@fe01.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'Unable to sign in with those credentials',
  );
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/login?returnTo=%2Fsettings');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText('analyst@fe01.test')).toBeVisible();
  await page.route('**/api/v1/auth/me', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('heading', { name: 'Session verification unavailable' }),
  ).toBeVisible();
  await expect(page.getByText('analyst@fe01.test')).toHaveCount(0);
  await page.unroute('**/api/v1/auth/me');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('analyst@fe01.test')).toBeVisible();
  // A real expired database session, not a mocked API response.
  const expired = process.env.FE01_EXPIRED;
  if (!expired) throw new Error('Missing expired fixture');
  await context.addCookies([
    {
      name: 'datascope_session',
      value: expired,
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('heading', { name: 'Sign in required' }),
  ).toBeVisible();
  await expect(page.getByText('analyst@fe01.test')).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings$/);
});

test('session and login network failures are actionable, with no fake success', async ({
  page,
}) => {
  await page.goto('http://localhost:3101/login');
  await expect(
    page.getByRole('heading', { name: 'Session verification unavailable' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.goto('/login');
  await page.getByLabel('Email address').fill('viewer@fe01.test');
  await page
    .getByLabel('Password', { exact: true })
    .fill('test-only-placeholder');
  await page.route('**/api/v1/auth/login', (route) => route.abort());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'Check your connection',
  );
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
});

test('public forms remain usable at responsive widths and retain input across focus', async ({
  page,
}, info) => {
  for (const path of ['/', '/login', '/register']) {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      if (path !== '/') {
        await page.getByLabel('Email address').fill('draft@example.test');
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await expect(page.getByLabel('Email address')).toHaveValue(
          'draft@example.test',
        );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if ([375, 1440].includes(width))
        await page.screenshot({
          path: info.outputPath(
            `${path.slice(1) || 'landing'}-${String(width)}.png`,
          ),
          fullPage: true,
        });
    }
  }
});
