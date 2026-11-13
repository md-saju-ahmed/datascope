import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import { historyResponseSchema } from '@datascope/contracts';
import type { CurrentUser, HistoryQuery } from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { offset, pageInfo } from '../../common/access.js';
@Injectable()
export class SearchHistoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
  ) {}
  async list(user: CurrentUser, query: HistoryQuery) {
    return this.database.db.transaction(
      async (db) => {
        const current = await this.permissions.current(user, db);
        const h = schema.searchHistory;
        const predicate = sql`${h.userId}=${current.id} and ${this.permissions.visible(current, sql`${h.datasetId}`)} and (${query.datasetId === undefined} or ${h.datasetId}=${query.datasetId ?? null}::uuid)
     and (${h.normalizedQuery}->>'savedViewId' is null or exists(select 1 from saved_views v where v.id::text=${h.normalizedQuery}->>'savedViewId' and (${current.role === 'admin'} or v.owner_id=${current.id} or exists(select 1 from saved_view_shares s where s.view_id=v.id and s.user_id=${current.id}))))`;
        const rows = await db
          .select()
          .from(h)
          .where(predicate)
          .orderBy(sql`${h.executedAt} desc`, sql`${h.id} desc`)
          .limit(query.pageSize)
          .offset(offset(query));
        const total = await db.execute<{ total: string }>(
          sql`select count(*)::text as total from ${h} where ${predicate}`,
        );
        return historyResponseSchema.parse({
          data: rows.map((row) => ({
            id: row.id.toString(),
            datasetId: row.datasetId,
            normalizedQuery: row.normalizedQuery,
            filterKeys: row.filterKeys,
            durationMs: row.durationMs,
            executedAt: row.executedAt.toISOString(),
          })),
          pageInfo: pageInfo(
            { page: query.page, pageSize: query.pageSize },
            Number(total.rows[0]?.total),
          ),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async clear(user: CurrentUser) {
    return this.database.db.transaction(async (db) => {
      const current = await this.permissions.current(user, db);
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${current.id},0))`,
      );
      const result = await db.execute<{ deleted: string }>(
        sql`with removed as (delete from search_history where user_id=${current.id} returning 1) select count(*)::text as deleted from removed`,
      );
      return { data: { deleted: result.rows[0]?.deleted ?? '0' } };
    });
  }
}
