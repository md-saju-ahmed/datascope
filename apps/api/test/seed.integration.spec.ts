import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  migrateDatabase,
  seedConfiguration,
  seedDatabase,
  seedIds,
  recordBase,
} from '@datascope/db';
import type { SeedConfiguration, SeedResult } from '@datascope/db';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const name = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
const otherName = `datascope_test_seed_${randomUUID().replaceAll('-', '')}`;
let config: SeedConfiguration;
let pool: ReturnType<typeof createDatabase>['pool'];
let openedPool = false;
let result: SeedResult;
const created = new Set<string>();

function administer(database: string, create: boolean) {
  if (!/^datascope_test_seed_[a-f0-9]{32}$/.test(database))
    throw new Error('Unsafe disposable DB name');
  execFileSync(
    'docker',
    [
      'compose',
      '--project-directory',
      root,
      '--profile',
      'test',
      'exec',
      '-T',
      'postgres_test',
      'psql',
      '-U',
      'datascope_test_admin',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      create
        ? `CREATE DATABASE "${database}" OWNER datascope_test_app`
        : `DROP DATABASE "${database}"`,
    ],
    { cwd: root, timeout: 30000, windowsHide: true, stdio: 'pipe' },
  );
  if (create) created.add(database);
  else created.delete(database);
}

function connection(database: string) {
  const url = new URL(config.connectionString);
  url.pathname = `/${database}`;
  return createDatabase({
    connectionString: url.toString(),
    max: 3,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 60000,
  }).pool;
}

beforeAll(async () => {
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
  administer(name, true);
  pool = connection(name);
  openedPool = true;
  await migrateDatabase(pool);
});
afterAll(async () => {
  if (openedPool) await pool.end();
  for (const database of created) administer(database, false);
});

