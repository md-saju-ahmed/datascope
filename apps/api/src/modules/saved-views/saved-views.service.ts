import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import {
  savedConfigSchema,
  searchRequestSchema,
  viewResponseSchema,
  viewListResponseSchema,
  shareResponseSchema,
} from '@datascope/contracts';
import type {
  CurrentUser,
  ViewCreate,
  ViewPatch,
  ViewListQuery,
  SavedConfig,
} from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import type { DataContext } from '../permissions/permissions.service.js';
import { SecurityAudit } from '../permissions/security-audit.service.js';
import {
  forbidden,
  notFound,
  offset,
  pageInfo,
  databaseConflict,
} from '../../common/access.js';
import { validated } from '../auth/auth-http.js';
import { validateSearch, isAdvanced } from '../search/search-validation.js';

@Injectable()
export class SavedViewsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly audit: SecurityAudit,
  ) {}
  private dto(row: typeof schema.savedViews.$inferSelect) {
    return {
      ...row,
      config: validated(savedConfigSchema, row.config),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private async config(
    user: CurrentUser,
    datasetId: string,
    config: SavedConfig,
    db: DataContext,
  ) {
    const { version, ...input } = config;
    const query = validated(searchRequestSchema, input);
    const access = await this.permissions.dataset(
      user,
      datasetId,
      isAdvanced(query) ? 'analyze' : 'read',
      db,
    );
    if (!['admin', 'analyst'].includes(access.user.role)) forbidden();
    const fields = await db
      .select()
      .from(schema.datasetFields)
      .where(sql`${schema.datasetFields.datasetId}=${datasetId}`)
      .limit(101);
    if (fields.length > 100) throw new Error('Field cap exceeded');
    const normalized = validateSearch(query, fields);
    return {
      version,
      q: normalized.q,
      conditions: normalized.conditions,
      sort: query.sort,
      columns: query.columns,
      pageSize: query.pageSize,
    };
  }
  async list(user: CurrentUser, query: ViewListQuery) {
    return this.database.db.transaction(
      async (db) => {
        const current = await this.permissions.current(user, db);
        const views = schema.savedViews;
        const predicate = sql`${this.permissions.visible(current, sql`${views.datasetId}`)} and (${current.role === 'admin'} or ${views.ownerId}=${current.id} or exists(select 1 from saved_view_shares where view_id=${views.id} and user_id=${current.id})) and (${query.datasetId === undefined} or ${views.datasetId}=${query.datasetId ?? null}::uuid)`;
        const rows = await db
          .select()
          .from(views)
          .where(predicate)
          .orderBy(sql`${views.updatedAt} desc`, sql`${views.id} desc`)
          .limit(query.pageSize)
          .offset(offset(query));
        const count = await db.execute<{ total: string }>(
          sql`select count(*)::text as total from ${views} where ${predicate}`,
        );
        return viewListResponseSchema.parse({
          data: rows.map((row) => this.dto(row)),
          pageInfo: pageInfo(
            { page: query.page, pageSize: query.pageSize },
            Number(count.rows[0]?.total),
          ),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async get(user: CurrentUser, id: string) {
    return this.database.db.transaction(
      async (db) =>
        viewResponseSchema.parse({
          data: this.dto(
            await this.permissions.ownedOrShared(user, id, false, db),
          ),
        }),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async create(user: CurrentUser, body: ViewCreate) {
    try {
      const result = await this.database.db.transaction(async (db) => {
        const current = await this.permissions.current(user, db, true);
        const config = await this.config(
          current,
          body.datasetId,
          body.config,
          db,
        );
        const [row] = await db
          .insert(schema.savedViews)
          .values({ ...body, ownerId: current.id, config })
          .returning();
        if (!row) throw new Error('View creation failed');
        return viewResponseSchema.parse({ data: this.dto(row) });
      });
      this.audit.record(user.id, 'saved-view.create', result.data.id);
      return result;
    } catch (error) {
      return databaseConflict(error);
    }
  }
  async patch(user: CurrentUser, id: string, body: ViewPatch) {
    return this.database.db.transaction(async (db) => {
      await db
        .select({ id: schema.savedViews.id })
        .from(schema.savedViews)
        .where(sql`${schema.savedViews.id}=${id}`)
        .for('update');
      const previous = await this.permissions.ownedOrShared(user, id, true, db);
      const config = await this.config(
        user,
        previous.datasetId,
        body.config ?? validated(savedConfigSchema, previous.config),
        db,
      );
      const [row] = await db
        .update(schema.savedViews)
        .set({ name: body.name ?? previous.name, config })
        .where(sql`${schema.savedViews.id}=${id}`)
        .returning();
      if (!row) notFound();
      this.audit.record(user.id, 'saved-view.update', id);
      return viewResponseSchema.parse({ data: this.dto(row) });
    });
  }
  async remove(user: CurrentUser, id: string) {
    return this.database.db.transaction(async (db) => {
      await db
        .select({ id: schema.savedViews.id })
        .from(schema.savedViews)
        .where(sql`${schema.savedViews.id}=${id}`)
        .for('update');
      await this.permissions.ownedOrShared(user, id, true, db);
      await db
        .delete(schema.savedViews)
        .where(sql`${schema.savedViews.id}=${id}`);
      this.audit.record(user.id, 'saved-view.delete', id);
      return { data: { deleted: true as const } };
    });
  }
  async share(user: CurrentUser, id: string, userId: string, remove = false) {
    return this.database.db.transaction(async (db) => {
      await db
        .select({ id: schema.savedViews.id })
        .from(schema.savedViews)
        .where(sql`${schema.savedViews.id}=${id}`)
        .for('update');
      const view = await this.permissions.ownedOrShared(user, id, true, db);
      if (remove) {
        await db
          .delete(schema.savedViewShares)
          .where(
            sql`${schema.savedViewShares.viewId}=${id} and ${schema.savedViewShares.userId}=${userId}`,
          );
        this.audit.record(user.id, 'saved-view.share.revoke', id, {
          recipientId: userId,
        });
        return { data: { deleted: true as const } };
      }
      const [recipient] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          role: schema.users.role,
        })
        .from(schema.users)
        .where(
          sql`${schema.users.id}=${userId} and ${schema.users.isActive}=true`,
        )
        .for('share');
      if (!recipient) notFound();
      await this.permissions.dataset(recipient, view.datasetId, 'read', db);
      await db
        .insert(schema.savedViewShares)
        .values({ viewId: id, userId })
        .onConflictDoNothing();
      const row = await db.query.savedViewShares.findFirst({
        where: sql`${schema.savedViewShares.viewId}=${id} and ${schema.savedViewShares.userId}=${userId}`,
      });
      if (!row) throw new Error('Share creation failed');
      this.audit.record(user.id, 'saved-view.share', id, {
        recipientId: userId,
      });
      return shareResponseSchema.parse({
        data: { ...row, createdAt: row.createdAt.toISOString() },
      });
    });
  }
}
