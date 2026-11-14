import { readFile } from 'node:fs/promises';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { csrfResponseSchema, viewResponseSchema } from '@datascope/contracts';
const origin = 'http://localhost:3100';
function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
const primary = () => required('FE05_PRIMARY');
const custom = () => required('FE12_DATASET');
const endpoint = (id = primary()) => `/datasets/${id}/exports/selected`;
async function signIn(context: BrowserContext, role = 'analyst') {
  const csrf = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  expect(
    (
      await context.request.post('/api/v1/auth/login', {
        headers: { Origin: origin, 'X-CSRF-Token': csrf.csrfToken },
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
  method: 'post' | 'patch' | 'put' | 'delete',
  path: string,
  data: unknown,
) {
  const csrf = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  return context.request[method]('/api/v1' + path, {
    headers: { Origin: origin, 'X-CSRF-Token': csrf.csrfToken },
    data: data ?? {},
  });
}
async function open(page: Page, id = primary(), extra = '') {
  await page.goto(`/datasets/${id}/explore?pageSize=25${extra}`);
  await expect(
    page.getByRole('region', { name: 'Dataset records' }),
  ).toBeVisible();
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export selected', exact: true })
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('datascope-selected.csv');
  const path = await file.path();
  if (!path) throw new Error('Download missing');
  return readFile(path, 'utf8');
}

test('FE12 selected export works after an explicit saved-view run', async ({
  page,
  context,
}) => {
  await signIn(context);
  const response = await send(context, 'post', '/saved-views', {
    name: 'FE12 CSV view',
    datasetId: custom(),
    config: {
      version: 1,
      q: '',
      conditions: [],
      sort: [],
      pageSize: 25,
      columns: ['id', 'name'],
    },
  });
  expect(response.status()).toBe(201);
  const view = viewResponseSchema.parse(await response.json()).data;
  try {
    await page.goto(
      `/datasets/${custom()}/explore?pageSize=25&columns=%5B%22id%22%2C%22name%22%5D&view=${view.id}`,
    );
    await expect(
      page.getByRole('region', { name: 'Dataset records' }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Run saved view', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Dataset records' }),
    ).toBeVisible();
    await page
      .getByRole('checkbox', { name: 'Select current page', exact: true })
      .check();
    const csv = await download(page);
    expect(csv.startsWith('"id","name"\r\n')).toBe(true);
    expect(csv).toContain('বাংলা');
    expect(csv).toContain("'=SUM(1,2)");
  } finally {
    expect(
      (
        await send(context, 'delete', `/saved-views/${view.id}`, undefined)
      ).status(),
    ).toBe(200);
  }
});

test('FE12 Analyst downloads only selected rows/visible columns with exact CSV escaping, Unicode and decimal precision', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await open(
    page,
    custom(),
    '&sort=%5B%7B%22field%22%3A%22id%22%2C%22direction%22%3A%22asc%22%7D%5D&columns=%5B%22id%22%2C%22name%22%2C%22revenue%22%5D',
  );
  await expect(
    page.getByText('3 records / analyze access', { exact: true }),
  ).toBeVisible();
  const button = page.getByRole('button', {
    name: 'Export selected',
    exact: true,
  });
  await expect(button).toBeDisabled();
  const boxes = page.getByRole('checkbox', { name: /^Select record / });
  const first = (await boxes.nth(0).getAttribute('aria-label'))?.replace(
    'Select record ',
    '',
  );
  const second = (await boxes.nth(1).getAttribute('aria-label'))?.replace(
    'Select record ',
    '',
  );
  if (!first || !second) throw new Error('Missing selected record IDs');
  await boxes.nth(1).check();
  await boxes.nth(0).check();
  const payload = page.waitForRequest((r) =>
    r.url().endsWith(endpoint(custom())),
  );
  const responsePending = page.waitForResponse((r) =>
    r.url().endsWith(endpoint(custom())),
  );
  const csv = await download(page);
  const response = await responsePending;
  expect(response.headers()['content-type']).toContain('text/csv');
  expect(response.headers()['content-disposition']).toContain(
    'datascope-selected.csv',
  );
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.text()).toBe(csv);
  expect((await payload).postDataJSON()).toEqual({
    recordIds: [first, second],
    columns: ['id', 'name', 'revenue'],
  });
  expect(csv).toBe(
    `"id","name","revenue"\r\n"${first}","'=SUM(1,2)","9999999999999999.99"\r\n"${second}","Comma, ""quote""\nবাংলা","9999999999999999.99"\r\n`,
  );
  await expect(
    page.getByText('CSV download started for 2 selected records.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('2 selected on this page', { exact: true }),
  ).toBeVisible();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(button).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`export-${String(width)}.png`),
      fullPage: true,
    });
  }
  await button.focus();
  const keyboardDownload = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  expect((await keyboardDownload).suggestedFilename()).toBe(
    'datascope-selected.csv',
  );
});

