import {
  users,
  authSessions,
  userPreferences,
  systemSettings,
} from './identity.js';
import { datasets, datasetFields, datasetPermissions } from './datasets.js';
import {
  datasetRecords,
  recordRelationships,
  recordChanges,
} from './records.js';
import { savedViews, savedViewShares, searchHistory } from './views.js';

export * from './common.js';
export * from './identity.js';
export * from './datasets.js';
export * from './records.js';
export * from './views.js';
export * from './relations.js';

export const coreTables = {
  users,
  authSessions,
  datasets,
  datasetFields,
  datasetPermissions,
  datasetRecords,
  recordRelationships,
  recordChanges,
  savedViews,
  savedViewShares,
  searchHistory,
  userPreferences,
  systemSettings,
};
