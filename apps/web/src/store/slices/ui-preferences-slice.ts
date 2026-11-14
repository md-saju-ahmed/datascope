import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  preferencesSchema,
  type Preferences,
  type PreferencePatch,
} from '@datascope/contracts';

export const uiPreferencesSlice = createSlice({
  name: 'uiPreferences',
  initialState: (): Preferences => preferencesSchema.parse({}),
  reducers: {
    preferencesChanged(state, { payload }: PayloadAction<PreferencePatch>) {
      if (payload.density !== undefined) state.density = payload.density;
      if (payload.defaultPageSize !== undefined)
        state.defaultPageSize = payload.defaultPageSize;
      if (payload.defaultDatasetId !== undefined)
        state.defaultDatasetId = payload.defaultDatasetId;
    },
    preferencesReset: () => preferencesSchema.parse({}),
  },
  selectors: { selectUiPreferences: (state) => state },
});
