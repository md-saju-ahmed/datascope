import {
  normalizeSearch,
  skipToken,
  searchApi,
  datasetsApi,
  baseApi,
} from '../src/store/api/index.ts';
import { makeStore } from '../src/store/store.ts';
import { authSlice } from '../src/store/slices/auth-slice.ts';
import { clientStateCleared } from '../src/store/lifecycle.ts';
import { searchRequestSchema } from '@datascope/contracts';
const user = {
  id: 'dada0004-0000-4000-8000-000000000002',
  email: 'unit@example.test',
  role: 'analyst' as const,
};
const datasetId = 'dada0004-0000-4000-8000-000000000101';
test('malformed API success becomes a controlled schema error without caching invalid data', async () => {
  const store = makeStore(user, {
    baseUrl: 'http://unit.test/api/v1',
    fetchFn: () => Promise.resolve(Response.json({ data: {} })),
  });
  const request = store.dispatch(
    datasetsApi.endpoints.getDataset.initiate(datasetId),
  );
  await expect(request.unwrap()).rejects.toMatchObject({
    status: 'CUSTOM_ERROR',
    error: 'Invalid API response; try again',
  });
  expect(
    datasetsApi.endpoints.getDataset.select(datasetId)(store.getState()).data,
  ).toBeUndefined();
  request.unsubscribe();
  store.clearApi();
});
test('normalization shares equivalent AND/IN queries and preserves sort/column priority and decimal strings', () => {
  const query = searchRequestSchema.parse({
    q: ' Alpha ',
    conditions: [
      { field: 'country', op: 'in', value: ['Germany', 'France'] },
      { field: 'revenue', op: 'gt', value: '10000.01' },
    ],
    sort: [
      { field: 'revenue', direction: 'desc' },
      { field: 'name', direction: 'asc' },
    ],
    columns: ['name', 'revenue'],
  });
  const reverse = {
    ...query,
    conditions: [...query.conditions].reverse().map((c) => ({
      ...c,
      value: Array.isArray(c.value) ? [...c.value].reverse() : c.value,
    })),
  };
  expect(normalizeSearch(query)).toEqual(normalizeSearch(reverse));
  expect(normalizeSearch(query).sort).toEqual(query.sort);
  expect(normalizeSearch(query).columns).toEqual(query.columns);
  expect(query.q).toBe('Alpha');
});
test('skipToken selects uninitialized state and unknown/anonymous sessions send no protected requests', async () => {
  let calls = 0;
  const store = makeStore(undefined, {
    baseUrl: 'http://unit.test/api/v1',
    fetchFn: () => {
      calls++;
      return Promise.reject(new Error('Unexpected network'));
    },
  });
  expect(
    searchApi.endpoints.searchRecords.select(skipToken)(store.getState())
      .isUninitialized,
  ).toBe(true);
  const request = store.dispatch(
    datasetsApi.endpoints.getDataset.initiate(datasetId),
  );
  expect((await request).isError).toBe(true);
  expect(calls).toBe(0);
  request.unsubscribe();
  store.clearApi();
});
test('cache is per store and explicit clear/identity changes remove server data', async () => {
  const store = makeStore(user),
    other = makeStore(user);
  const args = { datasetId, query: searchRequestSchema.parse({}) };
  await store.dispatch(
    searchApi.util.upsertQueryData('searchRecords', args, {
      data: [{ id: '1000000000001', name: 'private' }],
      pageInfo: {
        page: 1,
        pageSize: 25,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
      },
      sort: [],
      queryId: 'dada0004-0000-4000-8000-000000000999',
    }),
  );
  expect(Object.keys(store.getState().api.queries)).toHaveLength(1);
  expect(Object.keys(other.getState().api.queries)).toHaveLength(0);
  store.dispatch(
    authSlice.actions.sessionReceived({
      ...user,
      email: 'changed@example.test',
    }),
  );
  expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
  store.dispatch(clientStateCleared());
  expect(store.getState().auth.status).toBe('anonymous');
  store.clearApi();
  other.clearApi();
  expect(baseApi.reducerPath).toBe('api');
});
