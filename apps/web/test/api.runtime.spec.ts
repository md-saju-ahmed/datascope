// Runs only via run.mjs: real Nest, PostgreSQL 100k seed and Next same-origin proxy.
import { makeStore, type AppStore } from '../src/store/store.ts';
import {
  authApi,
  datasetsApi,
  searchApi,
  viewsApi,
  managementApi,
  baseApi,
  skipToken,
} from '../src/store/api/index.ts';
import {
  searchRequestSchema,
  savedConfigSchema,
  savedQuery,
  type CurrentUser,
} from '@datascope/contracts';
import { authSlice } from '../src/store/slices/auth-slice.ts';
import { clientStateCleared } from '../src/store/lifecycle.ts';
import { QueryStatus } from '@reduxjs/toolkit/query';

const origin = 'http://localhost:3100';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing fixture ${name}`);
  return value;
}
const primary = required('FE03_PRIMARY'),
  restricted = required('FE03_RESTRICTED');
const query = searchRequestSchema.parse({
  columns: ['name', 'status', 'revenue'],
});
const args = { datasetId: primary, query };
const clients: {
  store: AppStore;
  requests: { path: string; method: string; intent: string | null }[];
}[] = [];
function client() {
  const cookies = new Map<string, string>();
  const requests: { path: string; method: string; intent: string | null }[] =
    [];
  let block:
    | { path: string; entered: () => void; release: Promise<void> }
    | undefined;
  let failPath: string | undefined;
  const fetchFn: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === failPath) {
      failPath = undefined;
      throw new TypeError('Injected network outage');
    }
    request.headers.set('Origin', origin);
    if (cookies.size)
      request.headers.set(
        'Cookie',
        [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      );
    requests.push({
      path,
      method: request.method,
      intent: request.headers.get('X-Search-Intent'),
    });
    const response = await fetch(request);
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      if (!pair) continue;
      const equals = pair.indexOf('=');
      cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    const gate = block;
    if (gate?.path === path) {
      block = undefined;
      // The server completed, then the network is delayed. Ignore cancellation here
      // intentionally to verify that a late response cannot repopulate another scope.
      const body = await response.arrayBuffer();
      gate.entered();
      await gate.release;
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    }
    return response;
  };
  const store = makeStore(undefined, { baseUrl: `${origin}/api/v1`, fetchFn });
  const result = {
    store,
    requests,
    cookies,
    fetchFn,
    count: (path: string) =>
      requests.filter((r) => r.path === `/api/v1/${path}`).length,
    hold: (path: string) => {
      let entered = () => {};
      let release = () => {};
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      block = { path: `/api/v1/${path}`, entered, release: released };
      return { ready, release };
    },
    fail: (path: string) => {
      failPath = `/api/v1/${path}`;
    },
  };
  clients.push(result);
  return result;
}
async function login(c: ReturnType<typeof client>, role: string) {
  return (
    await c.store
      .dispatch(
        authApi.endpoints.login.initiate({
          email: `${role}@fe03.test`,
          password: `${required('FE03_PASSWORD')}-${role}`,
        }),
      )
      .unwrap()
  ).data;
}
async function settled(store: AppStore) {
  // Invalidation queues refetches after mutation completion.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await Promise.all(store.dispatch(baseApi.util.getRunningQueriesThunk()));
}
let admin: ReturnType<typeof client>,
  analyst: ReturnType<typeof client>,
  viewer: ReturnType<typeof client>;
let analystUser: CurrentUser;
beforeAll(async () => {
  admin = client();
  analyst = client();
  viewer = client();
  await login(admin, 'admin');
  analystUser = await login(analyst, 'analyst');
  await login(viewer, 'viewer');
});
afterEach(() => {
  for (const c of clients) c.store.clearApi();
});
afterAll(() => {
  console.log(
    JSON.stringify(
      {
        evidence: 'FE-03 actual proxy requests',
        requests: clients.flatMap((c) => c.requests),
      },
      null,
      2,
    ),
  );
});

test('same-origin cookie/CSRF login and real health/session endpoints; credentials stay out of state', async () => {
  expect(admin.cookies.has('datascope_session')).toBe(true);
  expect(
    (
      await admin.store
        .dispatch(authApi.endpoints.getSession.initiate(undefined))
        .unwrap()
    ).data.role,
  ).toBe('admin');
  expect(
    await admin.store
      .dispatch(authApi.endpoints.getLiveness.initiate(undefined))
      .unwrap(),
  ).toEqual({ status: 'ok' });
  expect(
    await admin.store
      .dispatch(authApi.endpoints.getReadiness.initiate(undefined))
      .unwrap(),
  ).toEqual({ status: 'ok', database: 'up' });
  const state = JSON.stringify(admin.store.getState());
  expect(state).not.toContain(required('FE03_PASSWORD'));
  expect(state).not.toContain(admin.cookies.get('datascope_session'));
});
test('normalized simultaneous queries dedupe, cache reuses, pages remain bounded and separate', async () => {
  const conditions = searchRequestSchema.parse({
    ...query,
    conditions: [
      { field: 'status', op: 'eq', value: 'Active' },
      { field: 'country', op: 'eq', value: 'Germany' },
    ],
  });
  const one = { datasetId: primary, query: conditions };
  const two = {
    datasetId: primary,
    query: { ...conditions, conditions: [...conditions.conditions].reverse() },
  };
  const path = `datasets/${primary}/search`,
    before = analyst.count(path);
  const a = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(one),
  );
  const b = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(two),
  );
  const [x, y] = await Promise.all([a.unwrap(), b.unwrap()]);
  expect(x).toEqual(y);
  expect(x.data).toHaveLength(25);
  expect(analyst.count(path) - before).toBe(1);
  const c = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(two),
  );
  await c.unwrap();
  expect(analyst.count(path) - before).toBe(1);
  const next = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate({
      datasetId: primary,
      query: { ...conditions, page: 2, pageSize: 10 },
    }),
  );
  const page = await next.unwrap();
  expect(page.data).toHaveLength(10);
  expect(page.pageInfo.page).toBe(2);
  expect(analyst.count(path) - before).toBe(2);
  for (const r of [a, b, c, next]) r.unsubscribe();
});
test('single-flight CSRF bootstrap across concurrent different POST reads', async () => {
  const csrf = analyst.count('auth/csrf');
  await Promise.all([
    analyst.store
      .dispatch(searchApi.endpoints.searchRecords.initiate(args))
      .unwrap(),
    analyst.store
      .dispatch(
        searchApi.endpoints.searchRecords.initiate({
          ...args,
          query: { ...query, page: 2 },
        }),
      )
      .unwrap(),
  ]);
  expect(analyst.count('auth/csrf') - csrf).toBe(1);
});
test('applied execution records real history once; cache refresh/focus/reconnect never invent searches', async () => {
  await analyst.store
    .dispatch(viewsApi.endpoints.clearSearchHistory.initiate(undefined))
    .unwrap();
  const applied = await analyst.store
    .dispatch(
      searchApi.endpoints.executeSearch.initiate({
        ...args,
        query: { ...query, q: 'Known Match Alpha' },
      }),
    )
    .unwrap();
  expect(applied.data[0]?.name).toBe('Known Match Alpha');
  const handle = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(
      { ...args, query: { ...query, q: 'Known Match Alpha' } },
      {
        subscriptionOptions: { refetchOnFocus: true, refetchOnReconnect: true },
      },
    ),
  );
  await handle.unwrap();
  await handle.refetch().unwrap();
  analyst.store.dispatch(baseApi.internalActions.onFocus());
  await settled(analyst.store);
  analyst.store.dispatch(baseApi.internalActions.onOnline());
  await settled(analyst.store);
  const history = await analyst.store
    .dispatch(viewsApi.endpoints.getSearchHistory.initiate(undefined))
    .unwrap();
  expect(history.pageInfo.total).toBe(1);
  expect(history.data[0]?.normalizedQuery.q).toBe('Known Match Alpha');
  const reads = analyst.requests.filter((r) => r.path.endsWith('/search'));
  expect(reads.filter((r) => r.intent === 'apply')).toHaveLength(1);
  expect(reads.filter((r) => r.intent === null).length).toBeGreaterThanOrEqual(
    3,
  );
  handle.unsubscribe();
});
test('loading, stale background refresh, network failure, retry, abort and late old results', async () => {
  const path = `datasets/${primary}/search`;
  const gate = analyst.hold(path);
  const first = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(args),
  );
  expect(
    searchApi.endpoints.searchRecords.select(args)(analyst.store.getState())
      .isLoading,
  ).toBe(true);
  await gate.ready;
  gate.release();
  const original = await first.unwrap();
  const refreshGate = analyst.hold(path);
  const refresh = first.refetch();
  await refreshGate.ready;
  let snapshot = searchApi.endpoints.searchRecords.select(args)(
    analyst.store.getState(),
  );
  expect(snapshot.isLoading).toBe(true);
  expect(snapshot.data).toEqual(original);
  refreshGate.release();
  await refresh.unwrap();
  analyst.fail(path);
  await first.refetch();
  snapshot = searchApi.endpoints.searchRecords.select(args)(
    analyst.store.getState(),
  );
  expect(snapshot.isError).toBe(true);
  expect(snapshot.data).toBeDefined();
  await first.refetch().unwrap();
  const delayed = analyst.hold(path);
  const old = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate({
      ...args,
      query: { ...query, q: 'Known Match Beta' },
    }),
  );
  await delayed.ready;
  old.abort();
  delayed.release();
  expect((await old).isError).toBe(true);
  expect(
    searchApi.endpoints.searchRecords.select({
      ...args,
      query: { ...query, q: 'Known Match Beta' },
    })(analyst.store.getState()).data,
  ).toBeUndefined();
  expect(
    searchApi.endpoints.searchRecords.select(args)(analyst.store.getState())
      .data,
  ).toBeDefined();
  first.unsubscribe();
  old.unsubscribe();
});
test('saved-view mutations invalidate subscribed lists exactly once and persist CRUD/sharing/Apply', async () => {
  const listing = analyst.store.dispatch(
    viewsApi.endpoints.getSavedViews.initiate(undefined),
  );
  await listing.unwrap();
  const before = analyst.count('saved-views');
  const view = await analyst.store
    .dispatch(
      viewsApi.endpoints.createSavedView.initiate({
        name: 'FE03 cache evidence',
        datasetId: primary,
        config: savedConfigSchema.parse({ ...savedQuery(query), version: 1 }),
      }),
    )
    .unwrap();
  await settled(analyst.store);
  expect(analyst.count('saved-views') - before).toBe(2); // one POST + one invalidated GET
  expect(
    viewsApi.endpoints.getSavedViews
      .select(undefined)(analyst.store.getState())
      .data?.data.some((v) => v.id === view.data.id),
  ).toBe(true);
  await analyst.store
    .dispatch(viewsApi.endpoints.getSavedView.initiate(view.data.id))
    .unwrap();
  await analyst.store
    .dispatch(
      viewsApi.endpoints.updateSavedView.initiate({
        viewId: view.data.id,
        changes: { name: 'Renamed' },
      }),
    )
    .unwrap();
  await settled(analyst.store);
  expect(
    viewsApi.endpoints.getSavedView.select(view.data.id)(
      analyst.store.getState(),
    ).data?.data.name,
  ).toBe('Renamed');
  await analyst.store
    .dispatch(
      viewsApi.endpoints.shareSavedView.initiate({
        viewId: view.data.id,
        userId: required('FE03_VIEWER'),
      }),
    )
    .unwrap();
  const shared = await viewer.store
    .dispatch(viewsApi.endpoints.getSavedView.initiate(view.data.id))
    .unwrap();
  expect(shared.data.name).toBe('Renamed');
  expect(
    (
      await viewer.store
        .dispatch(
          searchApi.endpoints.applySavedView.initiate({
            viewId: view.data.id,
            paging: { page: 1 },
          }),
        )
        .unwrap()
    ).data,
  ).toHaveLength(25);
  await analyst.store
    .dispatch(
      viewsApi.endpoints.revokeSavedViewShare.initiate({
        viewId: view.data.id,
        userId: required('FE03_VIEWER'),
      }),
    )
    .unwrap();
  await expect(
    viewer.store
      .dispatch(
        viewsApi.endpoints.getSavedView.initiate(view.data.id, {
          forceRefetch: true,
        }),
      )
      .unwrap(),
  ).rejects.toMatchObject({ status: 404 });
  await analyst.store
    .dispatch(viewsApi.endpoints.deleteSavedView.initiate(view.data.id))
    .unwrap();
  await settled(analyst.store);
  expect(
    viewsApi.endpoints.getSavedView.select(view.data.id)(
      analyst.store.getState(),
    ).data,
  ).toBeUndefined();
  expect(
    viewsApi.endpoints.getSavedView.select(view.data.id)(
      analyst.store.getState(),
    ).isError,
  ).toBe(true);
  expect(
    viewsApi.endpoints.getSavedViews.select(undefined)(analyst.store.getState())
      .data?.data,
  ).toEqual([]);
  listing.unsubscribe();
});
test('preferences mutation revalidates only tagged queries and failed mutation does not invalidate', async () => {
  const prefs = analyst.store.dispatch(
    managementApi.endpoints.getPreferences.initiate(undefined),
  );
  const datasets = analyst.store.dispatch(
    datasetsApi.endpoints.getDatasets.initiate(undefined),
  );
  await Promise.all([prefs.unwrap(), datasets.unwrap()]);
  const before = analyst.count('preferences/me'),
    other = analyst.count('datasets');
  await analyst.store
    .dispatch(
      managementApi.endpoints.updatePreferences.initiate({
        density: 'compact',
      }),
    )
    .unwrap();
  await settled(analyst.store);
  expect(analyst.count('preferences/me') - before).toBe(2);
  expect(analyst.count('datasets')).toBe(other);
  expect(
    managementApi.endpoints.getPreferences.select(undefined)(
      analyst.store.getState(),
    ).data?.data.density,
  ).toBe('compact');
  const failed = analyst.count('preferences/me');
  await expect(
    analyst.store
      .dispatch(
        managementApi.endpoints.updatePreferences.initiate({
          defaultDatasetId: crypto.randomUUID(),
        }),
      )
      .unwrap(),
  ).rejects.toBeDefined();
  await settled(analyst.store);
  expect(analyst.count('preferences/me') - failed).toBe(1);
  prefs.unsubscribe();
  datasets.unsubscribe();
});
test('verified metadata/details/relationships/changes, aggregates, bounded CSV and backend role/validation denials', async () => {
  expect(
    (
      await analyst.store
        .dispatch(
          datasetsApi.endpoints.getFields.initiate({ datasetId: primary }),
        )
        .unwrap()
    ).data.length,
  ).toBeGreaterThan(0);
  const record = { datasetId: primary, recordId: '1000000000001' };
  expect(
    (
      await analyst.store
        .dispatch(datasetsApi.endpoints.getRecord.initiate(record))
        .unwrap()
    ).data.revenue,
  ).toBe('10000.01');
  await analyst.store
    .dispatch(datasetsApi.endpoints.getRelatedRecords.initiate(record))
    .unwrap();
  expect(
    (
      await analyst.store
        .dispatch(datasetsApi.endpoints.getRecordChanges.initiate(record))
        .unwrap()
    ).data,
  ).toEqual([]);
  expect(
    (
      await analyst.store
        .dispatch(
          managementApi.endpoints.getDatasetAnalytics.initiate({
            datasetId: primary,
          }),
        )
        .unwrap()
    ).data.totalRecords,
  ).toBe('100000');
  await analyst.store
    .dispatch(managementApi.endpoints.getSearchActivity.initiate(undefined))
    .unwrap();
  expect(
    (
      await admin.store
        .dispatch(
          managementApi.endpoints.getPlatformAnalytics.initiate(undefined),
        )
        .unwrap()
    ).data.totalRecords,
  ).toBe('100128');
  const selection = {
    recordIds: ['1000000000001'],
    columns: ['name', 'revenue'],
  };
  const csv = await analyst.store
    .dispatch(
      searchApi.endpoints.exportSelected.initiate({
        datasetId: primary,
        selection,
      }),
    )
    .unwrap();
  expect(csv).toContain('Known Match Alpha');
  expect(csv).toContain('10000.01');
  await expect(
    viewer.store
      .dispatch(
        searchApi.endpoints.exportSelected.initiate({
          datasetId: primary,
          selection,
        }),
      )
      .unwrap(),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    viewer.store
      .dispatch(datasetsApi.endpoints.getDataset.initiate(restricted))
      .unwrap(),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    analyst.store
      .dispatch(
        searchApi.endpoints.searchRecords.initiate({
          ...args,
          query: {
            ...query,
            conditions: [{ field: 'notAField', op: 'eq', value: 'bad' }],
          },
        }),
      )
      .unwrap(),
  ).rejects.toMatchObject({ status: 400 });
});
test('Admin dataset/field/grant/user/system endpoint contracts persist without touching existing environments', async () => {
  const created = await admin.store
    .dispatch(
      datasetsApi.endpoints.createDataset.initiate({
        name: 'FE03 temporary',
        slug: `fe03-${crypto.randomUUID()}`,
        source: 'test',
        description: '',
        category: 'test',
      }),
    )
    .unwrap();
  const datasetId = created.data.id;
  await admin.store
    .dispatch(datasetsApi.endpoints.getDataset.initiate(datasetId))
    .unwrap();
  await admin.store
    .dispatch(
      datasetsApi.endpoints.updateDataset.initiate({
        datasetId,
        changes: { name: 'Changed' },
      }),
    )
    .unwrap();
  const field = await admin.store
    .dispatch(
      datasetsApi.endpoints.createField.initiate({
        datasetId,
        field: {
          fieldKey: 'name',
          label: 'Name',
          dataType: 'string',
          operators: ['eq', 'contains'],
          isSearchable: true,
          isFilterable: true,
          isSortable: true,
          isVisible: true,
          sortOrder: 0,
        },
      }),
    )
    .unwrap();
  await admin.store
    .dispatch(
      datasetsApi.endpoints.updateField.initiate({
        datasetId,
        fieldId: field.data.id,
        changes: { label: 'Company' },
      }),
    )
    .unwrap();
  const userId = required('FE03_VIEWER');
  await admin.store
    .dispatch(
      datasetsApi.endpoints.setPermission.initiate({
        datasetId,
        userId,
        permission: 'read',
      }),
    )
    .unwrap();
  expect(
    (
      await admin.store
        .dispatch(datasetsApi.endpoints.getPermissions.initiate({ datasetId }))
        .unwrap()
    ).data,
  ).toHaveLength(1);
  await admin.store
    .dispatch(
      datasetsApi.endpoints.revokePermission.initiate({ datasetId, userId }),
    )
    .unwrap();
  expect(
    (
      await admin.store
        .dispatch(datasetsApi.endpoints.archiveDataset.initiate(datasetId))
        .unwrap()
    ).data.isArchived,
  ).toBe(true);
  expect(
    (
      await admin.store
        .dispatch(managementApi.endpoints.getUsers.initiate(undefined))
        .unwrap()
    ).data.length,
  ).toBeGreaterThanOrEqual(6);
  await admin.store
    .dispatch(
      managementApi.endpoints.updateUser.initiate({
        userId,
        changes: { isActive: true },
      }),
    )
    .unwrap();
  await admin.store
    .dispatch(managementApi.endpoints.getSettings.initiate(undefined))
    .unwrap();
  expect(
    (
      await admin.store
        .dispatch(
          managementApi.endpoints.updateSettings.initiate({
            'exports.max_selected_rows': 999,
          }),
        )
        .unwrap()
    ).data['exports.max_selected_rows'],
  ).toBe(999);
  await admin.store
    .dispatch(
      managementApi.endpoints.updateSettings.initiate({
        'exports.max_selected_rows': 1000,
      }),
    )
    .unwrap();
  const registered = await admin.store
    .dispatch(
      authApi.endpoints.register.initiate({
        email: `fe03-${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
      }),
    )
    .unwrap();
  expect(registered.data.role).toBe('viewer');
});
test('permission loss redacts stale collections and session/identity clear rejects delayed responses', async () => {
  await viewer.store
    .dispatch(datasetsApi.endpoints.getDataset.initiate(primary))
    .unwrap();
  await viewer.store
    .dispatch(searchApi.endpoints.searchRecords.initiate(args))
    .unwrap();
  const gate = viewer.hold(`datasets/${primary}/search`);
  const delayed = viewer.store.dispatch(
    searchApi.endpoints.searchRecords.initiate({
      ...args,
      query: { ...query, page: 3 },
    }),
  );
  await gate.ready;
  await admin.store
    .dispatch(
      datasetsApi.endpoints.revokePermission.initiate({
        datasetId: primary,
        userId: required('FE03_VIEWER'),
      }),
    )
    .unwrap();
  await expect(
    viewer.store
      .dispatch(
        datasetsApi.endpoints.getDataset.initiate(primary, {
          forceRefetch: true,
        }),
      )
      .unwrap(),
  ).rejects.toMatchObject({ status: 404 });
  gate.release();
  await delayed;
  expect(
    Object.values(viewer.store.getState().api.queries).every(
      (q) => q?.data === undefined,
    ),
  ).toBe(true);
  await admin.store
    .dispatch(
      datasetsApi.endpoints.setPermission.initiate({
        datasetId: primary,
        userId: required('FE03_VIEWER'),
        permission: 'read',
      }),
    )
    .unwrap();
  const hold = analyst.hold(`datasets/${primary}/search`);
  const old = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(args),
  );
  await hold.ready;
  analyst.store.dispatch(
    authSlice.actions.sessionReceived({
      ...analystUser,
      email: 'new-identity@example.test',
    }),
  );
  hold.release();
  await old;
  expect(Object.keys(analyst.store.getState().api.queries)).toHaveLength(0);
  analyst.store.dispatch(authSlice.actions.sessionReceived(analystUser));
  await analyst.store
    .dispatch(searchApi.endpoints.searchRecords.initiate(args))
    .unwrap();
  analyst.store.dispatch(clientStateCleared());
  expect(Object.keys(analyst.store.getState().api.queries)).toHaveLength(0);
  expect(
    searchApi.endpoints.searchRecords.select(skipToken)(
      analyst.store.getState(),
    ).isUninitialized,
  ).toBe(true);
});
test('aborting one subscriber during shared CSRF bootstrap does not cancel a different query', async () => {
  analyst.store.dispatch(authSlice.actions.sessionReceived(analystUser));
  const gate = analyst.hold('auth/csrf'),
    before = analyst.count('auth/csrf');
  const a = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate(args),
  );
  const b = analyst.store.dispatch(
    searchApi.endpoints.searchRecords.initiate({
      ...args,
      query: { ...query, page: 2 },
    }),
  );
  await gate.ready;
  a.abort();
  gate.release();
  expect((await a).isError).toBe(true);
  expect((await b.unwrap()).pageInfo.page).toBe(2);
  expect(analyst.count('auth/csrf') - before).toBe(1);
  a.unsubscribe();
  b.unsubscribe();
});
test('real stale CSRF token is refreshed once, without replaying domain side effects', async () => {
  await analyst.store
    .dispatch(searchApi.endpoints.searchRecords.initiate(args))
    .unwrap();
  analyst.cookies.set('datascope_csrf', 'f'.repeat(64));
  const csrf = analyst.count('auth/csrf'),
    search = analyst.count(`datasets/${primary}/search`);
  expect(
    (
      await analyst.store
        .dispatch(
          searchApi.endpoints.searchRecords.initiate({
            ...args,
            query: { ...query, page: 2 },
          }),
        )
        .unwrap()
    ).pageInfo.page,
  ).toBe(2);
  expect(analyst.count('auth/csrf') - csrf).toBe(1);
  expect(analyst.count(`datasets/${primary}/search`) - search).toBe(2);
});
test('cleanup between mutation fulfillment and cache seeding cannot resurrect private data', async () => {
  analyst.store.dispatch(authSlice.actions.sessionReceived(analystUser));
  let cleared = false;
  const unsubscribe = analyst.store.subscribe(() => {
    if (
      !cleared &&
      Object.values(analyst.store.getState().api.mutations).some(
        (m) => m?.status === QueryStatus.fulfilled,
      )
    ) {
      cleared = true;
      analyst.store.dispatch(clientStateCleared());
    }
  });
  try {
    await analyst.store.dispatch(
      searchApi.endpoints.executeSearch.initiate(args),
    );
    await settled(analyst.store);
    expect(cleared).toBe(true);
    expect(Object.keys(analyst.store.getState().api.queries)).toHaveLength(0);
    expect(analyst.store.getState().auth.status).toBe('anonymous');
  } finally {
    unsubscribe();
  }
});
test('real logout clears all scoped cache; revoked session replay yields 401 and cannot reuse cached data', async () => {
  viewer.store.dispatch(
    authSlice.actions.sessionReceived({
      id: required('FE03_VIEWER'),
      email: 'viewer@fe03.test',
      role: 'viewer',
    }),
  );
  await viewer.store
    .dispatch(datasetsApi.endpoints.getDataset.initiate(primary))
    .unwrap();
  const old = viewer.cookies.get('datascope_session');
  await viewer.store
    .dispatch(authApi.endpoints.logout.initiate(undefined))
    .unwrap();
  expect(viewer.store.getState().auth.status).toBe('anonymous');
  expect(Object.keys(viewer.store.getState().api.queries)).toHaveLength(0);
  if (!old) throw new Error('Missing session');
  viewer.cookies.set('datascope_session', old);
  viewer.store.dispatch(
    authSlice.actions.sessionReceived({
      id: required('FE03_VIEWER'),
      email: 'viewer@fe03.test',
      role: 'viewer',
    }),
  );
  await expect(
    viewer.store
      .dispatch(authApi.endpoints.getSession.initiate(undefined))
      .unwrap(),
  ).rejects.toMatchObject({ status: 401 });
  await settled(viewer.store);
  expect(viewer.store.getState().auth.status).toBe('anonymous');
  expect(Object.keys(viewer.store.getState().api.queries)).toHaveLength(0);
});
