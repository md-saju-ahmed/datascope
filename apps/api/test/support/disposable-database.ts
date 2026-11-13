import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localMigrationUrl } from '@datascope/db';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));

function execute(database: string, statement: string): void {
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
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ],
    { cwd: root, timeout: 30000, windowsHide: true, stdio: 'pipe' },
  );
}

export function administerDisposableDatabase(
  database: string,
  create: boolean,
  extensions = true,
): void {
  localMigrationUrl(process.env, true);
  if (!/^datascope_test_(migration|seed|search)_[a-f0-9]{32}$/.test(database))
    throw new Error('Unsafe disposable database identifier');
  if (!create) {
    execute('postgres', `DROP DATABASE "${database}"`);
    return;
  }
  execute(
    'postgres',
    `CREATE DATABASE "${database}" OWNER datascope_test_admin`,
  );
  try {
    execute(
      database,
      `GRANT CONNECT,TEMPORARY ON DATABASE "${database}" TO datascope_test_app;
      GRANT USAGE,CREATE ON SCHEMA public TO datascope_test_app`,
    );
    if (extensions) installDisposableExtensions(database);
  } catch (error) {
    execute('postgres', `DROP DATABASE "${database}"`);
    throw error;
  }
}

export function installDisposableExtensions(database: string): void {
  if (!/^datascope_test_(migration|seed|search)_[a-f0-9]{32}$/.test(database))
    throw new Error('Unsafe disposable extension database identifier');
  execute(
    database,
    'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
  );
}