test('FE12 Admin exports bounded 100-row page and selection clears on page, query, columns, dataset and refresh', async ({
  page,
  context,
}) => {
  await signIn(context, 'admin');
  await open(page);
  await page.getByLabel('Rows per page').selectOption('100');
  await expect(page.locator('tbody tr')).toHaveCount(100);
  await page
    .getByRole('checkbox', { name: 'Select current page', exact: true })
    .check();
  const request = page.waitForRequest((r) => r.url().endsWith(endpoint()));
  const csv = await download(page);
  const body: unknown = (await request).postDataJSON();
  expect(body).toMatchObject({ recordIds: expect.any(Array) });
  expect((body as { recordIds: string[] }).recordIds).toHaveLength(100);
  expect(csv.split('\r\n')).toHaveLength(102);
  expect(
    csv
      .split('\r\n')
      .slice(1, -1)
      .map((line) => line.split(',')[0]?.replaceAll('"', ''))
      .sort(),
  ).toEqual((body as { recordIds: string[] }).recordIds.slice().sort());
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(
    page.getByText('0 selected on this page', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Export selected', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'Select current page', exact: true })
    .check();
  await page.getByLabel('Search indexed fields', { exact: true }).fill('Known');
  await expect(page).toHaveURL(/q=Known/);
  await expect(
    page.getByText('0 selected on this page', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Select current page', exact: true })
    .check();
  await page.getByText('Columns', { exact: true }).click();
  await page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: 'Columns' }) })
    .getByLabel('Country', { exact: true })
    .uncheck();
  await expect(
    page.getByText('0 selected on this page', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Select current page', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Refresh records', exact: true })
    .click();
  await expect(
    page.getByText('0 selected on this page', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('checkbox', { name: 'Select current page', exact: true })
    .check();
  await open(page, custom());
  await expect(
    page.getByText('0 selected on this page', { exact: true }),
  ).toBeVisible();
});

test('FE12 configured limit, loading, duplicate prevention, network error retry and context-change cancellation', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  const admin = await browser.newContext({ baseURL: origin });
  await signIn(admin, 'admin');
  try {
    expect(
      (
        await send(admin, 'patch', '/system/settings', {
          'exports.max_selected_rows': 1,
        })
      ).status(),
    ).toBe(200);
    await open(page, custom());
    await page
      .getByRole('checkbox', { name: 'Select current page', exact: true })
      .check();
    let downloads = 0;
    page.on('download', () => {
      downloads++;
    });
    await page
      .getByRole('button', { name: 'Export selected', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'configured export limit' }),
    ).toBeVisible();
    expect(downloads).toBe(0);
    expect(
      (
        await send(admin, 'patch', '/system/settings', {
          'exports.max_selected_rows': 1000,
        })
      ).status(),
    ).toBe(200);
    await page.route('**/exports/selected', (route) => route.abort());
    await page
      .getByRole('button', { name: 'Export selected', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Check your connection' }),
    ).toBeVisible();
    expect(downloads).toBe(0);
    await page.unroute('**/exports/selected');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let count = 0;
    await page.route('**/exports/selected', async (route) => {
      count++;
      const response = await route.fetch();
      await held;
      await route.fulfill({ response }).catch(() => undefined);
    });
    const file = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export selected', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Preparing CSV...', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('Preparing selected records for download...', {
        exact: true,
      }),
    ).toBeVisible();
    await expect.poll(() => count).toBe(1);
    release();
    await file;
    expect(downloads).toBe(1);
    await page.unroute('**/exports/selected');
    let releaseCanceled: () => void = () => undefined;
    const canceled = new Promise<void>((resolve) => {
      releaseCanceled = resolve;
    });
    let cancellationReady = false;
    await page.route('**/exports/selected', async (route) => {
      const response = await route.fetch();
      cancellationReady = true;
      await canceled;
      await route.fulfill({ response }).catch(() => undefined);
    });
    await page
      .getByRole('button', { name: 'Export selected', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Preparing CSV...', exact: true }),
    ).toBeDisabled();
    await expect.poll(() => cancellationReady).toBe(true);
    await page
      .getByRole('button', { name: 'Clear selection', exact: true })
      .click();
    await page
      .getByRole('searchbox', { name: 'Search indexed fields', exact: true })
      .fill('Unselected');
    await page
      .getByRole('searchbox', { name: 'Search indexed fields', exact: true })
      .press('Enter');
    await expect(page).toHaveURL(/q=Unselected/);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    releaseCanceled();
    await page.unrouteAll({ behavior: 'wait' });
    expect(downloads).toBe(1);
    await expect(
      page.getByText('0 selected on this page', { exact: true }),
    ).toBeVisible();
  } finally {
    await send(admin, 'patch', '/system/settings', {
      'exports.max_selected_rows': 1000,
    });
    await admin.close();
  }
});

test('FE12 backend denies Viewer/read-only/unauthenticated/cross-dataset, malformed and revoked export', async ({
  page,
  context,
  browser,
}) => {
  const selection = { recordIds: ['1000000000001'], columns: ['id', 'name'] };
  expect(
    (
      await context.request.post('/api/v1' + endpoint(), { data: selection })
    ).status(),
  ).toBe(401);
  await signIn(context, 'viewer');
  await open(page);
  await page
    .getByRole('checkbox', { name: 'Select current page', exact: true })
    .check();
  await expect(
    page.getByRole('button', { name: 'Export selected', exact: true }),
  ).toHaveCount(0);
  expect((await send(context, 'post', endpoint(), selection)).status()).toBe(
    403,
  );
  const reader = await browser.newContext({ baseURL: origin });
  const analyst = await browser.newContext({ baseURL: origin });
  const admin = await browser.newContext({ baseURL: origin });
  try {
    await signIn(reader, 'read-analyst');
    const readerPage = await reader.newPage();
    await open(readerPage);
    await expect(
      readerPage.getByRole('button', { name: 'Export selected', exact: true }),
    ).toHaveCount(0);
    expect((await send(reader, 'post', endpoint(), selection)).status()).toBe(
      403,
    );
    await signIn(analyst);
    await signIn(admin, 'admin');
    expect(
      (
        await send(
          analyst,
          'post',
          endpoint(required('FE05_RESTRICTED')),
          selection,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await send(analyst, 'post', endpoint(), {
          ...selection,
          recordIds: ['1000000000001', '2000000000001'],
        })
      ).status(),
    ).toBe(404);
    for (const invalid of [
      [],
      ['1000000000001', '1000000000001'],
      Array.from({ length: 1001 }, (_, i) => String(i + 1)),
    ])
      expect(
        (
          await send(analyst, 'post', endpoint(), {
            ...selection,
            recordIds: invalid,
          })
        ).status(),
      ).toBe(400);
    expect(
      (
        await send(analyst, 'post', endpoint(), {
          ...selection,
          columns: ['passwordHash'],
        })
      ).status(),
    ).toBe(400);
    const analystPage = await analyst.newPage();
    await open(analystPage, custom());
    await analystPage
      .getByRole('checkbox', { name: 'Select current page', exact: true })
      .check();
    expect(
      (
        await send(
          admin,
          'delete',
          `/datasets/${custom()}/permissions/${required('FE07_ANALYST')}`,
          undefined,
        )
      ).status(),
    ).toBe(200);
    expect(
      (await send(analyst, 'post', endpoint(custom()), selection)).status(),
    ).toBe(404);
    await analystPage
      .getByRole('button', { name: 'Export selected', exact: true })
      .click();
    await expect(
      analystPage.getByRole('heading', { name: 'Dataset unavailable' }).first(),
    ).toBeVisible();
    await expect(
      analystPage.getByRole('region', { name: 'Dataset records' }),
    ).toHaveCount(0);
  } finally {
    await send(
      admin,
      'put',
      `/datasets/${custom()}/permissions/${required('FE07_ANALYST')}`,
      { permission: 'analyze' },
    );
    await reader.close();
    await analyst.close();
    await admin.close();
  }
});
