import { createDatabase } from './client.js';
import { migrateDatabase } from './migrations.js';
import { localMigrationUrl } from './migration-target.js';

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== '--test')) {
    throw new Error('Only --test is supported by the local migration command');
  }
  const { pool } = createDatabase({
    connectionString: localMigrationUrl(
      process.env,
      process.argv.includes('--test'),
    ),
    max: 1,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 30000,
  });
  pool.on('error', () => {
    console.error('Migration database connection unavailable');
  });
  try {
    const result = await migrateDatabase(pool);
    console.log(
      `Migrations verified: ${result.applied.toString()} applied, ${result.pending.toString()} pending`,
    );
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error(
    'Migration failed; verify local configuration, migration files and applied history. No automatic reset was performed.',
  );
  process.exitCode = 1;
});
