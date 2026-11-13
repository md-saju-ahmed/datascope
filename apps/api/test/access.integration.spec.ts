import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  createDatabase,
  localMigrationUrl,
  migrateDatabase,
  schema,
  sql,
} from '@datascope/db';
import type { Database } from '@datascope/db';
import {
  apiErrorSchema,
  datasetResponseSchema,
  datasetListResponseSchema,
  fieldResponseSchema,
  fieldListResponseSchema,
  grantListResponseSchema,
  grantResponseSchema,
  recordResponseSchema,
  relatedListResponseSchema,
  changesResponseSchema,
  revokedResponseSchema,
} from '@datascope/contracts';
import type { CurrentUser } from '@datascope/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';
import { PermissionsModule } from '../src/modules/permissions/permissions.module.js';
import { PermissionsService } from '../src/modules/permissions/permissions.service.js';
import { DatasetAccessGuard } from '../src/modules/permissions/access.guards.js';
import { SessionGuard } from '../src/modules/auth/session.guard.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { DatasetAction } from '../src/common/access.js';
import { administerDisposableDatabase } from './support/disposable-database.js';
import { ApiClient } from './support/api-client.js';

// Test-only routes exercise reusable guards for later modules; no production feature stub.
@Controller('verification/datasets/:datasetId')
@UseGuards(SessionGuard, DatasetAccessGuard)
class ActionProbe {
  @Get('analyze')
  @DatasetAction('analyze')
  analyze() {
    return { authorized: true };
  }
  @Get('manage')
  @DatasetAction('manage')
  manage() {
    return { authorized: true };
  }
}

const freshName = `datascope_test_access_${randomUUID().replaceAll('-', '')}`;
const datasetPath = (id: string) => `/api/v1/datasets/${id}`;
const recordPath = (id: string, record: string) =>
  `${datasetPath(id)}/records/${record}`;
const auditEvents: string[] = [];

