import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import {
  loginRequestSchema,
  registerRequestSchema,
} from '@datascope/contracts';
import { AuthSecurity, readCookie } from '../src/modules/auth/auth-security.js';
import { RateWindows } from '../src/modules/auth/auth-rate-limit.js';
import { AuthFailure } from '../src/modules/auth/auth-http.js';
import { parseEnvironment } from '../src/config/environment.js';

const url = 'postgresql://unit:unit@127.0.0.1:1/unavailable';

describe('authentication contracts and security policy', () => {
  it('normalizes email but preserves password bytes', () => {
    const password = '  spaces-are-significant  ';
    expect(
      registerRequestSchema.parse({
        email: '  VIEWER@Example.Test ',
        password,
      }),
    ).toEqual({ email: 'viewer@example.test', password });
    expect(
      loginRequestSchema.parse({ email: 'a@example.test', password: 'x' })
        .password,
    ).toBe('x');
  });

  it.each([
    { email: 'broken', password: 'a'.repeat(16) },
    { email: 'a@example.test', password: 'too-short' },
    { email: 'a@example.test', password: 'a'.repeat(129) },
    { email: 'a@example.test', password: '🔐'.repeat(33) },
    { email: 'a@example.test', password: 'a'.repeat(16), role: 'admin' },
    { email: 'a@example.test', password: 'a'.repeat(16), isActive: true },
  ])('rejects invalid registration or mass assignment %#', (body) => {
    expect(registerRequestSchema.safeParse(body).success).toBe(false);
  });

  it.each([
    'null',
    '*',
    'https://example.test/',
    'https://name:secret@example.test',
    'https://example.test/path',
    'http://example.test',
  ])('rejects unsafe production origin %s', (APP_ORIGIN) => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: url,
        APP_ORIGIN,
      }),
    ).toThrow('APP_ORIGIN');
  });

  it('requires explicit HTTPS origin in production and accepts canonical local development', () => {
    expect(() =>
      parseEnvironment({ NODE_ENV: 'production', DATABASE_URL: url }),
    ).toThrow('APP_ORIGIN');
    expect(parseEnvironment({ DATABASE_URL: url }).APP_ORIGIN).toBe(
      'http://localhost:3000',
    );
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: url,
        APP_ORIGIN: 'https://datascope.example.test',
      }).APP_ORIGIN,
    ).toBe('https://datascope.example.test');
  });

  it('rejects malformed and duplicate opaque cookies without throwing decoding errors', () => {
    const token = randomBytes(32).toString('hex');
    expect(readCookie(`other=x; session=${token}`, 'session')).toBe(token);
    for (const value of [
      `session=${token}; session=${token}`,
      'session=%ZZ',
      'session=plain',
      undefined,
    ])
      expect(readCookie(value, 'session')).toBeUndefined();
  });

  it('sets production __Host cookies with matching secure scope for issuance and deletion', () => {
    const security = new AuthSecurity(
      parseEnvironment({
        NODE_ENV: 'production',
        DATABASE_URL: url,
        APP_ORIGIN: 'https://datascope.example.test',
      }),
    );
    const response = new ServerResponse(new IncomingMessage(new Socket()));
    security.setSession(response, randomBytes(32).toString('hex'));
    security.clearSession(response);
    const cookies = response.getHeader('Set-Cookie');
    expect(cookies).toEqual([
      expect.stringMatching(
        /^__Host-datascope_session=[0-9a-f]{64}; Max-Age=86400;.*Path=\/; HttpOnly; SameSite=Lax; Secure$/,
      ),
      expect.stringMatching(
        /^__Host-datascope_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=\/; HttpOnly; SameSite=Lax; Secure$/,
      ),
    ]);
    expect(JSON.stringify(cookies)).not.toContain('Domain=');
  });

  it('rejects CSRF token replay after API key rotation while a session cookie remains parseable', () => {
    const environment = parseEnvironment({ DATABASE_URL: url });
    const first = new AuthSecurity(environment);
    const restarted = new AuthSecurity(environment);
    const request = new IncomingMessage(new Socket());
    const response = new ServerResponse(request);
    const session = randomBytes(32).toString('hex');
    const csrf = first.issueCsrf(response, session);
    request.headers = {
      origin: environment.APP_ORIGIN,
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      cookie: `${first.sessionCookie}=${session}; ${first.csrfCookie}=${csrf.split('.')[0] ?? ''}`,
    };
    expect(() => {
      first.assertCsrf(request);
    }).not.toThrow();
    expect(() => {
      restarted.assertCsrf(request);
    }).toThrow(AuthFailure);
    expect(restarted.session(request)).toBe(session);
  });

  it('reserves concurrent attempts, expires windows and fails closed at bounded capacity', () => {
    const windows = new RateWindows(2);
    expect(windows.consume('a', 2, 1000, 0)).toBe(0);
    expect(windows.consume('a', 2, 1000, 0)).toBe(0);
    expect(windows.consume('a', 2, 1000, 0)).toBe(1);
    expect(windows.consume('b', 1, 1000, 0)).toBe(0);
    expect(windows.consume('c', 1, 1000, 0)).toBe(60);
    expect(windows.consume('a', 2, 1000, 1000)).toBe(0);
    expect(windows.consume('c', 1, 1000, 1000)).toBe(0);
  });
});
