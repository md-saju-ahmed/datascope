import { test, expect, type BrowserContext } from '@playwright/test';
import { csrfResponseSchema } from '@datascope/contracts';

async function authenticate(context: BrowserContext, role: string) {
  const csrf = await context.request.get(
    'http://localhost:4100/api/v1/auth/csrf',
    { headers: { Origin: 'http://localhost:3100' } },
  );
  const body: unknown = await csrf.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('csrfToken' in body) ||
    typeof body.csrfToken !== 'string'
  )
    throw new Error('Invalid bootstrap');
  const login = await context.request.post(
    'http://localhost:4100/api/v1/auth/login',
    {
      headers: {
        Origin: 'http://localhost:3100',
        'X-CSRF-Token': body.csrfToken,
      },
      data: { email: `${role}@fe01.test`, password: process.env.FE01_PASSWORD },
    },
  );
  expect(login.status()).toBe(200);
}
test('public boundaries and unauthenticated/forged private entry', async ({
  page,
  context,
}) => {
  for (const path of ['/', '/login', '/register']) {
    expect((await page.goto(path))?.status()).toBe(200);
  }
  for (const path of ['/dashboard', '/admin/users', '/datasets']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByText('admin@fe01.test')).toHaveCount(0);
  }
  await context.addCookies([
    {
      name: 'datascope_session',
      value: 'a'.repeat(64),
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
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
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
test('public navbar updates after login and provides responsive mobile navigation', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(
    page
      .getByRole('navigation', { name: 'Public Navigation' })
      .getByRole('link', { name: 'Sign in' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Public Navigation' })
      .getByRole('link', { name: 'Sign up' }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Sign up' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await authenticate(context, 'viewer');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(
    page
      .getByRole('navigation', { name: 'Public Navigation' })
      .getByRole('link', { name: 'Sign in' }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Public Navigation' })
      .getByRole('link', { name: 'Dashboard' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Public Navigation' })
      .getByRole('button', { name: 'Sign out' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Public Navigation' })
      .getByText('viewer@fe01.test'),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('viewer@fe01.test')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
test('backend outage fails closed with recoverable error and no identity leak', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'datascope_session',
      value: 'a'.repeat(64),
      domain: 'localhost',
      path: '/',
    },
  ]);
  await page.goto('http://localhost:3101/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Unable to load this page' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Unable to load this page' }),
  ).toBeVisible();
});
for (const role of ['viewer', 'analyst', 'admin'])
  test(`${role}: server session, responsive navigation and role boundaries`, async ({
    page,
    context,
  }, testInfo) => {
    await authenticate(context, role);
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dashboard');
      await expect(
        page.getByRole('heading', { name: 'Overview', exact: true }),
      ).toBeVisible();
      await expect(page.getByText(`${role}@fe01.test`)).toBeVisible();
      if (role === 'admin' && [390, 1440].includes(width))
        await page.screenshot({
          path: testInfo.outputPath(`shell-${String(width)}.png`),
          fullPage: true,
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (width < 1024) {
        const trigger = page.getByRole('button', { name: 'Open navigation' });
        await trigger.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole('link', { name: 'Analytics', exact: true }),
        ).toHaveCount(role === 'viewer' ? 0 : 1);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await trigger.click();
        await dialog
          .getByRole('link', { name: 'Settings', exact: true })
          .click();
        await expect(
          page.getByRole('heading', { name: 'Settings', exact: true }),
        ).toBeVisible();
      }
    }
    for (const area of ['users', 'datasets', 'permissions', 'system']) {
      await page.goto(`/admin/${area}`);
      await expect(
        page.getByRole('heading', {
          name:
            role === 'admin'
              ? /management|permissions|settings/i
              : 'Access denied',
        }),
      ).toBeVisible();
    }
    await page.goto('/analytics');
    await expect(
      page.getByRole('heading', {
        name: role === 'viewer' ? 'Access denied' : 'Analytics',
        exact: true,
      }),
    ).toBeVisible();
    const cookie = (await context.cookies()).find(
      (item) => item.name === 'datascope_session',
    );
    expect(cookie).toBeDefined();
    const bootstrap = await context.request.get(
      'http://localhost:4100/api/v1/auth/csrf',
      { headers: { Origin: 'http://localhost:3100' } },
    );
    const csrf = csrfResponseSchema.parse(await bootstrap.json());
    const logout = await context.request.post(
      'http://localhost:4100/api/v1/auth/logout',
      {
        headers: {
          Origin: 'http://localhost:3100',
          'X-CSRF-Token': csrf.csrfToken,
        },
        data: {},
      },
    );
    expect(logout.status()).toBe(200);
    // Replay the now-revoked cookie to verify the server, rather than just clearing browser state.
    if (!cookie) throw new Error('Missing session');
    await context.addCookies([cookie]);
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  });
