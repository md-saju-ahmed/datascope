import { randomBytes, randomUUID } from 'node:crypto';
import {
  createDatabase,
  getMigrationStatus,
  migrateDatabase,
  seedConfiguration,
  seedDatabase,
  seedIds,
} from '@datascope/db';
import type { SeedConfiguration } from '@datascope/db';
import {
  administerDisposableDatabase,
  installDisposableExtensions,
} from './support/disposable-database.js';

const name = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
let created = false;
let opened = false;
let pool: ReturnType<typeof createDatabase>['pool'];
let config: SeedConfiguration;

beforeAll(() => {
  config = seedConfiguration(
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
  administerDisposableDatabase(name, true, false);
  created = true;
  const url = new URL(config.connectionString);
  url.pathname = `/${name}`;
  pool = createDatabase({
    connectionString: url.toString(),
    max: 4,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 60000,
  }).pool;
  opened = true;
});
afterAll(async () => {
  try {
    if (opened) await pool.end();
  } finally {
    if (created) administerDisposableDatabase(name, false);
  }
});

async function fixture() {
  const dataset = randomUUID();
  const other = randomUUID();
  await pool.query(
    "insert into datasets(id,slug,name,source) values($1,$2,'FTS fixture','test'),($3,$4,'Other FTS fixture','test')",
    [dataset, `fts-${dataset}`, other, `fts-${other}`],
  );
  await pool.query(
    `insert into dataset_fields(dataset_id,field_key,label,data_type,is_searchable,sort_order)
    values($1,'name','Name','string',true,0),($1,'status','Status','enum',true,1),
      ($1,'country','Country','enum',true,2),($1,'category','Category','enum',true,3),
      ($2,'name','Name','string',true,0)`,
    [dataset, other],
  );
  const record = await pool.query<{ id: string }>(
    `insert into dataset_records(dataset_id,name,status,country,category,attributes,created_at,updated_at)
    values($1,'Quasar Observatory','Active','Germany','Space',
      '{"note":"NebulaSignal","description":"GalacticSignal","secret":"HiddenSignal","score":"NumericSignal"}',
      '2020-01-01','2020-01-01') returning id::text`,
    [dataset],
  );
  const id = record.rows[0]?.id;
  if (!id) throw new Error('Missing FTS fixture');
  return { dataset, other, id };
}

async function matches(dataset: string, query: string): Promise<string[]> {
  const rows = await pool.query<{ id: string }>(
    `select id::text from dataset_records
    where dataset_id=$1 and search_vector @@ websearch_to_tsquery('simple',$2) order by id`,
    [dataset, query],
  );
  return rows.rows.map((row) => row.id);
}

async function expectBlocked(pid: number | undefined): Promise<void> {
  if (!pid) throw new Error('Missing PostgreSQL worker PID');
  for (let i = 0; i < 100; i++) {
    const state = await pool.query<{ blocked: boolean }>(
      'select cardinality(pg_blocking_pids($1))>0 as blocked',
      [pid],
    );
    if (state.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected PostgreSQL lock wait did not occur');
}

describe('PostgreSQL search migration and synchronized vectors', () => {
  it('refuses a missing extension atomically without granting the app database CREATE', async () => {
    const privilege = await pool.query<{ allowed: boolean }>(
      "select has_database_privilege(current_user,current_database(),'CREATE') as allowed",
    );
    expect(privilege.rows).toEqual([{ allowed: false }]);
    await expect(pool.query('create extension pg_trgm')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(migrateDatabase(pool)).rejects.toMatchObject({
      cause: { code: '55000' },
    });
    expect(
      (
        await pool.query(
          "select count(*)::int as count from pg_tables where schemaname='public'",
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(await getMigrationStatus(pool)).toMatchObject({
      ready: false,
      applied: 0,
      pending: 3,
    });
  });
  it('applies after explicit admin extension bootstrap and seeds 100k synchronized vectors', async () => {
    installDisposableExtensions(name);
    expect(await migrateDatabase(pool)).toMatchObject({
      ready: true,
      applied: 3,
      pending: 0,
    });
    const seeded = await seedDatabase(pool, config);
    expect(seeded).toMatchObject({
      primaryCount: 100000,
      restrictedCount: 128,
      dataChecksum: 'c5a8664c3f72aebec577a33193f6bd1e',
    });
    expect(
      (
        await pool.query(
          `select count(*)::int as populated from dataset_records
      where dataset_id=$1 and search_vector <> ''::tsvector`,
          [seedIds.primary],
        )
      ).rows,
    ).toEqual([{ populated: 100000 }]);
    await pool.query('analyze dataset_records');
    expect(await matches(seedIds.primary, '"Known Match Alpha"')).toEqual([
      '1000000000001',
    ]);
    expect((await seedDatabase(pool, config)).dataChecksum).toBe(
      seeded.dataChecksum,
    );
  });
  it('installs valid B-tree/GIN indexes and non-null vectors under restricted privileges', async () => {
    const indexes = await pool.query<{
      indexname: string;
      indexdef: string;
      valid: boolean;
    }>(`select c.relname as indexname,pg_get_indexdef(i.indexrelid) as indexdef,i.indisvalid as valid
      from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid='dataset_records'::regclass`);
    const expected = [
      'dataset_records_dataset_id_id_idx',
      'dataset_records_dataset_created_id_idx',
      'dataset_records_dataset_status_country_id_idx',
      'dataset_records_dataset_revenue_id_idx',
      'dataset_records_search_vector_gin_idx',
      'dataset_records_name_trgm_gin_idx',
    ];
    for (const index of expected)
      expect(indexes.rows.find((row) => row.indexname === index)).toMatchObject(
        { valid: true },
      );
    expect(
      indexes.rows.find(
        (row) => row.indexname === 'dataset_records_name_trgm_gin_idx',
      )?.indexdef,
    ).toContain('gin (lower(name) gin_trgm_ops)');
    expect(
      indexes.rows.find(
        (row) => row.indexname === 'dataset_records_dataset_id_idx',
      ),
    ).toBeUndefined();
    expect(
      (
        await pool.query(
          "select is_nullable from information_schema.columns where table_schema='public' and table_name='dataset_records' and column_name='search_vector'",
        )
      ).rows,
    ).toEqual([{ is_nullable: 'NO' }]);
    expect(
      (
        await pool.query(
          "select has_database_privilege(current_user,current_database(),'CREATE') as allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
  });
  it('indexes declared text only, handles malformed websearch safely and synchronizes record edits', async () => {
    const f = await fixture();
    expect(await matches(f.dataset, 'Quasar Active Germany Space')).toEqual([
      f.id,
    ]);
    expect(await matches(f.dataset, 'HiddenSignal')).toEqual([]);
    expect(await matches(f.dataset, 'NebulaSignal')).toEqual([]);
    expect(await matches(f.other, 'Quasar')).toEqual([]);
    await matches(f.dataset, '"unclosed ( OR \' --');
    await pool.query(
      "update dataset_records set name='Pulsar Observatory',status='Inactive' where id=$1",
      [f.id],
    );
    expect(await matches(f.dataset, 'Quasar')).toEqual([]);
    expect(await matches(f.dataset, 'Pulsar Inactive')).toEqual([f.id]);
    const dates = await pool.query<{ updated_at: Date }>(
      'select updated_at from dataset_records where id=$1',
      [f.id],
    );
    expect(dates.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      new Date('2020-01-01').getTime(),
    );
  });
  it('refreshes custom text on metadata insert/key/type/delete and ignores non-text JSON values', async () => {
    const f = await fixture();
    await pool.query(
      "insert into dataset_fields(dataset_id,field_key,label,data_type,is_searchable) values($1,'note','Note','string',true),($1,'score','Score','number',true)",
      [f.dataset],
    );
    expect(await matches(f.dataset, 'NebulaSignal')).toEqual([f.id]);
    expect(await matches(f.dataset, 'NumericSignal')).toEqual([]);
    await pool.query(
      "update dataset_fields set field_key='description' where dataset_id=$1 and field_key='note'",
      [f.dataset],
    );
    expect(await matches(f.dataset, 'NebulaSignal')).toEqual([]);
    expect(await matches(f.dataset, 'GalacticSignal')).toEqual([f.id]);
    await pool.query(
      "update dataset_fields set data_type='number' where dataset_id=$1 and field_key='description'",
      [f.dataset],
    );
    expect(await matches(f.dataset, 'GalacticSignal')).toEqual([]);
    await pool.query(
      "update dataset_fields set data_type='string' where dataset_id=$1 and field_key='description'",
      [f.dataset],
    );
    await pool.query(
      "update dataset_records set attributes=jsonb_set(attributes,'{description}','[\"ArraySignal\"]') where id=$1",
      [f.id],
    );
    expect(await matches(f.dataset, 'ArraySignal')).toEqual([]);
    await pool.query(
      "delete from dataset_fields where dataset_id=$1 and field_key='name'",
      [f.dataset],
    );
    expect(await matches(f.dataset, 'Quasar')).toEqual([]);
  });
  it('preserves timestamps on derived refresh, respects flags and prevents vector tampering', async () => {
    const f = await fixture();
    const before = (
      await pool.query('select updated_at from dataset_records where id=$1', [
        f.id,
      ])
    ).rows;
    await pool.query(
      "update dataset_fields set is_searchable=false where dataset_id=$1 and field_key='country'",
      [f.dataset],
    );
    expect(await matches(f.dataset, 'Germany')).toEqual([]);
    expect(
      (
        await pool.query('select updated_at from dataset_records where id=$1', [
          f.id,
        ])
      ).rows,
    ).toEqual(before);
    await pool.query(
      "update dataset_records set search_vector=to_tsvector('simple','ForgedSignal') where id=$1",
      [f.id],
    );
    expect(await matches(f.dataset, 'ForgedSignal')).toEqual([]);
    expect(await matches(f.dataset, 'Quasar')).toEqual([f.id]);
    expect(
      (
        await pool.query('select updated_at from dataset_records where id=$1', [
          f.id,
        ])
      ).rows,
    ).toEqual(before);
  });
  it('recomputes scope on record or metadata moves between datasets', async () => {
    const f = await fixture();
    await pool.query('update dataset_records set dataset_id=$1 where id=$2', [
      f.other,
      f.id,
    ]);
    expect(await matches(f.dataset, 'Quasar')).toEqual([]);
    expect(await matches(f.other, 'Quasar')).toEqual([f.id]);
    expect(await matches(f.other, 'Germany')).toEqual([]);
    await pool.query(
      "update dataset_fields set dataset_id=$1 where dataset_id=$2 and field_key='country'",
      [f.other, f.dataset],
    );
    expect(await matches(f.other, 'Germany')).toEqual([f.id]);
  });
  it('waits for metadata commit before indexing a concurrent new record', async () => {
    const f = await fixture();
    const metadata = await pool.connect();
    const writer = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await metadata.query('begin');
      await metadata.query(
        'update dataset_fields set is_searchable=false where dataset_id=$1',
        [f.dataset],
      );
      const pid = (
        await writer.query<{ pid: number }>('select pg_backend_pid() as pid')
      ).rows[0]?.pid;
      pending = writer.query(
        "insert into dataset_records(dataset_id,name) values($1,'ConcurrentSignal')",
        [f.dataset],
      );
      await expectBlocked(pid);
      await metadata.query('commit');
      await pending;
      expect(await matches(f.dataset, 'ConcurrentSignal')).toEqual([]);
    } finally {
      try {
        await metadata.query('rollback');
        if (pending) await pending;
      } finally {
        writer.release();
        metadata.release();
      }
    }
  });
  it('refreshes records committed while a metadata change waits for their parent lock', async () => {
    const f = await fixture();
    const writer = await pool.connect();
    const metadata = await pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query('begin');
      await writer.query(
        "insert into dataset_records(dataset_id,name) values($1,'BeforeMetadataSignal')",
        [f.dataset],
      );
      const pid = (
        await metadata.query<{ pid: number }>('select pg_backend_pid() as pid')
      ).rows[0]?.pid;
      pending = metadata.query(
        'update dataset_fields set is_searchable=false where dataset_id=$1',
        [f.dataset],
      );
      await expectBlocked(pid);
      await writer.query('commit');
      await pending;
      expect(await matches(f.dataset, 'BeforeMetadataSignal')).toEqual([]);
      expect(
        (
          await pool.query(
            "select count(*)::int as count from dataset_records where dataset_id=$1 and search_vector=''::tsvector",
            [f.dataset],
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    } finally {
      try {
        await writer.query('rollback');
        if (pending) await pending;
      } finally {
        writer.release();
        metadata.release();
      }
    }
  });
  it('refreshes phrase ordering but leaves records untouched for a label-only edit', async () => {
    const f = await fixture();
    const before = (
      await pool.query(
        'select xmin::text as version from dataset_records where id=$1',
        [f.id],
      )
    ).rows;
    await pool.query(
      "update dataset_fields set label='Display name' where dataset_id=$1 and field_key='name'",
      [f.dataset],
    );
    expect(
      (
        await pool.query(
          'select xmin::text as version from dataset_records where id=$1',
          [f.id],
        )
      ).rows,
    ).toEqual(before);
    expect(await matches(f.dataset, '"Quasar Observatory Active"')).toEqual([
      f.id,
    ]);
    await pool.query(
      "update dataset_fields set sort_order=100 where dataset_id=$1 and field_key='name'",
      [f.dataset],
    );
    expect(await matches(f.dataset, '"Quasar Observatory Active"')).toEqual([]);
    expect(await matches(f.dataset, 'Quasar Active')).toEqual([f.id]);
  });
  it('allows NULL/blank fields and keeps vectors empty after disabling all text metadata', async () => {
    const f = await fixture();
    await pool.query(
      "update dataset_records set name='',status=null,country=null,category=null,attributes='{}' where id=$1",
      [f.id],
    );
    expect(
      (
        await pool.query(
          'select search_vector::text as vector from dataset_records where id=$1',
          [f.id],
        )
      ).rows,
    ).toEqual([{ vector: '' }]);
    await pool.query(
      "update dataset_records set name='NowVisible' where id=$1",
      [f.id],
    );
    expect(await matches(f.dataset, 'NowVisible')).toEqual([f.id]);
    await pool.query(
      'update dataset_fields set is_searchable=false where dataset_id=$1',
      [f.dataset],
    );
    expect(await matches(f.dataset, 'NowVisible')).toEqual([]);
  });
  it('uses trigram matching with bound case-insensitive partial text', async () => {
    const result = await pool.query<{ id: string }>(
      'select id::text from dataset_records where dataset_id=$1 and lower(name) like lower($2) order by id',
      [seedIds.primary, '%MATCH ALPHA%'],
    );
    expect(result.rows).toEqual([{ id: '1000000000001' }]);
    expect(
      (
        await pool.query(
          'select id from dataset_records where dataset_id=$1 and lower(name) like $2',
          [seedIds.primary, "%'; DROP TABLE users;--%"],
        )
      ).rows,
    ).toEqual([]);
  });
});

interface PlanNode {
  'Index Name'?: string;
  Plans?: PlanNode[];
}
function indexNames(plan: PlanNode): string[] {
  return [
    ...(plan['Index Name'] ? [plan['Index Name']] : []),
    ...(plan.Plans ?? []).flatMap(indexNames),
  ];
}
describe('100k real PostgreSQL plans without forced planner settings', () => {
  it.each([
    [
      'created_at desc nulls last,id desc nulls last',
      'true',
      [],
      'dataset_records_dataset_created_id_idx',
    ],
    [
      'id',
      'status=$2 and country=$3',
      ['Active', 'Germany'],
      'dataset_records_dataset_status_country_id_idx',
    ],
    [
      'revenue,id',
      'revenue between $2 and $3',
      ['999900', '1000000'],
      'dataset_records_dataset_revenue_id_idx',
    ],
  ])(
    'chooses the scoped B-tree for %s',
    async (order, predicate, values, index) => {
      const rows = await pool.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
        `explain (analyze,buffers,format json) select id from dataset_records where dataset_id=$1 and ${predicate} order by ${order} limit 25`,
        [seedIds.primary, ...values],
      );
      const plan = rows.rows[0]?.['QUERY PLAN'][0]?.Plan;
      if (!plan) throw new Error('Missing query plan');
      expect(indexNames(plan)).toContain(index);
    },
  );
  it.each([
    [
      "search_vector @@ websearch_to_tsquery('simple',$2)",
      '"Known Match Alpha"',
      'dataset_records_search_vector_gin_idx',
    ],
    [
      'lower(name) like $2',
      '%match alpha%',
      'dataset_records_name_trgm_gin_idx',
    ],
  ])('chooses GIN for %s', async (predicate, value, index) => {
    const rows = await pool.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
      `explain (analyze,buffers,format json) select id from dataset_records where dataset_id=$1 and ${predicate}`,
      [seedIds.primary, value],
    );
    const plan = rows.rows[0]?.['QUERY PLAN'][0]?.Plan;
    if (!plan) throw new Error('Missing query plan');
    expect(indexNames(plan)).toContain(index);
  });
});
