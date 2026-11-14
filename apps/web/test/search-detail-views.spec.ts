import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  csrfResponseSchema,
  searchResponseSchema,
  historyResponseSchema,
  viewResponseSchema,
} from '@datascope/contracts';
import type { SearchCondition } from '@datascope/contracts';
const origin = 'http://localhost:3100';
function primary() {
  if (!process.env.FE05_PRIMARY) throw new Error('Missing fixture');
  return process.env.FE05_PRIMARY;
}
const path = () => `/datasets/${primary()}/explore`;
async function signIn(context: BrowserContext, role = 'analyst') {
  const boot = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  const result = await context.request.post('/api/v1/auth/login', {
    headers: { Origin: origin, 'X-CSRF-Token': boot.csrfToken },
    data: { email: `${role}@fe01.test`, password: process.env.FE01_PASSWORD },
  });
  expect(result.status()).toBe(200);
}
async function send(
  context: BrowserContext,
  method: 'post' | 'patch' | 'delete' | 'put',
  url: string,
  data: unknown,
  applied = false,
) {
  const boot = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  return context.request[method](`/api/v1${url}`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': boot.csrfToken,
      ...(applied ? { 'X-Search-Intent': 'apply' } : {}),
    },
    data,
  });
}
async function table(page: Page) {
  await expect(
    page.getByRole('region', { name: 'Dataset records', exact: true }),
  ).toBeVisible();
  return page
    .getByRole('region', { name: 'Dataset records', exact: true })
    .locator('tbody tr');
}
async function history(context: BrowserContext) {
  return historyResponseSchema.parse(
    await (
      await context.request.get('/api/v1/search-history?pageSize=100')
    ).json(),
  );
}
async function condition(
  page: Page,
  index: number,
  field: string,
  op: string,
  value: string | string[],
) {
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('button', { name: 'Add condition', exact: true })
    .click();
  await dialog
    .getByLabel(`Field ${String(index)}`, { exact: true })
    .selectOption(field);
  await dialog
    .getByLabel(`Operator ${String(index)}`, { exact: true })
    .selectOption(op);
  if (Array.isArray(value)) {
    await dialog
      .getByLabel(
        `From ${String(index)}${field === 'createdAt' ? ' (UTC)' : ''}`,
        { exact: true },
      )
      .fill(value[0] ?? '');
    await dialog
      .getByLabel(
        `To ${String(index)}${field === 'createdAt' ? ' (UTC)' : ''}`,
        { exact: true },
      )
      .fill(value[1] ?? '');
  } else
    await dialog
      .getByLabel(
        `Value ${String(index)}${field === 'createdAt' ? ' (UTC)' : ''}`,
        { exact: true },
      )
      .fill(value);
}
const combined: SearchCondition[] = [
  { field: 'status', op: 'eq', value: 'Active' },
  { field: 'country', op: 'eq', value: 'Germany' },
  { field: 'revenue', op: 'gt', value: '10000.00' },
  { field: 'createdAt', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
];

test('FE07 typed AND draft executes once against100k, navigation/cache/history intent, keyboard/mobile and save entry', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.goto('/search');
  await page.getByRole('link', { name: 'Build search', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await table(page);
  const before = (await history(context)).pageInfo.total;
  const requests: { intent: string | undefined; body: unknown }[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/search'))
      requests.push({
        intent: r.headers()['x-search-intent'],
        body: r.postDataJSON(),
      });
  });
  await page
    .getByRole('button', { name: 'Advanced builder', exact: true })
    .click();
  await condition(page, 1, 'status', 'eq', 'Active');
  await condition(page, 2, 'country', 'eq', 'Germany');
  await condition(page, 3, 'revenue', 'gt', '10000.00');
  await condition(page, 4, 'createdAt', 'gte', '2026-01-01T00:00');
  expect(requests).toHaveLength(0);
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect(page.getByText('1,082 results', { exact: false })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    intent: 'apply',
    body: {
      conditions: [...combined].sort((a, b) =>
        JSON.stringify(a) < JSON.stringify(b) ? -1 : 1,
      ),
      page: 1,
    },
  });
  expect((await history(context)).pageInfo.total).toBe(before + 1);
  const filtered = page.url();
  await page
    .getByRole('button', { name: 'Refresh records', exact: true })
    .click();
  await expect(await table(page)).toHaveCount(25);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]?.intent).toBeUndefined();
  expect((await history(context)).pageInfo.total).toBe(before + 1);
  await page
    .getByRole('button', { name: 'Remove filter 2', exact: true })
    .click();
  await expect(page).not.toHaveURL(filtered);
  await page.goBack();
  await expect(page).toHaveURL(filtered);
  await expect(page.getByText('1,082 results', { exact: false })).toBeVisible();
  await page.goForward();
  await expect(page).not.toHaveURL(filtered);
  await page.goBack();
  await page.reload();
  await expect(page.getByText('1,082 results', { exact: false })).toBeVisible();
  await page
    .getByRole('button', { name: 'Advanced builder', exact: true })
    .click();
  await page.getByLabel('Value 3', { exact: true }).fill('1e9');
  await expect(
    page.getByRole('button', { name: 'Apply filters', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Enter a decimal number without exponent notation.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset draft', exact: true }).click();
  await expect(page.getByLabel('Value 3', { exact: true })).toHaveValue(
    '10000.00',
  );
  await page
    .getByRole('button', { name: 'Last 30 days (UTC)', exact: true })
    .click();
  const from = await page
    .getByLabel('From 4 (UTC)', { exact: true })
    .inputValue();
  const to = await page.getByLabel('To 4 (UTC)', { exact: true }).inputValue();
  expect(Date.parse(`${to}Z`) - Date.parse(`${from}Z`)).toBe(30 * 86400000);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Advanced builder', exact: true }),
  ).toBeFocused();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page
      .getByRole('button', { name: 'Advanced builder', exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole('button', { name: 'Apply filters', exact: true }),
    ).toBeVisible();
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: info.outputPath(`builder-${String(width)}.png`),
        fullPage: true,
      });
    await page.keyboard.press('Escape');
  }
  console.log(
    JSON.stringify({
      evidence: 'FE07 combined requests',
      requests,
      historyBefore: before,
      historyAfter: (await history(context)).pageInfo.total,
    }),
  );
});
test('FE07 global debounce/Enter, superseded real responses, basic exact filters and Viewer/read-grant denials', async ({
  page,
  context,
}) => {
  await signIn(context, 'viewer');
  await page.goto(path());
  await table(page);
  await expect(
    page.getByRole('button', { name: 'Advanced builder', exact: true }),
  ).toHaveCount(0);
  const searches: { intent: string | undefined; q: unknown }[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/search'))
      searches.push({
        intent: r.headers()['x-search-intent'],
        q: (r.postDataJSON() as { q: unknown }).q,
      });
  });
  const input = page.getByRole('searchbox', { name: 'Search indexed fields' });
  await input.pressSequentially('Known Match Alpha', { delay: 15 });
  await expect.poll(() => searches.length).toBe(1);
  await expect(await table(page)).toHaveCount(1);
  expect(searches[0]).toEqual({ intent: 'apply', q: 'Known Match Alpha' });
  const count = searches.length;
  await page.waitForTimeout(450);
  expect(searches).toHaveLength(count);
  await input.fill('Revenue Boundary');
  await input.press('Enter');
  await expect(await table(page)).toHaveCount(1);
  await expect((await table(page)).first()).toContainText('Revenue Boundary');
  await page.waitForTimeout(450);
  expect(searches).toHaveLength(2);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(await table(page)).toHaveCount(25);
  await page
    .getByRole('button', { name: 'Basic filters', exact: true })
    .click();
  await condition(page, 1, 'country', 'eq', 'Germany');
  await page
    .getByRole('button', { name: 'Apply filters', exact: true })
    .click();
  await expect((await table(page)).first()).toContainText('Germany');
  const headers = await (await table(page))
    .first()
    .locator('td')
    .allTextContents();
  expect(headers).toContain('Germany');
  const denied = await send(context, 'post', `/datasets/${primary()}/search`, {
    conditions: [{ field: 'revenue', op: 'gt', value: '0' }],
  });
  expect(denied.status()).toBe(403);
  await page.goto(
    `${path()}?filters=${encodeURIComponent(JSON.stringify([{ field: 'revenue', op: 'gt', value: '0' }]))}`,
  );
  await expect(
    page.getByRole('heading', { name: 'Advanced search unavailable' }),
  ).toBeVisible();
  const readContext = await context.browser()?.newContext({ baseURL: origin });
  if (!readContext) throw new Error('Missing browser');
  try {
    await signIn(readContext, 'read-analyst');
    const other = await readContext.newPage();
    await other.goto(path());
    await table(other);
    await expect(
      other.getByRole('button', { name: 'Advanced builder', exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await send(readContext, 'post', `/datasets/${primary()}/search`, {
          conditions: [{ field: 'name', op: 'contains', value: 'Alpha' }],
        })
      ).status(),
    ).toBe(403);
  } finally {
    await readContext.close();
  }
  console.log(
    JSON.stringify({ evidence: 'FE07 debounce/explicit intent', searches }),
  );
});
test('FE07 delayed and failed search preserve newest state; numeric/date edges and malformed URL fail closed', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto(path());
  await table(page);
  await page.route('**/api/v1/datasets/*/search', async (route) => {
    const body = route.request().postDataJSON() as { q: string };
    if (body.q === 'Known Match Alpha')
      await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  const input = page.getByRole('searchbox', { name: 'Search indexed fields' });
  await input.fill('Known Match Alpha');
  await input.press('Enter');
  await expect(
    page.getByText('Applying search...', { exact: true }),
  ).toBeVisible();
  await input.fill('Revenue Boundary');
  await input.press('Enter');
  await expect((await table(page)).first()).toContainText('Revenue Boundary');
  await page.waitForTimeout(1000);
  await expect((await table(page)).first()).toContainText('Revenue Boundary');
  await page.unroute('**/api/v1/datasets/*/search');
  await page.route('**/api/v1/datasets/*/search', (route) => route.abort());
  await input.fill('networkfailure');
  await input.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Search could not be applied' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/Revenue\+Boundary/);
  await page.unroute('**/api/v1/datasets/*/search');
  const query = {
    conditions: [
      { field: 'revenue', op: 'between', value: ['10000.00', '10000.01'] },
      {
        field: 'createdAt',
        op: 'between',
        value: ['2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'],
      },
    ],
    sort: [{ field: 'id', direction: 'asc' }],
  };
  const response = await send(
    context,
    'post',
    `/datasets/${primary()}/search`,
    query,
  );
  expect(response.status()).toBe(200);
  expect(
    searchResponseSchema.parse(await response.json()).data.map((row) => row.id),
  ).toEqual(['1000000000001', '1000000000002']);
  await page.goto(
    `${path()}?filters=${encodeURIComponent(JSON.stringify(query.conditions))}`,
  );
  await expect(await table(page)).toHaveCount(2);
  for (const bad of [
    'page=1&page=2',
    'mode=sql',
    'filters=' +
      encodeURIComponent(
        JSON.stringify([
          { field: 'revenue', op: 'between', value: ['2', '1'] },
        ]),
      ),
  ]) {
    await page.goto(`${path()}?${bad}`);
    await expect(
      page.getByRole('heading', { name: 'Invalid Explorer query' }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Dataset records', exact: true }),
    ).toHaveCount(0);
  }
});

test('FE08 deep detail reuses peek; authorized relationships/real changes page, safe attributes, return state and honest empty/denied', async ({
  page,
  context,
}, info) => {
  await signIn(context, 'viewer');
  const criteria = new URLSearchParams({
    q: 'Known Match',
    sort: JSON.stringify([{ field: 'id', direction: 'asc' }]),
    pageSize: '10',
    columns: JSON.stringify(['id', 'name', 'country']),
  });
  await page.goto(`${path()}?${criteria.toString()}`);
  await table(page);
  const before = new URL(page.url()).searchParams;
  await page
    .getByRole('button', { name: 'Open record 1000000000001', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Open full record', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Known Match Alpha', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Complete record fields' }),
  ).toContainText('10000.01');
  const related = page.getByRole('region', {
    name: 'Related records',
    exact: true,
  });
  await expect(related.getByRole('link')).toHaveCount(10);
  await related
    .getByRole('button', { name: 'Next relationships', exact: true })
    .click();
  await expect(related.getByRole('link')).toHaveCount(2);
  await expect(related).not.toContainText('Partner');
  const changes = page.getByRole('region', {
    name: 'Change history',
    exact: true,
  });
  await expect(changes.locator('li')).toHaveCount(10);
  await expect(changes).toContainText('Verified browser fixture');
  await changes
    .getByRole('button', { name: 'Next changes', exact: true })
    .click();
  await expect(changes.locator('li')).toHaveCount(1);
  await page.getByText('largeNote', { exact: true }).click();
  const large = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'largeNote' }) });
  await large.getByRole('button', { name: 'Show value', exact: true }).click();
  await expect(large.locator('pre')).toHaveText(/Long authorized attribute/);
  await expect(large.getByRole('button', { name: /Show more/ })).toBeVisible();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390)
      await page.screenshot({
        path: info.outputPath('record-mobile.png'),
        fullPage: true,
      });
  }
  await page.screenshot({
    path: info.outputPath('record-desktop.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Back to results', exact: true })
    .click();
  await table(page);
  const after = new URL(page.url()).searchParams;
  for (const key of ['q', 'sort', 'pageSize', 'columns'])
    expect(after.get(key)).toBe(before.get(key));
  await page.goto(
    `/datasets/${primary()}/records/1000000000003?return=${encodeURIComponent('https://evil.invalid/')}`,
  );
  await expect(
    page.getByText('No history available.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No related records available.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to results', exact: true }),
  ).toHaveAttribute('href', path());
  const restricted = process.env.FE05_RESTRICTED;
  if (!restricted) throw new Error('Missing restricted fixture');
  await page.goto(`/datasets/${restricted}/records/1000000100001`);
  await expect(
    page.getByRole('region', { name: 'Complete record fields' }),
  ).toHaveCount(0);
  await page.goto(`/datasets/${primary()}/records/9223372036854775807`);
  await expect(
    page.getByRole('heading', { name: 'Dataset unavailable', exact: true }),
  ).toBeVisible();
});

