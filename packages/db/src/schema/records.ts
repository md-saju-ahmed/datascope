import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './common.js';
import { datasets } from './datasets.js';
import { users } from './identity.js';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const datasetRecords = pgTable(
  'dataset_records',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    status: text('status'),
    country: text('country'),
    category: text('category'),
    revenue: numeric('revenue', { precision: 18, scale: 2 }),
    attributes: jsonb('attributes')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    searchVector: tsvector('search_vector'),
    ...timestamps(),
  },
  (table) => [
    index('dataset_records_dataset_id_idx').on(table.datasetId),
    check(
      'dataset_records_attributes_object',
      sql`jsonb_typeof(${table.attributes}) = 'object'`,
    ),
    check(
      'dataset_records_revenue_finite',
      sql`${table.revenue} is null or ${table.revenue} <> 'NaN'::numeric`,
    ),
  ],
);

export const recordRelationships = pgTable(
  'record_relationships',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    sourceRecordId: bigint('source_record_id', { mode: 'bigint' })
      .notNull()
      .references(() => datasetRecords.id, { onDelete: 'cascade' }),
    targetRecordId: bigint('target_record_id', { mode: 'bigint' })
      .notNull()
      .references(() => datasetRecords.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('record_relationships_edge_unique').on(
      table.sourceRecordId,
      table.targetRecordId,
      table.relationType,
    ),
    index('record_relationships_target_idx').on(table.targetRecordId),
    check(
      'record_relationships_not_self',
      sql`${table.sourceRecordId} <> ${table.targetRecordId}`,
    ),
    check(
      'record_relationships_type_not_blank',
      sql`length(btrim(${table.relationType})) > 0`,
    ),
  ],
);

export const recordChanges = pgTable(
  'record_changes',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    recordId: bigint('record_id', { mode: 'bigint' })
      .notNull()
      .references(() => datasetRecords.id, { onDelete: 'restrict' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changedAt: timestamp('changed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index('record_changes_record_date_idx').on(table.recordId, table.changedAt),
    check(
      'record_changes_object',
      sql`jsonb_typeof(${table.changes}) = 'object'`,
    ),
  ],
);
