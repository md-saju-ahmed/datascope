import { test, expect, type BrowserContext } from '@playwright/test';
import { csrfResponseSchema } from '@datascope/contracts';
test.use({ trace: 'on' });
async function login(context: BrowserContext) {
  const csrf = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  expect(
    (
      await context.request.post('/api/v1/auth/login', {
        headers: {
          Origin: 'http://localhost:3100',
          'X-CSRF-Token': csrf.csrfToken,
        },
        data: { email: 'admin@fe01.test', password: process.env.FE01_PASSWORD },
      })
    ).status(),
  ).toBe(200);
}
function primary() {
  if (!process.env.FE05_PRIMARY) throw new Error('Missing fixture');
  return process.env.FE05_PRIMARY;
}
test('FE13 required routes fit desktop/mobile and expose named controls', async ({
  page,
  context,
}, info) => {
  test.setTimeout(120000);
  await login(context);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/dashboard',
      '/datasets',
      `/datasets/${primary()}/explore`,
      `/datasets/${primary()}/records/1000000000001`,
      '/search',
      '/saved-views',
      '/history',
      '/analytics',
      '/settings',
      '/admin/users',
      '/admin/datasets',
      '/admin/permissions',
      '/admin/system',
    ]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(
        page.getByRole('status', { name: 'Loading data', exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const unnamed = await page
        .locator('main button:visible')
        .evaluateAll(
          (buttons) =>
            buttons.filter(
              (button) =>
                !button.textContent.trim() &&
                !button.getAttribute('aria-label') &&
                !button.getAttribute('aria-labelledby'),
            ).length,
        );
      expect(unnamed).toBe(0);
      await page.screenshot({
        path: info.outputPath(
          `${String(width)}-${path.replaceAll('/', '_')}.png`,
        ),
        fullPage: true,
      });
    }
  }
});
test('FE13 short desktop and mobile keyboard navigation, skip link, modal trap/restoration and reduced motion', async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 1024, height: 400 });
  await page.goto('/settings');
  const system = page
    .locator('aside')
    .getByRole('link', { name: 'System', exact: true });
  await system.focus();
  await expect(system).toBeInViewport();
  expect(
    await page
      .locator('aside')
      .evaluate((node) => getComputedStyle(node).overflowY),
  ).toBe('auto');
  await page.goto('/settings');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 400 });
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page.evaluate(() => {
      const element = document.createElement('div');
      element.className = 'animate-pulse';
      document.body.appendChild(element);
      const duration = getComputedStyle(element).animationDuration;
      element.remove();
      return parseFloat(duration);
    }),
  ).toBeLessThan(0.001);
});
test('FE13 real delayed/error/retry/empty/denied Explorer states on mobile', async ({
  page,
  context,
}) => {
  await login(context);
  await page.setViewportSize({ width: 390, height: 844 });
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/datasets/*/search', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/datasets/${primary()}/explore?pageSize=25`);
  await expect(
    page.getByRole('status', { name: 'Loading data', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.route('**/datasets/*/search', (route) => route.abort());
  await page
    .getByRole('button', { name: 'Refresh records', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Unable to load data', exact: true }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search indexed fields' })
    .fill('fe13unmatchablexyz');
  await page
    .getByRole('searchbox', { name: 'Search indexed fields' })
    .press('Enter');
  await expect(
    page.getByRole('heading', { name: 'No matching records' }),
  ).toBeVisible();
  await page.goto('/datasets/00000000-0000-4000-8000-000000000001/explore');
  await expect(
    page.getByRole('heading', { name: 'Page not found', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toHaveCount(0);
});
