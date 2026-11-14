import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CurrentUser } from '@datascope/contracts';

interface AuthState {
  user: CurrentUser | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
}
const initialState: AuthState = { user: null, status: 'unknown' };
export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionReceived(state, { payload }: PayloadAction<CurrentUser | null>) {
      // Store a display summary only, never the login response or credentials.
      state.user = payload
        ? { id: payload.id, email: payload.email, role: payload.role }
        : null;
      state.status = payload ? 'authenticated' : 'anonymous';
    },
  },
  selectors: {
    selectUser: (state) => state.user,
    selectAuthStatus: (state) => state.status,
  },
});
