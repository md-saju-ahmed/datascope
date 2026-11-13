import { pgEnum, timestamp } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['admin', 'analyst', 'viewer']);
export const datasetPermission = pgEnum('dataset_permission', [
  'read',
  'analyze',
  'manage',
]);
export const fieldDataType = pgEnum('field_data_type', [
  'string',
  'number',
  'date',
  'boolean',
  'enum',
]);

export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  };
}
