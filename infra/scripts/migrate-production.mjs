import { createDatabase, migrateDatabase } from '@datascope/db';

// Separate one-shot operation: never run migrations as an API startup side effect.
async function main() {
  if (process.env.DATASCOPE_MIGRATION_APPROVED !== 'true')
    throw new Error('Explicit migration approval required');
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Invalid database URL');
  const { pool } = createDatabase({
    connectionString: url.toString(),
    max: 1,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 60000,
  });
  pool.on('error', () => {
    console.error('Migration database unavailable');
  });
  try {
    const result = await migrateDatabase(pool);
    console.log(
      `Migrations verified: ${String(result.applied)} applied, ${String(result.pending)} pending`,
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'Migration failed; verify approval, connection and immutable migration history. No reset performed.',
  );
  process.exitCode = 1;
});
