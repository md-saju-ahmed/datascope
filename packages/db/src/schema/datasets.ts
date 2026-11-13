import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { datasetPermission, fieldDataType, timestamps } from './common.js';
import { users } from './identity.js';

export const datasets = pgTable(
  'datasets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    category: text('category').default('uncategorized').notNull(),
    source: text('source').notNull(),
    recordCount: bigint('record_count', { mode: 'bigint' })
      .default(sql`0`)
      .notNull(),
    isArchived: boolean('is_archived').default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('datasets_slug_unique').on(table.slug),
    check(
      'datasets_slug_shape',
      sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check('datasets_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('datasets_source_not_blank', sql`length(btrim(${table.source})) > 0`),
    check('datasets_record_count_nonnegative', sql`${table.recordCount} >= 0`),
  ],
);

export const datasetFields = pgTable(
  'dataset_fields',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    fieldKey: text('field_key').notNull(),
    label: text('label').notNull(),
    dataType: fieldDataType('data_type').notNull(),
    operators: jsonb('operators').$type<string[]>().default([]).notNull(),
    isSearchable: boolean('is_searchable').default(false).notNull(),
    isFilterable: boolean('is_filterable').default(false).notNull(),
    isSortable: boolean('is_sortable').default(false).notNull(),
    isVisible: boolean('is_visible').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('dataset_fields_dataset_key_unique').on(
      table.datasetId,
      table.fieldKey,
    ),
    check(
      'dataset_fields_key_shape',
      sql`${table.fieldKey} ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'`,
    ),
    check(
      'dataset_fields_label_not_blank',
      sql`length(btrim(${table.label})) > 0`,
    ),
    check(
      'dataset_fields_operators_array',
      sql`jsonb_typeof(${table.operators}) = 'array'`,
    ),
    check(
      'dataset_fields_sort_order_nonnegative',
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const datasetPermissions = pgTable(
  'dataset_permissions',
  {
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: datasetPermission('permission').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.userId] }),
    index('dataset_permissions_user_id_idx').on(table.userId),
  ],
);
