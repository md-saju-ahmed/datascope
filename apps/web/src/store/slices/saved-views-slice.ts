import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SavedConfig } from '@datascope/contracts';
import { copySearchDraft } from './search-config-slice.ts';

interface ViewEditorDraft {
  viewId: string | null;
  datasetId: string;
  name: string;
  config: SavedConfig;
}
interface SavedViewsState {
  selectedViewId: string | null;
  editor: ViewEditorDraft | null;
}
const initialState: SavedViewsState = { selectedViewId: null, editor: null };
export const savedViewsSlice = createSlice({
  name: 'savedViews',
  initialState,
  reducers: {
    viewSelected(state, { payload }: PayloadAction<string | null>) {
      state.selectedViewId = payload;
    },
    editorOpened(state, { payload }: PayloadAction<ViewEditorDraft>) {
      state.editor = {
        viewId: payload.viewId,
        datasetId: payload.datasetId,
        name: payload.name,
        config: copySearchDraft(payload.config),
      };
    },
    editorClosed(state) {
      state.editor = null;
    },
  },
  selectors: {
    selectSelectedViewId: (state) => state.selectedViewId,
    selectViewEditor: (state) => state.editor,
  },
});
