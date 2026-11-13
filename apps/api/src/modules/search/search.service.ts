import { Inject, Injectable, Logger } from '@nestjs/common';
import { databaseForClient, schema, sql } from '@datascope/db';
import type {
  CurrentUser,
  SearchRequest,
  SearchResponse,
} from '@datascope/contracts';
import { searchResponseSchema } from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { APP_ENVIRONMENT } from '../../config/environment.js';
import type { AppEnvironment } from '../../config/environment.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { databaseConflict, pageInfo } from '../../common/access.js';
import { AuthFailure } from '../auth/auth-http.js';
import { RateWindows } from '../auth/auth-rate-limit.js';
import { requestContext } from '../../common/request-context.js';
import { compileSearch } from './search-compiler.js';
import { isAdvanced, validateSearch } from './search-validation.js';

@Injectable()
export class SearchService {
  private readonly windows = new RateWindows();
  private readonly logger = new Logger(SearchService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    @Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment,
  ) {}

  async search(
    user: CurrentUser,
    datasetId: string,
    input: SearchRequest,
    applied = false,
  ): Promise<SearchResponse> {
    const started = Date.now();
    const queryId = requestContext.getStore()?.requestId;
    if (!queryId) throw new Error('Request context required');
    const retry = this.windows.consume(user.id, 60, 60000);
    if (retry)
      throw new AuthFailure(
        429,
        'RATE_LIMITED',
        'Too many searches; try again later',
        [],
        retry,
      );
    const client = await this.database.pool.connect();
    const connection = { destroyed: false };
    // Destroying the active connection cancels its work; never release a timed-out query
    // to the pool while it is still executing, or race a cancellation against reuse.
    const deadline = setTimeout(
      () => {
        connection.destroyed = true;
        client.release(true);
      },
      Math.max(1, 10000 - (Date.now() - started)),
    );
    const db = databaseForClient(client);
    let status = 'failed';
    try {
      await client.query('begin isolation level repeatable read read only');
      await client.query("select set_config('statement_timeout', $1, true)", [
        String(this.environment.DB_STATEMENT_TIMEOUT_MS),
      ]);
      const access = await this.permissions.dataset(
        user,
        datasetId,
        isAdvanced(input) ? 'analyze' : 'read',
        db,
      );
      const fields = await db
        .select()
        .from(schema.datasetFields)
        .where(sql`${schema.datasetFields.datasetId} = ${datasetId}`)
        .limit(101);
      if (fields.length > 100) throw new Error('Field registry exceeds bound');
      const query = validateSearch(input, fields);
      const compiled = compileSearch(
        datasetId,
        query,
        fields,
        this.permissions.visible(access.user, schema.datasetRecords.datasetId),
      );
      const rows = await db.execute<{
        record: Record<string, string | boolean | null>;
      }>(compiled.rows);
      const count = await db.execute<{ total: string }>(compiled.count);
      const response = searchResponseSchema.parse({
        data: rows.rows.map((row) => row.record),
        pageInfo: pageInfo(
          { page: input.page, pageSize: input.pageSize },
          Number(count.rows[0]?.total),
        ),
        sort: query.sort,
        queryId,
      });
      await client.query('commit');
      if (applied) {
        await client.query('begin');
        await client.query("select set_config('statement_timeout', $1, true)", [
          String(this.environment.DB_STATEMENT_TIMEOUT_MS),
        ]);
        // Same user's concurrent searches serialize deduplication and retention.
        await db.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`,
        );
        await this.permissions.dataset(
          user,
          datasetId,
          isAdvanced(input) ? 'analyze' : 'read',
          db,
        );
        const normalized = {
          version: 1,
          q: query.q,
          conditions: query.conditions,
          sort: input.sort,
          columns: input.columns,
          pageSize: query.pageSize,
        };
        await db.execute(sql`insert into search_history(user_id,dataset_id,normalized_query,filter_keys,duration_ms)
          select ${user.id}, ${datasetId}, ${JSON.stringify(normalized)}::jsonb, ${JSON.stringify([...new Set(query.conditions.map((condition) => condition.field))])}::jsonb, ${Date.now() - started}
          where not exists (select 1 from search_history where user_id=${user.id} and dataset_id=${datasetId}
            and executed_at >= clock_timestamp() - interval '60 seconds'
            and normalized_query->'q' = ${JSON.stringify(query.q)}::jsonb
            and normalized_query->'conditions' = ${JSON.stringify(query.conditions)}::jsonb)`);
        await db.execute(sql`delete from search_history where user_id=${user.id} and id not in
          (select id from search_history where user_id=${user.id} order by executed_at desc,id desc limit 100)`);
        await client.query('commit');
      }
      if (connection.destroyed) throw new Error('Search deadline exceeded');
      status = 'completed';
      return response;
    } catch (error) {
      if (!connection.destroyed)
        await client.query('rollback').catch(() => undefined);
      if (connection.destroyed)
        throw new AuthFailure(
          503,
          'SEARCH_TIMEOUT',
          'Search timed out; narrow the query and try again',
        );
      return databaseConflict(error);
    } finally {
      clearTimeout(deadline);
      if (!connection.destroyed) client.release();
      this.logger.log(
        JSON.stringify({
          event: 'search_execution',
          requestId: queryId,
          status,
          durationMs: Date.now() - started,
        }),
      );
    }
  }
}
