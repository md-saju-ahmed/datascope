import { makeStore, type AppStore } from '../src/store/store.ts';
import { clientStateCleared } from '../src/store/lifecycle.ts';
import { authSlice } from '../src/store/slices/auth-slice.ts';
import { datasetSlice } from '../src/store/slices/dataset-slice.ts';
import { searchConfigSlice } from '../src/store/slices/search-config-slice.ts';
import { savedViewsSlice } from '../src/store/slices/saved-views-slice.ts';
import { uiPreferencesSlice } from '../src/store/slices/ui-preferences-slice.ts';
import { savedConfigSchema, type CurrentUser } from '@datascope/contracts';

const user: CurrentUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'first@example.test',
  role: 'analyst',
};
const datasetId = '00000000-0000-4000-8000-000000000002';
const viewId = '00000000-0000-4000-8000-000000000003';
const config = savedConfigSchema.parse({
  version: 1,
  q: 'Known Match',
  conditions: [
    { field: 'status', op: 'eq', value: 'Active' },
    { field: 'country', op: 'in', value: ['Germany', 'France'] },
  ],
  sort: [
    { field: 'revenue', direction: 'desc' },
    { field: 'name', direction: 'asc' },
  ],
  columns: ['id', 'name', 'revenue'],
  pageSize: 50,
});
function populate(store: AppStore) {
  store.dispatch(datasetSlice.actions.activeDatasetChanged(datasetId));
  store.dispatch(
    searchConfigSlice.actions.draftReplaced({ datasetId, config }),
  );
  store.dispatch(savedViewsSlice.actions.viewSelected(viewId));
  store.dispatch(
    savedViewsSlice.actions.editorOpened({
      viewId,
      datasetId,
      name: 'Draft view',
      config,
    }),
  );
  store.dispatch(
    uiPreferencesSlice.actions.preferencesChanged({
      density: 'compact',
      defaultPageSize: 100,
      defaultDatasetId: datasetId,
    }),
  );
}

