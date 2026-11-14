import { createAction } from '@reduxjs/toolkit';
export const clientStateCleared = createAction('client/stateCleared');
export const protectedAccessLost = createAction('client/protectedAccessLost');
export const sessionExpired = createAction('client/sessionExpired');
export const savedViewRemoved = createAction<string>('client/savedViewRemoved');
