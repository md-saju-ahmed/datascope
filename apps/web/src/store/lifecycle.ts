import { createAction } from '@reduxjs/toolkit';
// FE-03 will also reset its user-scoped API cache on this event.
export const clientStateCleared = createAction('client/stateCleared');
