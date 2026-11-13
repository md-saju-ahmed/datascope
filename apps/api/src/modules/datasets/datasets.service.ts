import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import { fieldCreateSchema } from '@datascope/contracts';
import type {
  CurrentUser,
  Dataset,
  DatasetCreate,
  DatasetPatch,
  DatasetListQuery,
  DatasetField,
  FieldCreate,
  FieldPatch,
  PageQuery,
  Permission,
  Grant,
} from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { SecurityAudit } from '../permissions/security-audit.service.js';
import {
  databaseConflict,
  notFound,
  offset,
  pageInfo,
  forbidden,
} from '../../common/access.js';
import { AuthFailure, validated } from '../auth/auth-http.js';

type DatasetRow = typeof schema.datasets.$inferSelect;
type FieldRow = typeof schema.datasetFields.$inferSelect;
type GrantRow = typeof schema.datasetPermissions.$inferSelect;
export function datasetDto(row: DatasetRow, permission: Permission): Dataset {
  return {
    ...row,
    recordCount: row.recordCount.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    effectivePermission: permission,
  };
}
export function fieldDto(row: FieldRow): DatasetField {
  return {
    ...fieldCore(row),
    id: row.id,
    datasetId: row.datasetId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function fieldCore(row: FieldRow): FieldCreate {
  // Parse operator enums, but never advertise a malformed persisted metadata definition.
  return validated(fieldCreateSchema, {
    fieldKey: row.fieldKey,
    label: row.label,
    dataType: row.dataType,
    operators: row.operators,
    isSearchable: row.isSearchable,
    isFilterable: row.isFilterable,
    isSortable: row.isSortable,
    isVisible: row.isVisible,
    sortOrder: row.sortOrder,
  });
}
function grantDto(row: GrantRow): Grant {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class DatasetsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly permissions: PermissionsService,
    private readonly audit: SecurityAudit,
  ) {}

  async list(user: CurrentUser, query: DatasetListQuery) {
    const current = await this.permissions.current(user);
    if (query.includeArchived && current.role !== 'admin') forbidden();
    const predicate = sql`${this.permissions.visible(current, schema.datasets.id)} and (${query.includeArchived} or ${schema.datasets.isArchived} = false)`;
    const rows = await this.database.db
      .select({
        dataset: schema.datasets,
        permission: schema.datasetPermissions.permission,
      })
      .from(schema.datasets)
      .leftJoin(
        schema.datasetPermissions,
        sql`${schema.datasetPermissions.datasetId} = ${schema.datasets.id} and ${schema.datasetPermissions.userId} = ${current.id}`,
      )
      .where(predicate)
      .orderBy(schema.datasets.name, schema.datasets.id)
      .limit(query.pageSize)
      .offset(offset(query));
    const totals = await this.database.db.execute<{ total: string }>(
      sql`select count(*)::text as total from datasets where ${predicate}`,
    );
    if (current.role === 'admin')
      this.audit.record(current.id, 'datasets.admin.list', 'platform');
    return {
      data: rows.map((row) =>
        datasetDto(
          row.dataset,
          current.role === 'admin' ? 'manage' : (row.permission ?? 'read'),
        ),
      ),
      pageInfo: pageInfo(
        { page: query.page, pageSize: query.pageSize },
        Number(totals.rows[0]?.total ?? 0),
      ),
    };
  }

  async get(user: CurrentUser, id: string) {
    const access = await this.permissions.dataset(user, id);
    return { data: datasetDto(access.dataset, access.effectivePermission) };
  }

  async create(user: CurrentUser, body: DatasetCreate) {
    try {
      const row = await this.database.db.transaction(async (db) => {
        await this.permissions.admin(user, db, true);
        const [created] = await db
          .insert(schema.datasets)
          .values(body)
          .returning();
        if (!created) throw new Error('Dataset insertion failed');
        return created;
      });
      this.audit.record(user.id, 'dataset.create', row.id);
      return { data: datasetDto(row, 'manage') };
    } catch (error) {
      databaseConflict(error);
    }
  }

  async patch(user: CurrentUser, id: string, body: DatasetPatch) {
    try {
      const row = await this.database.db.transaction(async (db) => {
        await this.permissions.admin(user, db, true);
        const [changed] = await db
          .update(schema.datasets)
          .set(body)
          .where(sql`${schema.datasets.id} = ${id}`)
          .returning();
        if (!changed) notFound();
        return changed;
      });
      this.audit.record(user.id, 'dataset.update', id);
      return { data: datasetDto(row, 'manage') };
    } catch (error) {
      databaseConflict(error);
    }
  }

  async archive(user: CurrentUser, id: string) {
    const row = await this.database.db.transaction(async (db) => {
      await this.permissions.admin(user, db, true);
      const [changed] = await db
        .update(schema.datasets)
        .set({ isArchived: true })
        .where(sql`${schema.datasets.id} = ${id}`)
        .returning();
      if (!changed) notFound();
      return changed;
    });
    this.audit.record(user.id, 'dataset.archive', id);
    return { data: datasetDto(row, 'manage') };
  }

  async fields(user: CurrentUser, id: string, query: PageQuery) {
    await this.permissions.dataset(user, id);
    const rows = await this.database.db.query.datasetFields.findMany({
      where: sql`${schema.datasetFields.datasetId} = ${id}`,
      orderBy: [schema.datasetFields.sortOrder, schema.datasetFields.id],
      limit: query.pageSize,
      offset: offset(query),
    });
    const total = await this.database.db.execute<{ total: string }>(
      sql`select count(*)::text as total from dataset_fields where dataset_id = ${id}`,
    );
    return {
      data: rows.map(fieldDto),
      pageInfo: pageInfo(query, Number(total.rows[0]?.total ?? 0)),
    };
  }

  async createField(user: CurrentUser, id: string, body: FieldCreate) {
    try {
      const row = await this.database.db.transaction(async (db) => {
        await this.permissions.admin(user, db, true);
        // Serialize the field cap, metadata-trigger refresh and archival for this dataset.
        const [dataset] = await db
          .select({ id: schema.datasets.id })
          .from(schema.datasets)
          .where(sql`${schema.datasets.id} = ${id}`)
          .for('update');
        if (!dataset) notFound();
        const count = await db.execute<{ total: string }>(
          sql`select count(*)::text as total from dataset_fields where dataset_id = ${id}`,
        );
        if (Number(count.rows[0]?.total ?? 0) >= 100)
          throw new AuthFailure(
            400,
            'FIELD_LIMIT',
            'Dataset field limit reached',
          );
        const [created] = await db
          .insert(schema.datasetFields)
          .values({ ...body, datasetId: id })
          .returning();
        if (!created) throw new Error('Field insertion failed');
        return created;
      });
      this.audit.record(user.id, 'dataset.field.create', id, {
        fieldId: row.id,
      });
      return { data: fieldDto(row) };
    } catch (error) {
      databaseConflict(error);
    }
  }

  async patchField(
    user: CurrentUser,
    id: string,
    fieldId: string,
    body: FieldPatch,
  ) {
    try {
      const row = await this.database.db.transaction(async (db) => {
        await this.permissions.admin(user, db, true);
        const [dataset] = await db
          .select({ id: schema.datasets.id })
          .from(schema.datasets)
          .where(sql`${schema.datasets.id} = ${id}`)
          .for('update');
        if (!dataset) notFound();
        const previous = await db.query.datasetFields.findFirst({
          where: sql`${schema.datasetFields.id} = ${fieldId} and ${schema.datasetFields.datasetId} = ${id}`,
        });
        if (!previous) notFound();
        const merged = validated(fieldCreateSchema, {
          ...fieldCore(previous),
          ...body,
        });
        const [changed] = await db
          .update(schema.datasetFields)
          .set(merged)
          .where(
            sql`${schema.datasetFields.id} = ${fieldId} and ${schema.datasetFields.datasetId} = ${id}`,
          )
          .returning();
        if (!changed) notFound();
        return changed;
      });
      this.audit.record(user.id, 'dataset.field.update', id, { fieldId });
      return { data: fieldDto(row) };
    } catch (error) {
      databaseConflict(error);
    }
  }

  async grants(user: CurrentUser, id: string, query: PageQuery) {
    await this.permissions.admin(user);
    await this.permissions.dataset(user, id);
    const rows = await this.database.db.query.datasetPermissions.findMany({
      where: sql`${schema.datasetPermissions.datasetId} = ${id}`,
      orderBy: [schema.datasetPermissions.userId],
      limit: query.pageSize,
      offset: offset(query),
    });
    const count = await this.database.db.execute<{ total: string }>(
      sql`select count(*)::text as total from dataset_permissions where dataset_id = ${id}`,
    );
    return {
      data: rows.map(grantDto),
      pageInfo: pageInfo(query, Number(count.rows[0]?.total ?? 0)),
    };
  }

  async grant(
    user: CurrentUser,
    id: string,
    userId: string,
    permission: Permission,
  ) {
    const row = await this.database.db.transaction(async (db) => {
      await this.permissions.admin(user, db, true);
      const [dataset] = await db
        .select({ id: schema.datasets.id })
        .from(schema.datasets)
        .where(sql`${schema.datasets.id} = ${id}`)
        .for('update');
      if (!dataset) notFound();
      const [recipient] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          sql`${schema.users.id} = ${userId} and ${schema.users.isActive} = true`,
        )
        .for('share');
      if (!recipient) notFound();
      const [changed] = await db
        .insert(schema.datasetPermissions)
        .values({ datasetId: id, userId, permission, grantedBy: user.id })
        .onConflictDoUpdate({
          target: [
            schema.datasetPermissions.datasetId,
            schema.datasetPermissions.userId,
          ],
          set: { permission, grantedBy: user.id },
        })
        .returning();
      if (!changed) throw new Error('Permission update failed');
      return changed;
    });
    this.audit.record(user.id, 'dataset.grant.upsert', id, {
      recipientId: userId,
      permission,
    });
    return { data: grantDto(row) };
  }

  async revoke(user: CurrentUser, id: string, userId: string) {
    await this.database.db.transaction(async (db) => {
      await this.permissions.admin(user, db, true);
      const [dataset] = await db
        .select({ id: schema.datasets.id })
        .from(schema.datasets)
        .where(sql`${schema.datasets.id} = ${id}`)
        .for('update');
      if (!dataset) notFound();
      await db
        .delete(schema.datasetPermissions)
        .where(
          sql`${schema.datasetPermissions.datasetId} = ${id} and ${schema.datasetPermissions.userId} = ${userId}`,
        );
    });
    this.audit.record(user.id, 'dataset.grant.revoke', id, {
      recipientId: userId,
    });
    return { data: { revoked: true as const } };
  }
}
