import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './common.js';
import { datasets } from './datasets.js';
import { users } from './identity.js';

export const savedViews = pgTable(
  'saved_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    ...timestamps(),
  },
  (table) => [
    index('saved_views_owner_id_idx').on(table.ownerId),
    index('saved_views_dataset_id_idx').on(table.datasetId),
    check('saved_views_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check(
      'saved_views_config_object',
      sql`jsonb_typeof(${table.config}) = 'object'`,
    ),
  ],
);

export const savedViewShares = pgTable(
  'saved_view_shares',
  {
    viewId: uuid('view_id')
      .notNull()
      .references(() => savedViews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.viewId, table.userId] }),
    index('saved_view_shares_user_id_idx').on(table.userId),
  ],
);

export const searchHistory = pgTable(
  'search_history',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedByDefaultAsIdentity(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    datasetId: uuid('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'restrict' }),
    normalizedQuery: jsonb('normalized_query')
      .$type<Record<string, unknown>>()
      .notNull(),
    filterKeys: jsonb('filter_keys').$type<string[]>().default([]).notNull(),
    durationMs: integer('duration_ms'),
    executedAt: timestamp('executed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('search_history_user_date_idx').on(
      table.userId,
      table.executedAt,
      table.id,
    ),
    index('search_history_dataset_id_idx').on(table.datasetId),
    check(
      'search_history_query_object',
      sql`jsonb_typeof(${table.normalizedQuery}) = 'object'`,
    ),
    check(
      'search_history_filter_keys_array',
      sql`jsonb_typeof(${table.filterKeys}) = 'array'`,
    ),
    check(
      'search_history_duration_nonnegative',
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
  ],
);