test('FE09 real create/edit/share/revoke/delete; shared advanced Viewer explicit replay and history isolation', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.goto(
    `${path()}?filters=${encodeURIComponent(JSON.stringify(combined))}&columns=${encodeURIComponent('["id","name","revenue"]')}&pageSize=10`,
  );
  await table(page);
  await page.getByRole('button', { name: 'Save view', exact: true }).click();
  await page
    .getByLabel('View name', { exact: true })
    .fill('Verified four-condition view');
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/saved-views') &&
      r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create saved view', exact: true })
    .click();
  const view = viewResponseSchema.parse(await (await created).json()).data;
  expect(view.config).not.toHaveProperty('page');
  expect(view.config.version).toBe(1);
  await page.goto('/saved-views');
  let card = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Verified four-condition view',
      exact: true,
    }),
  });
  await card.getByRole('button', { name: 'Edit view', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('View name', { exact: true })
    .fill('Updated verified view');
  await dialog
    .getByLabel('Saved page size', { exact: true })
    .selectOption('25');
  await dialog.getByLabel('Value 3', { exact: true }).fill('15000');
  await dialog
    .getByLabel('Add saved sort', { exact: true })
    .selectOption('revenue');
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  card = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'Updated verified view',
      exact: true,
    }),
  });
  await card.getByRole('button', { name: 'Share view', exact: true }).click();
  await page
    .getByLabel('Recipient user ID', { exact: true })
    .fill(process.env.FE07_VIEWER ?? '');
  await page
    .getByRole('button', { name: 'Confirm share', exact: true })
    .click();
  await expect(
    page.getByText('View shared. The recipient must retain dataset access.', {
      exact: true,
    }),
  ).toBeVisible();
  const viewer = await context.browser()?.newContext({ baseURL: origin });
  if (!viewer) throw new Error('Missing browser');
  try {
    await signIn(viewer, 'viewer');
    const other = await viewer.newPage();
    await other.goto('/saved-views');
    const shared = other.locator('article').filter({
      has: other.getByRole('heading', {
        name: 'Updated verified view',
        exact: true,
      }),
    });
    await expect(
      shared.getByRole('button', { name: 'Share view', exact: true }),
    ).toHaveCount(0);
    const writes: { url: string; intent: string | undefined }[] = [];
    other.on('request', (r) => {
      if (r.url().endsWith('/apply') || r.url().endsWith('/search'))
        writes.push({
          url: new URL(r.url()).pathname,
          intent: r.headers()['x-search-intent'],
        });
    });
    const before = (await history(viewer)).pageInfo.total;
    await shared.getByRole('link', { name: 'Open view', exact: true }).click();
    await expect(
      other.getByRole('button', { name: 'Run saved view', exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
    await other
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await expect(await table(other)).toHaveCount(25);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.url).toBe(`/api/v1/saved-views/${view.id}/apply`);
    expect((await history(viewer)).pageInfo.total).toBe(before + 1);
    await other.reload();
    await expect(
      other.getByRole('button', { name: 'Run saved view', exact: true }),
    ).toBeVisible();
    await other.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    await other.waitForTimeout(300);
    expect(writes).toHaveLength(1);
    await other
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await table(other);
    await other.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(
      other.getByText('Run the saved view to load page 2.', { exact: true }),
    ).toBeVisible();
    expect(writes).toHaveLength(2);
    await other
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await table(other);
    expect(writes).toHaveLength(3);
    await other.goto('/history');
    const sharedHistory = other
      .locator('li')
      .filter({ hasText: 'revenue gt 15000' })
      .first();
    await expect(sharedHistory).toBeVisible();
    await sharedHistory
      .getByRole('button', { name: 'Run again', exact: true })
      .click();
    await expect(
      other.getByRole('button', { name: 'Run saved view', exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole('button', { name: 'Advanced builder', exact: true }),
    ).toHaveCount(0);
    await other.screenshot({
      path: info.outputPath('shared-view.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Confirm revoke', exact: true })
      .click();
    await expect(
      page.getByText(
        'Revocation confirmed. This user has no share through this view.',
        { exact: true },
      ),
    ).toBeVisible();
    await other
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await expect(
      other.getByRole('heading', { name: 'Dataset unavailable', exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole('region', { name: 'Dataset records', exact: true }),
    ).toHaveCount(0);
    expect(
      (await history(viewer)).data.some(
        (row) => row.normalizedQuery.savedViewId === view.id,
      ),
    ).toBe(false);
    const own = await history(context);
    expect(
      own.data.every((row) => row.normalizedQuery.savedViewId !== view.id),
    ).toBe(true);
    expect(
      (
        await send(viewer, 'post', '/saved-views', {
          name: 'Forbidden',
          datasetId: primary(),
          config: view.config,
        })
      ).status(),
    ).toBe(403);
    console.log(
      JSON.stringify({
        evidence: 'FE09 explicit view request counts',
        writes,
        viewerHistoryBefore: before,
      }),
    );
  } finally {
    await viewer.close();
  }
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await card.getByRole('button', { name: 'Delete view', exact: true }).click();
  const deleted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/saved-views/${view.id}`) &&
      response.request().method() === 'DELETE',
  );
  await page
    .getByRole('button', { name: 'Confirm delete', exact: true })
    .click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Updated verified view', exact: true }),
  ).toHaveCount(0);
  expect(
    (await context.request.get(`/api/v1/saved-views/${view.id}`)).status(),
  ).toBe(404);
});
test('FE09 ordinary history reapply is explicit once, share/grant negatives and paginated histories', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto(path());
  await table(page);
  await page
    .getByRole('searchbox', { name: 'Search indexed fields' })
    .fill('Known Match Gamma');
  await page
    .getByRole('searchbox', { name: 'Search indexed fields' })
    .press('Enter');
  await expect(await table(page)).toHaveCount(1);
  await page.goto('/history');
  const entry = page
    .locator('li')
    .filter({ hasText: 'Known Match Gamma' })
    .first();
  await expect(entry).toBeVisible();
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/search'))
      calls.push(r.headers()['x-search-intent'] ?? 'read');
  });
  await entry.getByRole('button', { name: 'Run again', exact: true }).click();
  await expect(await table(page)).toHaveCount(1);
  expect(calls).toEqual(['apply']);
  const viewResult = await send(context, 'post', '/saved-views', {
    name: 'Grant boundary',
    datasetId: primary(),
    config: { version: 1, q: '', conditions: combined },
  });
  expect(viewResult.status()).toBe(201);
  const view = viewResponseSchema.parse(await viewResult.json()).data;
  const noGrant = process.env.FE07_EMPTY;
  if (!noGrant) throw new Error('Missing no-grant fixture');
  expect(
    (
      await send(context, 'post', `/saved-views/${view.id}/shares`, {
        userId: noGrant,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await send(context, 'post', `/saved-views/${view.id}/shares`, {
        userId: '11111111-1111-4111-8111-111111111111',
      })
    ).status(),
  ).toBe(404);
  const viewer = await context.browser()?.newContext({ baseURL: origin });
  if (!viewer) throw new Error('Missing browser');
  try {
    await signIn(viewer, 'viewer');
    expect(
      (await viewer.request.get(`/api/v1/saved-views/${view.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await send(viewer, 'post', `/saved-views/${view.id}/apply`, {})
      ).status(),
    ).toBe(404);
  } finally {
    await viewer.close();
  }
  expect(
    (await send(context, 'delete', `/saved-views/${view.id}`, {})).status(),
  ).toBe(200);
  for (let index = 0; index < 11; index++) {
    const result = await send(
      context,
      'post',
      `/datasets/${primary()}/search`,
      { q: `History pagination ${String(index)}` },
      true,
    );
    expect(result.status()).toBe(200);
  }
  await page.goto('/history');
  await expect(page.locator('main li')).toHaveCount(10);
  const newest = await page.locator('main li').first().textContent();
  await page.getByRole('button', { name: 'Next history', exact: true }).click();
  await expect
    .poll(async () => page.locator('main li').first().textContent())
    .not.toBe(newest);
});

test('FE09 dataset revocation redacts shared results and history, no automatic Apply retry', async ({
  context,
}) => {
  await signIn(context);
  const created = await send(context, 'post', '/saved-views', {
    name: 'Revoked dataset view',
    datasetId: primary(),
    config: { version: 1, conditions: combined, pageSize: 10 },
  });
  expect(created.status()).toBe(201);
  const view = viewResponseSchema.parse(await created.json()).data;
  const viewerId = process.env.FE07_VIEWER;
  if (!viewerId) throw new Error('Missing Viewer fixture');
  expect(
    (
      await send(context, 'post', `/saved-views/${view.id}/shares`, {
        userId: viewerId,
      })
    ).status(),
  ).toBe(201);
  const browser = context.browser();
  if (!browser) throw new Error('Missing browser');
  const viewer = await browser.newContext({ baseURL: origin }),
    admin = await browser.newContext({ baseURL: origin });
  try {
    await signIn(viewer, 'viewer');
    await signIn(admin, 'admin');
    const other = await viewer.newPage();
    await other.goto('/saved-views');
    await other
      .locator('article')
      .filter({
        has: other.getByRole('heading', {
          name: 'Revoked dataset view',
          exact: true,
        }),
      })
      .getByRole('link', { name: 'Open view', exact: true })
      .click();
    let applies = 0;
    other.on('request', (r) => {
      if (r.url().endsWith('/apply')) applies++;
    });
    await other
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await table(other);
    expect(applies).toBe(1);
    expect(
      (
        await send(
          admin,
          'delete',
          `/datasets/${primary()}/permissions/${viewerId}`,
          {},
        )
      ).status(),
    ).toBe(200);
    await other
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await expect(
      other.getByRole('heading', { name: 'Dataset unavailable', exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole('region', { name: 'Dataset records', exact: true }),
    ).toHaveCount(0);
    await other.waitForTimeout(350);
    expect(applies).toBe(1);
    expect(
      (await history(viewer)).data.every(
        (item) => item.datasetId !== primary(),
      ),
    ).toBe(true);
  } finally {
    expect(
      (
        await send(
          admin,
          'put',
          `/datasets/${primary()}/permissions/${viewerId}`,
          { permission: 'read' },
        )
      ).status(),
    ).toBe(200);
    await viewer.close();
    await admin.close();
    expect(
      (await send(context, 'delete', `/saved-views/${view.id}`, {})).status(),
    ).toBe(200);
  }
});
