import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { savedConfigSchema, type SavedConfig } from '@datascope/contracts';

// Explicit projection prevents response rows or applied pagination entering drafts.
export function copySearchDraft(config: SavedConfig): SavedConfig {
  return {
    version: 1,
    q: config.q,
    conditions: config.conditions.map((condition) => ({
      field: condition.field,
      op: condition.op,
      value: Array.isArray(condition.value)
        ? [...condition.value]
        : condition.value,
    })),
    sort: config.sort.map((item) => ({
      field: item.field,
      direction: item.direction,
    })),
    pageSize: config.pageSize,
    ...(config.columns ? { columns: [...config.columns] } : {}),
  };
}
interface SearchConfigState {
  datasetId: string | null;
  draft: SavedConfig;
}
const initialState = (): SearchConfigState => ({
  datasetId: null,
  draft: savedConfigSchema.parse({ version: 1 }),
});
export const searchConfigSlice = createSlice({
  name: 'searchConfig',
  initialState,
  reducers: {
    draftReplaced(
      state,
      { payload }: PayloadAction<{ datasetId: string; config: SavedConfig }>,
    ) {
      state.datasetId = payload.datasetId;
      state.draft = copySearchDraft(payload.config);
    },
    draftCleared: () => initialState(),
  },
  selectors: {
    selectSearchDraft: (state) => state.draft,
    selectDraftDatasetId: (state) => state.datasetId,
  },
});
