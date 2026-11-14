import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  csrfResponseSchema,
  preferencesResponseSchema,
  datasetListResponseSchema,
  datasetResponseSchema,
  fieldListResponseSchema,
  usersResponseSchema,
  settingsResponseSchema,
} from '@datascope/contracts';
const origin = 'http://localhost:3100';
function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
const primary = () => required('FE05_PRIMARY');
async function signIn(context: BrowserContext, role = 'admin') {
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
  method: 'post' | 'patch',
  path: string,
  data: unknown,
) {
  const csrf = csrfResponseSchema.parse(
    await (await context.request.get('/api/v1/auth/csrf')).json(),
  );
  return context.request[method]('/api/v1' + path, {
    headers: { Origin: origin, 'X-CSRF-Token': csrf.csrfToken },
    data,
  });
}
async function prefs(context: BrowserContext) {
  return preferencesResponseSchema.parse(
    await (await context.request.get('/api/v1/preferences/me')).json(),
  ).data;
}
async function confirm(page: Page, button: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox').last().check();
  await dialog.getByRole('button', { name: button, exact: true }).click();
}
async function searchUser(page: Page, email: string) {
  await page.getByLabel('Search users by email').fill(email);
  await page.getByRole('button', { name: 'Search users', exact: true }).click();
  const article = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: email, exact: true }) });
  await expect(article).toBeVisible();
  return article;
}
test('FE11 own preferences persist, defaults/density take effect, explicit URL wins, reset and responsive keyboard', async ({
  page,
  context,
}, info) => {
  await signIn(context, 'analyst');
  await page.goto('/settings');
  await page.getByLabel('Table density').selectOption('compact');
  await page.getByLabel('Default rows per page').selectOption('10');
  await page
    .getByLabel('Default dataset', { exact: true })
    .selectOption(primary());
  await page
    .getByRole('button', { name: 'Save preferences', exact: true })
    .click();
  await expect(
    page.getByText('Preferences saved.', { exact: true }).first(),
  ).toBeVisible();
  expect(await prefs(context)).toEqual({
    density: 'compact',
    defaultPageSize: 10,
    defaultDatasetId: primary(),
  });
  await page.reload();
  await expect(page.getByLabel('Table density')).toHaveValue('compact');
  await expect(
    page.getByRole('link', { name: 'Data Explorer', exact: true }),
  ).toHaveAttribute('href', `/datasets/${primary()}/explore`);
  await page.goto(`/datasets/${primary()}/explore`);
  await expect(page).toHaveURL(/pageSize=10/);
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(page.locator('tbody td').first()).toHaveAttribute(
    'data-density',
    'compact',
  );
  await page.goto(`/datasets/${primary()}/explore?pageSize=25`);
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.reload();
  await expect(page.getByLabel('Rows per page')).toHaveValue('25');
  await page.goto('/settings');
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`settings-${String(width)}.png`),
      fullPage: true,
    });
  }
  const reset = page.getByRole('button', {
    name: 'Reset preferences',
    exact: true,
  });
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reset).toBeFocused();
  await reset.click();
  await page
    .getByRole('button', { name: 'Confirm reset', exact: true })
    .click();
  await expect(
    page.getByText('Preferences reset.', { exact: true }),
  ).toBeVisible();
  expect(await prefs(context)).toEqual({
    density: 'comfortable',
    defaultPageSize: 25,
    defaultDatasetId: null,
  });
});
test('FE11 Admin changes role/status with confirmation and server persistence; final Admin stays protected', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/admin/users');
  let article = await searchUser(page, 'empty@fe01.test');
  await article
    .getByRole('button', { name: 'Change access', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Role', { exact: true })
    .selectOption('analyst');
  let writes = 0;
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/users/')) writes++;
  });
  await page
    .getByRole('button', { name: 'Save user access', exact: true })
    .click();
  expect(writes).toBe(0);
  await confirm(page, 'Save user access');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(article).toContainText('analyst');
  let actual = usersResponseSchema.parse(
    await (
      await context.request.get('/api/v1/users?q=empty%40fe01.test')
    ).json(),
  ).data[0];
  expect(actual?.role).toBe('analyst');
  const target = await context.browser()?.newContext({ baseURL: origin });
  if (!target) throw new Error('Missing browser');
  try {
    await signIn(target, 'empty');
    await article
      .getByRole('button', { name: 'Change access', exact: true })
      .click();
    await page.getByLabel('Account enabled').uncheck();
    await confirm(page, 'Save user access');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await target.request.get('/api/v1/auth/me')).status()).toBe(401);
    actual = usersResponseSchema.parse(
      await (
        await context.request.get('/api/v1/users?q=empty%40fe01.test')
      ).json(),
    ).data[0];
    expect(actual?.isActive).toBe(false);
    await article
      .getByRole('button', { name: 'Change access', exact: true })
      .click();
    await page.getByLabel('Account enabled').check();
    await confirm(page, 'Save user access');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await target.close();
  }
  article = await searchUser(page, 'admin@fe01.test');
  await article
    .getByRole('button', { name: 'Change access', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel('Role', { exact: true })
    .selectOption('viewer');
  await confirm(page, 'Save user access');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'At least one active administrator is required',
  );
  expect(
    usersResponseSchema
      .parse(
        await (
          await context.request.get('/api/v1/users?q=admin%40fe01.test')
        ).json(),
      )
      .data.find((u) => u.email === 'admin@fe01.test')?.role,
  ).toBe('admin');
});
test('FE11 dataset create/edit, validated field metadata, grants/revocation and confirmed archive use real APIs', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.goto('/admin/datasets');
  await page
    .getByRole('button', { name: 'Create dataset', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Name', { exact: true })
    .fill('FE11 verification dataset');
  await dialog.getByLabel('Slug', { exact: true }).fill('fe11-browser-dataset');
  await dialog.getByLabel('Category', { exact: true }).fill('verification');
  await dialog.getByLabel('Source', { exact: true }).fill('Browser fixture');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Owned disposable fixture');
  await dialog
    .getByRole('button', { name: 'Create empty dataset', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const dataset = datasetListResponseSchema
    .parse(
      await (await context.request.get('/api/v1/datasets?pageSize=100')).json(),
    )
    .data.find((d) => d.slug === 'fe11-browser-dataset');
  if (!dataset) throw new Error('Missing created dataset');
  expect(dataset.recordCount).toBe('0');
  let article = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'FE11 verification dataset',
      exact: true,
    }),
  });
  await article
    .getByRole('button', { name: 'Edit dataset', exact: true })
    .click();
  await dialog.getByLabel('Name', { exact: true }).fill('FE11 updated dataset');
  await dialog
    .getByRole('button', { name: 'Save dataset', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    datasetResponseSchema.parse(
      await (
        await context.request.get(`/api/v1/datasets/${dataset.id}`)
      ).json(),
    ).data.name,
  ).toBe('FE11 updated dataset');
  article = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'FE11 updated dataset',
      exact: true,
    }),
  });
  await article
    .getByRole('button', { name: 'Manage fields', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Add field', exact: true }).click();
  await dialog.getByLabel('Field key', { exact: true }).fill('id');
  await dialog.getByLabel('Field label', { exact: true }).fill('Company');
  await dialog.getByLabel('Operators', { exact: true }).fill('eq, contains');
  await confirm(page, 'Save field metadata');
  await expect(dialog.getByRole('alert')).toContainText(
    'Check the form values',
  );
  await dialog.getByLabel('Field key', { exact: true }).fill('name');
  await dialog.getByLabel('Searchable text', { exact: true }).check();
  await dialog
    .getByRole('button', { name: 'Save field metadata', exact: true })
    .click();
  await expect(
    dialog.getByText('Field metadata saved.', { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Edit field name', exact: true })
    .click();
  await dialog.getByLabel('Field label', { exact: true }).fill('Company name');
  await confirm(page, 'Save field metadata');
  await expect(
    dialog.getByText('Field metadata saved.', { exact: true }),
  ).toBeVisible();
  const fields = fieldListResponseSchema.parse(
    await (
      await context.request.get(`/api/v1/datasets/${dataset.id}/fields`)
    ).json(),
  ).data;
  expect(fields[0]).toMatchObject({
    fieldKey: 'name',
    label: 'Company name',
    operators: ['eq', 'contains'],
    isSearchable: true,
    isVisible: true,
  });
  await dialog
    .getByRole('button', { name: 'Close dialog', exact: true })
    .click();
  await page.goto('/admin/permissions');
  await page.getByLabel('Dataset', { exact: true }).selectOption(dataset.id);
  await expect(
    page.getByText('No explicit grants for this dataset.', { exact: true }),
  ).toBeVisible();
  async function grant(permission: string) {
    await page
      .getByRole('button', { name: 'Grant or update access', exact: true })
      .click();
    await dialog
      .getByLabel('Find recipient by email', { exact: true })
      .fill('empty@fe01.test');
    await dialog
      .getByRole('button', { name: 'Find recipient', exact: true })
      .click();
    await dialog
      .getByLabel('Recipient', { exact: true })
      .selectOption(required('FE07_EMPTY'));
    await dialog
      .getByLabel('Permission', { exact: true })
      .selectOption(permission);
    await confirm(page, 'Save dataset access');
    await expect(dialog).toHaveCount(0);
  }
  await grant('read');
  const target = await context.browser()?.newContext({ baseURL: origin });
  if (!target) throw new Error('Missing browser');
  try {
    await signIn(target, 'empty');
    expect(
      (await target.request.get(`/api/v1/datasets/${dataset.id}`)).status(),
    ).toBe(200);
    expect(
      (
        await target.request.get(`/api/v1/datasets/${dataset.id}/analytics`)
      ).status(),
    ).toBe(403);
    await grant('analyze');
    expect(
      (
        await target.request.get(`/api/v1/datasets/${dataset.id}/analytics`)
      ).status(),
    ).toBe(200);
    const other = await target.newPage();
    await other.goto(`/datasets/${dataset.id}/explore`);
    await expect(
      other.getByRole('heading', { name: 'No records available', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Revoke access', exact: true })
      .click();
    await confirm(page, 'Confirm revoke');
    await expect(dialog).toHaveCount(0);
    expect(
      (await target.request.get(`/api/v1/datasets/${dataset.id}`)).status(),
    ).toBe(404);
    await other
      .getByRole('button', { name: 'Refresh records', exact: true })
      .click();
    await expect(
      other.getByRole('heading', { name: 'Dataset unavailable', exact: true }),
    ).toBeVisible();
  } finally {
    await target.close();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: info.outputPath('permissions-mobile.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto('/admin/datasets');
  article = page.locator('article').filter({
    has: page.getByRole('heading', {
      name: 'FE11 updated dataset',
      exact: true,
    }),
  });
  await article
    .getByRole('button', { name: 'Archive dataset', exact: true })
    .click();
  await confirm(page, 'Confirm archive');
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('Include archived datasets', { exact: true }).check();
  await expect(article).toContainText('Archived');
  expect(
    datasetListResponseSchema
      .parse(
        await (
          await context.request.get(
            '/api/v1/datasets?includeArchived=true&pageSize=100',
          )
        ).json(),
      )
      .data.find((d) => d.id === dataset.id)?.isArchived,
  ).toBe(true);
});
test('FE11 system settings persist and enforce registration/export policy; role denials and failure retry', async ({
  page,
  context,
}, info) => {
  await signIn(context);
  await page.goto('/admin/system');
  await page
    .getByLabel('Allow public Viewer registration', { exact: true })
    .uncheck();
  await page
    .getByLabel('Maximum selected records per export', { exact: true })
    .fill('3');
  await page.getByRole('checkbox').last().check();
  await page
    .getByRole('button', { name: 'Save system settings', exact: true })
    .click();
  await expect(
    page.getByText('System settings saved.', { exact: true }).first(),
  ).toBeVisible();
  expect(
    settingsResponseSchema.parse(
      await (await context.request.get('/api/v1/system/settings')).json(),
    ).data,
  ).toEqual({ 'registration.enabled': false, 'exports.max_selected_rows': 3 });
  const anonymous = await context.browser()?.newContext({ baseURL: origin });
  if (!anonymous) throw new Error('Missing browser');
  try {
    expect(
      (
        await send(anonymous, 'post', '/auth/register', {
          email: 'fe11-disabled@example.test',
          password: required('FE01_PASSWORD'),
        })
      ).status(),
    ).toBe(403);
  } finally {
    await anonymous.close();
  }
  expect(
    (
      await send(context, 'post', `/datasets/${primary()}/exports/selected`, {
        recordIds: [
          '1000000000001',
          '1000000000002',
          '1000000000003',
          '1000000000004',
        ],
        columns: ['name'],
      })
    ).status(),
  ).toBe(400);
  await page.reload();
  await expect(
    page.getByLabel('Maximum selected records per export', { exact: true }),
  ).toHaveValue('3');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: info.outputPath('system-mobile.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByLabel('Allow public Viewer registration', { exact: true })
    .check();
  await page
    .getByLabel('Maximum selected records per export', { exact: true })
    .fill('1000');
  await page.getByRole('checkbox').last().check();
  await page
    .getByRole('button', { name: 'Save system settings', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        settingsResponseSchema.parse(
          await (await context.request.get('/api/v1/system/settings')).json(),
        ).data,
    )
    .toEqual({
      'registration.enabled': true,
      'exports.max_selected_rows': 1000,
    });
  for (const role of ['viewer', 'analyst']) {
    await signIn(context, role);
    for (const area of ['users', 'datasets', 'permissions', 'system']) {
      await page.goto(`/admin/${area}`);
      await expect(
        page.getByRole('heading', { name: 'Access denied', exact: true }),
      ).toBeVisible();
    }
    expect((await context.request.get('/api/v1/users')).status()).toBe(403);
    expect(
      (await context.request.get('/api/v1/system/settings')).status(),
    ).toBe(403);
    expect(
      (
        await send(context, 'patch', '/system/settings', {
          'registration.enabled': false,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await send(context, 'patch', '/preferences/me', {
          userId: required('FE07_EMPTY'),
          density: 'compact',
        })
      ).status(),
    ).toBe(400);
  }
  await page.route('**/api/v1/preferences/me', (route) =>
    route.abort('failed'),
  );
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Unable to load data', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v1/preferences/me');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByLabel('Table density', { exact: true })).toBeVisible();
});
