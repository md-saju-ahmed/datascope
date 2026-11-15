import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createDatabase } from '../../../packages/db/dist/index.js';
import {
  csrfResponseSchema,
  datasetAnalyticsResponseSchema,
  platformAnalyticsResponseSchema,
  historyResponseSchema,
} from '@datascope/contracts';
const origin = 'http://localhost:3100';
const primary = () => required('FE05_PRIMARY');
function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
async function signIn(context: BrowserContext, role = 'analyst') {
  const boot = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  expect(
    (
      await context.request.post('/api/v1/auth/login', {
        headers: { Origin: origin, 'X-CSRF-Token': boot.csrfToken },
        data: {
          email: `${role}@fe01.test`,
          password: required('FE01_PASSWORD'),
        },
      })
    ).status(),
  ).toBe(200);
}
async function send(
  context: BrowserContext,
  method: 'post' | 'put' | 'delete',
  path: string,
  data: unknown,
  applied = false,
) {
  const boot = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  return context.request[method](`/api/v1${path}`, {
    headers: {
      Origin: origin,
      'X-CSRF-Token': boot.csrfToken,
      ...(applied ? { 'X-Search-Intent': 'apply' } : {}),
    },
    data,
  });
}
type AnalyticsData = ReturnType<
  typeof datasetAnalyticsResponseSchema.parse
