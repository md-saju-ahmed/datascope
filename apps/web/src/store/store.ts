import {
  combineReducers,
  configureStore,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { CurrentUser } from '@datascope/contracts';
import { authSlice } from './slices/auth-slice.ts';
import { datasetSlice } from './slices/dataset-slice.ts';
import { searchConfigSlice } from './slices/search-config-slice.ts';
import { savedViewsSlice } from './slices/saved-views-slice.ts';
import { uiPreferencesSlice } from './slices/ui-preferences-slice.ts';
import { clientStateCleared } from './lifecycle.ts';

const combinedReducer = combineReducers({
  auth: authSlice.reducer,
  dataset: datasetSlice.reducer,
  searchConfig: searchConfigSlice.reducer,
  savedViews: savedViewsSlice.reducer,
  uiPreferences: uiPreferencesSlice.reducer,
});
export type RootState = ReturnType<typeof combinedReducer>;
function rootReducer(
  state: RootState | undefined,
  action: UnknownAction,
): RootState {
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
export function makeStore(initialUser?: CurrentUser | null) {
  const store = configureStore({
    reducer: rootReducer,
    devTools: process.env.NODE_ENV !== 'production',
  });
  if (initialUser !== undefined)
    store.dispatch(authSlice.actions.sessionReceived(initialUser));
  return store;
}
export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
