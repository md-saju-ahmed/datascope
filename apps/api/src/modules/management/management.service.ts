import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import {
  preferencesSchema,
  settingsSchema,
  usersResponseSchema,
  userResponseSchema,
  preferencesResponseSchema,
  settingsResponseSchema,
} from '@datascope/contracts';
import type {
  CurrentUser,
  UsersQuery,
  UserPatch,
  PreferencePatch,
  SettingsPatch,
} from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { SecurityAudit } from '../permissions/security-audit.service.js';
import { AuthFailure, validated } from '../auth/auth-http.js';
import { notFound, offset, pageInfo } from '../../common/access.js';
const projection = {
  id: schema.users.id,
  email: schema.users.email,
  role: schema.users.role,
  isActive: schema.users.isActive,
  createdAt: schema.users.createdAt,
  updatedAt: schema.users.updatedAt,
};
type UserRow = Pick<typeof schema.users.$inferSelect, keyof typeof projection>;
const dto = (row: UserRow) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
@Injectable()
export class ManagementService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly audit: SecurityAudit,
  ) {}
  async users(user: CurrentUser, query: UsersQuery) {
    return this.database.db.transaction(
      async (db) => {
        await this.permissions.admin(user, db);
        const pattern = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
        const predicate = sql`${schema.users.email} ilike ${pattern} escape '\\'`;
        const rows = await db
          .select(projection)
          .from(schema.users)
          .where(predicate)
          .orderBy(schema.users.email, schema.users.id)
          .limit(query.pageSize)
          .offset(offset(query));
        const total = await db.execute<{ total: string }>(
          sql`select count(*)::text as total from users where ${predicate}`,
        );
        return usersResponseSchema.parse({
          data: rows.map(dto),
          pageInfo: pageInfo(
            { page: query.page, pageSize: query.pageSize },
            Number(total.rows[0]?.total),
          ),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async patchUser(user: CurrentUser, id: string, patch: UserPatch) {
    return this.database.db.transaction(async (db) => {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('datascope.admin-management',0))`,
      );
      await this.permissions.admin(user, db, true);
      const [target] = await db
        .select(projection)
        .from(schema.users)
        .where(sql`${schema.users.id}=${id}`)
        .for('update');
      if (!target) notFound();
      if (
        target.role === 'admin' &&
        target.isActive &&
        ((patch.role !== undefined && patch.role !== 'admin') ||
          patch.isActive === false)
      ) {
        const count = await db.execute<{ total: string }>(
          sql`select count(*)::text as total from users where role='admin' and is_active`,
        );
        if (BigInt(count.rows[0]?.total ?? '0') <= 1n)
          throw new AuthFailure(
            409,
            'LAST_ADMIN',
            'At least one active administrator is required',
          );
      }
      const [row] = await db
        .update(schema.users)
        .set(patch)
        .where(sql`${schema.users.id}=${id}`)
        .returning(projection);
      if (!row) notFound();
      if (!row.isActive)
        await db
          .update(schema.authSessions)
          .set({ revokedAt: new Date() })
          .where(
            sql`${schema.authSessions.userId}=${id} and ${schema.authSessions.revokedAt} is null`,
          );
      this.audit.record(user.id, 'user.access.update', id, {
        role: row.role,
        isActive: String(row.isActive),
      });
      return userResponseSchema.parse({ data: dto(row) });
    });
  }
  async preferences(user: CurrentUser) {
    return this.database.db.transaction(
      async (db) => {
        const current = await this.permissions.current(user, db);
        const row = await db.query.userPreferences.findFirst({
          where: sql`${schema.userPreferences.userId}=${current.id}`,
        });
        const prefs = validated(preferencesSchema, row?.preferences ?? {});
        if (prefs.defaultDatasetId) {
          const visible = await db
            .select({ id: schema.datasets.id })
            .from(schema.datasets)
            .where(
              sql`${schema.datasets.id}=${prefs.defaultDatasetId} and ${this.permissions.visible(current, schema.datasets.id)}`,
            )
            .limit(1);
          if (!visible.length) prefs.defaultDatasetId = null;
        }
        return preferencesResponseSchema.parse({ data: prefs });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async patchPreferences(user: CurrentUser, patch: PreferencePatch) {
    return this.database.db.transaction(async (db) => {
      const current = await this.permissions.current(user, db, true);
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`preferences:${user.id}`},0))`,
      );
      if (patch.defaultDatasetId)
        await this.permissions.dataset(
          current,
          patch.defaultDatasetId,
          'read',
          db,
        );
      const row = await db.query.userPreferences.findFirst({
        where: sql`${schema.userPreferences.userId}=${user.id}`,
      });
      const prefs = validated(preferencesSchema, {
        ...validated(preferencesSchema, row?.preferences ?? {}),
        ...patch,
      });
      await db
        .insert(schema.userPreferences)
        .values({ userId: user.id, preferences: prefs })
        .onConflictDoUpdate({
          target: schema.userPreferences.userId,
          set: { preferences: prefs },
        });
      return preferencesResponseSchema.parse({ data: prefs });
    });
  }
  async settings(user: CurrentUser) {
    await this.permissions.admin(user);
    const rows = await this.database.db
      .select({
        key: schema.systemSettings.key,
        value: schema.systemSettings.value,
      })
      .from(schema.systemSettings)
      .where(
        sql`${schema.systemSettings.key} in ('registration.enabled','exports.max_selected_rows')`,
      )
      .limit(2);
    return settingsResponseSchema.parse({
      data: validated(
        settingsSchema,
        Object.fromEntries(rows.map((row) => [row.key, row.value])),
      ),
    });
  }
  async patchSettings(user: CurrentUser, patch: SettingsPatch) {
    return this.database.db.transaction(async (db) => {
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('datascope.registration',0))`,
      );
      await this.permissions.admin(user, db, true);
      for (const [key, value] of Object.entries(patch))
        await db
          .insert(schema.systemSettings)
          .values({ key, value, updatedBy: user.id })
          .onConflictDoUpdate({
            target: schema.systemSettings.key,
            set: { value, updatedBy: user.id },
          });
      const rows = await db
        .select({
          key: schema.systemSettings.key,
          value: schema.systemSettings.value,
        })
        .from(schema.systemSettings)
        .where(
          sql`${schema.systemSettings.key} in ('registration.enabled','exports.max_selected_rows')`,
        )
        .limit(2);
      this.audit.record(user.id, 'system.settings.update', 'platform');
      return settingsResponseSchema.parse({
        data: validated(
          settingsSchema,
          Object.fromEntries(rows.map((row) => [row.key, row.value])),
        ),
      });
    });
  }
}
