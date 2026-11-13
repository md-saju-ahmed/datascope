import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createDatabase,
  migrateDatabase,
  seedConfiguration,
  seedDatabase,
  seedIds,
  schema,
  sql,
} from '@datascope/db';
import {
  searchRequestSchema,
  searchResponseSchema,
  apiErrorSchema,
} from '@datascope/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';
import { DatabaseService } from '../src/database/database.service.js';
import { validateSearch } from '../src/modules/search/search-validation.js';
import { compileSearch } from '../src/modules/search/search-compiler.js';
import { PermissionsService } from '../src/modules/permissions/permissions.service.js';
import { administerDisposableDatabase } from './support/disposable-database.js';
import { ApiClient } from './support/api-client.js';

const databaseName = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
const endpoint = (id: string) => `/api/v1/datasets/${id}/search`;
const logs: string[] = [];
describe('BE-10â€“13 real PostgreSQL search API over 100k records', () => {
  let created = false;
  let database: ReturnType<typeof createDatabase> | undefined;
  let app: INestApplication<Server> | undefined;
  let analyst: ApiClient;
  let viewer: ApiClient;
  let admin: ApiClient;
  let custom: string;
  const ids: string[] = [];
  const config = seedConfiguration(
    {
      NODE_ENV: 'test',
      SEED_ALLOW_LOCAL: 'true',
      DATABASE_TEST_URL: process.env.DATABASE_TEST_URL,
      SEED_ADMIN_EMAIL: `admin-${randomUUID()}@example.test`,
      SEED_ADMIN_PASSWORD: randomBytes(24).toString('hex'),
      SEED_ANALYST_EMAIL: `analyst-${randomUUID()}@example.test`,
      SEED_ANALYST_PASSWORD: randomBytes(24).toString('hex'),
      SEED_VIEWER_EMAIL: `viewer-${randomUUID()}@example.test`,
      SEED_VIEWER_PASSWORD: randomBytes(24).toString('hex'),
    },
    true,
  );
  const db = () => {
    if (!database) throw new Error('Database not initialized');
    return database;
  };
  const server = () => {
    if (!app) throw new Error('App not initialized');
    return app.getHttpServer();
  };
  async function run(
    body: object = {},
    dataset: string = seedIds.primary,
    client = analyst,
    apply = false,
  ) {
    const response = await request(server())
      .post(endpoint(dataset))
      .set('Cookie', client.cookie())
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', client.csrf)
      .set('X-Search-Intent', apply ? 'apply' : '')
      .send(body);
    return response;
  }
  // Omit the intent header for ordinary retrievals, rather than accepting an empty invalid value.
  async function search(
    body: object = {},
    dataset: string = seedIds.primary,
    client = analyst,
  ) {
    const response = await client.send('post', endpoint(dataset), body);
    expect(response.status).toBe(200);
    const result = searchResponseSchema.parse(response.body);
    expect(result.queryId).toBe(response.headers['x-request-id']);
    return result;
  }
  beforeAll(async () => {
    administerDisposableDatabase(databaseName, true);
    created = true;
    const url = new URL(config.connectionString);
    url.pathname = `/${databaseName}`;
    database = createDatabase({
      connectionString: url.toString(),
      max: 4,
      connectionTimeoutMillis: 2000,
      statementTimeoutMillis: 30000,
    });
    await migrateDatabase(db().pool);
    await seedDatabase(db().pool, config);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: url.toString(),
          DB_POOL_MAX: 4,
          DB_STATEMENT_TIMEOUT_MS: 1000,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.useLogger({
      log(message: unknown) {
        if (typeof message === 'string') logs.push(message);
      },
      warn() {},
      error() {},
    });
    configureApp(app);
    await app.init();
    admin = new ApiClient(server());
    analyst = new ApiClient(server());
    viewer = new ApiClient(server());
    const account = (role: string) => {
      const found = config.accounts.find((entry) => entry.role === role);
      if (!found) throw new Error('Missing account');
      return found;
    };
    for (const [role, client] of [
      ['admin', admin],
      ['analyst', analyst],
      ['viewer', viewer],
    ] as const) {
      const credentials = account(role);
      await client.login(credentials.email, credentials.password);
    }
    custom = randomUUID();
    await db().pool.query(
      "insert into datasets(id,slug,name,source) values($1,$2,'Typed search fixture','test')",
      [custom, `search-${custom}`],
    );
    await db().pool.query(
      "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'analyze'),($1,$3,'read')",
      [custom, seedIds.analyst, seedIds.viewer],
    );
    const fields = [
      ['name', 'string', ['eq', 'neq', 'contains', 'in']],
      ['status', 'enum', ['eq', 'neq', 'in']],
      [
        'revenue',
        'number',
        ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in'],
      ],
      ['createdAt', 'date', ['eq', 'gte', 'lte', 'between']],
      [
        'score',
        'number',
        ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in'],
      ],
      ['when', 'date', ['eq', 'gte', 'lte', 'between']],
      ['flag', 'boolean', ['eq', 'neq', 'in']],
      ['note', 'string', ['eq', 'neq', 'contains', 'in']],
    ];
    for (const [key, type, operators] of fields)
      await db().pool.query(
        `insert into dataset_fields(dataset_id,field_key,label,data_type,operators,is_filterable,is_sortable,is_searchable,is_visible)
      values($1,$2,$2,$3,$4,true,true,$5,$6)`,
        [
          custom,
          key,
          type,
          JSON.stringify(operators),
          key === 'name',
          key !== 'note',
        ],
      );
    for (let i = 0; i < 25; i++) {
      const attributes =
        i === 24
          ? {
              score: 'not numeric',
              when: '2026-02-30T00:00:00Z',
              flag: 'true',
              note: ['bad'],
            }
          : {
              score: i,
              when: '2026-11-01T06:00:00+06:00',
              flag: i % 2 === 0,
              note: i === 0 ? 'Literal %_\\ marker' : `note ${i.toString()}`,
            };
      const result = await db().pool.query<{ id: string }>(
        `insert into dataset_records(id,dataset_id,name,status,revenue,attributes,created_at)
        values($1,$2,$3,$4,$5,$6,'2026-11-01T00:00:00Z') returning id::text`,
        [
          (9007199254740993n + BigInt(i)).toString(),
          custom,
          i < 2 ? 'Same' : `Name ${i.toString()}`,
          i === 24 ? null : 'Active',
          i === 24 ? null : '9999999999999999.99',
          JSON.stringify(attributes),
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new Error('Missing fixture ID');
      ids.push(id);
    }
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (database) await database.pool.end();
      } finally {
        if (created) administerDisposableDatabase(databaseName, false);
      }
    }
  });
  it('returns bounded default listing, exact string IDs/decimals and UTC metadata', async () => {
    const result = await search();
    expect(result.data).toHaveLength(25);
    expect(result.pageInfo).toEqual({
      page: 1,
      pageSize: 25,
      total: 100000,
      totalPages: 4000,
      hasNextPage: true,
    });
    expect(result.sort).toEqual([
      { field: 'createdAt', direction: 'desc' },
      { field: 'id', direction: 'desc' },
    ]);
    expect(
      result.data.every(
        (row) =>
          typeof row.id === 'string' &&
          !('searchVector' in row) &&
          !('attributes' in row),
      ),
    ).toBe(true);
    const precision = await search(
      {
        columns: ['revenue', 'createdAt'],
        sort: [{ field: 'id', direction: 'asc' }],
        pageSize: 10,
      },
      custom,
    );
    expect(precision.data[0]).toEqual({
      id: ids[0],
      revenue: '9999999999999999.99',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
  });
  it('matches global FTS on declared text and treats SQL-looking query text as data', async () => {
    const result = await search({
      q: '"Known Match Alpha"',
      columns: ['name'],
    });
    expect(result.data.map((row) => row.id)).toEqual(['1000000000001']);
    expect(
      (await search({ q: 'definitelymissingtoken OR "; DROP TABLE users;--' }))
        .pageInfo.total,
    ).toBe(0);
    expect((await search({ q: '"unclosed (' })).data).toEqual([]);
    expect((await search({ q: 'Literal' }, custom)).data).toEqual([]);
  });
  it('executes the four-condition example and independently reconciles exact count/IDs', async () => {
    const conditions = [
      { field: 'status', op: 'eq', value: 'Active' },
      { field: 'country', op: 'eq', value: 'Germany' },
      { field: 'revenue', op: 'gt', value: '10000.00' },
      { field: 'createdAt', op: 'gte', value: '2026-01-01T00:00:00Z' },
    ];
    const result = await search({
      conditions,
      sort: [{ field: 'id', direction: 'asc' }],
      columns: ['id'],
    });
    const expected = await db().pool.query<{ id: string }>(
      "select id::text from dataset_records where dataset_id=$1 and status='Active' and country='Germany' and revenue>10000 and created_at>='2026-01-01' order by id limit 25",
      [seedIds.primary],
    );
    expect(result.data).toEqual(expected.rows);
    expect(result.pageInfo.total).toBe(1082);
    expect(result.data.slice(0, 3).map((row) => row.id)).toEqual([
      '1000000000001',
      '1000000000007',
      '1000000000008',
    ]);
  });
  it('supports case-sensitive exact and literal case-insensitive partial matches', async () => {
    expect(
      (
        await search({
          conditions: [{ field: 'name', op: 'eq', value: 'known match alpha' }],
        })
      ).data,
    ).toEqual([]);
    expect(
      (
        await search({
          conditions: [{ field: 'name', op: 'contains', value: 'MATCH ALPHA' }],
        })
      ).data.map((row) => row.id),
    ).toEqual(['1000000000001']);
    expect(
      (
        await search(
          {
            conditions: [{ field: 'note', op: 'contains', value: '%_\\' }],
            columns: ['note'],
          },
          custom,
        )
      ).data,
    ).toEqual([{ id: ids[0], note: 'Literal %_\\ marker' }]);
    expect(
      (
        await search({
          conditions: [
            { field: 'name', op: 'contains', value: "'; DROP TABLE users;--" },
          ],
        })
      ).pageInfo.total,
    ).toBe(0);
    expect(
      (
        await search(
          { conditions: [{ field: 'name', op: 'contains', value: 'S' }] },
          custom,
        )
      ).pageInfo.total,
    ).toBe(2);
  });
  it.each([
    ['eq', '4', 1],
    ['neq', '4', 23],
    ['gt', '20', 3],
    ['gte', '20', 4],
    ['lt', '3', 3],
    ['lte', '3', 4],
    ['between', ['4', '4'], 1],
    ['between', ['2', '4'], 3],
    ['in', ['2', '4'], 2],
  ])(
    'handles dynamic numeric %s with real typed predicates and null exclusion',
    async (op, value, total) => {
      const result = await search(
        { conditions: [{ field: 'score', op, value }], columns: ['score'] },
        custom,
      );
      expect(result.pageInfo.total).toBe(total);
      expect(result.data.every((row) => typeof row.score === 'string')).toBe(
        true,
      );
    },
  );
  it('handles typed dynamic dates/booleans and invalid JSON values safely', async () => {
    const result = await search(
      {
        conditions: [
          {
            field: 'when',
            op: 'between',
            value: ['2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'],
          },
          { field: 'flag', op: 'eq', value: true },
        ],
        columns: ['when', 'flag'],
      },
      custom,
    );
    expect(result.pageInfo.total).toBe(12);
    expect(
      result.data.every(
        (row) => row.when === '2026-11-01T00:00:00.000Z' && row.flag === true,
      ),
    ).toBe(true);
    const invalid = await search(
      {
        sort: [{ field: 'id', direction: 'desc' }],
        columns: ['score', 'when', 'flag', 'note'],
        pageSize: 10,
      },
      custom,
    );
    expect(invalid.data[0]).toEqual({
      id: ids[24],
      score: null,
      when: null,
      flag: null,
      note: null,
    });
    expect(
      (
        await search(
          { conditions: [{ field: 'flag', op: 'in', value: [true, false] }] },
          custom,
        )
      ).pageInfo.total,
    ).toBe(24);
  });
  it('keeps multi-sort ties stable, puts NULL last and preserves navigation/counts', async () => {
    const body = {
      sort: [
        { field: 'status', direction: 'desc' },
        { field: 'score', direction: 'desc' },
      ],
      columns: ['score'],
      pageSize: 10,
    };
    const first = await search(body, custom);
    const second = await search({ ...body, page: 2 }, custom);
    expect(first.data.map((row) => row.score)).toEqual([
      '23',
      '22',
      '21',
      '20',
      '19',
      '18',
      '17',
      '16',
      '15',
      '14',
    ]);
    expect(second.data.map((row) => row.score)).toEqual([
      '13',
      '12',
      '11',
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
    ]);
    expect((await search(body, custom)).data).toEqual(first.data);
    const last = await search({ ...body, page: 3 }, custom);
    expect(last.data.at(-1)?.id).toBe(ids[24]);
    expect(last.pageInfo.hasNextPage).toBe(false);
    expect((await search({ ...body, page: 4 }, custom)).data).toEqual([]);
    expect(
      (await search({ page: 1001, pageSize: 100, columns: ['id'] })).data,
    ).toEqual([]);
    const ties = await search(
      {
        conditions: [{ field: 'name', op: 'eq', value: 'Same' }],
        sort: [{ field: 'name', direction: 'asc' }],
      },
      custom,
    );
    expect(ties.data.map((row) => row.id)).toEqual(ids.slice(0, 2));
  });
  it('rejects unauthorized datasets without disclosing metadata, including malformed query attempts', async () => {
    await request(server())
      .post(endpoint(seedIds.primary))
      .send({})
      .expect(401);
    for (const id of [seedIds.restricted, randomUUID()]) {
      const result = await viewer.send('post', endpoint(id), {
        columns: ['secret'],
      });
      expect(result.status).toBe(404);
      expect(apiErrorSchema.parse(result.body).code).toBe('RESOURCE_NOT_FOUND');
    }
    expect(
      (
        await search(
          {
            conditions: [
              { field: 'status', op: 'in', value: ['Active', 'Pending'] },
            ],
          },
          seedIds.primary,
          viewer,
        )
      ).data.length,
    ).toBeGreaterThan(0);
    const denied = await viewer.send('post', endpoint(seedIds.primary), {
      conditions: [{ field: 'revenue', op: 'gt', value: '1' }],
    });
    expect(denied.status).toBe(403);
    await db().pool.query(
      "update dataset_permissions set permission='read' where user_id=$1 and dataset_id=$2",
      [seedIds.analyst, custom],
    );
    try {
      expect(
        (
          await analyst.send('post', endpoint(custom), {
            conditions: [{ field: 'score', op: 'gt', value: '1' }],
          })
        ).status,
      ).toBe(403);
    } finally {
      await db().pool.query(
        "update dataset_permissions set permission='analyze' where user_id=$1 and dataset_id=$2",
        [seedIds.analyst, custom],
      );
    }
  });
  it('enforces CSRF/origin, strict metadata validation and error envelopes', async () => {
    expect((await analyst.send('post', endpoint(custom), {}, '')).status).toBe(
      403,
    );
    await request(server())
      .post(endpoint(custom))
      .set('Cookie', analyst.cookie())
      .set('Origin', 'https://untrusted.example')
      .set('X-CSRF-Token', analyst.csrf)
      .send({})
      .expect(403);
    for (const body of [
      { columns: ['unknown'] },
      { sort: [{ field: 'name;drop', direction: 'asc' }] },
      { conditions: [{ field: 'score', op: 'between', value: ['2', '1'] }] },
      { page: 1002, pageSize: 100 },
    ]) {
      const response = await admin.send('post', endpoint(custom), body);
      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(response.body).code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('select ');
    }
    const intent = await run({}, custom, admin, false);
    expect(intent.status).toBe(400);
  });
  it('records only completed applied queries and concurrently deduplicates normalized criteria', async () => {
    const initial = await db().pool.query(
      'select count(*)::int as total from search_history',
    );
    expect(initial.rows).toEqual([{ total: 0 }]);
    const body = {
      q: 'NoSuchHistoryFixture',
      sort: [
        { field: 'status', direction: 'asc' },
        { field: 'country', direction: 'asc' },
        { field: 'revenue', direction: 'desc' },
      ],
      conditions: [
        { field: 'status', op: 'in', value: ['Pending', 'Active', 'Active'] },
      ],
    };
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        run({ ...body, page: i + 1 }, seedIds.primary, admin, true),
      ),
    );
    expect(results.map((response) => response.status)).toEqual([
      200, 200, 200, 200,
    ]);
    const history = await db().pool.query<{
      duration_ms: number;
      normalized_query: Record<string, unknown>;
    }>(
      'select user_id,dataset_id,normalized_query,filter_keys,duration_ms from search_history',
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({
      user_id: seedIds.admin,
      dataset_id: seedIds.primary,
      filter_keys: ['status'],
      normalized_query: { version: 1, q: body.q },
    });
    expect(history.rows[0]?.duration_ms).toBeGreaterThanOrEqual(0);
    const { version, ...configuration } =
      history.rows[0]?.normalized_query ?? {};
    expect(version).toBe(1);
    expect(searchRequestSchema.safeParse(configuration).success).toBe(true);
    expect(
      (await search(configuration, seedIds.primary, admin)).pageInfo.total,
    ).toBe(0);
    await search({}, seedIds.primary, admin);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from search_history',
        )
      ).rows[0]?.total,
    ).toBe(1);
    const bad = await run(
      { conditions: [{ field: 'bad', op: 'eq', value: 'x' }] },
      custom,
      admin,
      true,
    );
    expect(bad.status).toBe(400);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from search_history',
        )
      ).rows[0]?.total,
    ).toBe(1);
    await db().pool.query(
      "update search_history set executed_at=clock_timestamp()-interval '61 seconds'",
    );
    expect((await run(body, seedIds.primary, admin, true)).status).toBe(200);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from search_history',
        )
      ).rows[0]?.total,
    ).toBe(2);
  });
  it('caps only the current user history at 100 and isolates another user', async () => {
    await db().pool.query(
      `insert into search_history(user_id,dataset_id,normalized_query,executed_at)
      select $1,$2,'{}',clock_timestamp()-interval '1 day' from generate_series(1,105)`,
      [seedIds.admin, seedIds.primary],
    );
    await db().pool.query(
      "insert into search_history(user_id,dataset_id,normalized_query) values($1,$2,'{}')",
      [seedIds.viewer, seedIds.primary],
    );
    expect(
      (await run({ q: 'retentionfixture' }, seedIds.primary, admin, true))
        .status,
    ).toBe(200);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from search_history where user_id=$1',
          [seedIds.admin],
        )
      ).rows[0]?.total,
    ).toBe(100);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from search_history where user_id=$1',
          [seedIds.viewer],
        )
      ).rows[0]?.total,
    ).toBe(1);
  });
  it('cancels a real blocked search with a controlled error, no history and reusable pool', async () => {
    const locker = await db().pool.connect();
    await locker.query('begin');
    await locker.query('lock dataset_records in access exclusive mode');
    try {
      const response = await run({}, custom, admin, true);
      expect(response.status).toBe(503);
      expect(apiErrorSchema.parse(response.body).code).toBe('DATABASE_TIMEOUT');
      expect(JSON.stringify(response.body)).not.toContain('dataset_records');
    } finally {
      await locker.query('rollback');
      locker.release();
    }
    expect((await search({}, custom, admin)).pageInfo.total).toBe(25);
    expect(app?.get(DatabaseService).pool.waitingCount).toBe(0);
  });
  it('rechecks revoked grants, role ceilings, archived datasets and inactive sessions', async () => {
    await db().pool.query(
      'delete from dataset_permissions where dataset_id=$1 and user_id=$2',
      [custom, seedIds.viewer],
    );
    try {
      expect((await viewer.send('post', endpoint(custom), {})).status).toBe(
        404,
      );
    } finally {
      await db().pool.query(
        "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'manage')",
        [custom, seedIds.viewer],
      );
    }
    expect(
      (
        await viewer.send('post', endpoint(custom), {
          conditions: [{ field: 'score', op: 'eq', value: '1' }],
        })
      ).status,
    ).toBe(403);
    await db().pool.query('update datasets set is_archived=true where id=$1', [
      custom,
    ]);
    try {
      expect((await viewer.send('post', endpoint(custom), {})).status).toBe(
        404,
      );
      expect((await search({}, custom, admin)).pageInfo.total).toBe(25);
    } finally {
      await db().pool.query(
        'update datasets set is_archived=false where id=$1',
        [custom],
      );
    }
    await db().pool.query('update users set is_active=false where id=$1', [
      seedIds.viewer,
    ]);
    try {
      expect((await viewer.send('post', endpoint(custom), {})).status).toBe(
        401,
      );
    } finally {
      await db().pool.query('update users set is_active=true where id=$1', [
        seedIds.viewer,
      ]);
    }
  });
  it('uses one repeatable-read snapshot for page and exact count during concurrent insertion', async () => {
    const locker = await db().pool.connect();
    let pending: ReturnType<typeof search> | undefined;
    let inserted: string | undefined;
    try {
      await locker.query('begin');
      await locker.query('lock dataset_records in access exclusive mode');
      pending = search({ columns: ['id'], pageSize: 100 }, custom, admin);
      let blocked = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const activity = await db().pool.query<{ blocked: boolean }>(
          "select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%jsonb_build_object%') as blocked",
        );
        if (activity.rows[0]?.blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      const row = await locker.query<{ id: string }>(
        "insert into dataset_records(dataset_id,name) values($1,'Concurrent snapshot fixture') returning id::text",
        [custom],
      );
      inserted = row.rows[0]?.id;
      await locker.query('commit');
      const response = await pending;
      expect(response.pageInfo.total).toBe(25);
      expect(response.data).toHaveLength(25);
      expect(response.data.some((record) => record.id === inserted)).toBe(
        false,
      );
      expect(
        (await search({ columns: ['id'], pageSize: 100 }, custom, admin))
          .pageInfo.total,
      ).toBe(26);
    } finally {
      await locker.query('rollback');
      locker.release();
      if (pending) await pending;
      if (inserted)
        await db().pool.query('delete from dataset_records where id=$1', [
          inserted,
        ]);
    }
  });
  it('enforces the overall 10-second deadline by destroying the active connection without history or pool leaks', async () => {
    const url = new URL(config.connectionString);
    url.pathname = `/${databaseName}`;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: url.toString(),
          DB_POOL_MAX: 1,
          DB_STATEMENT_TIMEOUT_MS: 10000,
        }),
      )
      .compile();
    const deadlineApp =
      module.createNestApplication<INestApplication<Server>>();
    deadlineApp.useLogger(false);
    configureApp(deadlineApp);
    await deadlineApp.init();
    const caller = new ApiClient(deadlineApp.getHttpServer());
    const credentials = config.accounts.find(
      (account) => account.role === 'admin',
    );
    if (!credentials) throw new Error('Missing credentials');
    await caller.login(credentials.email, credentials.password);
    const locker = await db().pool.connect();
    const before = await db().pool.query<{ total: number }>(
      'select count(*)::int as total from search_history',
    );
    try {
      await locker.query('begin');
      await locker.query('lock dataset_records in access exclusive mode');
      const started = Date.now();
      const result = await request(deadlineApp.getHttpServer())
        .post(endpoint(custom))
        .set('Cookie', caller.cookie())
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', caller.csrf)
        .set('X-Search-Intent', 'apply')
        .send({});
      expect(result.status).toBe(503);
      expect(apiErrorSchema.parse(result.body).code).toBe('SEARCH_TIMEOUT');
      expect(Date.now() - started).toBeLessThan(12000);
    } finally {
      await locker.query('rollback');
      locker.release();
      await deadlineApp.close();
    }
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from search_history',
        )
      ).rows,
    ).toEqual(before.rows);
    expect(deadlineApp.get(DatabaseService).pool.totalCount).toBe(0);
    expect((await search({}, custom, admin)).pageInfo.total).toBe(25);
  });
  it('captures actual generated SQL plans on 100k without forced indexes', async () => {
    const fields = await db()
      .db.select()
      .from(schema.datasetFields)
      .where(sql`${schema.datasetFields.datasetId} = ${seedIds.primary}`);
    const permissions = app?.get(PermissionsService);
    if (!permissions) throw new Error('Missing permission service');
    const user = {
      id: seedIds.admin,
      email: 'not-logged@example.test',
      role: 'admin' as const,
    };
    const cases = [
      { q: '"Known Match Alpha"' },
      { conditions: [{ field: 'name', op: 'contains', value: 'match alpha' }] },
      {
        conditions: [
          { field: 'status', op: 'eq', value: 'Active' },
          { field: 'country', op: 'eq', value: 'Germany' },
        ],
      },
      { page: 901, pageSize: 100, sort: [{ field: 'id', direction: 'asc' }] },
    ];
    await db().pool.query('analyze dataset_records');
    const plans = [];
    for (const input of cases) {
      const query = validateSearch(
        searchRequestSchema.parse({ ...input, columns: ['id'] }),
        fields,
      );
      const compiled = compileSearch(
        seedIds.primary,
        query,
        fields,
        permissions.visible(user, schema.datasetRecords.datasetId),
      );
      const result = await db().db.execute(
        sql`explain (analyze,buffers,format json) ${compiled.rows}`,
      );
      const count = await db().db.execute(
        sql`explain (analyze,buffers,format json) ${compiled.count}`,
      );
      plans.push({ input, rows: result.rows, count: count.rows });
    }
    const encoded = JSON.stringify(plans);
    expect(encoded).toContain('dataset_records_search_vector_gin_idx');
    expect(encoded).toContain('dataset_records_name_trgm_gin_idx');
    const planFile = new URL(
      '../../../../../docs/evidence/be-10-13/generated-plans.json',
      import.meta.url,
    );
    mkdirSync(new URL('.', planFile), { recursive: true });
    writeFileSync(
      planFile,
      JSON.stringify(
        {
          scope: 'Single SQL samples, no load/p95 claim',
          primaryCount: 100000,
          postgres: (await db().pool.query('show server_version')).rows,
          plans,
        },
        null,
        2,
      ),
    );
    const event = logs.find((entry) =>
      entry.includes('"event":"search_execution"'),
    );
    expect(event).toBeDefined();
    expect(event).not.toContain('Known Match Alpha');
  });
  it('rate-limits per active user and returns Retry-After without granting additional access', async () => {
    // Viewer has used only a few requests; reserve all remaining slots with cheap authorized searches.
    let limited = false;
    for (let i = 0; i < 61; i++) {
      const result = await viewer.send('post', endpoint(custom), {
        columns: ['id'],
        page: 4,
        pageSize: 10,
      });
      if (result.status === 429) {
        expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
        limited = true;
        break;
      }
      expect(result.status).toBe(200);
    }
    expect(limited).toBe(true);
  });
});
