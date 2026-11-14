import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
interface DatasetState {
  activeDatasetId: string | null;
}
const initialState: DatasetState = { activeDatasetId: null };
export const datasetSlice = createSlice({
  name: 'dataset',
  initialState,
  reducers: {
    activeDatasetChanged(state, { payload }: PayloadAction<string | null>) {
      state.activeDatasetId = payload;
    },
  },
  selectors: { selectActiveDatasetId: (state) => state.activeDatasetId },
});
