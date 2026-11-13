import { relations } from 'drizzle-orm';
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

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(authSessions),
  preferences: one(userPreferences),
  permissions: many(datasetPermissions, {
    relationName: 'permission_recipient',
  }),
  grantedPermissions: many(datasetPermissions, {
    relationName: 'permission_grantor',
  }),
  ownedViews: many(savedViews),
  sharedViews: many(savedViewShares),
  searches: many(searchHistory),
  changes: many(recordChanges),
  settings: many(systemSettings),
}));
export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));
export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  }),
);
export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  actor: one(users, {
    fields: [systemSettings.updatedBy],
    references: [users.id],
  }),
}));
export const datasetsRelations = relations(datasets, ({ many }) => ({
  fields: many(datasetFields),
  permissions: many(datasetPermissions),
  records: many(datasetRecords),
  views: many(savedViews),
  searches: many(searchHistory),
}));
export const datasetFieldsRelations = relations(datasetFields, ({ one }) => ({
  dataset: one(datasets, {
    fields: [datasetFields.datasetId],
    references: [datasets.id],
  }),
}));
export const datasetPermissionsRelations = relations(
  datasetPermissions,
  ({ one }) => ({
    dataset: one(datasets, {
      fields: [datasetPermissions.datasetId],
      references: [datasets.id],
    }),
    user: one(users, {
      fields: [datasetPermissions.userId],
      references: [users.id],
      relationName: 'permission_recipient',
    }),
    grantor: one(users, {
      fields: [datasetPermissions.grantedBy],
      references: [users.id],
      relationName: 'permission_grantor',
    }),
  }),
);
export const datasetRecordsRelations = relations(
  datasetRecords,
  ({ one, many }) => ({
    dataset: one(datasets, {
      fields: [datasetRecords.datasetId],
      references: [datasets.id],
    }),
    outgoing: many(recordRelationships, {
      relationName: 'relationship_source',
    }),
    incoming: many(recordRelationships, {
      relationName: 'relationship_target',
    }),
    changes: many(recordChanges),
  }),
);
export const recordRelationshipsRelations = relations(
  recordRelationships,
  ({ one }) => ({
    source: one(datasetRecords, {
      fields: [recordRelationships.sourceRecordId],
      references: [datasetRecords.id],
      relationName: 'relationship_source',
    }),
    target: one(datasetRecords, {
      fields: [recordRelationships.targetRecordId],
      references: [datasetRecords.id],
      relationName: 'relationship_target',
    }),
  }),
);
export const recordChangesRelations = relations(recordChanges, ({ one }) => ({
  record: one(datasetRecords, {
    fields: [recordChanges.recordId],
    references: [datasetRecords.id],
  }),
  actor: one(users, {
    fields: [recordChanges.actorUserId],
    references: [users.id],
  }),
}));
export const savedViewsRelations = relations(savedViews, ({ one, many }) => ({
  owner: one(users, { fields: [savedViews.ownerId], references: [users.id] }),
  dataset: one(datasets, {
    fields: [savedViews.datasetId],
    references: [datasets.id],
  }),
  shares: many(savedViewShares),
}));
export const savedViewSharesRelations = relations(
  savedViewShares,
  ({ one }) => ({
    view: one(savedViews, {
      fields: [savedViewShares.viewId],
      references: [savedViews.id],
    }),
    user: one(users, {
      fields: [savedViewShares.userId],
      references: [users.id],
    }),
  }),
);
export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, { fields: [searchHistory.userId], references: [users.id] }),
  dataset: one(datasets, {
    fields: [searchHistory.datasetId],
    references: [datasets.id],
  }),
}));
