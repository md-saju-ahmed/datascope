import {
  EnvironmentError,
  parseEnvironment,
} from '../src/config/environment.js';

const url = 'postgresql://unit:unit@127.0.0.1:55432/datascope_test';

describe('environment validation', () => {
  it('requires a database URL before startup', () => {
    expect(() => parseEnvironment({})).toThrow(
      'Invalid environment: DATABASE_URL',
    );
  });

  it('applies bounded defaults and ignores unrelated system environment', () => {
    const config = parseEnvironment({
      DATABASE_URL: url,
      UNRELATED: 'ignored',
    });
    expect(config).toMatchObject({
      PORT: 4000,
      API_HOST: '127.0.0.1',
      DB_POOL_MAX: 10,
    });
    expect(config).not.toHaveProperty('UNRELATED');
  });

  it.each(['0', '65536', '1.5', '', 'not-a-port'])(
    'rejects invalid port %p',
    (PORT) => {
      expect(() => parseEnvironment({ DATABASE_URL: url, PORT })).toThrow(
        EnvironmentError,
      );
    },
  );

  it.each(['0', '21', 'unlimited'])(
    'rejects invalid pool bound %p',
    (DB_POOL_MAX) => {
      expect(() =>
        parseEnvironment({ DATABASE_URL: url, DB_POOL_MAX }),
      ).toThrow(EnvironmentError);
    },
  );

  it.each([
    'https://example.com/db',
    'postgresql://localhost/db',
    'postgresql://unit:unit@localhost/',
  ])('rejects unsupported connection URL %p', (DATABASE_URL) => {
    expect(() => parseEnvironment({ DATABASE_URL })).toThrow(EnvironmentError);
  });

  it('redacts values from configuration errors', () => {
    const sensitive = 'not-a-real-password';
    try {
      parseEnvironment({
        DATABASE_URL: `invalid:${sensitive}`,
        PORT: sensitive,
      });
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError);
      expect(error instanceof Error ? error.message : '').toBe(
        'Invalid environment: DATABASE_URL, PORT',
      );
    }
  });
});