describe('real PostgreSQL deterministic seed', () => {
  it('rejects account collisions without escalating or overwriting an existing account', async () => {
    const email = config.accounts[0]?.email;
    const id = randomUUID();
    await pool.query(
      "insert into users(id,email,password_hash,role) values($1,$2,'!disabled','viewer')",
      [id, email],
    );
    await expect(seedDatabase(pool, config)).rejects.toThrow('already exist');
    expect(
      (
        await pool.query('select role,password_hash from users where id=$1', [
          id,
        ])
      ).rows,
    ).toEqual([{ role: 'viewer', password_hash: '!disabled' }]);
    expect(
      (await pool.query('select count(*)::int as count from datasets')).rows,
    ).toEqual([{ count: 0 }]);
    await pool.query('delete from users where id=$1', [id]);
  });
  it('rolls back users, metadata, grants and earlier batches when a later insert fails', async () => {
    await pool.query(
      "alter table dataset_records add constraint seed_failure_fixture check (attributes->>'seedOrdinal' <> '1501')",
    );
    try {
      await expect(seedDatabase(pool, config)).rejects.toMatchObject({
        code: '23514',
      });
      const counts =
        await pool.query(`select (select count(*)::int from users) as users,
        (select count(*)::int from datasets) as datasets, (select count(*)::int from dataset_fields) as fields,
        (select count(*)::int from dataset_permissions) as grants, (select count(*)::int from dataset_records) as records,
        (select count(*)::int from system_settings) as settings`);
      expect(counts.rows).toEqual([
        {
          users: 0,
          datasets: 0,
          fields: 0,
          grants: 0,
          records: 0,
          settings: 0,
        },
      ]);
    } finally {
      await pool.query(
        'alter table dataset_records drop constraint seed_failure_fixture',
      );
    }
  });
  it('persists 100,000 primary rows and independent SQL confirms boundaries and distributions', async () => {
    result = await seedDatabase(pool, config);
    expect(result).toMatchObject({
      applied: true,
      primaryCount: 100000,
      restrictedCount: 128,
      fixtureMatchIds: ['1000000000001', '1000000000007', '1000000000008'],
    });
    const counts = await pool.query(
      `select count(*)::int as total,
      count(distinct status)::int as statuses, count(distinct country)::int as countries,
      count(distinct category)::int as categories, count(*) filter(where attributes->>'fixture'='true')::int as fixtures,
      count(*) filter(where revenue is null)::int as null_revenues from dataset_records where dataset_id=$1`,
      [seedIds.primary],
    );
    expect(counts.rows).toEqual([
      {
        total: 100000,
        statuses: 5,
        countries: 6,
        categories: 5,
        fixtures: 10,
        null_revenues: 3,
      },
    ]);
    const boundary = await pool.query(
      'select id::text,revenue::text,created_at from dataset_records where id=$1',
      [(recordBase + 2n).toString()],
    );
    expect(boundary.rows).toEqual([
      {
        id: '1000000000002',
        revenue: '10000.00',
        created_at: new Date('2026-10-01T00:00:00Z'),
      },
    ]);
  });
  it('seeds metadata, real relationships and distinct role/grant boundaries without fake history', async () => {
    const fields = await pool.query(
      'select field_key,data_type,is_filterable from dataset_fields where dataset_id=$1 order by sort_order',
      [seedIds.primary],
    );
    expect(fields.rowCount).toBe(9);
    expect(fields.rows).toContainEqual({
      field_key: 'verified',
      data_type: 'boolean',
      is_filterable: true,
    });
    const users = await pool.query<{ role: string; password_hash: string }>(
      'select role,password_hash from users order by role',
    );
    expect(users.rows.map((u) => u.role)).toEqual([
      'admin',
      'analyst',
      'viewer',
    ]);
    for (const user of users.rows) {
      expect(user.password_hash).toMatch(/^\$argon2id\$v=19\$/);
      for (const account of config.accounts)
        expect(user.password_hash).not.toContain(account.password);
    }
    expect(
      (
        await pool.query(
          'select dataset_id::text,permission from dataset_permissions where user_id=$1',
          [seedIds.viewer],
        )
      ).rows,
    ).toEqual([{ dataset_id: seedIds.primary, permission: 'read' }]);
    expect(
      (
        await pool.query(
          'select count(*)::int as count from dataset_permissions where user_id=$1',
          [seedIds.analyst],
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (
        await pool.query(
          'select count(*)::int as count from record_relationships',
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    expect(
      (await pool.query('select count(*)::int as count from record_changes'))
        .rows,
    ).toEqual([{ count: 0 }]);
  });
  it('replays serially and concurrently without changing data, password hashes or timestamps', async () => {
    const before = await pool.query(
      'select id,password_hash,created_at,updated_at from users order by id',
    );
    const replay = await seedDatabase(pool, config);
    const parallel = await Promise.all([
      seedDatabase(pool, config),
      seedDatabase(pool, config),
    ]);
    for (const run of [replay, ...parallel])
      expect(run).toEqual({ ...result, applied: false });
    expect(
      (
        await pool.query(
          'select id,password_hash,created_at,updated_at from users order by id',
        )
      ).rows,
    ).toEqual(before.rows);
  });
  it('refuses changed credentials instead of resetting the existing password', async () => {
    const changed = {
      ...config,
      accounts: config.accounts.map((a) => ({
        ...a,
        password: a.password + 'changed',
      })),
    };
    await expect(seedDatabase(pool, changed)).rejects.toThrow(
      'account differs',
    );
    expect((await seedDatabase(pool, config)).dataChecksum).toBe(
      result.dataChecksum,
    );
  });
  it('refuses changed bootstrap identities without creating new accounts', async () => {
    const changed = {
      ...config,
      accounts: config.accounts.map((a) => ({
        ...a,
        email: `other-${a.email}`,
      })),
    };
    await expect(seedDatabase(pool, changed)).rejects.toThrow(
      'configuration differs',
    );
    expect(
      (await pool.query('select count(*)::int as count from users')).rows,
    ).toEqual([{ count: 3 }]);
  });
  it('preserves unrelated rows and leaves normal identity-generated inserts usable', async () => {
    const id = randomUUID();
    await pool.query(
      "insert into datasets(id,slug,name,source) values($1,$2,'Unrelated','test')",
      [id, `unrelated-${id}`],
    );
    const inserted = await pool.query<{ id: string }>(
      "insert into dataset_records(dataset_id,name) values($1,'Unrelated') returning id::text",
      [id],
    );
    expect(Number(inserted.rows[0]?.id)).toBeLessThan(1000000000000);
    await seedDatabase(pool, config);
    expect(
      (
        await pool.query(
          'select name from dataset_records where dataset_id=$1',
          [id],
        )
      ).rows,
    ).toEqual([{ name: 'Unrelated' }]);
  });
  it('refuses count drift without rewriting existing dataset state', async () => {
    await pool.query('update datasets set record_count=1 where id=$1', [
      seedIds.primary,
    ]);
    try {
      await expect(seedDatabase(pool, config)).rejects.toThrow('row counts');
      expect(
        (
          await pool.query(
            'select record_count::text from datasets where id=$1',
            [seedIds.primary],
          )
        ).rows,
      ).toEqual([{ record_count: '1' }]);
    } finally {
      await pool.query('update datasets set record_count=100000 where id=$1', [
        seedIds.primary,
      ]);
    }
  });
  it('reproduces the complete business-data checksum on a second fresh database', async () => {
    administer(otherName, true);
    const other = connection(otherName);
    try {
      await migrateDatabase(other);
      expect(await seedDatabase(other, config)).toEqual(result);
    } finally {
      await other.end();
      administer(otherName, false);
    }
  });
});
