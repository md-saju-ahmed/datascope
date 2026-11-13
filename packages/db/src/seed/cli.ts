import { createDatabase } from '../client.js';
import { seedConfiguration } from './config.js';
import { seedDatabase } from './runner.js';

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== '--test'))
    throw new Error('Only --test is supported by the local seed command');
  const config = seedConfiguration(
    process.env,
    process.argv.includes('--test'),
  );
  const { pool } = createDatabase({
    connectionString: config.connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    statementTimeoutMillis: 60000,
  });
  pool.on('error', () => {
    console.error('Seed database connection unavailable');
  });
  try {
    const result = await seedDatabase(pool, config);
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'Seed failed. Check explicit local opt-in, account configuration, current migrations and existing fixture integrity. No reset or automatic repair was performed.',
  );
  process.exitCode = 1;
});