describe('FE-02 client state ownership and lifecycle', () => {
  test('fresh stores have all five slices and no established client identity by default', () => {
    const store = makeStore();
    expect(Object.keys(store.getState()).sort()).toEqual([
      'auth',
      'dataset',
      'savedViews',
      'searchConfig',
      'uiPreferences',
    ]);
    expect(authSlice.selectors.selectAuthStatus(store.getState())).toBe(
      'unknown',
    );
    expect(authSlice.selectors.selectUser(store.getState())).toBeNull();
  });
  test('verified identity seeds the first render and projects away login/session secrets', () => {
    const loginLike = {
      ...user,
      csrfToken: 'do-not-retain',
      expiresAt: 'do-not-retain',
      password: 'do-not-retain',
    };
    const store = makeStore(loginLike);
    expect(authSlice.selectors.selectUser(store.getState())).toEqual(user);
    expect(authSlice.selectors.selectAuthStatus(store.getState())).toBe(
      'authenticated',
    );
    expect(JSON.stringify(store.getState())).not.toContain('do-not-retain');
    expect(makeStore(null).getState().auth.status).toBe('anonymous');
  });
  test('independent requests/providers cannot share user, dataset or editor state', () => {
    const first = makeStore(user);
    const second = makeStore({
      ...user,
      id: '00000000-0000-4000-8000-000000000004',
      email: 'second@example.test',
      role: 'viewer',
    });
    const before = structuredClone(second.getState());
    populate(first);
    expect(second.getState()).toEqual(before);
    expect(makeStore(user).getState().savedViews.editor).toBeNull();
  });
  test.each(['account', 'role', 'email', 'anonymous'] as const)(
    '%s change discards all user-scoped drafts and preferences',
    (change) => {
      const store = makeStore(user);
      populate(store);
      const next =
        change === 'anonymous'
          ? null
          : {
              ...user,
              ...(change === 'account'
                ? { id: '00000000-0000-4000-8000-000000000004' }
                : {}),
              ...(change === 'role' ? { role: 'viewer' as const } : {}),
              ...(change === 'email' ? { email: 'changed@example.test' } : {}),
            };
      store.dispatch(authSlice.actions.sessionReceived(next));
      expect(store.getState()).toEqual(makeStore(next).getState());
    },
  );
  test('same verified principal refresh preserves the active workspace', () => {
    const store = makeStore(user);
    populate(store);
    const before = structuredClone(store.getState());
    store.dispatch(authSlice.actions.sessionReceived({ ...user }));
    expect(store.getState()).toEqual(before);
  });
  test('explicit session clear removes every scoped state, without changing another store', () => {
    const store = makeStore(user);
    populate(store);
    const independent = makeStore(user);
    populate(independent);
    const before = structuredClone(independent.getState());
    store.dispatch(clientStateCleared());
    expect(store.getState()).toEqual(makeStore(null).getState());
    expect(independent.getState()).toEqual(before);
  });
  test('dataset change clears incompatible drafts/views but retains user preferences', () => {
    const store = makeStore(user);
    populate(store);
    const preferences = structuredClone(store.getState().uiPreferences);
    store.dispatch(
      datasetSlice.actions.activeDatasetChanged(
        '00000000-0000-4000-8000-000000000005',
      ),
    );
    expect(
      searchConfigSlice.selectors.selectSearchDraft(store.getState()),
    ).toEqual(makeStore().getState().searchConfig.draft);
    expect(
      savedViewsSlice.selectors.selectSelectedViewId(store.getState()),
    ).toBeNull();
    expect(
      savedViewsSlice.selectors.selectViewEditor(store.getState()),
    ).toBeNull();
    expect(store.getState().uiPreferences).toEqual(preferences);
    expect(store.getState().auth.user).toEqual(user);
  });
  test('same dataset selection preserves the draft; clearing selection discards it', () => {
    const store = makeStore(user);
    populate(store);
    const before = structuredClone(store.getState());
    store.dispatch(datasetSlice.actions.activeDatasetChanged(datasetId));
    expect(store.getState()).toEqual(before);
    store.dispatch(datasetSlice.actions.activeDatasetChanged(null));
    expect(
      datasetSlice.selectors.selectActiveDatasetId(store.getState()),
    ).toBeNull();
    expect(
      searchConfigSlice.selectors.selectDraftDatasetId(store.getState()),
    ).toBeNull();
  });
  test('search drafts retain AND/sort priority, decimal-safe strings and columns without fetching or applied pagination', () => {
    const store = makeStore(user);
    const draft = {
      ...config,
      conditions: [
        ...config.conditions,
        { field: 'revenue', op: 'gt' as const, value: '9999999999999999.99' },
      ],
    };
    store.dispatch(
      searchConfigSlice.actions.draftReplaced({ datasetId, config: draft }),
    );
    expect(
      searchConfigSlice.selectors.selectSearchDraft(store.getState()),
    ).toEqual(draft);
    expect(Object.keys(store.getState().searchConfig).sort()).toEqual([
      'datasetId',
      'draft',
    ]);
    expect('page' in store.getState().searchConfig.draft).toBe(false);
    store.dispatch(searchConfigSlice.actions.draftCleared());
    expect(store.getState().searchConfig).toEqual(
      makeStore().getState().searchConfig,
    );
  });
  test('view editor and preference changes do not retain result/list payloads', () => {
    const store = makeStore(user);
    const augmentedConfig = {
      ...config,
      data: [{ id: '1000000000001' }],
      page: 4000,
    };
    store.dispatch(
      savedViewsSlice.actions.editorOpened({
        viewId: null,
        datasetId,
        name: 'Unsaved draft',
        config: augmentedConfig,
      }),
    );
    expect(store.getState().savedViews.editor?.config).toEqual(config);
    expect(Object.keys(store.getState().savedViews).sort()).toEqual([
      'editor',
      'selectedViewId',
    ]);
    store.dispatch(savedViewsSlice.actions.editorClosed());
    expect(store.getState().savedViews.editor).toBeNull();
    const augmentedPreferences = {
      density: 'compact' as const,
      data: ['do-not-retain'],
    };
    store.dispatch(
      uiPreferencesSlice.actions.preferencesChanged(augmentedPreferences),
    );
    expect(store.getState().uiPreferences).toEqual({
      density: 'compact',
      defaultPageSize: 25,
      defaultDatasetId: null,
    });
  });
  test('partial UI preference updates preserve omissions and allow explicit clearing/reset', () => {
    const store = makeStore(user);
    populate(store);
    store.dispatch(
      uiPreferencesSlice.actions.preferencesChanged({ density: 'comfortable' }),
    );
    expect(store.getState().uiPreferences).toEqual({
      density: 'comfortable',
      defaultPageSize: 100,
      defaultDatasetId: datasetId,
    });
    store.dispatch(
      uiPreferencesSlice.actions.preferencesChanged({ defaultDatasetId: null }),
    );
    expect(store.getState().uiPreferences.defaultDatasetId).toBeNull();
    store.dispatch(uiPreferencesSlice.actions.preferencesReset());
    expect(
      uiPreferencesSlice.selectors.selectUiPreferences(store.getState()),
    ).toEqual(makeStore().getState().uiPreferences);
  });
  test('reducers leave previous snapshots intact and state remains JSON-serializable', () => {
    const store = makeStore(user);
    const before = store.getState();
    const clone = structuredClone(before);
    populate(store);
    expect(before).toEqual(clone);
    expect(JSON.parse(JSON.stringify(store.getState()))).toEqual(
      store.getState(),
    );
  });
});