describe('BE-07/08/09 real PostgreSQL authorization and data APIs', () => {
  let created = false;
  let fixtureDb: ReturnType<typeof createDatabase> | undefined;
  let app: INestApplication<Server>;
  let closeApp: (() => Promise<void>) | undefined;
  let db: Database;
  let admin: ApiClient;
  let analyst: ApiClient;
  let viewer: ApiClient;
  let outsider: ApiClient;
  let adminUser: CurrentUser;
  let analystUser: CurrentUser;
  let viewerUser: CurrentUser;
  let outsiderUser: CurrentUser;
  let fixture: Awaited<ReturnType<typeof makeFixture>>;

  beforeAll(async () => {
    const url = new URL(localMigrationUrl(process.env, true));
    administerDisposableDatabase(freshName, true);
    created = true;
    url.pathname = `/${freshName}`;
    fixtureDb = createDatabase({
      connectionString: url.toString(),
      max: 3,
      connectionTimeoutMillis: 2000,
      statementTimeoutMillis: 10000,
    });
    db = fixtureDb.db;
    await migrateDatabase(fixtureDb.pool);
    const module = await Test.createTestingModule({
      imports: [AppModule, PermissionsModule],
      controllers: [ActionProbe],
    })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: url.toString(),
          DB_STATEMENT_TIMEOUT_MS: 10000,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    closeApp = () => app.close();
    // Capture actual structured logger output; authorization and SQL remain real.
    app.useLogger({
      log(message: unknown) {
        if (
          typeof message === 'string' &&
          message.includes('"event":"security_audit"')
        )
          auditEvents.push(message);
      },
      error() {},
      warn() {},
    });
    configureApp(app);
    await app.init();
    [adminUser, admin] = await account('admin');
    [analystUser, analyst] = await account('analyst');
    [viewerUser, viewer] = await account('viewer');
    [outsiderUser, outsider] = await account('analyst');
  });

  beforeEach(async () => {
    fixture = await makeFixture();
  });

  afterAll(async () => {
    try {
      if (closeApp) await closeApp();
    } finally {
      try {
        if (fixtureDb) await fixtureDb.pool.end();
      } finally {
        if (created) administerDisposableDatabase(freshName, false);
      }
    }
  });

  async function account(
    role: CurrentUser['role'],
  ): Promise<[CurrentUser, ApiClient]> {
    const user = {
      id: randomUUID(),
      email: `access-${randomUUID()}@example.test`,
      role,
    };
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await app.get(PasswordService).hash(password);
    await db.insert(schema.users).values({ ...user, passwordHash });
    const client = new ApiClient(app.getHttpServer());
    await client.login(user.email, password);
    return [user, client];
  }

  async function makeFixture() {
    const primary = randomUUID();
    const hidden = randomUUID();
    await db.insert(schema.datasets).values([
      {
        id: primary,
        name: 'Accessible fixture',
        slug: `primary-${primary}`,
        source: 'access-test',
        recordCount: 2n,
      },
      {
        id: hidden,
        name: 'Secret dataset title',
        slug: `hidden-${hidden}`,
        source: 'access-test',
        recordCount: 1n,
      },
    ]);
    const fields = await db
      .insert(schema.datasetFields)
      .values([
        {
          datasetId: primary,
          fieldKey: 'name',
          label: 'Name',
          dataType: 'string',
          isSearchable: true,
          isFilterable: true,
          operators: ['eq', 'contains'],
          isSortable: true,
        },
        {
          datasetId: hidden,
          fieldKey: 'name',
          label: 'Hidden name',
          dataType: 'string',
          isSearchable: true,
        },
      ])
      .returning();
    await db.insert(schema.datasetPermissions).values([
      {
        datasetId: primary,
        userId: viewerUser.id,
        permission: 'read',
        grantedBy: adminUser.id,
      },
      {
        datasetId: primary,
        userId: analystUser.id,
        permission: 'analyze',
        grantedBy: adminUser.id,
      },
    ]);
    const rows = await db
      .insert(schema.datasetRecords)
      .values([
        {
          datasetId: primary,
          name: 'Original record',
          status: 'Pending',
          revenue: '9999999999999999.99',
          attributes: { employeeCount: 20, note: 'Complete detail' },
        },
        { datasetId: primary, name: 'Visible related record' },
        { datasetId: hidden, name: 'Secret target identity' },
      ])
      .returning({ id: schema.datasetRecords.id });
    const first = rows[0]?.id;
    const second = rows[1]?.id;
    const secret = rows[2]?.id;
    if (!first || !second || !secret || !fields[0] || !fields[1])
      throw new Error('Fixture insertion failed');
    await db
      .update(schema.datasetRecords)
      .set({ status: 'Active' })
      .where(sql`${schema.datasetRecords.id} = ${first}`);
    await db.insert(schema.recordChanges).values({
      recordId: first,
      actorUserId: adminUser.id,
      changes: { status: { before: 'Pending', after: 'Active' } },
    });
    // Hidden relationship first ensures filtering must happen before LIMIT/OFFSET.
    await db.insert(schema.recordRelationships).values([
      {
        sourceRecordId: first,
        targetRecordId: secret,
        relationType: 'secret-relation-type',
      },
      { sourceRecordId: first, targetRecordId: second, relationType: 'peer' },
    ]);
    return {
      primary,
      hidden,
      first: first.toString(),
      second: second.toString(),
      secret: secret.toString(),
      field: fields[0].id,
      hiddenField: fields[1].id,
    };
  }

  function error(response: Response, status: number, code: string): void {
    expect(response.status).toBe(status);
    const parsed = apiErrorSchema.parse(response.body);
    expect(parsed.code).toBe(code);
    expect(parsed.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toMatch(
      /Secret dataset title|Secret target identity|secret-relation-type|password_hash|token_hash|postgresql:|stack|select |insert /i,
    );
  }

  it.each([
    '/api/v1/datasets',
    'detail',
    'fields',
    'permissions',
    'record',
    'related',
    'changes',
  ])('requires authentication for %s', async (endpoint) => {
    const paths: Record<string, string> = {
      detail: datasetPath(fixture.primary),
      fields: `${datasetPath(fixture.primary)}/fields`,
      permissions: `${datasetPath(fixture.primary)}/permissions`,
      record: recordPath(fixture.primary, fixture.first),
      related: `${recordPath(fixture.primary, fixture.first)}/related`,
      changes: `${recordPath(fixture.primary, fixture.first)}/changes`,
    };
    error(
      await request(app.getHttpServer()).get(paths[endpoint] ?? endpoint),
      401,
      'UNAUTHENTICATED',
    );
  });

  it('lists only granted datasets with exact authorized totals and bounded pagination', async () => {
    const result = await viewer.get('/api/v1/datasets?pageSize=10');
    expect(result.status).toBe(200);
    const body = datasetListResponseSchema.parse(result.body);
    expect(body.data.length).toBeLessThanOrEqual(10);
    expect(body.data.every((row) => row.effectivePermission === 'read')).toBe(
      true,
    );
    expect(body.data.some((row) => row.id === fixture.hidden)).toBe(false);
    const independent = await db.execute<{ total: string }>(
      sql`select count(*)::text as total from datasets d join dataset_permissions p on p.dataset_id=d.id where p.user_id=${viewerUser.id} and d.is_archived=false`,
    );
    expect(body.pageInfo.total).toBe(Number(independent.rows[0]?.total));
    expect(result.text).not.toContain('Secret dataset title');
  });

  it('returns an empty library for a user without grants and audits admin access', async () => {
    const result = await outsider.get('/api/v1/datasets');
    expect(datasetListResponseSchema.parse(result.body)).toMatchObject({
      data: [],
      pageInfo: { total: 0 },
    });
    const response = await admin.get(datasetPath(fixture.hidden));
    expect(response.status).toBe(200);
    expect(
      datasetResponseSchema.parse(response.body).data.effectivePermission,
    ).toBe('manage');
    expect(auditEvents).toContain(
      JSON.stringify({
        event: 'security_audit',
        actorId: adminUser.id,
        action: 'dataset.admin.read',
        resourceId: fixture.hidden,
        requestId: response.get('X-Request-Id'),
      }),
    );
  });

  it('returns safe dataset metadata, exact count strings and independent field pages', async () => {
    const response = await viewer.get(datasetPath(fixture.primary));
    const body = datasetResponseSchema.parse(response.body).data;
    expect(body.recordCount).toBe('2');
    expect(body.effectivePermission).toBe('read');
    expect(body.createdAt).toMatch(/Z$/);
    const fields = await viewer.get(`${datasetPath(fixture.primary)}/fields`);
    expect(fieldListResponseSchema.parse(fields.body)).toMatchObject({
      data: [{ fieldKey: 'name', operators: ['eq', 'contains'] }],
      pageInfo: { total: 1 },
    });
  });

  it.each(['detail', 'fields', 'record', 'related', 'changes'])(
    'hides inaccessible and missing resource existence for %s',
    async (endpoint) => {
      const path = (dataset: string, record: string) =>
        endpoint === 'detail'
          ? datasetPath(dataset)
          : endpoint === 'fields'
            ? `${datasetPath(dataset)}/fields`
            : `${recordPath(dataset, record)}${endpoint === 'record' ? '' : `/${endpoint}`}`;
      const hidden = await viewer.get(path(fixture.hidden, fixture.secret));
      const missing = await viewer.get(path(randomUUID(), fixture.secret));
      error(hidden, 404, 'RESOURCE_NOT_FOUND');
      error(missing, 404, 'RESOURCE_NOT_FOUND');
      expect(apiErrorSchema.parse(hidden.body).message).toBe(
        apiErrorSchema.parse(missing.body).message,
      );
    },
  );

  it('enforces the role and grant hierarchy through reusable real guards', async () => {
    const analyze = `/api/v1/verification/datasets/${fixture.primary}/analyze`;
    expect((await analyst.get(analyze)).status).toBe(200);
    error(await viewer.get(analyze), 403, 'FORBIDDEN');
    error(await outsider.get(analyze), 404, 'RESOURCE_NOT_FOUND');
    await db
      .update(schema.datasetPermissions)
      .set({ permission: 'read' })
      .where(
        sql`${schema.datasetPermissions.datasetId} = ${fixture.primary} and ${schema.datasetPermissions.userId} = ${analystUser.id}`,
      );
    error(await analyst.get(analyze), 403, 'FORBIDDEN');
    await db
      .update(schema.datasetPermissions)
      .set({ permission: 'manage' })
      .where(sql`${schema.datasetPermissions.datasetId} = ${fixture.primary}`);
    expect(
      (
        await analyst.get(
          `/api/v1/verification/datasets/${fixture.primary}/manage`,
        )
      ).status,
    ).toBe(200);
    error(await viewer.get(analyze), 403, 'FORBIDDEN');
    error(
      await analyst.send('patch', datasetPath(fixture.primary), {
        name: 'Must not change',
      }),
      403,
      'FORBIDDEN',
    );
  });

  it('does not trust forged principal roles in service-level authorization', async () => {
    const forged = { ...viewerUser, role: 'admin' as const };
    await expect(
      app.get(PermissionsService).admin(forged),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      app.get(PermissionsService).dataset(forged, fixture.hidden),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('creates and updates datasets as admin, with zero records and no injected server fields', async () => {
    const created = await admin.send('post', '/api/v1/datasets', {
      name: 'Created via API',
      slug: `api-${randomUUID()}`,
      source: 'Manual',
      description: 'Description',
      category: 'Examples',
    });
    expect(created.status).toBe(201);
    const row = datasetResponseSchema.parse(created.body).data;
    expect(row.recordCount).toBe('0');
    expect(row.isArchived).toBe(false);
    const updated = await admin.send('patch', datasetPath(row.id), {
      name: 'Renamed via API',
    });
    expect(updated.status).toBe(200);
    expect(datasetResponseSchema.parse(updated.body).data).toMatchObject({
      name: 'Renamed via API',
      description: 'Description',
      category: 'Examples',
      source: 'Manual',
    });
    const persisted = await db.query.datasets.findFirst({
      where: sql`${schema.datasets.id} = ${row.id}`,
    });
    expect(persisted?.name).toBe('Renamed via API');
    error(
      await admin.send('patch', datasetPath(row.id), { recordCount: '100000' }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('handles conflicting dataset slugs without changing either record', async () => {
    const name = `conflict-${randomUUID()}`;
    expect(
      (
        await admin.send('post', '/api/v1/datasets', {
          name: 'First',
          slug: name,
          source: 'Test',
        })
      ).status,
    ).toBe(201);
    error(
      await admin.send('post', '/api/v1/datasets', {
        name: 'Second',
        slug: name,
        source: 'Test',
      }),
      409,
      'RESOURCE_CONFLICT',
    );
    const rows = await db.query.datasets.findMany({
      where: sql`${schema.datasets.slug} = ${name}`,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('First');
  });

  it('archives datasets without deleting their records and keeps admin management available', async () => {
    const response = await admin.send('delete', datasetPath(fixture.primary));
    expect(response.status).toBe(200);
    expect(datasetResponseSchema.parse(response.body).data.isArchived).toBe(
      true,
    );
    expect(
      (
        await db.query.datasetRecords.findMany({
          where: sql`${schema.datasetRecords.datasetId} = ${fixture.primary}`,
        })
      ).length,
    ).toBe(2);
    error(
      await viewer.get(datasetPath(fixture.primary)),
      404,
      'RESOURCE_NOT_FOUND',
    );
    error(
      await analyst.get(recordPath(fixture.primary, fixture.first)),
      404,
      'RESOURCE_NOT_FOUND',
    );
    expect((await admin.get(datasetPath(fixture.primary))).status).toBe(200);
    const defaults = datasetListResponseSchema.parse(
      (await admin.get('/api/v1/datasets?pageSize=100')).body,
    );
    expect(defaults.data.some((row) => row.id === fixture.primary)).toBe(false);
    const all = datasetListResponseSchema.parse(
      (await admin.get('/api/v1/datasets?pageSize=100&includeArchived=true'))
        .body,
    );
    expect(all.pageInfo.total).toBe(defaults.pageInfo.total + 1);
    error(
      await viewer.get('/api/v1/datasets?includeArchived=true'),
      403,
      'FORBIDDEN',
    );
  });

  it.each(['post', 'patch', 'delete'] as const)(
    'denies non-admin dataset mutation through %s',
    async (method) => {
      const path =
        method === 'post' ? '/api/v1/datasets' : datasetPath(fixture.primary);
      for (const client of [viewer, analyst])
        error(
          await client.send(method, path, {
            name: 'Forbidden',
            slug: `forbidden-${randomUUID()}`,
            source: 'Test',
          }),
          403,
          'FORBIDDEN',
        );
    },
  );

  it('enforces CSRF on all dataset/field/grant mutation routes', async () => {
    const paths: ['post' | 'put' | 'patch' | 'delete', string, object][] = [
      [
        'post',
        '/api/v1/datasets',
        { name: 'Blocked', slug: 'blocked', source: 'Test' },
      ],
      ['patch', datasetPath(fixture.primary), { name: 'Blocked' }],
      ['delete', datasetPath(fixture.primary), {}],
      [
        'post',
        `${datasetPath(fixture.primary)}/fields`,
        { fieldKey: 'blocked', label: 'Blocked', dataType: 'string' },
      ],
      [
        'patch',
        `${datasetPath(fixture.primary)}/fields/${fixture.field}`,
        { label: 'Blocked' },
      ],
      [
        'put',
        `${datasetPath(fixture.primary)}/permissions/${outsiderUser.id}`,
        { permission: 'read' },
      ],
      [
        'delete',
        `${datasetPath(fixture.primary)}/permissions/${viewerUser.id}`,
        {},
      ],
    ];
    for (const [method, path, body] of paths)
      error(await admin.send(method, path, body, ''), 403, 'CSRF_REJECTED');
    expect(
      (
        await db.query.datasets.findFirst({
          where: sql`${schema.datasets.id} = ${fixture.primary}`,
        })
      )?.name,
    ).toBe('Accessible fixture');
  });

  it('creates typed fields, patches only requested properties and synchronizes FTS metadata', async () => {
    const response = await admin.send(
      'post',
      `${datasetPath(fixture.primary)}/fields`,
      {
        fieldKey: 'customLabel',
        label: 'Custom label',
        dataType: 'string',
        isSearchable: true,
        isFilterable: true,
        isSortable: true,
        operators: ['eq', 'contains'],
      },
    );
    expect(response.status).toBe(201);
    const field = fieldResponseSchema.parse(response.body).data;
    const updated = await admin.send(
      'patch',
      `${datasetPath(fixture.primary)}/fields/${field.id}`,
      { label: 'New label' },
    );
    expect(updated.status).toBe(200);
    expect(fieldResponseSchema.parse(updated.body).data).toMatchObject({
      label: 'New label',
      isSearchable: true,
      isFilterable: true,
      isSortable: true,
      operators: ['eq', 'contains'],
    });
    await db
      .update(schema.datasetRecords)
      .set({ attributes: { customLabel: 'Metadata synchronization' } })
      .where(sql`${schema.datasetRecords.id} = ${fixture.first}`);
    const matches = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from dataset_records where id = ${fixture.first} and search_vector @@ websearch_to_tsquery('simple','synchronization')`,
    );
    expect(matches.rows[0]?.count).toBe('1');
  });

  it('rejects incompatible merged field patches and cross-dataset field IDs', async () => {
    error(
      await admin.send(
        'patch',
        `${datasetPath(fixture.primary)}/fields/${fixture.field}`,
        { dataType: 'number' },
      ),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await admin.send(
        'patch',
        `${datasetPath(fixture.primary)}/fields/${fixture.hiddenField}`,
        { label: 'Cross-dataset tampering' },
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
    expect(
      (
        await db.query.datasetFields.findFirst({
          where: sql`${schema.datasetFields.id} = ${fixture.hiddenField}`,
        })
      )?.label,
    ).toBe('Hidden name');
  });

  it('rejects duplicate field keys and enforces the serialized 100-field cap', async () => {
    error(
      await admin.send('post', `${datasetPath(fixture.primary)}/fields`, {
        fieldKey: 'name',
        label: 'Duplicate',
        dataType: 'string',
      }),
      409,
      'RESOURCE_CONFLICT',
    );
    await db.insert(schema.datasetFields).values(
      Array.from({ length: 99 }, (_, index) => ({
        datasetId: fixture.primary,
        fieldKey: `custom${String(index)}`,
        label: 'Field',
        dataType: 'string' as const,
      })),
    );
    error(
      await admin.send('post', `${datasetPath(fixture.primary)}/fields`, {
        fieldKey: 'overflow',
        label: 'Overflow',
        dataType: 'string',
      }),
      400,
      'FIELD_LIMIT',
    );
    expect(
      fieldListResponseSchema.parse(
        (await admin.get(`${datasetPath(fixture.primary)}/fields?pageSize=10`))
          .body,
      ).pageInfo.total,
    ).toBe(100);
  });

  it('upserts and revokes grants with current access checks and durable SQL state', async () => {
    const path = `${datasetPath(fixture.primary)}/permissions/${outsiderUser.id}`;
    const before = await outsider.get(datasetPath(fixture.primary));
    error(before, 404, 'RESOURCE_NOT_FOUND');
    const granted = await admin.send('put', path, { permission: 'read' });
    expect(granted.status).toBe(200);
    expect(grantResponseSchema.parse(granted.body).data).toMatchObject({
      permission: 'read',
      grantedBy: adminUser.id,
    });
    expect((await outsider.get(datasetPath(fixture.primary))).status).toBe(200);
    expect(
      (await admin.send('put', path, { permission: 'analyze' })).status,
    ).toBe(200);
    expect(
      (
        await outsider.get(
          `/api/v1/verification/datasets/${fixture.primary}/analyze`,
        )
      ).status,
    ).toBe(200);
    const grants = grantListResponseSchema.parse(
      (await admin.get(`${datasetPath(fixture.primary)}/permissions`)).body,
    );
    expect(grants.pageInfo.total).toBe(3);
    const revoked = await admin.send('delete', path);
    expect(revoked.status).toBe(200);
    expect(revokedResponseSchema.parse(revoked.body).data.revoked).toBe(true);
    error(
      await outsider.get(datasetPath(fixture.primary)),
      404,
      'RESOURCE_NOT_FOUND',
    );
    error(
      await outsider.get(recordPath(fixture.primary, fixture.first)),
      404,
      'RESOURCE_NOT_FOUND',
    );
    expect(
      await db.query.datasetPermissions.findFirst({
        where: sql`${schema.datasetPermissions.datasetId} = ${fixture.primary} and ${schema.datasetPermissions.userId} = ${outsiderUser.id}`,
      }),
    ).toBeUndefined();
  });

  it('denies non-admin permission reads/writes even with an elevated dataset grant', async () => {
    await db
      .update(schema.datasetPermissions)
      .set({ permission: 'manage' })
      .where(sql`${schema.datasetPermissions.datasetId} = ${fixture.primary}`);
    for (const client of [viewer, analyst]) {
      error(
        await client.get(`${datasetPath(fixture.primary)}/permissions`),
        403,
        'FORBIDDEN',
      );
      error(
        await client.send(
          'put',
          `${datasetPath(fixture.primary)}/permissions/${outsiderUser.id}`,
          { permission: 'manage' },
        ),
        403,
        'FORBIDDEN',
      );
      error(
        await client.send(
          'delete',
          `${datasetPath(fixture.primary)}/permissions/${viewerUser.id}`,
        ),
        403,
        'FORBIDDEN',
      );
      error(
        await client.send('post', `${datasetPath(fixture.primary)}/fields`, {
          fieldKey: 'forbidden',
          label: 'Forbidden',
          dataType: 'string',
        }),
        403,
        'FORBIDDEN',
      );
    }
  });

  it('rejects nonexistent/inactive grant recipients and malicious permission payloads', async () => {
    error(
      await admin.send(
        'put',
        `${datasetPath(fixture.primary)}/permissions/${randomUUID()}`,
        { permission: 'read' },
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
    error(
      await admin.send(
        'put',
        `${datasetPath(fixture.primary)}/permissions/${outsiderUser.id}`,
        { permission: 'admin' },
      ),
      400,
      'VALIDATION_ERROR',
    );
    error(
      await admin.send(
        'put',
        `${datasetPath(fixture.primary)}/permissions/${outsiderUser.id}`,
        { permission: 'read', role: 'admin' },
      ),
      400,
      'VALIDATION_ERROR',
    );
    await db
      .update(schema.users)
      .set({ isActive: false })
      .where(sql`${schema.users.id} = ${outsiderUser.id}`);
    try {
      error(
        await admin.send(
          'put',
          `${datasetPath(fixture.primary)}/permissions/${outsiderUser.id}`,
          { permission: 'read' },
        ),
        404,
        'RESOURCE_NOT_FOUND',
      );
    } finally {
      await db
        .update(schema.users)
        .set({ isActive: true })
        .where(sql`${schema.users.id} = ${outsiderUser.id}`);
    }
  });

  it('rechecks role downgrades before admin mutations without requiring re-login', async () => {
    await db
      .update(schema.users)
      .set({ role: 'viewer' })
      .where(sql`${schema.users.id} = ${adminUser.id}`);
    try {
      error(
        await admin.send('patch', datasetPath(fixture.hidden), {
          name: 'Forbidden after downgrade',
        }),
        403,
        'FORBIDDEN',
      );
    } finally {
      await db
        .update(schema.users)
        .set({ role: 'admin' })
        .where(sql`${schema.users.id} = ${adminUser.id}`);
    }
  });

  it('returns complete authorized record details with decimal/bigint safety and no internal vector', async () => {
    const response = await viewer.get(
      recordPath(fixture.primary, fixture.first),
    );
    expect(response.status).toBe(200);
    const record = recordResponseSchema.parse(response.body).data;
    expect(record).toMatchObject({
      id: fixture.first,
      revenue: '9999999999999999.99',
      status: 'Active',
      attributes: { employeeCount: 20, note: 'Complete detail' },
    });
    expect(response.text).not.toMatch(/searchVector|search_vector/);
  });

  it('round-trips persisted record IDs above Number.MAX_SAFE_INTEGER through the API', async () => {
    const largeId = 9007199254740993n;
    await db.insert(schema.datasetRecords).values({
      id: largeId,
      datasetId: fixture.primary,
      name: 'Bigint precision record',
      revenue: '9999999999999999.99',
    });
    await db
      .update(schema.datasets)
      .set({ recordCount: 3n })
      .where(sql`${schema.datasets.id} = ${fixture.primary}`);
    const response = await viewer.get(
      recordPath(fixture.primary, largeId.toString()),
    );
    expect(response.status).toBe(200);
    expect(recordResponseSchema.parse(response.body).data).toMatchObject({
      id: '9007199254740993',
      revenue: '9999999999999999.99',
    });
    expect(
      relatedListResponseSchema.parse(
        (
          await viewer.get(
            `${recordPath(fixture.primary, largeId.toString())}/related`,
          )
        ).body,
      ),
    ).toMatchObject({ data: [], pageInfo: { total: 0 } });
  });

  it('serializes concurrent field creation at the metadata cap', async () => {
    await db.insert(schema.datasetFields).values(
      Array.from({ length: 98 }, (_, index) => ({
        datasetId: fixture.primary,
        fieldKey: `concurrent${String(index)}`,
        label: 'Field',
        dataType: 'string' as const,
      })),
    );
    const responses = await Promise.all(
      ['lastA', 'lastB'].map((fieldKey) =>
        admin.send('post', `${datasetPath(fixture.primary)}/fields`, {
          fieldKey,
          label: 'Last allowed field',
          dataType: 'string',
        }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 400,
    ]);
    const count = await db.execute<{ total: string }>(
      sql`select count(*)::text as total from dataset_fields where dataset_id = ${fixture.primary}`,
    );
    expect(count.rows[0]?.total).toBe('100');
  });

  it('paginates deterministic authorized dataset pages without duplicates or hidden totals', async () => {
    const extra = Array.from({ length: 12 }, () => ({
      id: randomUUID(),
      slug: `paging-${randomUUID()}`,
      name: 'Paging tie',
      source: 'Test',
    }));
    await db.insert(schema.datasets).values(extra);
    await db.insert(schema.datasetPermissions).values(
      extra.map((dataset) => ({
        datasetId: dataset.id,
        userId: outsiderUser.id,
        permission: 'read' as const,
        grantedBy: adminUser.id,
      })),
    );
    const first = datasetListResponseSchema.parse(
      (await outsider.get('/api/v1/datasets?page=1&pageSize=10')).body,
    );
    const second = datasetListResponseSchema.parse(
      (await outsider.get('/api/v1/datasets?page=2&pageSize=10')).body,
    );
    expect(first.pageInfo).toMatchObject({
      total: 12,
      totalPages: 2,
      hasNextPage: true,
    });
    expect(second.pageInfo.hasNextPage).toBe(false);
    const ids = [...first.data, ...second.data].map((row) => row.id);
    expect(new Set(ids).size).toBe(12);
    expect(ids).toEqual(extra.map((dataset) => dataset.id).sort());
    expect(
      datasetListResponseSchema
        .parse((await outsider.get('/api/v1/datasets?page=1&pageSize=10')).body)
        .data.map((row) => row.id),
    ).toEqual(first.data.map((row) => row.id));
    // Remove only the explicit grants made in this test's disposable database.
    await db
      .delete(schema.datasetPermissions)
      .where(sql`${schema.datasetPermissions.userId} = ${outsiderUser.id}`);
  });

  it('rejects record ID substitution even when the dataset itself is authorized', async () => {
    error(
      await viewer.get(recordPath(fixture.primary, fixture.secret)),
      404,
      'RESOURCE_NOT_FOUND',
    );
    error(
      await admin.get(recordPath(fixture.primary, fixture.secret)),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('filters hidden related identities/types/counts before pagination and checks incoming links', async () => {
    const response = await viewer.get(
      `${recordPath(fixture.primary, fixture.first)}/related?pageSize=10`,
    );
    const body = relatedListResponseSchema.parse(response.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.record.id).toBe(fixture.second);
    expect(body.data[0]?.direction).toBe('outgoing');
    expect(body.pageInfo.total).toBe(1);
    expect(response.text).not.toContain(fixture.secret);
    expect(response.text).not.toContain('secret-relation-type');
    const incoming = relatedListResponseSchema.parse(
      (
        await viewer.get(
          `${recordPath(fixture.primary, fixture.second)}/related`,
        )
      ).body,
    );
    expect(incoming.data[0]?.record.id).toBe(fixture.first);
    expect(incoming.data[0]?.direction).toBe('incoming');
    expect(
      relatedListResponseSchema.parse(
        (
          await admin.get(
            `${recordPath(fixture.primary, fixture.first)}/related`,
          )
        ).body,
      ).pageInfo.total,
    ).toBe(2);
  });

  it('does not let an entire first page of hidden edges suppress a later visible relation', async () => {
    const targets = await db
      .insert(schema.datasetRecords)
      .values(
        Array.from({ length: 9 }, () => ({
          datasetId: fixture.hidden,
          name: 'Hidden page target',
        })),
      )
      .returning({ id: schema.datasetRecords.id });
    await db
      .update(schema.datasets)
      .set({ recordCount: 10n })
      .where(sql`${schema.datasets.id} = ${fixture.hidden}`);
    // Only relationships created by this fixture in the newly generated test DB.
    await db
      .delete(schema.recordRelationships)
      .where(
        sql`${schema.recordRelationships.sourceRecordId} = ${fixture.first}`,
      );
    await db.insert(schema.recordRelationships).values(
      [BigInt(fixture.secret), ...targets.map((row) => row.id)].map(
        (targetRecordId) => ({
          sourceRecordId: BigInt(fixture.first),
          targetRecordId,
          relationType: 'Hidden page relation',
        }),
      ),
    );
    await db.insert(schema.recordRelationships).values({
      sourceRecordId: BigInt(fixture.first),
      targetRecordId: BigInt(fixture.second),
      relationType: 'Visible later relation',
    });
    const response = await viewer.get(
      `${recordPath(fixture.primary, fixture.first)}/related?pageSize=10`,
    );
    const page = relatedListResponseSchema.parse(response.body);
    expect(page.pageInfo).toMatchObject({
      total: 1,
      totalPages: 1,
      hasNextPage: false,
    });
    expect(page.data.map((edge) => edge.record.id)).toEqual([fixture.second]);
    expect(response.text).not.toContain('Hidden page');
  });

  it('applies a newly granted/revoked target permission immediately to related results', async () => {
    const permissionPath = `${datasetPath(fixture.hidden)}/permissions/${viewerUser.id}`;
    expect(
      (await admin.send('put', permissionPath, { permission: 'read' })).status,
    ).toBe(200);
    expect(
      relatedListResponseSchema.parse(
        (
          await viewer.get(
            `${recordPath(fixture.primary, fixture.first)}/related`,
          )
        ).body,
      ).pageInfo.total,
    ).toBe(2);
    expect((await admin.send('delete', permissionPath)).status).toBe(200);
    expect(
      relatedListResponseSchema.parse(
        (
          await viewer.get(
            `${recordPath(fixture.primary, fixture.first)}/related`,
          )
        ).body,
      ).pageInfo.total,
    ).toBe(1);
  });

  it('shows true empty related/history pages and actual recorded changes', async () => {
    const history = changesResponseSchema.parse(
      (
        await viewer.get(
          `${recordPath(fixture.primary, fixture.first)}/changes`,
        )
      ).body,
    );
    expect(history.data[0]?.changes).toEqual({
      status: { before: 'Pending', after: 'Active' },
    });
    expect(history.data[0]?.actorUserId).toBe(adminUser.id);
    expect(history.pageInfo.total).toBe(1);
    expect(
      changesResponseSchema.parse(
        (
          await viewer.get(
            `${recordPath(fixture.primary, fixture.second)}/changes`,
          )
        ).body,
      ),
    ).toMatchObject({ data: [], pageInfo: { total: 0 } });
    expect(
      relatedListResponseSchema.parse(
        (
          await viewer.get(
            `${recordPath(fixture.primary, fixture.first)}/related?page=2`,
          )
        ).body,
      ),
    ).toMatchObject({ data: [], pageInfo: { total: 1 } });
  });

  it('requires both saved-view ownership/share and current dataset permission', async () => {
    const [view] = await db
      .insert(schema.savedViews)
      .values({
        ownerId: analystUser.id,
        datasetId: fixture.primary,
        name: 'Access resolver fixture',
        config: {},
      })
      .returning();
    if (!view) throw new Error('View fixture failed');
    const permissions = app.get(PermissionsService);
    await expect(
      permissions.ownedOrShared(analystUser, view.id, true),
    ).resolves.toMatchObject({ id: view.id });
    await expect(
      permissions.ownedOrShared(viewerUser, view.id),
    ).rejects.toMatchObject({ status: 404 });
    await db
      .insert(schema.savedViewShares)
      .values({ viewId: view.id, userId: viewerUser.id });
    await expect(
      permissions.ownedOrShared(viewerUser, view.id),
    ).resolves.toMatchObject({ id: view.id });
    await expect(
      permissions.ownedOrShared(viewerUser, view.id, true),
    ).rejects.toMatchObject({ status: 403 });
    await db
      .delete(schema.datasetPermissions)
      .where(
        sql`${schema.datasetPermissions.datasetId} = ${fixture.primary} and ${schema.datasetPermissions.userId} = ${viewerUser.id}`,
      );
    await expect(
      permissions.ownedOrShared(viewerUser, view.id),
    ).rejects.toMatchObject({ status: 404 });
    await db
      .delete(schema.datasetPermissions)
      .where(
        sql`${schema.datasetPermissions.datasetId} = ${fixture.primary} and ${schema.datasetPermissions.userId} = ${analystUser.id}`,
      );
    await expect(
      permissions.ownedOrShared(analystUser, view.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    'not-a-uuid',
    'x%27%3BSELECT',
    '00000000-0000-0000-0000-00000000000x',
  ])('rejects malformed dataset params %s', async (id) => {
    error(await viewer.get(datasetPath(id)), 400, 'VALIDATION_ERROR');
  });
  it.each(['0', '1.5', '9223372036854775808', '1%3Bselect'])(
    'rejects malformed record params %s',
    async (id) => {
      error(
        await viewer.get(recordPath(fixture.primary, id)),
        400,
        'VALIDATION_ERROR',
      );
    },
  );
  it.each([
    'pageSize=1000',
    'page=0',
    'pageSize=10&pageSize=100',
    'sort=raw-sql',
  ])('rejects invalid list params %s', async (query) => {
    error(
      await viewer.get(`/api/v1/datasets?${query}`),
      400,
      'VALIDATION_ERROR',
    );
  });
});