>['data'];
async function reconcile(data: AnalyticsData, userId?: string) {
  const url = new URL(required('FE10_DATABASE_URL'));
  if (!/^\/datascope_test_seed_[0-9a-f]{32}$/.test(url.pathname))
    throw new Error('Not a disposable database');
  const db = createDatabase({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 1000,
    statementTimeoutMillis: 60000,
  });
  try {
    const total = await db.pool.query<{ count: string }>(
      'select count(*)::text as count from dataset_records where dataset_id=$1',
      [data.datasetId],
    );
    expect(data.totalRecords).toBe(total.rows[0]?.count);
    for (const field of ['category', 'status'] as const) {
      const rows = await db.pool.query<{ key: string | null; count: string }>(
        `select ${field} as key,count(*)::text as count from dataset_records where dataset_id=$1 group by ${field} order by count(*) desc,${field} collate "C" nulls last limit 50`,
        [data.datasetId],
      );
      const breakdown = field === 'category' ? data.byCategory : data.byStatus;
      expect(breakdown.buckets).toEqual(rows.rows);
      expect(
        BigInt(breakdown.otherCount) +
          rows.rows.reduce((sum, row) => sum + BigInt(row.count), 0n),
      ).toBe(BigInt(data.totalRecords));
    }
    const activity = data.searchActivity;
    const args = [data.datasetId, activity.from, activity.to, userId ?? null];
    const growth = await db.pool.query<{ key: string; count: string }>(
      "select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as key,count(*)::text as count from dataset_records where dataset_id=$1 and created_at between $2 and $3 group by 1 order by 1",
      args.slice(0, 3),
    );
    expect(data.growth).toEqual(growth.rows);
    const predicate =
      'dataset_id=$1 and executed_at between $2 and $3 and ($4::uuid is null or user_id=$4::uuid)';
    expect(activity.total).toBe(
      (
        await db.pool.query<{ count: string }>(
          `select count(*)::text as count from search_history where ${predicate}`,
          args,
        )
      ).rows[0]?.count,
    );
    expect(activity.byDay).toEqual(
      (
        await db.pool.query<{ key: string; count: string }>(
          `select to_char(executed_at at time zone 'UTC','YYYY-MM-DD') as key,count(*)::text as count from search_history where ${predicate} group by 1 order by 1`,
          args,
        )
      ).rows,
    );
    expect(activity.filters).toEqual(
      (
        await db.pool.query<{ key: string; count: string }>(
          `select f.key,count(*)::text as count from search_history cross join lateral jsonb_array_elements_text(filter_keys) f(key) where ${predicate} group by f.key order by count(*) desc,f.key collate "C" limit 50`,
          args,
        )
      ).rows,
    );
    const calendar = async (table: 'dataset_records' | 'search_history') => {
      const timestamp =
        table === 'dataset_records' ? 'created_at' : 'executed_at';
      return (
        await db.pool.query<{ key: string; count: string }>(
          `with events as (
        select ${timestamp} as at from ${table} where dataset_id=$1 and ${timestamp} between $2 and $3 ${table === 'search_history' ? 'and ($4::uuid is null or user_id=$4::uuid)' : ''}
      ) select to_char(day,'YYYY-MM-DD') as key,count(events.at)::text as count
      from generate_series(($2::timestamptz at time zone 'UTC')::date,($3::timestamptz at time zone 'UTC')::date,interval '1 day') day
      left join events on (events.at at time zone 'UTC')::date=day::date group by day order by day`,
          table === 'search_history' ? args : args.slice(0, 3),
        )
      ).rows;
    };
    return {
      growth: await calendar('dataset_records'),
      activity: await calendar('search_history'),
    };
  } finally {
    await db.pool.end();
  }
}
async function report(page: Page) {
  const response = await page.waitForResponse(
    (r) => /\/datasets\/[^/]+\/analytics\?/.test(r.url()) && r.status() === 200,
  );
  return datasetAnalyticsResponseSchema.parse(await response.json()).data;
}
async function exactRows(
  page: Page,
  title: string,
  rows: { key: string | null; count: string }[],
) {
  const region = page.getByRole('region', { name: title, exact: true });
  await region.locator('summary').click();
  const expected = rows.map((row) => [
    row.key === null
      ? 'Unspecified'
      : row.key === ''
        ? 'Empty string'
        : row.key,
    BigInt(row.count).toLocaleString('en-US'),
  ]);
  await expect
    .poll(() =>
      region
        .locator('tbody tr')
        .evaluateAll((elements) =>
          elements.map((el) =>
            Array.from(el.children).map((cell) => cell.textContent),
          ),
        ),
    )
    .toEqual(expected);
}
test('FE10 analyst all six categories match independent SQL and exact tables on100k; dashboard and bounded requests', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  expect(
    (
      await send(
        context,
        'post',
        `/datasets/${primary()}/search`,
        {
          q: 'FE10 analytics intent',
          conditions: [{ field: 'status', op: 'eq', value: 'Active' }],
        },
        true,
      )
    ).status(),
  ).toBe(200);
  const before = historyResponseSchema.parse(
    await (await context.request.get('/api/v1/search-history')).json(),
  ).pageInfo.total;
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/')) requests.push(new URL(r.url()).pathname);
  });
  const loaded = report(page);
  await page.goto(`/analytics?datasetId=${primary()}&days=30`);
  const data = await loaded;
  const calendar = await reconcile(data, required('FE07_ANALYST'));
  expect(data.searchActivity.scope).toBe('own');
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('100,000');
  await expect(
    page.getByText('Search scope: your own retained history.', {
      exact: false,
    }),
  ).toBeVisible();
  await exactRows(page, 'Records by category', data.byCategory.buckets);
  await exactRows(page, 'Records by status', data.byStatus.buckets);
  await exactRows(page, 'Data growth trends', calendar.growth);
  await exactRows(
    page,
    'Most frequently used filters',
    data.searchActivity.filters,
  );
  await exactRows(page, 'Search activity', calendar.activity);
  await expect(page.locator('.recharts-surface')).toHaveCount(5);
  const category = page.getByRole('region', {
    name: 'Records by category',
    exact: true,
  });
  await category.locator('svg[role="application"]').focus();
  await page.keyboard.press('ArrowRight');
  const tooltip = category.locator('.recharts-tooltip-wrapper');
  await expect(tooltip).toBeVisible();
  const tooltipText = await tooltip.textContent();
  expect(
    data.byCategory.buckets.some(
      (row) =>
        tooltipText?.includes(row.key ?? 'Unspecified') &&
        tooltipText.includes(BigInt(row.count).toLocaleString('en-US')),
    ),
  ).toBe(true);
  expect(
    requests.filter(
      (path) => path.endsWith('/search') || path.includes('/records'),
    ),
  ).toEqual([]);
  expect(requests.filter((path) => path.endsWith('/analytics'))).toHaveLength(
    1,
  );
  const refreshed = report(page);
  await page
    .getByRole('button', { name: 'Refresh analytics', exact: true })
    .click();
  await refreshed;
  expect(
    historyResponseSchema.parse(
      await (await context.request.get('/api/v1/search-history')).json(),
    ).pageInfo.total,
  ).toBe(before);
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByLabel('Dataset to analyze')).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`analytics-${String(width)}.png`),
      fullPage: true,
    });
  }
  await page.getByLabel('Activity and growth window').selectOption('7');
  await expect(page).toHaveURL(/days=7/);
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('100,000');
  await page.reload();
  await expect(page.getByLabel('Activity and growth window')).toHaveValue('7');
  await page.goto('/dashboard');
  await expect(
    page.getByRole('region', { name: 'Available datasets', exact: true }),
  ).toContainText('3');
  await expect(
    page.getByRole('region', { name: 'Recent searches', exact: true }),
  ).toContainText('FE10 analytics intent');
  await expect(
    page.getByRole('region', { name: 'Platform summary', exact: true }),
  ).toHaveCount(0);
  await page.locator(`a[href="/datasets/${primary()}/explore"]`).click();
  await expect(
    page.getByRole('region', { name: 'Dataset records', exact: true }),
  ).toBeVisible();
  await mkdir('test-results/FE10', { recursive: true });
  await writeFile(
    'test-results/FE10/analyst-reconciliation.json',
    JSON.stringify(
      {
        data,
        requests,
        historyUnchangedOnRefresh: true,
        independentSqlMatch: true,
      },
      null,
      2,
    ),
  );
});
test('FE10 Admin platform totals, dataset switch, top50 Other, nulls and true empty state', async ({
  page,
  context,
}, info) => {
  await signIn(context, 'admin');
  const loaded = report(page);
  await page.goto(`/analytics?datasetId=${required('FE10_GROUPS_DATASET')}`);
  const data = await loaded;
  await reconcile(data);
  expect(data.totalRecords).toBe('57');
  expect(data.byCategory.otherCount).toBe('6');
  expect(data.searchActivity.scope).toBe('dataset');
  await exactRows(page, 'Records by category', [
    ...data.byCategory.buckets,
    { key: 'Other (remaining groups)', count: '6' },
  ]);
  await expect(
    page.getByRole('region', { name: 'Records by category', exact: true }),
  ).toContainText('Unspecified');
  const platform = platformAnalyticsResponseSchema.parse(
    await (await context.request.get('/api/v1/analytics/platform')).json(),
  ).data;
  const db = createDatabase({
    connectionString: required('FE10_DATABASE_URL'),
    max: 1,
    connectionTimeoutMillis: 1000,
    statementTimeoutMillis: 60000,
  });
  try {
    expect(platform).toEqual(
      (
        await db.pool.query<typeof platform>(
          'select (select count(*)::text from datasets) as datasets,(select count(*)::text from dataset_records) as "totalRecords",(select count(*)::text from users) as users,(select count(*)::text from users where is_active) as "activeUsers"',
        )
      ).rows[0],
    );
  } finally {
    await db.pool.end();
  }
  await expect(
    page.getByRole('region', { name: 'Platform records', exact: true }),
  ).toContainText(BigInt(platform.totalRecords).toLocaleString('en-US'));
  await page
    .getByLabel('Dataset to analyze')
    .selectOption(required('FE10_EMPTY_DATASET'));
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('0');
  await expect(
    page.getByText('No category data in this dataset.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No status data in this dataset.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No records were created in this window.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No searches have been recorded in this window.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('No filter usage has been recorded in this window.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('empty-analytics.png'),
    fullPage: true,
  });
  await page.goBack();
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('57');
  await writeFile(
    'test-results/FE10/admin-reconciliation.json',
    JSON.stringify({ data, platform, independentSqlMatch: true }, null, 2),
  );
});
test('FE10 loading, initial error retry, stale background failure, focus refresh and no cross-dataset stale charts', async ({
  page,
  context,
}) => {
  await signIn(context);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let mode = 'hold';
  const pattern = '**/api/v1/datasets/*/analytics?*';
  await page.route(pattern, async (route) => {
    if (mode === 'hold') {
      await gate;
      await route.continue();
    } else if (mode === 'fail') await route.abort('failed');
    else await route.continue();
  });
  await page.goto(`/analytics?datasetId=${primary()}`);
  await expect(
    page.getByRole('status', { name: 'Loading analytics', exact: true }),
  ).toBeVisible();
  release();
  // The held successful request is real; fail a subsequent refresh.
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('100,000');
  mode = 'fail';
  await page
    .getByRole('button', { name: 'Refresh analytics', exact: true })
    .click();
  await expect(
    page.getByText('Analytics refresh failed.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('100,000');
  mode = 'pass';
  const focused = report(page);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await focused;
  await expect(
    page.getByText('Analytics refresh failed.', { exact: false }),
  ).toHaveCount(0);
  mode = 'fail';
  await page
    .getByLabel('Dataset to analyze')
    .selectOption(required('FE10_EMPTY_DATASET'));
  await expect(
    page.getByRole('heading', { name: 'Unable to load data', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toHaveCount(0);
  mode = 'pass';
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('0');
});
test('FE10 Viewer/read-only/hidden dataset denials, malformed URLs and live grant revocation purge charts', async ({
  page,
  context,
}) => {
  await signIn(context, 'viewer');
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/') && r.url().includes('analytics'))
      calls.push(r.url());
  });
  await page.goto('/analytics');
  await expect(
    page.getByRole('heading', { name: 'Access denied', exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  expect(
    (
      await context.request.get(`/api/v1/datasets/${primary()}/analytics`)
    ).status(),
  ).toBe(403);
  await signIn(context, 'read-analyst');
  await page.goto(`/analytics?datasetId=${primary()}`);
  await expect(
    page.getByText('Analytics requires analyze access to this dataset.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await context.request.get(`/api/v1/datasets/${primary()}/analytics`)
    ).status(),
  ).toBe(403);
  await signIn(context);
  await page.goto(`/analytics?datasetId=${required('FE05_RESTRICTED')}`);
  await expect(
    page
      .getByRole('heading', { name: 'Dataset unavailable', exact: true })
      .first(),
  ).toBeVisible();
  expect(
    (
      await context.request.get(
        `/api/v1/datasets/${required('FE05_RESTRICTED')}/analytics`,
      )
    ).status(),
  ).toBe(404);
  for (const query of [
    'datasetId=invalid',
    'days=0',
    'days=367',
    'datasetId=' + primary() + '&datasetId=' + primary(),
  ]) {
    await page.goto(`/analytics?${query}`);
    await expect(
      page.getByRole('heading', {
        name: 'Invalid analytics selection',
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.goto(`/analytics?datasetId=${primary()}`);
  await expect(
    page.getByRole('region', { name: 'Total records', exact: true }),
  ).toContainText('100,000');
  const admin = await context.browser()?.newContext({ baseURL: origin });
  if (!admin) throw new Error('Missing browser');
  try {
    await signIn(admin, 'admin');
    expect(
      (
        await send(
          admin,
          'put',
          `/datasets/${primary()}/permissions/${required('FE07_ANALYST')}`,
          { permission: 'read' },
        )
      ).status(),
    ).toBe(200);
    await page
      .getByRole('button', { name: 'Refresh analytics', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Total records', exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByText('Analytics requires analyze access', { exact: false })
        .or(
          page.getByRole('heading', {
            name: 'Dataset unavailable',
            exact: true,
          }),
        )
        .first(),
    ).toBeVisible();
  } finally {
    expect(
      (
        await send(
          admin,
          'put',
          `/datasets/${primary()}/permissions/${required('FE07_ANALYST')}`,
          { permission: 'analyze' },
        )
      ).status(),
    ).toBe(200);
    await admin.close();
  }
});
