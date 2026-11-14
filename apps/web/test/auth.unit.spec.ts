import { safeReturnPath, signInPath } from '../src/features/auth/navigation.ts';
import { authError } from '../src/features/auth/errors.ts';
import {
  registerRequestSchema,
  loginRequestSchema,
} from '@datascope/contracts';

test.each([
  'https://evil.test',
  '//evil.test',
  '/\\evil.test',
  '/%2f%2fevil.test',
  '/%252fevil.test',
  '/login',
  '/register',
  '/api/v1/auth/logout',
  '/dashboard/../login',
  '/dashboard\n',
  '/dashboard//evil',
  '/dashboard/%2e%2e/login',
  '/dashboard/%zz',
  null,
  ['//evil.test'],
])('rejects ambiguous return path %s', (path) => {
  expect(safeReturnPath(path)).toBe('/dashboard');
});
test('preserves allowed local path and query; sign-in path encodes nested query', () => {
  expect(safeReturnPath('/datasets/abc/explore?page=2&q=some%20text')).toBe(
    '/datasets/abc/explore?page=2&q=some%20text',
  );
  expect(
    new URL(signInPath('/settings'), 'https://local.test').searchParams.get(
      'returnTo',
    ),
  ).toBe('/settings');
});
test('frozen registration limits count UTF-8 bytes, preserve password spaces and disallow elevated roles', () => {
  const input = { email: ' Person@Example.com ', password: ' '.repeat(16) };
  expect(registerRequestSchema.parse(input)).toEqual({
    ...input,
    email: 'person@example.com',
  });
  expect(
    registerRequestSchema.safeParse({ ...input, role: 'admin' }).success,
  ).toBe(false);
  expect(
    registerRequestSchema.safeParse({ ...input, password: 'a'.repeat(15) })
      .success,
  ).toBe(false);
  expect(
    registerRequestSchema.safeParse({ ...input, password: 'é'.repeat(65) })
      .success,
  ).toBe(false);
  expect(
    registerRequestSchema.safeParse({ ...input, password: 'é'.repeat(64) })
      .success,
  ).toBe(true);
  expect(
    loginRequestSchema.safeParse({ ...input, password: 'short' }).success,
  ).toBe(true);
});
test('errors are actionable and never echo server content', () => {
  expect(
    authError({ status: 401, data: { message: 'private' } }),
  ).not.toContain('private');
  expect(authError({ status: 429 })).toContain('Wait');
  expect(authError({ status: 409 }, true)).toContain('signing in');
});
