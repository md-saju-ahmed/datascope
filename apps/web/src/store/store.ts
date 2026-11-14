import {
  combineReducers,
  configureStore,
  type UnknownAction,
  createListenerMiddleware,
} from '@reduxjs/toolkit';
import { QueryStatus } from '@reduxjs/toolkit/query';
import type { CurrentUser } from '@datascope/contracts';
import { authSlice } from './slices/auth-slice.ts';
import { datasetSlice } from './slices/dataset-slice.ts';
import { searchConfigSlice } from './slices/search-config-slice.ts';
import { savedViewsSlice } from './slices/saved-views-slice.ts';
import { uiPreferencesSlice } from './slices/ui-preferences-slice.ts';
import {
  clientStateCleared,
  protectedAccessLost,
  sessionExpired,
  savedViewRemoved,
} from './lifecycle.ts';
import { baseApi } from './api/index.ts';
import { createTransport, type TransportOptions } from './api/transport.ts';

const combinedReducer = combineReducers({
  auth: authSlice.reducer,
  dataset: datasetSlice.reducer,
  searchConfig: searchConfigSlice.reducer,
  savedViews: savedViewsSlice.reducer,
  uiPreferences: uiPreferencesSlice.reducer,
  api: baseApi.reducer,
});
export type RootState = ReturnType<typeof combinedReducer>;
function rootReducer(
  state: RootState | undefined,
  action: UnknownAction,
): RootState {
  if (state && sessionExpired.match(action)) {
    // Redact immediately but retain the failed request's error until its promise
    // settles. Resetting RTK Query mid-flight would make unwrap resolve undefined.
    const redacted = rootReducer(state, protectedAccessLost());
    return {
      ...combinedReducer(undefined, authSlice.actions.sessionReceived(null)),
      api: redacted.api,
    };
  }
  if (
    state &&
    (protectedAccessLost.match(action) || savedViewRemoved.match(action))
  ) {
    const removedViewId = savedViewRemoved.match(action)
      ? action.payload
      : undefined;
    const queries = { ...state.api.queries };
    for (const [key, value] of Object.entries(queries)) {
      if (!value || value.status === QueryStatus.uninitialized) continue;
      if (
        removedViewId &&
        (value.endpointName !== 'getSavedView' ||
          value.originalArgs !== removedViewId)
      )
        continue;
      const entry = {
        ...value,
        requestId: removedViewId
          ? `removed:${value.requestId}`
          : value.requestId,
        status: QueryStatus.rejected as const,
        error: {
          status: removedViewId ? 404 : 403,
          code: 'ACCESS_CHANGED',
          message: 'Access changed; refresh to verify access',
        },
      };
      delete entry.data;
      queries[key] = entry;
    }
    const mutations = { ...state.api.mutations };
    for (const [key, value] of Object.entries(mutations)) {
      if (!value || value.status === QueryStatus.uninitialized) continue;
      if (removedViewId && value.endpointName !== 'applySavedView') continue;
      const entry = {
        ...value,
        requestId: removedViewId
          ? `removed:${value.requestId}`
          : value.requestId,
        status: QueryStatus.rejected as const,
        error: {
          status: removedViewId ? 404 : 403,
          code: 'ACCESS_CHANGED',
          message: 'Access changed; retry to verify access',
        },
      };
      delete entry.data;
      mutations[key] = entry;
    }
    return { ...state, api: { ...state.api, queries, mutations } };
  }
  if (clientStateCleared.match(action))
    return combinedReducer(undefined, authSlice.actions.sessionReceived(null));
  if (authSlice.actions.sessionReceived.match(action)) {
    const before = state?.auth.user;
    const after = action.payload;
    if (
      before?.id !== after?.id ||
      before?.role !== after?.role ||
      before?.email !== after?.email
    )
      state = undefined;
  }
  if (
    state &&
    datasetSlice.actions.activeDatasetChanged.match(action) &&
    state.dataset.activeDatasetId !== action.payload
  ) {
    state = {
      ...state,
      searchConfig: searchConfigSlice.reducer(undefined, action),
      savedViews: savedViewsSlice.reducer(undefined, action),
    };
  }
  return combinedReducer(state, action);
}
// Each server render/provider instance gets a fresh store; no exported singleton.
export function makeStore(
  initialUser?: CurrentUser | null,
  transportOptions?: TransportOptions,
) {
  const transport = createTransport(transportOptions);
  const lifecycle = createListenerMiddleware<RootState>();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: { transport } } })
        .prepend(lifecycle.middleware)
        .concat(baseApi.middleware),
    // Auth mutation arguments include passwords in transient actions. Do not
    // retain those actions or prior users' snapshots in DevTools history.
    devTools: false,
  });
  const clearApi = () => {
    transport.clear();
    for (const request of store.dispatch(baseApi.util.getRunningQueriesThunk()))
      request.abort();
    for (const request of store.dispatch(
      baseApi.util.getRunningMutationsThunk(),
    ))
      request.abort();
    store.dispatch(baseApi.util.resetApiState());
  };
  lifecycle.startListening({
    predicate: (action, current, previous) =>
      clientStateCleared.match(action) ||
      (authSlice.actions.sessionReceived.match(action) &&
        (current.auth.user?.id !== previous.auth.user?.id ||
          current.auth.user?.role !== previous.auth.user?.role ||
          current.auth.user?.email !== previous.auth.user?.email)),
    effect: clearApi,
  });
  lifecycle.startListening({
    actionCreator: protectedAccessLost,
    effect: () => {
      transport.clear();
    },
  });
  lifecycle.startListening({
    actionCreator: sessionExpired,
    effect: async () => {
      transport.clear();
      const version = transport.version();
      const pending = [
        ...store.dispatch(baseApi.util.getRunningQueriesThunk()),
        ...store.dispatch(baseApi.util.getRunningMutationsThunk()),
      ];
      await Promise.allSettled(pending);
      if (version === transport.version())
        store.dispatch(baseApi.util.resetApiState());
    },
  });
  if (initialUser !== undefined)
    store.dispatch(authSlice.actions.sessionReceived(initialUser));
  return Object.assign(store, { clearApi });
}
export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
