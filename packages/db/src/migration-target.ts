export function localMigrationUrl(
  environment: Record<string, string | undefined>,
  test: boolean,
): string {
  if (environment.NODE_ENV === 'production')
    throw new Error('Local migration command refuses production mode');
  const value = test ? environment.DATABASE_TEST_URL : environment.DATABASE_URL;
  if (!value)
    throw new Error(
      test ? 'DATABASE_TEST_URL is required' : 'DATABASE_URL is required',
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid migration database URL');
  }
  const database = test ? 'datascope_test' : 'datascope_dev';
  const user = test ? 'datascope_test_app' : 'datascope_app';
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    url.pathname !== `/${database}` ||
    url.username !== user ||
    !url.password
  ) {
    throw new Error(
      'Local migration command requires the designated loopback database and app role',
    );
  }
  return value;
}
