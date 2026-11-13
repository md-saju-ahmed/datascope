import { Injectable } from '@nestjs/common';
import { schema, sql } from '@datascope/db';
import type { Database } from '@datascope/db';
import type { CurrentUser, Permission } from '@datascope/contracts';
import { DatabaseService } from '../../database/database.service.js';
import { AuthFailure } from '../auth/auth-http.js';
import { forbidden, notFound } from '../../common/access.js';
import { SecurityAudit } from './security-audit.service.js';

const levels = { read: 0, analyze: 1, manage: 2 };
export type DataContext = Pick<
  Database,
  'select' | 'insert' | 'update' | 'delete' | 'query' | 'execute'
>;

export function permits(
  role: CurrentUser['role'],
  grant: Permission | undefined,
  action: Permission,
): boolean {
  return (
    role === 'admin' ||
    (grant !== undefined &&
      levels[grant] >= levels[action] &&
      (action === 'read' || role === 'analyst'))
  );
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: SecurityAudit,
  ) {}

  async current(
    user: CurrentUser,
    db: DataContext = this.database.db,
    lock = false,
  ): Promise<CurrentUser> {
    const query = db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(
        sql`${schema.users.id} = ${user.id} and ${schema.users.isActive} = true`,
      );
    const [row] = await (lock ? query.for('share') : query);
    if (!row)
      throw new AuthFailure(401, 'UNAUTHENTICATED', 'Authentication required');
    return row;
  }

  async admin(
    user: CurrentUser,
    db: DataContext = this.database.db,
    lock = false,
  ): Promise<CurrentUser> {
    const current = await this.current(user, db, lock);
    if (current.role !== 'admin') forbidden();
    return current;
  }

  // Reusable SQL authorization predicate: used before count/pagination, never JS filtering.
  visible(
    user: CurrentUser,
    datasetId:
      | ReturnType<typeof sql>
      | typeof schema.datasets.id
      | typeof schema.datasetRecords.datasetId,
  ) {
    return sql`exists (select 1 from users access_user join datasets access_dataset on access_dataset.id = ${datasetId}
      where access_user.id = ${user.id} and access_user.is_active = true and
      (access_user.role = 'admin' or (access_dataset.is_archived = false and exists
        (select 1 from dataset_permissions access_grant where access_grant.dataset_id = access_dataset.id and access_grant.user_id = access_user.id))))`;
  }

  async dataset(
    user: CurrentUser,
    datasetId: string,
    action: Permission = 'read',
    db: DataContext = this.database.db,
  ) {
    const current = await this.current(user, db);
    const row = await db.query.datasets.findFirst({
      where: sql`${schema.datasets.id} = ${datasetId}`,
    });
    if (!row || (row.isArchived && current.role !== 'admin')) notFound();
    const grant =
      current.role === 'admin'
        ? undefined
        : await db.query.datasetPermissions.findFirst({
            where: sql`${schema.datasetPermissions.datasetId} = ${datasetId} and ${schema.datasetPermissions.userId} = ${current.id}`,
          });
    if (current.role !== 'admin' && !grant) notFound();
    if (!permits(current.role, grant?.permission, action)) forbidden();
    if (current.role === 'admin')
      this.audit.record(current.id, `dataset.admin.${action}`, datasetId);
    return {
      dataset: row,
      effectivePermission:
        current.role === 'admin'
          ? ('manage' as const)
          : (grant?.permission ?? 'read'),
      user: current,
    };
  }

  async ownedOrShared(
    user: CurrentUser,
    viewId: string,
    write = false,
    db: DataContext = this.database.db,
  ) {
    const current = await this.current(user, db);
    const view = await db.query.savedViews.findFirst({
      where: sql`${schema.savedViews.id} = ${viewId}`,
    });
    if (!view) notFound();
    await this.dataset(current, view.datasetId, 'read', db);
    if (current.role === 'admin') {
      this.audit.record(current.id, 'saved-view.admin.access', viewId);
      return view;
    }
    if (write && current.role !== 'analyst') forbidden();
    if (view.ownerId === current.id) return view;
    if (write) notFound();
    const share = await db.query.savedViewShares.findFirst({
      where: sql`${schema.savedViewShares.viewId} = ${viewId} and ${schema.savedViewShares.userId} = ${current.id}`,
    });
    if (!share) notFound();
    return view;
  }
}
