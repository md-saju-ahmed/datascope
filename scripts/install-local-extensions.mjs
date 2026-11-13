import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

try {
  if (
    !['development', 'test'].includes(process.env.NODE_ENV) ||
    process.argv.slice(2).some((arg) => arg !== '--test')
  ) {
    throw new Error('Local extension bootstrap requires development/test mode');
  }
  const test = process.argv.includes('--test');
  const root = fileURLToPath(new URL('../', import.meta.url));
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
      test ? 'postgres_test' : 'postgres',
      'psql',
      '-U',
      test ? 'datascope_test_admin' : 'datascope_admin',
      '-d',
      test ? 'datascope_test' : 'datascope_dev',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
    ],
    { cwd: root, timeout: 30000, windowsHide: true, stdio: 'pipe' },
  );
  console.log(
    `Verified pg_trgm in local ${test ? 'test' : 'development'} database; app privileges unchanged.`,
  );
} catch {
  console.error(
    'Local extension bootstrap failed; verify mode and local Compose services. No app-role privileges changed.',
  );
  process.exitCode = 1;
}
