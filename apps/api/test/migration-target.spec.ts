import { localMigrationUrl } from '@datascope/db';

const dev =
  'postgresql://datascope_app:local-fixture@127.0.0.1:55431/datascope_dev';
const test =
  'postgresql://datascope_test_app:local-fixture@127.0.0.1:55432/datascope_test';

describe('local migration safety boundary', () => {
  it('selects the explicitly requested development or test target', () => {
    const env = { DATABASE_URL: dev, DATABASE_TEST_URL: test };
    expect(localMigrationUrl(env, false)).toBe(dev);
    expect(localMigrationUrl(env, true)).toBe(test);
  });

  it('does not fall back to development when test configuration is missing', () => {
    expect(() => localMigrationUrl({ DATABASE_URL: dev }, true)).toThrow(
      'DATABASE_TEST_URL is required',
    );
  });

  it('refuses production mode even with a loopback URL', () => {
    expect(() =>
      localMigrationUrl({ NODE_ENV: 'production', DATABASE_URL: dev }, false),
    ).toThrow('refuses production');
  });

  it.each([
    'postgresql://datascope_app:local-fixture@database.example.test/datascope_dev',
    'postgresql://datascope_app:local-fixture@127.0.0.1/customer_data',
    'postgresql://datascope_admin:local-fixture@127.0.0.1/datascope_dev',
    'https://datascope_app:local-fixture@127.0.0.1/datascope_dev',
    'not-a-url-containing-a-private-value',
  ])(
    'rejects a non-designated target without echoing its value',
    (DATABASE_URL) => {
      try {
        localMigrationUrl({ DATABASE_URL }, false);
        throw new Error('Expected target rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toMatch(
            /^(Invalid migration database URL|Local migration command requires)/,
          );
          expect(error.message).not.toContain(DATABASE_URL);
        }
      }
    },
  );
});
