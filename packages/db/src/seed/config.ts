import { localMigrationUrl } from '../migration-target.js';

export const seedRoles = ['admin', 'analyst', 'viewer'] as const;
export type SeedRole = (typeof seedRoles)[number];
export interface SeedAccount {
  role: SeedRole;
  email: string;
  password: string;
}
export interface SeedConfiguration {
  connectionString: string;
  test: boolean;
  accounts: SeedAccount[];
}

export function seedConfiguration(
  environment: Record<string, string | undefined>,
  test: boolean,
): SeedConfiguration {
  if (
    !['development', 'test'].includes(environment.NODE_ENV ?? '') ||
    environment.SEED_ALLOW_LOCAL !== 'true'
  )
    throw new Error('Seed requires explicit development/test opt-in');
  let connectionString: string;
  try {
    connectionString = localMigrationUrl(environment, test);
    const url = new URL(connectionString);
    if (url.search || url.hash)
      throw new Error('Connection options are not permitted');
  } catch {
    throw new Error('Seed requires the designated local database and app role');
  }
  const accounts = seedRoles.map((role) => {
    const prefix = `SEED_${role.toUpperCase()}`;
    const email = environment[`${prefix}_EMAIL`]?.trim().toLowerCase();
    const password = environment[`${prefix}_PASSWORD`];
    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !password ||
      password.length < 16 ||
      Buffer.byteLength(password, 'utf8') > 128 ||
      /REPLACE_WITH/i.test(password)
    )
      throw new Error(
        'Seed requires three valid emails and 16–128-byte configured passwords',
      );
    return { role, email, password };
  });
  if (
    new Set(accounts.map((a) => a.email)).size !== 3 ||
    new Set(accounts.map((a) => a.password)).size !== 3
  )
    throw new Error('Seed account emails and passwords must be distinct');
  return { connectionString, test, accounts };
}

// Test code may connect to its own generated disposable database. The CLI only
// accepts the two canonical databases through seedConfiguration above.
export function assertSeedConnection(
  poolUrl: string,
  config: SeedConfiguration,
): void {
  const expected = new URL(config.connectionString);
  const actual = new URL(poolUrl);
  const canonical = config.test ? '/datascope_test' : '/datascope_dev';
  const allowedDisposable =
    config.test && /^\/datascope_test_seed_[a-f0-9]{32}$/.test(actual.pathname);
  if (
    expected.pathname !== canonical ||
    actual.protocol !== expected.protocol ||
    actual.hostname !== expected.hostname ||
    actual.port !== expected.port ||
    actual.username !== expected.username ||
    actual.password !== expected.password ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(actual.hostname) ||
    actual.search !== '' ||
    actual.hash !== '' ||
    actual.username !==
      (config.test ? 'datascope_test_app' : 'datascope_app') ||
    (actual.pathname !== canonical && !allowedDisposable)
  )
    throw new Error('Seed connection is outside the designated local target');
}
