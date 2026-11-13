import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import {
  datasetAnalyticsResponseSchema,
  platformAnalyticsResponseSchema,
  activityResponseSchema,
} from '@datascope/contracts';
import type {
  CurrentUser,
  AnalyticsQuery,
  ActivityQuery,
} from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { DataContext } from '../permissions/permissions.service.js';
import { forbidden } from '../../common/access.js';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
  ) {}
  private async activityData(
    user: CurrentUser,
    query: ActivityQuery,
    db: DataContext,
  ) {
    const current = await this.permissions.current(user, db);
    if (current.role === 'viewer') forbidden();
    if (query.datasetId)
      await this.permissions.dataset(current, query.datasetId, 'analyze', db);
    const to = new Date();
    const from = new Date(to.getTime() - query.days * 86400000);
    const predicate = sql`h.executed_at>=${from} and h.executed_at<=${to} and (${current.role === 'admin'} or h.user_id=${current.id}) and (${query.datasetId === undefined} or h.dataset_id=${query.datasetId ?? null}::uuid) and ${this.permissions.visible(current, sql`h.dataset_id`)}`;
    const total = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from search_history h where ${predicate}`,
    );
    const days = await db.execute<{ key: string; count: string }>(
      sql`select to_char(h.executed_at at time zone 'UTC','YYYY-MM-DD') as key,count(*)::text as count from search_history h where ${predicate} group by 1 order by 1 limit 367`,
    );
    const filters = await db.execute<{ key: string; count: string }>(
      sql`select f.key,count(*)::text as count from search_history h cross join lateral jsonb_array_elements_text(h.filter_keys) f(key) where ${predicate} group by f.key order by count(*) desc,f.key collate "C" limit 50`,
    );
    return {
      scope:
        current.role === 'admin'
          ? query.datasetId
            ? 'dataset'
            : 'platform'
          : 'own',
      from: from.toISOString(),
      to: to.toISOString(),
      total: total.rows[0]?.count ?? '0',
      byDay: days.rows,
      filters: filters.rows,
    };
  }
  async activity(user: CurrentUser, query: ActivityQuery) {
    return this.database.db.transaction(
      async (db) =>
        activityResponseSchema.parse({
          data: await this.activityData(user, query, db),
        }),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async dataset(user: CurrentUser, datasetId: string, query: AnalyticsQuery) {
    return this.database.db.transaction(
      async (db) => {
        await this.permissions.dataset(user, datasetId, 'analyze', db);
        const predicate = sql`${schema.datasetRecords.datasetId}=${datasetId} and ${this.permissions.visible(user, schema.datasetRecords.datasetId)}`;
        const total = await db.execute<{ count: string }>(
          sql`select count(*)::text as count from ${schema.datasetRecords} where ${predicate}`,
        );
        const totalRecords = total.rows[0]?.count ?? '0';
        const breakdown = async (column: ReturnType<typeof sql>) => {
          const rows = await db.execute<{ key: string | null; count: string }>(
            sql`select ${column} as key,count(*)::text as count from ${schema.datasetRecords} where ${predicate} group by ${column} order by count(*) desc,${column} collate "C" nulls last limit 50`,
          );
          const included = rows.rows.reduce(
            (sum, row) => sum + BigInt(row.count),
            0n,
          );
          return {
            buckets: rows.rows,
            otherCount: (BigInt(totalRecords) - included).toString(),
          };
        };
        const byCategory = await breakdown(
          sql`${schema.datasetRecords.category}`,
        );
        const byStatus = await breakdown(sql`${schema.datasetRecords.status}`);
        const from = new Date(Date.now() - query.days * 86400000);
        const growth = await db.execute<{ key: string; count: string }>(
          sql`select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as key,count(*)::text as count from ${schema.datasetRecords} where ${predicate} and created_at>=${from} and created_at<=now() group by 1 order by 1 limit 367`,
        );
        return datasetAnalyticsResponseSchema.parse({
          data: {
            datasetId,
            totalRecords,
            byCategory,
            byStatus,
            growth: growth.rows,
            searchActivity: await this.activityData(
              user,
              { ...query, datasetId },
              db,
            ),
          },
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async platform(user: CurrentUser) {
    return this.database.db.transaction(
      async (db) => {
        await this.permissions.admin(user, db);
        const result = await db.execute<{
          datasets: string;
          totalRecords: string;
          users: string;
          activeUsers: string;
        }>(
          sql`select (select count(*)::text from datasets) as datasets,(select count(*)::text from dataset_records) as "totalRecords",(select count(*)::text from users) as users,(select count(*)::text from users where is_active) as "activeUsers"`,
        );
        return platformAnalyticsResponseSchema.parse({ data: result.rows[0] });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
}
