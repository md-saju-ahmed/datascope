import 'reflect-metadata';
import { administerDisposableDatabase } from './support/disposable-database.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  databaseForClient,
  getMigrationStatus,
  localMigrationUrl,
  migrateDatabase,
  schema,
  sql,
} from '@datascope/db';
import type { Database } from '@datascope/db';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';
import { configureApp } from '../src/configure-app.js';
import { DatabaseService } from '../src/database/database.service.js';

const freshName = `datascope_test_migration_${randomUUID().replaceAll('-', '')}`;
let createdFreshDatabase = false;

function administerFreshDatabase(create: boolean): void {
  administerDisposableDatabase(freshName, create);
}

const oldDate = new Date('2020-01-01T00:00:00.000Z');

async function fixture(db: Database) {
  const ownerId = randomUUID();
  const viewerId = randomUUID();
  const actorId = randomUUID();
  const datasetId = randomUUID();
  const otherDatasetId = randomUUID();
  const viewId = randomUUID();
  const slug = `fixture-${randomUUID()}`;
  const email = `viewer-${randomUUID()}@example.test`;
  // Non-login fixtures contain no reusable passwords or session tokens.
  const passwordHash = `!disabled-schema-fixture-${randomUUID()}`;
  await db.insert(schema.users).values([
    {
      id: ownerId,
      email: `owner-${randomUUID()}@example.test`,
      passwordHash,
      role: 'analyst',
    },
    { id: viewerId, email, passwordHash },
    {
      id: actorId,
      email: `actor-${randomUUID()}@example.test`,
      passwordHash,
      role: 'admin',
    },
  ]);
  await db.insert(schema.datasets).values([
    {
      id: datasetId,
      slug,
      name: 'Fixture',
      source: 'integration-test',
      recordCount: 1n,
      createdAt: oldDate,
      updatedAt: oldDate,
    },
    {
      id: otherDatasetId,
      slug: `other-${randomUUID()}`,
      name: 'Other fixture',
      source: 'integration-test',
      recordCount: 1n,
    },
  ]);
  await db
    .insert(schema.datasetFields)
    .values({ datasetId, fieldKey: 'name', label: 'Name', dataType: 'string' });
  await db.insert(schema.datasetPermissions).values([
    { datasetId, userId: ownerId, permission: 'analyze', grantedBy: actorId },
    { datasetId, userId: viewerId, permission: 'read', grantedBy: actorId },
  ]);
  const records = await db
    .insert(schema.datasetRecords)
    .values([
      {
        datasetId,
        name: 'First fixture',
        status: 'Pending',
        revenue: '12345.67',
        attributes: { source: 'fixture' },
      },
      { datasetId: otherDatasetId, name: 'Related fixture' },
    ])
    .returning({ id: schema.datasetRecords.id });
  const firstId = records[0]?.id;
  const secondId = records[1]?.id;
  if (firstId === undefined || secondId === undefined)
    throw new Error('Fixture insertion failed');
  await db
    .update(schema.datasetRecords)
    .set({ status: 'Active' })
    .where(sql`${schema.datasetRecords.id} = ${firstId}`);
  await db.insert(schema.recordRelationships).values({
    sourceRecordId: firstId,
    targetRecordId: secondId,
    relationType: 'related',
  });
  await db.insert(schema.recordChanges).values({
    recordId: firstId,
    actorUserId: actorId,
    changes: { status: { before: 'Pending', after: 'Active' } },
  });
  await db.insert(schema.savedViews).values({
    id: viewId,
    ownerId,
    datasetId,
    name: 'Fixture view',
    config: {
      version: 1,
      q: '',
      conditions: [],
      sort: [],
      columns: ['id', 'name'],
    },
  });
  await db.insert(schema.savedViewShares).values({ viewId, userId: viewerId });
  await db.insert(schema.searchHistory).values({
    userId: viewerId,
    datasetId,
    normalizedQuery: { q: 'fixture' },
    filterKeys: [],
    durationMs: 0,
  });
  await db
    .insert(schema.userPreferences)
    .values({ userId: viewerId, preferences: { density: 'compact' } });
  const settingKey = `fixture.${randomUUID().replaceAll('-', '')}`;
  await db
    .insert(schema.systemSettings)
    .values({ key: settingKey, value: { enabled: true }, updatedBy: actorId });
  const tokenHash = randomBytes(32).toString('hex');
  await db.insert(schema.authSessions).values({
    userId: viewerId,
    tokenHash,
    expiresAt: new Date(Date.now() + 3600000),
  });
  return {
    ownerId,
    viewerId,
    actorId,
    datasetId,
    otherDatasetId,
    viewId,
    firstId,
    secondId,
    slug,
    email,
    tokenHash,
    settingKey,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const negativeCases: Array<{
  name: string;
  statement: string;
  values: (data: Fixture) => unknown[];
  code: string;
}> = [
  {
    name: 'case-insensitive duplicate email',
    statement: 'insert into users(email,password_hash) values($1,$2)',
    values: (f) => [f.email.toUpperCase(), '!disabled-fixture'],
    code: '23505',
  },
  {
    name: 'duplicate dataset slug',
    statement: 'insert into datasets(slug,name,source) values($1,$2,$3)',
    values: (f) => [f.slug, 'duplicate', 'test'],
    code: '23505',
  },
  {
    name: 'duplicate registered field',
    statement:
      'insert into dataset_fields(dataset_id,field_key,label,data_type) values($1,$2,$3,$4)',
    values: (f) => [f.datasetId, 'name', 'Duplicate', 'string'],
    code: '23505',
  },
  {
    name: 'duplicate dataset grant',
    statement:
      'insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,$3)',
    values: (f) => [f.datasetId, f.viewerId, 'read'],
    code: '23505',
  },
  {
    name: 'duplicate view share',
    statement: 'insert into saved_view_shares(view_id,user_id) values($1,$2)',
    values: (f) => [f.viewId, f.viewerId],
    code: '23505',
  },
  {
    name: 'invalid role',
    statement: 'update users set role=$1 where id=$2',
    values: (f) => ['root', f.viewerId],
    code: '22P02',
  },
  {
    name: 'missing dataset reference',
    statement: 'insert into dataset_records(dataset_id,name) values($1,$2)',
    values: () => [randomUUID(), 'orphan'],
    code: '23503',
  },
  {
    name: 'invalid attributes shape',
    statement: 'update dataset_records set attributes=$1::jsonb where id=$2',
    values: (f) => ['[]', f.firstId.toString()],
    code: '23514',
  },
  {
    name: 'invalid preferences shape',
    statement:
      'update user_preferences set preferences=$1::jsonb where user_id=$2',
    values: (f) => ['[]', f.viewerId],
    code: '23514',
  },
  {
    name: 'invalid saved-view config shape',
    statement: 'update saved_views set config=$1::jsonb where id=$2',
    values: (f) => ['[]', f.viewId],
    code: '23514',
  },
  {
    name: 'invalid search-history query shape',
    statement:
      'update search_history set normalized_query=$1::jsonb where user_id=$2',
    values: (f) => ['[]', f.viewerId],
    code: '23514',
  },
  {
    name: 'negative record count',
    statement: 'update datasets set record_count=-1 where id=$1',
    values: (f) => [f.datasetId],
    code: '23514',
  },
  {
    name: 'unregistered key shape',
    statement: 'update dataset_fields set field_key=$1 where dataset_id=$2',
    values: (f) => ['name; DROP TABLE users', f.datasetId],
    code: '23514',
  },
  {
    name: 'non-hash session value',
    statement: 'update auth_sessions set token_hash=$1 where user_id=$2',
    values: (f) => ['plain-value', f.viewerId],
    code: '23514',
  },
  {
    name: 'expiry preceding creation',
    statement:
      "update auth_sessions set expires_at=created_at - interval '1 second' where user_id=$1",
    values: (f) => [f.viewerId],
    code: '23514',
  },
  {
    name: 'self-related record',
    statement:
      'insert into record_relationships(source_record_id,target_record_id,relation_type) values($1,$1,$2)',
    values: (f) => [f.firstId.toString(), 'self'],
    code: '23514',
  },
  {
    name: 'duplicate typed relationship',
    statement:
      'insert into record_relationships(source_record_id,target_record_id,relation_type) values($1,$2,$3)',
    values: (f) => [f.firstId.toString(), f.secondId.toString(), 'related'],
    code: '23505',
  },
  {
    name: 'non-finite revenue',
    statement: "update dataset_records set revenue='NaN'::numeric where id=$1",
    values: (f) => [f.firstId.toString()],
    code: '23514',
  },
  {
    name: 'physical dataset deletion with records',
    statement: 'delete from datasets where id=$1',
    values: (f) => [f.datasetId],
    code: '23503',
  },
  {
    name: 'record deletion with available history',
    statement: 'delete from dataset_records where id=$1',
    values: (f) => [f.firstId.toString()],
    code: '23503',
  },
];

describe('fresh PostgreSQL schema and migrations', () => {
  let app: INestApplication<Server>;
  let database: DatabaseService;
  let closeApp: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    // Validates the parent test target before any Docker/admin action.
    const url = new URL(localMigrationUrl(process.env, true));
    administerFreshDatabase(true);
    createdFreshDatabase = true;
    url.pathname = `/${freshName}`;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: url.toString(),
          DB_POOL_MAX: 3,
          DB_STATEMENT_TIMEOUT_MS: 5000,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    closeApp = () => app.close();
    configureApp(app);
    await app.init();
    database = app.get(DatabaseService);
  });

  afterAll(async () => {
    try {
      if (closeApp) await closeApp();
    } finally {
      // Only this suite's newly created, random-name disposable DB is removed.
      if (createdFreshDatabase) administerFreshDatabase(false);
    }
  });

  async function rolledBack<T>(run: (db: Database) => Promise<T>): Promise<T> {
    const client = await database.pool.connect();
    try {
      await client.query('begin');
      return await run(databaseForClient(client));
    } finally {
      try {
        await client.query('rollback');
      } finally {
        client.release();
      }
    }
  }

  it('rolls back journal, enums and tables together when a migration statement fails', async () => {
    // This empty conflicting table exists only in this suite's fresh disposable DB.
    await database.pool.query('create table public.users (id uuid)');
    try {
      await expect(migrateDatabase(database.pool)).rejects.toMatchObject({
        cause: { code: '42P07' },
      });
      const tables = await database.pool.query<{ name: string }>(
        "select tablename as name from pg_tables where schemaname='public'",
      );
      expect(tables.rows.map((row) => row.name)).toEqual(['users']);
      const types = await database.pool.query<{ count: number }>(
        "select count(*)::int as count from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname in ('user_role','dataset_permission','field_data_type')",
      );
      expect(types.rows[0]?.count).toBe(0);
      expect(await getMigrationStatus(database.pool)).toMatchObject({
        ready: false,
        applied: 0,
        pending: 3,
      });
    } finally {
      await database.pool.query('drop table public.users');
    }
  });

  it('keeps a fresh DB unready until all canonical migrations create all 13 tables', async () => {
    expect(await getMigrationStatus(database.pool)).toMatchObject({
      ready: false,
      applied: 0,
      pending: 3,
    });
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(await migrateDatabase(database.pool)).toMatchObject({
      ready: true,
      applied: 3,
      pending: 0,
    });
    const tables = await database.pool.query<{ name: string }>(
      "select tablename as name from pg_tables where schemaname='public' and tablename <> '__drizzle_migrations'",
    );
    expect(tables.rows.map((row) => row.name).sort()).toEqual(
      [
        'users',
        'auth_sessions',
        'datasets',
        'dataset_fields',
        'dataset_permissions',
        'dataset_records',
        'record_relationships',
        'record_changes',
        'saved_views',
        'saved_view_shares',
        'search_history',
        'user_preferences',
        'system_settings',
      ].sort(),
    );
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });

  it('replays and serializes concurrent migration calls without changing persisted data', async () => {
    const id = randomUUID();
    await database.db.insert(schema.users).values({
      id,
      email: `replay-${id}@example.test`,
      passwordHash: '!disabled-replay-fixture',
    });
    const before = await database.db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, id),
    });
    const results = await Promise.all([
      migrateDatabase(database.pool),
      migrateDatabase(database.pool),
    ]);
    expect(
      results.every((result) => result.ready && result.applied === 3),
    ).toBe(true);
    const after = await database.db.query.users.findFirst({
      where: (table, { eq }) => eq(table.id, id),
    });
    expect(after).toEqual(before);
    expect(after?.role).toBe('viewer');
  });

  it('traverses the actual relation graph across records, grants, views, history and preferences', async () => {
    await rolledBack(async (db) => {
      const f = await fixture(db);
      const user = await db.query.users.findFirst({
        where: (table, { eq }) => eq(table.id, f.viewerId),
        with: {
          sessions: true,
          preferences: true,
          permissions: { with: { dataset: { with: { fields: true } } } },
          sharedViews: { with: { view: { with: { owner: true } } } },
          searches: true,
        },
      });
      expect(user?.role).toBe('viewer');
      expect(user?.sessions).toHaveLength(1);
      expect(user?.preferences?.preferences).toEqual({ density: 'compact' });
      expect(user?.permissions[0]?.dataset.fields[0]?.fieldKey).toBe('name');
      expect(user?.sharedViews[0]?.view.owner.id).toBe(f.ownerId);
      expect(user?.searches[0]?.normalizedQuery).toEqual({ q: 'fixture' });
      const record = await db.query.datasetRecords.findFirst({
        where: (table, { eq }) => eq(table.id, f.firstId),
        with: {
          outgoing: { with: { target: { with: { dataset: true } } } },
          changes: { with: { actor: true } },
        },
      });
      expect(record?.status).toBe('Active');
      expect(record?.outgoing[0]?.target.dataset.id).toBe(f.otherDatasetId);
      expect(record?.changes[0]?.actor?.id).toBe(f.actorId);
      expect(record?.changes[0]?.changes).toEqual({
        status: { before: 'Pending', after: 'Active' },
      });
    });
  });

  it('preserves bigint IDs, exact decimal strings, typed metadata and UTC timestamps', async () => {
    await rolledBack(async (db) => {
      const f = await fixture(db);
      const id = 9007199254740993n;
      const result = await db
        .insert(schema.datasetRecords)
        .values({
          id,
          datasetId: f.datasetId,
          name: 'Precision fixture',
          revenue: '9999999999999999.99',
          createdAt: new Date('2026-01-01T10:00:00+06:00'),
        })
        .returning();
      expect(result[0]?.id).toBe(id);
      expect(result[0]?.id.toString()).toBe('9007199254740993');
      expect(result[0]?.revenue).toBe('9999999999999999.99');
      expect(result[0]?.createdAt.toISOString()).toBe(
        '2026-01-01T04:00:00.000Z',
      );
      const fields = await db.query.datasetFields.findMany({
        where: (table, { eq }) => eq(table.datasetId, f.datasetId),
      });
      expect(fields[0]).toMatchObject({
        dataType: 'string',
        isSearchable: false,
        isFilterable: false,
        isSortable: false,
        isVisible: true,
        operators: [],
      });
    });
  });

  it('updates modification timestamps in SQL and installs all eight update triggers', async () => {
    await rolledBack(async (db) => {
      const f = await fixture(db);
      const updated = await db
        .update(schema.datasets)
        .set({ name: 'Changed fixture' })
        .where(sql`${schema.datasets.id} = ${f.datasetId}`)
        .returning();
      expect(updated[0]?.createdAt).toEqual(oldDate);
      expect(updated[0]?.updatedAt.getTime()).toBeGreaterThan(
        oldDate.getTime(),
      );
    });
    const triggers = await database.pool.query<{ count: number }>(
      "select count(*)::int as count from pg_trigger where tgname='touch_updated_at' and not tgisinternal",
    );
    expect(triggers.rows[0]?.count).toBe(8);
  });

  it('cleans user-owned state while retaining change logs and nullable audit references', async () => {
    await rolledBack(async (db) => {
      const f = await fixture(db);
      await db
        .delete(schema.users)
        .where(sql`${schema.users.id} = ${f.actorId}`);
      const change = await db.query.recordChanges.findFirst({
        where: (table, { eq }) => eq(table.recordId, f.firstId),
      });
      const setting = await db.query.systemSettings.findFirst({
        where: (table, { eq }) => eq(table.key, f.settingKey),
      });
      const grants = await db.query.datasetPermissions.findMany({
        where: (table, { eq }) => eq(table.datasetId, f.datasetId),
      });
      expect(change?.actorUserId).toBeNull();
      expect(setting?.updatedBy).toBeNull();
      expect(grants.every((grant) => grant.grantedBy === null)).toBe(true);
      await db
        .delete(schema.users)
        .where(sql`${schema.users.id} = ${f.viewerId}`);
      expect(
        await db.query.authSessions.findFirst({
          where: (table, { eq }) => eq(table.userId, f.viewerId),
        }),
      ).toBeUndefined();
      expect(
        await db.query.userPreferences.findFirst({
          where: (table, { eq }) => eq(table.userId, f.viewerId),
        }),
      ).toBeUndefined();
      expect(
        await db.query.savedViewShares.findFirst({
          where: (table, { eq }) => eq(table.userId, f.viewerId),
        }),
      ).toBeUndefined();
      expect(
        await db.query.searchHistory.findFirst({
          where: (table, { eq }) => eq(table.userId, f.viewerId),
        }),
      ).toBeUndefined();
      await db
        .delete(schema.users)
        .where(sql`${schema.users.id} = ${f.ownerId}`);
      expect(
        await db.query.savedViews.findFirst({
          where: (table, { eq }) => eq(table.id, f.viewId),
        }),
      ).toBeUndefined();
      expect(
        await db.query.recordChanges.findFirst({
          where: (table, { eq }) => eq(table.recordId, f.firstId),
        }),
      ).toBeDefined();
    });
  });

  it.each(negativeCases)(
    'rejects $name at the PostgreSQL boundary',
    async (item) => {
      const client = await database.pool.connect();
      try {
        await client.query('begin');
        const f = await fixture(databaseForClient(client));
        await expect(
          client.query(item.statement, item.values(f)),
        ).rejects.toMatchObject({ code: item.code });
      } finally {
        try {
          await client.query('rollback');
        } finally {
          client.release();
        }
      }
    },
  );

  it('rejects altered applied history and reports unready without automatically repairing it', async () => {
    const row = (
      await database.pool.query<{ id: number; hash: string }>(
        'select id, hash from public.__drizzle_migrations order by id limit 1',
      )
    ).rows[0];
    if (!row) throw new Error('Expected migration journal entry');
    try {
      await database.pool.query(
        'update public.__drizzle_migrations set hash=$1 where id=$2',
        ['tampered-test-value', row.id],
      );
      expect(await getMigrationStatus(database.pool)).toMatchObject({
        ready: false,
        reason: 'mismatch',
      });
      await expect(migrateDatabase(database.pool)).rejects.toThrow(
        'refusing automatic repair',
      );
      await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
    } finally {
      await database.pool.query(
        'update public.__drizzle_migrations set hash=$1 where id=$2',
        [row.hash, row.id],
      );
    }
    expect(await database.isReady()).toBe(true);
  });

  it('detects a missing core table despite a complete migration journal', async () => {
    try {
      await database.pool.query(
        'alter table public.user_preferences rename to disposable_preferences_backup',
      );
      expect(await getMigrationStatus(database.pool)).toMatchObject({
        ready: false,
        reason: 'missing_tables',
      });
      await expect(migrateDatabase(database.pool)).rejects.toThrow(
        'refusing automatic repair',
      );
      await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
    } finally {
      await database.pool.query(
        'alter table public.disposable_preferences_backup rename to user_preferences',
      );
    }
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });
});
