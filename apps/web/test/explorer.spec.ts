import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { csrfResponseSchema, searchRequestSchema } from '@datascope/contracts';
async function signIn(context: BrowserContext, role = 'viewer') {
  const boot = await context.request.get('/api/v1/auth/csrf');
  const token = csrfResponseSchema.parse(await boot.json());
  const response = await context.request.post('/api/v1/auth/login', {
    headers: {
      Origin: 'http://localhost:3100',
      'X-CSRF-Token': token.csrfToken,
    },
    data: { email: `${role}@fe01.test`, password: process.env.FE01_PASSWORD },
  });
  expect(response.status()).toBe(200);
}
async function rows(page: Page) {
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toBeVisible();
  return page
    .getByRole('region', { name: 'Dataset records' })
    .locator('tbody tr');
}
test('FE05/06 Viewer library, fields, bounded table, sort/page/selection/columns/resize/details and URL restoration', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  const primary = process.env.FE05_PRIMARY;
  if (!primary) throw new Error('Missing fixture');
  const requests: unknown[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/search'))
      requests.push(request.postDataJSON());
  });
  await page.goto('/datasets');
  await expect(
    page.getByRole('heading', { name: 'Dataset Library', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore dataset' })).toHaveCount(
    1,
  );
  await page.getByRole('link', { name: 'View field information' }).click();
  await expect(
    page.getByRole('heading', { name: /field information/ }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Explore dataset', exact: true })
    .click();
  const tableRows = await rows(page);
  await expect(tableRows).toHaveCount(25);
  const first = await tableRows.first().textContent();
  await page.getByRole('checkbox', { name: 'Select current page' }).check();
  await expect(page.getByText('25 selected on this page')).toBeVisible();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(await rows(page)).toHaveCount(25);
  await expect(page.getByText('0 selected on this page')).toBeVisible();
  expect(await (await rows(page)).first().textContent()).not.toBe(first);
  await expect(page).toHaveURL(/page=2/);
  await page.goBack();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(await rows(page)).toHaveCount(25);
  await page.getByLabel('Rows per page').selectOption('10');
  await expect(await rows(page)).toHaveCount(10);
  await page.getByText('Sort priority', { exact: true }).click();
  await page.getByLabel('Add sort field').selectOption('name');
  await page.getByLabel('Add sort field').selectOption('country');
  await expect(page).toHaveURL(/sort=/);
  await expect(await rows(page)).toHaveCount(10);
  const lastRequest = requests.at(-1);
  expect(lastRequest).toMatchObject({
    pageSize: 10,
    sort: [
      { field: 'name', direction: 'asc' },
      { field: 'country', direction: 'asc' },
    ],
  });
  await page.getByText('Columns', { exact: true }).click();
  const country = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Columns' }) })
    .getByLabel('Country', { exact: true });
  const cellsBefore = await (await rows(page)).first().locator('td').count();
  await country.uncheck();
  await expect((await rows(page)).first().locator('td')).toHaveCount(
    cellsBefore - 1,
  );
  const separator = page.getByRole('separator', {
    name: 'Resize name',
    exact: true,
  });
  const before = Number(await separator.getAttribute('aria-valuenow'));
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', String(before + 20));
  const open = (await rows(page))
    .first()
    .getByRole('button', { name: /Open record/ });
  await open.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByText('name', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.reload();
  await expect(await rows(page)).toHaveCount(10);
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if ([390, 1440].includes(width))
      await page.screenshot({
        path: info.outputPath(`explorer-${String(width)}.png`),
        fullPage: true,
      });
  }
  expect(
    requests.every((value) => searchRequestSchema.safeParse(value).success),
  ).toBe(true);
  console.log(JSON.stringify({ evidence: 'bounded table requests', requests }));
});
test('FE05/06 unauthorized dataset and malformed URL reject without query fallback; search failure retries', async ({
  page,
  context,
}) => {
  await signIn(context);
  const primary = process.env.FE05_PRIMARY,
    restricted = process.env.FE05_RESTRICTED;
  if (!primary || !restricted) throw new Error('Missing fixtures');
  await page.goto(`/datasets/${restricted}/explore`);
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toHaveCount(0);
  await page.goto(`/datasets/${primary}/explore?pageSize=100000`);
  await expect(
    page.getByRole('heading', { name: 'Invalid Explorer query' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset query' }).click();
  await expect(await rows(page)).toHaveCount(25);
  await page.route('**/api/v1/datasets/*/search', (route) => route.abort());
  await page.getByRole('button', { name: 'Refresh records' }).click();
  await expect(
    page.getByRole('heading', { name: 'Unable to load data' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toHaveCount(0);
  await page.unroute('**/api/v1/datasets/*/search');
  await page.getByRole('button', { name: 'Try again' }).click();
  await rows(page);
  await page.goto(`/datasets/${primary}/explore?q=absolutelynonexistentxyz`);
  await expect(
    page.getByRole('heading', { name: 'No matching records' }),
  ).toBeVisible();
});

test('FE05/06 Analyst sees authorized dataset and literal search highlighting from real results', async ({
  page,
  context,
}) => {
  await signIn(context, 'analyst');
  const primary = process.env.FE05_PRIMARY;
  if (!primary) throw new Error('Missing fixture');
  await page.goto('/datasets');
  await expect(page.getByRole('link', { name: 'Explore dataset' })).toHaveCount(
    1,
  );
  await page.goto(`/datasets/${primary}/explore?q=Known%20Match`);
  await rows(page);
  await expect(page.locator('mark').first()).toHaveText('Known Match');
  await expect(
    page.getByRole('button', { name: /Open record/ }).first(),
  ).toBeVisible();
});
test('FE05/06 account without grants sees truthful empty library and no record requests', async ({
  page,
  context,
}) => {
  await signIn(context, 'empty');
  let records = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/search')) records++;
  });
  await page.goto('/datasets');
  await expect(
    page.getByRole('heading', {
      name: 'No datasets available to your account',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore dataset' })).toHaveCount(
    0,
  );
  expect(records).toBe(0);
});
