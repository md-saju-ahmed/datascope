import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import {
  createDatabase,
  migrateDatabase,
  seedConfiguration,
  seedDatabase,
  seedIds,
} from '@datascope/db';
import {
  viewResponseSchema,
  viewListResponseSchema,
  shareResponseSchema,
  searchResponseSchema,
  historyResponseSchema,
  historyClearResponseSchema,
  datasetAnalyticsResponseSchema,
  platformAnalyticsResponseSchema,
  activityResponseSchema,
  usersResponseSchema,
  userResponseSchema,
  preferencesResponseSchema,
  settingsResponseSchema,
  apiErrorSchema,
} from '@datascope/contracts';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';
import { administerDisposableDatabase } from './support/disposable-database.js';
import { ApiClient } from './support/api-client.js';
const name = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
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
const base = '/api/v1';
describe('BE-14–18 real PostgreSQL views/history/analytics/management/CSV', () => {
  let created = false;
  let app: INestApplication<Server> | undefined;
  let database: ReturnType<typeof createDatabase> | undefined;
  let admin: ApiClient;
  let analyst: ApiClient;
  let viewer: ApiClient;
  let other: ApiClient;
  const custom = randomUUID();
  const otherId = randomUUID();
  const ids: string[] = [];
  const audits: string[] = [];
  const db = () => {
    if (!database) throw new Error('Missing database');
    return database;
  };
  const server = () => {
    if (!app) throw new Error('Missing app');
    return app.getHttpServer();
  };
  const searchPath = (id: string) => `${base}/datasets/${id}/search`;
  const exportPath = (id: string) => `${base}/datasets/${id}/exports/selected`;
  const configBody = (advanced = false) => ({
    version: 1,
    q: '',
    conditions: advanced
      ? [{ field: 'revenue', op: 'gt', value: '10000' }]
      : [],
    sort: [{ field: 'name', direction: 'asc' }],
    columns: ['name', 'revenue'],
    pageSize: 10,
  });
  async function makeView(
    advanced = false,
    client: ApiClient = analyst,
    datasetId: string = custom,
  ) {
    const result = await client.send('post', `${base}/saved-views`, {
      name: 'Workflow view',
      datasetId,
      config: configBody(advanced),
    });
    expect(result.status).toBe(201);
    return viewResponseSchema.parse(result.body).data;
  }
  async function applied(
    client: ApiClient,
    q: string,
    datasetId: string = custom,
  ) {
    return request(server())
      .post(searchPath(datasetId))
      .set('Cookie', client.cookie())
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', client.csrf)
      .set('X-Search-Intent', 'apply')
      .send({
        q,
        conditions: [{ field: 'status', op: 'eq', value: 'Active' }],
      });
  }
  beforeAll(async () => {
    administerDisposableDatabase(name, true);
    created = true;
    const url = new URL(config.connectionString);
    url.pathname = `/${name}`;
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
          DB_STATEMENT_TIMEOUT_MS: 10000,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.useLogger({
      log(value: unknown) {
        if (typeof value === 'string') audits.push(value);
      },
      warn() {},
      error() {},
    });
    configureApp(app);
    await app.init();
    admin = new ApiClient(server());
    analyst = new ApiClient(server());
    viewer = new ApiClient(server());
    other = new ApiClient(server());
    for (const [role, client] of [
      ['admin', admin],
      ['analyst', analyst],
      ['viewer', viewer],
    ] as const) {
      const account = config.accounts.find((entry) => entry.role === role);
      if (!account) throw new Error('Missing credentials');
      await client.login(account.email, account.password);
    }
    const credentials = config.accounts.find(
      (entry) => entry.role === 'viewer',
    );
    if (!credentials) throw new Error('Missing credentials');
    const email = `other-${randomUUID()}@example.test`;
    await db().pool.query(
      "insert into users(id,email,password_hash,role) select $1,$2,password_hash,'analyst' from users where id=$3",
      [otherId, email, seedIds.viewer],
    );
    await other.login(email, credentials.password);
    await db().pool.query(
      "insert into datasets(id,slug,name,source) values($1,$2,'Workflow dataset','test')",
      [custom, `workflow-${custom}`],
    );
    await db().pool.query(
      "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'analyze'),($1,$3,'read'),($1,$4,'read')",
      [custom, seedIds.analyst, seedIds.viewer, otherId],
    );
    await db().pool.query(
      `insert into dataset_fields(dataset_id,field_key,label,data_type,operators,is_searchable,is_filterable,is_sortable,is_visible,sort_order)
     select $1,field_key,label,data_type,operators,is_searchable,is_filterable,is_sortable,is_visible,sort_order from dataset_fields where dataset_id=$2`,
      [custom, seedIds.primary],
    );
    for (let i = 0; i < 60; i++) {
      const inserted = await db().pool.query<{ id: string }>(
        `insert into dataset_records(id,dataset_id,name,status,country,category,revenue,attributes,created_at)
       values($1,$2,$3,$4,'Germany',$5,$6,$7,now()-interval '1 day') returning id::text`,
        [
          (9007199254740993n + BigInt(i)).toString(),
          custom,
          i === 0
            ? '=HYPERLINK("unsafe")'
            : i === 1
              ? 'Comma, "quote"\nline'
              : `Business ${i.toString()}`,
          i === 59 ? null : i % 2 ? 'Pending' : 'Active',
          `Category ${i.toString()}`,
          '9999999999999999.99',
          JSON.stringify({
            employeeCount: i,
            verified: i % 2 === 0,
            industry: 'Industry',
          }),
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('Missing ID');
      ids.push(id);
    }
  });
  beforeEach(async () => {
    await db().pool.query('delete from search_history');
    await db().pool.query(
      "delete from system_settings where key in ('registration.enabled','exports.max_selected_rows')",
    );
  });
  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      try {
        if (database) await database.pool.end();
      } finally {
        if (created) administerDisposableDatabase(name, false);
      }
    }
  });

  it('creates/lists/gets/renames/deletes owned views and persists validated state', async () => {
    const view = await makeView();
    expect(view.ownerId).toBe(seedIds.analyst);
    expect(view.config.columns).toEqual(['name', 'revenue']);
    const listing = await analyst
      .get(`${base}/saved-views?datasetId=${custom}`)
      .expect(200);
    expect(
      viewListResponseSchema
        .parse(listing.body)
        .data.some((row) => row.id === view.id),
    ).toBe(true);
    expect(
      viewResponseSchema.parse(
        (await analyst.get(`${base}/saved-views/${view.id}`).expect(200)).body,
      ).data.config,
    ).toEqual(view.config);
    const changed = await analyst.send(
      'patch',
      `${base}/saved-views/${view.id}`,
      { name: 'Renamed' },
    );
    expect(changed.status).toBe(200);
    expect(viewResponseSchema.parse(changed.body).data.name).toBe('Renamed');
    const persisted = await db().pool.query<{ name: string }>(
      'select name from saved_views where id=$1',
      [view.id],
    );
    expect(persisted.rows).toEqual([{ name: 'Renamed' }]);
    expect(
      (await analyst.send('delete', `${base}/saved-views/${view.id}`)).status,
    ).toBe(200);
    await analyst.get(`${base}/saved-views/${view.id}`).expect(404);
  });
  it('enforces owner/role boundaries and denies forged dataset/owner/config fields', async () => {
    const view = await makeView();
    await other.get(`${base}/saved-views/${view.id}`).expect(404);
    expect(
      (
        await other.send('patch', `${base}/saved-views/${view.id}`, {
          name: 'Stolen',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await viewer.send('post', `${base}/saved-views`, {
          name: 'Denied',
          datasetId: custom,
          config: configBody(),
        })
      ).status,
    ).toBe(403);
    for (const extra of [
      { ownerId: otherId },
      { datasetId: seedIds.restricted },
    ])
      expect(
        (await analyst.send('patch', `${base}/saved-views/${view.id}`, extra))
          .status,
      ).toBe(400);
    expect(
      (
        await analyst.send('post', `${base}/saved-views`, {
          name: 'Bad',
          datasetId: custom,
          config: {
            ...configBody(),
            conditions: [{ field: 'bad', op: 'eq', value: 'x' }],
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (await viewer.send('delete', `${base}/saved-views/${view.id}`)).status,
    ).toBe(403);
  });
  it('shares idempotently only with authorized recipients, rechecks revocation and hides counts', async () => {
    const view = await makeView(true);
    const path = `${base}/saved-views/${view.id}/shares`;
    const shared = await analyst.send('post', path, { userId: seedIds.viewer });
    expect(shared.status).toBe(201);
    expect(shareResponseSchema.parse(shared.body).data.userId).toBe(
      seedIds.viewer,
    );
    expect(
      (await analyst.send('post', path, { userId: seedIds.viewer })).status,
    ).toBe(201);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from saved_view_shares where view_id=$1',
          [view.id],
        )
      ).rows[0]?.total,
    ).toBe(1);
    await viewer.get(`${base}/saved-views/${view.id}`).expect(200);
    await db().pool.query(
      'delete from dataset_permissions where dataset_id=$1 and user_id=$2',
      [custom, seedIds.viewer],
    );
    try {
      await viewer.get(`${base}/saved-views/${view.id}`).expect(404);
      const rows = viewListResponseSchema.parse(
        (
          await viewer
            .get(`${base}/saved-views?datasetId=${custom}`)
            .expect(200)
        ).body,
      );
      expect(rows.data).toEqual([]);
      expect(rows.pageInfo.total).toBe(0);
      expect(
        (await analyst.send('post', path, { userId: seedIds.viewer })).status,
      ).toBe(404);
    } finally {
      await db().pool.query(
        "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'read')",
        [custom, seedIds.viewer],
      );
    }
    expect(
      (await analyst.send('delete', `${path}/${seedIds.viewer}`)).status,
    ).toBe(200);
    await viewer.get(`${base}/saved-views/${view.id}`).expect(404);
  });
  it('reapplies authorized shared advanced configuration without accepting arbitrary Viewer predicates', async () => {
    const view = await makeView(true);
    await analyst.send('post', `${base}/saved-views/${view.id}/shares`, {
      userId: seedIds.viewer,
    });
    const appliedView = await viewer.send(
      'post',
      `${base}/saved-views/${view.id}/apply`,
      { page: 2 },
    );
    expect(appliedView.status).toBe(200);
    const result = searchResponseSchema.parse(appliedView.body);
    expect(result.pageInfo).toMatchObject({ page: 2, pageSize: 10, total: 60 });
    expect(
      (
        await viewer.send('post', `${base}/saved-views/${view.id}/apply`, {
          conditions: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await viewer.send('post', searchPath(custom), {
          conditions: [{ field: 'revenue', op: 'gt', value: '10000' }],
        })
      ).status,
    ).toBe(403);
    const history = historyResponseSchema.parse(
      (await viewer.get(`${base}/search-history`).expect(200)).body,
    );
    expect(history.data[0]?.normalizedQuery.savedViewId).toBe(view.id);
    await analyst.send(
      'delete',
      `${base}/saved-views/${view.id}/shares/${seedIds.viewer}`,
    );
    expect(
      (await viewer.send('post', `${base}/saved-views/${view.id}/apply`, {}))
        .status,
    ).toBe(404);
    expect(
      historyResponseSchema.parse(
        (await viewer.get(`${base}/search-history`).expect(200)).body,
      ).pageInfo.total,
    ).toBe(0);
  });
  it('rejects stale metadata on reapply and allows Admin management within dataset policy', async () => {
    const view = await makeView(true);
    const patch = await admin.send('patch', `${base}/saved-views/${view.id}`, {
      name: 'Admin edited',
    });
    expect(patch.status).toBe(200);
    await db().pool.query(
      "update dataset_fields set is_filterable=false,operators='[]' where dataset_id=$1 and field_key='revenue'",
      [custom],
    );
    try {
      expect(
        (await analyst.send('post', `${base}/saved-views/${view.id}/apply`, {}))
          .status,
      ).toBe(400);
    } finally {
      await db().pool.query(
        'update dataset_fields set is_filterable=true,operators=\'["eq","gt","gte","lt","lte","between"]\' where dataset_id=$1 and field_key=\'revenue\'',
        [custom],
      );
    }
  });
  it('denies sharing outside dataset access or from recipients and cascades shares on delete', async () => {
    const view = await makeView(false, analyst, seedIds.restricted);
    expect(
      (
        await analyst.send('post', `${base}/saved-views/${view.id}/shares`, {
          userId: seedIds.viewer,
        })
      ).status,
    ).toBe(404);
    const own = await makeView();
    await analyst.send('post', `${base}/saved-views/${own.id}/shares`, {
      userId: otherId,
    });
    expect(
      (
        await other.send('post', `${base}/saved-views/${own.id}/shares`, {
          userId: seedIds.viewer,
        })
      ).status,
    ).toBe(404);
    await analyst.send('delete', `${base}/saved-views/${own.id}`);
    expect(
      (
        await db().pool.query<{ total: number }>(
          'select count(*)::int as total from saved_view_shares where view_id=$1',
          [own.id],
        )
      ).rows[0]?.total,
    ).toBe(0);
  });
  it('paginates real user-only history, redacts inaccessible datasets and clears only the caller', async () => {
    expect((await applied(analyst, 'history-one')).status).toBe(200);
    expect((await applied(viewer, 'history-two')).status).toBe(200);
    expect(
      (await applied(analyst, 'restricted-query', seedIds.restricted)).status,
    ).toBe(200);
    const history = historyResponseSchema.parse(
      (await analyst.get(`${base}/search-history?pageSize=10`).expect(200))
        .body,
    );
    expect(history.data).toHaveLength(2);
    expect(history.data[0]?.normalizedQuery.q).toBe('restricted-query');
    await db().pool.query(
      'delete from dataset_permissions where dataset_id=$1 and user_id=$2',
      [seedIds.restricted, seedIds.analyst],
    );
    try {
      const visible = historyResponseSchema.parse(
        (await analyst.get(`${base}/search-history`).expect(200)).body,
      );
      expect(visible.pageInfo.total).toBe(1);
      expect(visible.data[0]?.normalizedQuery.q).toBe('history-one');
    } finally {
      await db().pool.query(
        "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'analyze')",
        [seedIds.restricted, seedIds.analyst],
      );
    }
    const cleared = await analyst.send('delete', `${base}/search-history`);
    expect(cleared.status).toBe(200);
    expect(historyClearResponseSchema.parse(cleared.body).data.deleted).toBe(
      '2',
    );
    expect(
      historyResponseSchema.parse(
        (await viewer.get(`${base}/search-history`).expect(200)).body,
      ).pageInfo.total,
    ).toBe(1);
    expect(
      (
        await analyst.send('delete', `${base}/search-history`, {
          userId: seedIds.viewer,
        })
      ).status,
    ).toBe(400);
  });
  it('serializes clear with concurrent applied-search recording and keeps history bounded', async () => {
    const results = await Promise.all([
      applied(analyst, 'race-history'),
      analyst.send('delete', `${base}/search-history`),
      applied(analyst, 'race-history'),
    ]);
    expect(results.map((row) => row.status)).toEqual([200, 200, 200]);
    const rows = historyResponseSchema.parse(
      (await analyst.get(`${base}/search-history`).expect(200)).body,
    );
    expect(rows.data.length).toBeLessThanOrEqual(1);
  });
  it('returns deterministic bounded history pages and precision-safe bigint history IDs', async () => {
    const normalized = JSON.stringify({
      version: 1,
      q: 'paged',
      conditions: [],
      sort: [],
      pageSize: 25,
    });
    await db().pool.query(
      "insert into search_history(user_id,dataset_id,normalized_query,executed_at) select $1,$2,$3,now()-g*interval '1 second' from generate_series(1,12) g",
      [seedIds.analyst, custom, normalized],
    );
    const first = historyResponseSchema.parse(
      (await analyst.get(`${base}/search-history?pageSize=10`).expect(200))
        .body,
    );
    const second = historyResponseSchema.parse(
      (
        await analyst
          .get(`${base}/search-history?pageSize=10&page=2`)
          .expect(200)
      ).body,
    );
    expect(first.data).toHaveLength(10);
    expect(second.data).toHaveLength(2);
    expect(first.pageInfo.total).toBe(12);
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(second.pageInfo.hasNextPage).toBe(false);
    expect(
      new Set([...first.data, ...second.data].map((row) => row.id)).size,
    ).toBe(12);
    await db().pool.query(
      'insert into search_history(id,user_id,dataset_id,normalized_query) values($1,$2,$3,$4)',
      ['9007199254740993', seedIds.analyst, custom, normalized],
    );
    expect(
      historyResponseSchema.parse(
        (await analyst.get(`${base}/search-history`).expect(200)).body,
      ).data[0]?.id,
    ).toBe('9007199254740993');
  });
  it('reconciles all dataset aggregations against independent PostgreSQL queries including top50 remainder', async () => {
    expect((await applied(analyst, 'analytics-own')).status).toBe(200);
    expect((await applied(admin, 'analytics-admin')).status).toBe(200);
    const response = await analyst
      .get(`${base}/datasets/${custom}/analytics?days=30`)
      .expect(200);
    const data = datasetAnalyticsResponseSchema.parse(response.body).data;
    expect(data.totalRecords).toBe('60');
    expect(data.byCategory.buckets).toHaveLength(50);
    expect(data.byCategory.otherCount).toBe('10');
    const status = await db().pool.query<{ key: string | null; count: string }>(
      'select status as key,count(*)::text as count from dataset_records where dataset_id=$1 group by status order by count(*) desc,status collate "C" nulls last',
      [custom],
    );
    expect(data.byStatus.buckets).toEqual(status.rows);
    const category = await db().pool.query<{
      key: string | null;
      count: string;
    }>(
      'select category as key,count(*)::text as count from dataset_records where dataset_id=$1 group by category order by count(*) desc,category collate "C" nulls last limit 50',
      [custom],
    );
    expect(data.byCategory.buckets).toEqual(category.rows);
    const total = await db().pool.query<{ total: string }>(
      'select count(*)::text as total from dataset_records where dataset_id=$1',
      [custom],
    );
    expect(data.totalRecords).toBe(total.rows[0]?.total);
    const growth = await db().pool.query<{ key: string; count: string }>(
      "select to_char(created_at at time zone 'UTC','YYYY-MM-DD') as key,count(*)::text as count from dataset_records where dataset_id=$1 and created_at>=now()-interval '30 days' and created_at<=now() group by 1 order by 1",
      [custom],
    );
    expect(data.growth).toEqual(growth.rows);
    const window = [
      custom,
      seedIds.analyst,
      data.searchActivity.from,
      data.searchActivity.to,
    ];
    const activity = await db().pool.query<{ total: string }>(
      'select count(*)::text as total from search_history where dataset_id=$1 and user_id=$2 and executed_at between $3 and $4',
      window,
    );
    expect(data.searchActivity.total).toBe(activity.rows[0]?.total);
    const filters = await db().pool.query<{ key: string; count: string }>(
      'select f.key,count(*)::text as count from search_history h cross join lateral jsonb_array_elements_text(filter_keys) f(key) where dataset_id=$1 and user_id=$2 and executed_at between $3 and $4 group by f.key order by count(*) desc,f.key collate "C" limit 50',
      window,
    );
    expect(data.searchActivity.filters).toEqual(filters.rows);
    const days = await db().pool.query<{ key: string; count: string }>(
      "select to_char(executed_at at time zone 'UTC','YYYY-MM-DD') as key,count(*)::text as count from search_history where dataset_id=$1 and user_id=$2 and executed_at between $3 and $4 group by 1 order by 1",
      window,
    );
    expect(data.searchActivity.byDay).toEqual(days.rows);
    expect(
      data.byCategory.buckets.reduce(
        (sum, row) => sum + BigInt(row.count),
        BigInt(data.byCategory.otherCount),
      ),
    ).toBe(60n);
    expect(data.growth.reduce((sum, row) => sum + BigInt(row.count), 0n)).toBe(
      60n,
    );
    expect(data.searchActivity.total).toBe('1');
    expect(data.searchActivity.scope).toBe('own');
    expect(data.searchActivity.filters).toEqual([
      { key: 'status', count: '1' },
    ]);
    const adminResult = datasetAnalyticsResponseSchema.parse(
      (await admin.get(`${base}/datasets/${custom}/analytics`).expect(200))
        .body,
    ).data;
    expect(adminResult.searchActivity.total).toBe('2');
    const primary = datasetAnalyticsResponseSchema.parse(
      (
        await admin
          .get(`${base}/datasets/${seedIds.primary}/analytics`)
          .expect(200)
      ).body,
    ).data;
    expect(primary.totalRecords).toBe('100000');
  });
  it('returns actual platform/activity totals with role and dataset permission denials', async () => {
    const platform = platformAnalyticsResponseSchema.parse(
      (await admin.get(`${base}/analytics/platform`).expect(200)).body,
    ).data;
    const expected = await db().pool.query<{ total: string }>(
      'select count(*)::text as total from dataset_records',
    );
    expect(platform.totalRecords).toBe(expected.rows[0]?.total);
    await analyst.get(`${base}/analytics/platform`).expect(403);
    await viewer.get(`${base}/datasets/${custom}/analytics`).expect(403);
    await viewer.get(`${base}/analytics/search-activity`).expect(403);
    await other.get(`${base}/datasets/${custom}/analytics`).expect(403);
    await viewer
      .get(`${base}/datasets/${seedIds.restricted}/analytics`)
      .expect(404);
    const empty = activityResponseSchema.parse(
      (
        await analyst
          .get(`${base}/analytics/search-activity?datasetId=${custom}`)
          .expect(200)
      ).body,
    ).data;
    expect(empty.total).toBe('0');
    expect(empty.byDay).toEqual([]);
    expect(empty.filters).toEqual([]);
  });
  it('reports truthful empty dataset analytics', async () => {
    const id = randomUUID();
    await db().pool.query(
      "insert into datasets(id,slug,name,source) values($1,$2,'Empty','test')",
      [id, `empty-${id}`],
    );
    const data = datasetAnalyticsResponseSchema.parse(
      (await admin.get(`${base}/datasets/${id}/analytics`).expect(200)).body,
    ).data;
    expect(data.totalRecords).toBe('0');
    expect(data.byCategory).toEqual({ buckets: [], otherCount: '0' });
    expect(data.byStatus).toEqual({ buckets: [], otherCount: '0' });
    expect(data.growth).toEqual([]);
    expect(data.searchActivity.total).toBe('0');
  });
  it('lists only safe user projections and applies persisted role changes immediately', async () => {
    const list = usersResponseSchema.parse(
      (await admin.get(`${base}/users?pageSize=10`).expect(200)).body,
    );
    expect(list.pageInfo.total).toBe(4);
    expect(JSON.stringify(list)).not.toContain('passwordHash');
    await analyst.get(`${base}/users`).expect(403);
    const patched = await admin.send('patch', `${base}/users/${otherId}`, {
      role: 'viewer',
    });
    expect(patched.status).toBe(200);
    expect(userResponseSchema.parse(patched.body).data.role).toBe('viewer');
    try {
      expect(
        (
          await other.send('post', `${base}/saved-views`, {
            name: 'No',
            datasetId: custom,
            config: configBody(),
          })
        ).status,
      ).toBe(403);
    } finally {
      await db().pool.query("update users set role='analyst' where id=$1", [
        otherId,
      ]);
    }
    expect(
      (
        await analyst.send('patch', `${base}/users/${seedIds.viewer}`, {
          role: 'admin',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.send('patch', `${base}/users/${seedIds.viewer}`, {
          passwordHash: 'forged',
        })
      ).status,
    ).toBe(400);
  });
  it('prevents loss of final active Admin including concurrent self-demotions', async () => {
    const denied = await admin.send('patch', `${base}/users/${seedIds.admin}`, {
      isActive: false,
    });
    expect(denied.status).toBe(409);
    expect(apiErrorSchema.parse(denied.body).code).toBe('LAST_ADMIN');
    const second = randomUUID();
    const email = `second-${randomUUID()}@example.test`;
    const credentials = config.accounts.find((row) => row.role === 'admin');
    if (!credentials) throw new Error('Missing admin');
    await db().pool.query(
      "insert into users(id,email,password_hash,role) select $1,$2,password_hash,'admin' from users where id=$3",
      [second, email, seedIds.admin],
    );
    const caller = new ApiClient(server());
    await caller.login(email, credentials.password);
    try {
      const result = await Promise.all([
        admin.send('patch', `${base}/users/${seedIds.admin}`, {
          role: 'viewer',
        }),
        caller.send('patch', `${base}/users/${second}`, { role: 'viewer' }),
      ]);
      expect(result.map((row) => row.status).sort()).toEqual([200, 409]);
      expect(
        (
          await db().pool.query<{ total: number }>(
            "select count(*)::int as total from users where role='admin' and is_active",
          )
        ).rows[0]?.total,
      ).toBe(1);
    } finally {
      await db().pool.query(
        "update users set role='admin',is_active=true where id=$1",
        [seedIds.admin],
      );
      await db().pool.query('delete from users where id=$1', [second]);
    }
  });
  it('deactivation revokes real sessions and reactivation requires a new login', async () => {
    expect(
      (
        await admin.send('patch', `${base}/users/${otherId}`, {
          isActive: false,
        })
      ).status,
    ).toBe(200);
    await other.get(`${base}/auth/me`).expect(401);
    const active = await admin.send('patch', `${base}/users/${otherId}`, {
      isActive: true,
    });
    expect(active.status).toBe(200);
    await other.get(`${base}/auth/me`).expect(401);
    const credentials = config.accounts.find((row) => row.role === 'viewer');
    if (!credentials) throw new Error('Missing credentials');
    const identity = await db().pool.query<{ email: string }>(
      'select email from users where id=$1',
      [otherId],
    );
    const email = identity.rows[0]?.email;
    if (!email) throw new Error('Missing identity');
    await other.login(email, credentials.password);
  });
  it('persists only own preferences, merges concurrent patches and validates selected dataset access', async () => {
    expect(
      preferencesResponseSchema.parse(
        (await viewer.get(`${base}/preferences/me`).expect(200)).body,
      ).data.defaultPageSize,
    ).toBe(25);
    const response = await viewer.send('patch', `${base}/preferences/me`, {
      density: 'compact',
      defaultDatasetId: custom,
    });
    expect(response.status).toBe(200);
    const race = await Promise.all([
      viewer.send('patch', `${base}/preferences/me`, { defaultPageSize: 50 }),
      viewer.send('patch', `${base}/preferences/me`, {
        density: 'comfortable',
      }),
    ]);
    expect(race.map((row) => row.status)).toEqual([200, 200]);
    const prefs = preferencesResponseSchema.parse(
      (await viewer.get(`${base}/preferences/me`).expect(200)).body,
    ).data;
    expect(prefs).toEqual({
      defaultPageSize: 50,
      density: 'comfortable',
      defaultDatasetId: custom,
    });
    expect(
      (
        await viewer.send('patch', `${base}/preferences/me`, {
          userId: seedIds.admin,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await viewer.send('patch', `${base}/preferences/me`, {
          defaultDatasetId: seedIds.restricted,
        })
      ).status,
    ).toBe(404);
    await db().pool.query(
      'delete from dataset_permissions where dataset_id=$1 and user_id=$2',
      [custom, seedIds.viewer],
    );
    try {
      expect(
        preferencesResponseSchema.parse(
          (await viewer.get(`${base}/preferences/me`).expect(200)).body,
        ).data.defaultDatasetId,
      ).toBe(null);
    } finally {
      await db().pool.query(
        "insert into dataset_permissions(dataset_id,user_id,permission) values($1,$2,'read')",
        [custom, seedIds.viewer],
      );
    }
  });
  it('restricts system keys, enforces registration/export settings, and never returns private seed values', async () => {
    const response = settingsResponseSchema.parse(
      (await admin.get(`${base}/system/settings`).expect(200)).body,
    );
    expect(response.data).toEqual({
      'registration.enabled': true,
      'exports.max_selected_rows': 1000,
    });
    await viewer.get(`${base}/system/settings`).expect(403);
    expect(
      (
        await analyst.send('patch', `${base}/system/settings`, {
          'registration.enabled': false,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.send('patch', `${base}/system/settings`, {
          'seed.marker': 'leak',
        })
      ).status,
    ).toBe(400);
    const changed = await admin.send('patch', `${base}/system/settings`, {
      'registration.enabled': false,
      'exports.max_selected_rows': 1,
    });
    expect(changed.status).toBe(200);
    const fresh = new ApiClient(server());
    const bootstrap = await request(server())
      .get(`${base}/auth/csrf`)
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    const cookies: unknown = bootstrap.headers['set-cookie'];
    if (!Array.isArray(cookies)) throw new Error('Missing cookie');
    for (const cookie of cookies) {
      if (typeof cookie !== 'string') throw new Error('Invalid cookie');
      const part = cookie.split(';')[0] ?? '';
      const at = part.indexOf('=');
      fresh.cookies.set(part.slice(0, at), part.slice(at + 1));
    }
    const csrf: unknown = bootstrap.body;
    if (
      typeof csrf !== 'object' ||
      csrf === null ||
      !('csrfToken' in csrf) ||
      typeof csrf.csrfToken !== 'string'
    )
      throw new Error('Missing CSRF');
    fresh.csrf = csrf.csrfToken;
    const denied = await fresh.send('post', `${base}/auth/register`, {
      email: `new-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('hex'),
    });
    expect(denied.status).toBe(403);
    expect(apiErrorSchema.parse(denied.body).code).toBe(
      'REGISTRATION_DISABLED',
    );
    expect(
      (
        await analyst.send('post', exportPath(custom), {
          recordIds: ids.slice(0, 2),
          columns: ['name'],
        })
      ).status,
    ).toBe(400);
    await admin.send('patch', `${base}/system/settings`, {
      'registration.enabled': true,
    });
    const allowed = await fresh.send('post', `${base}/auth/register`, {
      email: `allowed-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('hex'),
    });
    expect(allowed.status).toBe(201);
  });
  it('exports only requested rows/columns with safe precision, proper CSV quoting and formula mitigation', async () => {
    const first = ids[0];
    const second = ids[1];
    if (!first || !second) throw new Error('Missing CSV fixtures');
    const response = await analyst.send('post', exportPath(custom), {
      recordIds: [ids[1], ids[0]],
      columns: ['id', 'name', 'revenue', 'verified'],
    });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.text).toBe(
      `"id","name","revenue","verified"\r\n"${first}","'=HYPERLINK(""unsafe"")","9999999999999999.99","true"\r\n"${second}","Comma, ""quote""\nline","9999999999999999.99","false"\r\n`,
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects cross-dataset/missing selections, Viewer/read-only export, unsafe columns and size overflow', async () => {
    const body = { recordIds: [ids[0]], columns: ['name'] };
    expect((await viewer.send('post', exportPath(custom), body)).status).toBe(
      403,
    );
    expect((await other.send('post', exportPath(custom), body)).status).toBe(
      403,
    );
    for (const target of [[ids[0], '1000000000001'], ['9223372036854775807']]) {
      const result = await analyst.send('post', exportPath(custom), {
        ...body,
        recordIds: target,
      });
      expect(result.status).toBe(404);
      expect(result.headers['content-type']).toContain('application/json');
    }
    expect(
      (
        await analyst.send('post', exportPath(custom), {
          ...body,
          columns: ['attributes'],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await analyst.send('post', exportPath(custom), {
          ...body,
          recordIds: Array.from({ length: 1001 }, (_, i) => (i + 1).toString()),
        })
      ).status,
    ).toBe(400);
    expect(
      (await viewer.send('post', exportPath(seedIds.restricted), body)).status,
    ).toBe(404);
  });
  it('exports the supported 1000-row boundary with independent selected-ID/value parity', async () => {
    const selected = await db().pool.query<{
      id: string;
      revenue: string | null;
    }>(
      'select id::text,revenue::text from dataset_records where dataset_id=$1 order by id limit 1000',
      [seedIds.primary],
    );
    const response = await analyst.send('post', exportPath(seedIds.primary), {
      recordIds: selected.rows.map((row) => row.id).reverse(),
      columns: ['id', 'revenue'],
    });
    expect(response.status).toBe(200);
    expect(response.text).toBe(
      '"id","revenue"\r\n' +
        selected.rows
          .map((row) => `"${row.id}","${row.revenue ?? ''}"`)
          .join('\r\n') +
        '\r\n',
    );
  });
  it.each([
    ['post', '/saved-views'],
    ['delete', '/search-history'],
    ['patch', '/users/' + seedIds.viewer],
    ['patch', '/preferences/me'],
    ['patch', '/system/settings'],
    ['post', `/datasets/${custom}/exports/selected`],
  ] as const)('requires valid auth/CSRF for %s %s', async (method, path) => {
    expect((await admin.send(method, base + path, {}, '')).status).toBe(403);
    const agent = request(server());
    await agent[method](base + path)
      .send({})
      .expect(401);
  });
  it('produces correlated access-change/export audit records without record or password contents', () => {
    expect(
      audits.some((value) => value.includes('"action":"user.access.update"')),
    ).toBe(true);
    expect(
      audits.some((value) =>
        value.includes('"action":"records.export.selected"'),
      ),
    ).toBe(true);
    expect(audits.some((value) => value.includes('"requestId":'))).toBe(true);
    for (const account of config.accounts)
      expect(audits.join('\n')).not.toContain(account.password);
    expect(audits.join('\n')).not.toContain('HYPERLINK');
  });
});
