import { fileURLToPath } from 'node:url';
import { getTableName, sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import { coreTables } from './schema/index.js';

const migrationConfig = {
  migrationsFolder: fileURLToPath(
    new URL('../src/migrations/', import.meta.url),
  ),
};
const coreTableNames = Object.values(coreTables).map((table) =>
  getTableName(table),
);
let expectedMigrations: ReturnType<typeof readMigrationFiles> | undefined;

function expectedHistory() {
  expectedMigrations ??= readMigrationFiles(migrationConfig);
  if (expectedMigrations.length === 0)
    throw new Error('No migration files found');
  return expectedMigrations;
}

export interface MigrationStatus {
  ready: boolean;
  applied: number;
  pending: number;
  reason: 'pending' | 'mismatch' | 'missing_tables' | 'ready';
}

export async function getMigrationStatus(
  connection: Pick<pg.Pool, 'query'>,
): Promise<MigrationStatus> {
  const expected = expectedHistory();
  const exists = await connection.query<{ journal: string | null }>(
    'select to_regclass($1)::text as journal',
    ['public.__drizzle_migrations'],
  );
  if (!exists.rows[0]?.journal) {
    return {
      ready: false,
      applied: 0,
      pending: expected.length,
      reason: 'pending',
    };
  }
  const history = await connection.query<{ hash: string; created_at: string }>(
    'select hash, created_at from public.__drizzle_migrations order by created_at, id',
  );
  const applied = history.rows.length;
  const pending = Math.max(expected.length - applied, 0);
  const mismatch =
    applied > expected.length ||
    history.rows.some((row, index) => {
      const migration = expected[index];
      return (
        !migration ||
        row.hash !== migration.hash ||
        row.created_at !== String(migration.folderMillis)
      );
    });
  if (mismatch) return { ready: false, applied, pending, reason: 'mismatch' };
  if (pending > 0) return { ready: false, applied, pending, reason: 'pending' };
  const tables = await connection.query<{ name: string }>(
    `select table_name as name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' and table_name = any($1::text[])`,
    [coreTableNames],
  );
  const ready = tables.rows.length === coreTableNames.length;
  return {
    ready,
    applied,
    pending,
    reason: ready ? 'ready' : 'missing_tables',
  };
}

export async function migrateDatabase(pool: pg.Pool): Promise<MigrationStatus> {
  const client = await pool.connect();
  try {
    // Session lock is released by destroying this one migration connection below.
    await client.query('select pg_advisory_lock($1)', [178586369]);
    const before = await getMigrationStatus(client);
    if (before.reason === 'mismatch' || before.reason === 'missing_tables') {
      throw new Error(
        'Applied migration history or schema does not match; refusing automatic repair',
      );
    }
    const pending = expectedHistory().slice(before.applied);
    await drizzle(client).transaction(async (transaction) => {
      await transaction.execute(sql`create table if not exists public.__drizzle_migrations (
        id serial primary key, hash text not null, created_at bigint not null
      )`);
      for (const migration of pending) {
        for (const statement of migration.sql) {
          // Only reviewed on-disk migration SQL enters this raw execution path.
          if (statement.trim()) await transaction.execute(sql.raw(statement));
        }
        await transaction.execute(sql`insert into public.__drizzle_migrations (hash, created_at)
          values (${migration.hash}, ${migration.folderMillis})`);
      }
    });
    const after = await getMigrationStatus(client);
    if (!after.ready)
      throw new Error('Schema verification failed after migration');
    return after;
  } finally {
    client.release(true);
  }
}
