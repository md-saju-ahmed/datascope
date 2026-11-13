import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const secret = () => randomBytes(24).toString('hex');
const adminPassword = secret();
const appPassword = secret();
const testAdminPassword = secret();
const testAppPassword = secret();
const text = `# Generated local credentials. Never commit or use in production.
NODE_ENV=development
API_HOST=127.0.0.1
PORT=4000
DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=2000
DB_STATEMENT_TIMEOUT_MS=3000
POSTGRES_PORT=55431
POSTGRES_ADMIN_PASSWORD=${adminPassword}
POSTGRES_APP_PASSWORD=${appPassword}
DATABASE_URL=postgresql://datascope_app:${appPassword}@127.0.0.1:55431/datascope_dev
POSTGRES_TEST_PORT=55432
POSTGRES_TEST_ADMIN_PASSWORD=${testAdminPassword}
POSTGRES_TEST_APP_PASSWORD=${testAppPassword}
DATABASE_TEST_URL=postgresql://datascope_test_app:${testAppPassword}@127.0.0.1:55432/datascope_test
`;

try {
  await writeFile(new URL('../.env', import.meta.url), text, {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    'Created ignored .env with separate random development and test credentials.',
  );
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
    console.error('.env already exists; it was not modified.');
  } else {
    console.error('Could not create local environment file.');
  }
  process.exitCode = 1;
}
