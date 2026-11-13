import {
  createDatabase,
  seedConfiguration,
  seedDatabase,
  seedRecord,
} from '@datascope/db';

const base = {
  NODE_ENV: 'development',
  SEED_ALLOW_LOCAL: 'true',
  DATABASE_URL:
    'postgresql://datascope_app:unit-db-password@127.0.0.1:55431/datascope_dev',
  DATABASE_TEST_URL:
    'postgresql://datascope_test_app:unit-test-password@127.0.0.1:55432/datascope_test',
  SEED_ADMIN_EMAIL: ' Admin@Example.test ',
  SEED_ADMIN_PASSWORD: 'Unit-admin-secret-0123456789',
  SEED_ANALYST_EMAIL: 'analyst@example.test',
  SEED_ANALYST_PASSWORD: 'Unit-analyst-secret-0123456789',
  SEED_VIEWER_EMAIL: 'viewer@example.test',
  SEED_VIEWER_PASSWORD: 'Unit-viewer-secret-0123456789',
};

describe('local seed configuration', () => {
  it('requires explicit credentials, normalizes emails and selects the test URL', () => {
    const config = seedConfiguration(base, true);
    expect(config.test).toBe(true);
    expect(config.connectionString).toBe(base.DATABASE_TEST_URL);
    expect(config.accounts.map((a) => a.email)).toEqual([
      'admin@example.test',
      'analyst@example.test',
      'viewer@example.test',
    ]);
  });
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: '' },
    { SEED_ALLOW_LOCAL: '' },
    { SEED_ADMIN_PASSWORD: '' },
    { SEED_ADMIN_PASSWORD: 'short' },
    { SEED_ADMIN_PASSWORD: 'REPLACE_WITH_LOCAL_PASSWORD' },
    { SEED_ADMIN_PASSWORD: 'x'.repeat(129) },
    { SEED_ADMIN_PASSWORD: '🎲'.repeat(40) },
    { SEED_ADMIN_EMAIL: 'invalid' },
    { SEED_ADMIN_EMAIL: 'VIEWER@example.test' },
    { SEED_ADMIN_PASSWORD: base.SEED_VIEWER_PASSWORD },
    { DATABASE_URL: `${base.DATABASE_URL}?host=external.example.test` },
    {
      DATABASE_URL:
        'postgresql://datascope_app:unit-db-password@example.com/datascope_dev',
    },
    {
      DATABASE_URL:
        'postgresql://datascope_admin:unit-db-password@localhost/datascope_dev',
    },
    {
      DATABASE_URL:
        'postgresql://datascope_app:unit-db-password@localhost/production',
    },
  ])(
    'refuses unsafe configuration %# without printing supplied values',
    (override) => {
      expect(() =>
        seedConfiguration({ ...base, ...override }, false),
      ).toThrow();
      try {
        seedConfiguration({ ...base, ...override }, false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        for (const key of ['SEED_ADMIN_PASSWORD', 'DATABASE_URL'] as const) {
          const supplied = { ...base, ...override }[key];
          if (supplied) expect(message).not.toContain(supplied);
        }
      }
    },
  );
  it('never falls back to development when the test URL is missing', () => {
    expect(() =>
      seedConfiguration({ ...base, DATABASE_TEST_URL: '' }, true),
    ).toThrow('designated local');
  });
  it.each([
    base.DATABASE_URL.replace('55431', '9'),
    base.DATABASE_URL.replace('127.0.0.1', 'example.test'),
    base.DATABASE_URL.replace('datascope_app:', 'datascope_admin:'),
    `${base.DATABASE_URL}?host=example.test`,
  ])(
    'rejects a mismatched pool before acquiring a connection %#',
    async (connectionString) => {
      const { pool } = createDatabase({
        connectionString,
        max: 1,
        connectionTimeoutMillis: 100,
        statementTimeoutMillis: 100,
      });
      try {
        await expect(
          seedDatabase(pool, seedConfiguration(base, false)),
        ).rejects.toThrow('outside the designated local target');
        expect(pool.totalCount).toBe(0);
      } finally {
        await pool.end();
      }
    },
  );
});

describe('deterministic business generator', () => {
  it('has fixed boundaries, exact decimal fixtures, nulls and stable high IDs', () => {
    expect(seedRecord(0)).toMatchObject({
      id: 1000000000001n,
      name: 'Known Match Alpha',
      revenue: '10000.01',
      status: 'Active',
      country: 'Germany',
    });
    expect(seedRecord(1).revenue).toBe('10000.00');
    expect(seedRecord(5).revenue).toBeNull();
    expect(seedRecord(8).status).toBe('');
    expect(seedRecord(9).status).toBeNull();
    expect(seedRecord(99999).id).toBe(1000000100000n);
    expect(seedRecord(127, true).id).toBe(1000000100128n);
    expect(() => seedRecord(100000)).toThrow();
    expect(() => seedRecord(-1)).toThrow();
    expect(() => seedRecord(0.5)).toThrow();
  });
});
