import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import {
  createDatabase,
  localMigrationUrl,
  migrateDatabase,
  schema,
  sql,
} from '@datascope/db';
import type { Database } from '@datascope/db';
import {
  apiErrorSchema,
  authUserResponseSchema,
  csrfResponseSchema,
  loginResponseSchema,
  logoutResponseSchema,
} from '@datascope/contracts';
import { argon2id, hash, verify } from 'argon2';
import { AppModule } from '../src/app.module.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';
import { configureApp } from '../src/configure-app.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { tokenHash } from '../src/modules/auth/auth-security.js';
import { administerDisposableDatabase } from './support/disposable-database.js';

const origin = 'http://localhost:3000';
const databaseName = `datascope_test_auth_${randomUUID().replaceAll('-', '')}`;
const route = '/api/v1/auth';

class Browser {
  readonly cookies = new Map<string, string>();
  csrf = '';
  constructor(
    private readonly server: Server,
    private readonly sourceOrigin = origin,
  ) {}

  capture(response: Response): void {
    const headers: unknown = response.headers['set-cookie'];
    if (!Array.isArray(headers)) return;
    for (const raw of headers) {
      if (typeof raw !== 'string') throw new Error('Invalid cookie header');
      const entry = raw.split(';')[0] ?? '';
      const index = entry.indexOf('=');
      this.cookies.set(entry.slice(0, index), entry.slice(index + 1));
    }
  }

  cookie(): string {
    return [...this.cookies]
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  async bootstrap(): Promise<Response> {
    const response = await request(this.server)
      .get(`${route}/csrf`)
      .set('Origin', this.sourceOrigin)
      .set('Cookie', this.cookie())
      .expect(200);
    this.capture(response);
    this.csrf = csrfResponseSchema.parse(response.body).csrfToken;
    return response;
  }

  async post(path: string, body: object = {}): Promise<Response> {
    const response = await request(this.server)
      .post(`${route}/${path}`)
      .set('Origin', this.sourceOrigin)
      .set('Cookie', this.cookie())
      .set('X-CSRF-Token', this.csrf)
      .send(body);
    this.capture(response);
    if (response.status === 200 && path === 'login')
      this.csrf = loginResponseSchema.parse(response.body).csrfToken;
    if (response.status === 200 && path === 'logout')
      this.csrf = logoutResponseSchema.parse(response.body).csrfToken;
    return response;
  }
}

describe('authentication against real isolated PostgreSQL', () => {
  let connectionString: string;
  let created = false;
  let fixtureDatabase: ReturnType<typeof createDatabase> | undefined;
  let app: INestApplication<Server>;
  let closeApp: (() => Promise<void>) | undefined;
  let db: Database;
  let browser: Browser;

  beforeAll(async () => {
    const url = new URL(localMigrationUrl(process.env, true));
    administerDisposableDatabase(databaseName, true);
    created = true;
    url.pathname = `/${databaseName}`;
    connectionString = url.toString();
    fixtureDatabase = createDatabase({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 1000,
      statementTimeoutMillis: 5000,
    });
    db = fixtureDatabase.db;
    await migrateDatabase(fixtureDatabase.pool);
  });

  async function openApp(productionOrigin?: string): Promise<void> {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: productionOrigin ? 'production' : 'test',
          DATABASE_URL: connectionString,
          APP_ORIGIN: productionOrigin ?? origin,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    closeApp = () => app.close();
    configureApp(app);
    await app.init();
    browser = new Browser(app.getHttpServer(), productionOrigin ?? origin);
    await browser.bootstrap();
  }

  beforeEach(async () => {
    await openApp();
  });

  afterEach(async () => {
    if (closeApp) await closeApp();
    closeApp = undefined;
  });

  afterAll(async () => {
    try {
      if (fixtureDatabase) await fixtureDatabase.pool.end();
    } finally {
      if (created) administerDisposableDatabase(databaseName, false);
    }
  });

  async function user(
    role: 'admin' | 'analyst' | 'viewer' = 'viewer',
    active = true,
  ) {
    const id = randomUUID();
    const email = `auth-${id}@example.test`;
    const password = randomBytes(24).toString('base64url');
    const passwordHash = await app.get(PasswordService).hash(password);
    await db
      .insert(schema.users)
      .values({ id, email, passwordHash, role, isActive: active });
    return { id, email, password, passwordHash };
  }

  async function login(
    account: { email: string; password: string },
    target = browser,
  ) {
    const response = await target.post('login', {
      email: account.email,
      password: account.password,
    });
    expect(response.status).toBe(200);
    return loginResponseSchema.parse(response.body);
  }

  function assertError(response: Response, status: number, code: string): void {
    expect(response.status).toBe(status);
    const error = apiErrorSchema.parse(response.body);
    expect(error.code).toBe(code);
    expect(error.requestId).toBe(response.headers['x-request-id']);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toMatch(
      /password_hash|token_hash|select |insert |stack|postgresql:/i,
    );
  }

  it('registers only an active Viewer, hashes the password and requires explicit login', async () => {
    const email = `register-${randomUUID()}@example.test`;
    const password = randomBytes(24).toString('hex');
    const response = await browser.post('register', {
      email: ` ${email.toUpperCase()} `,
      password,
    });
    expect(response.status).toBe(201);
    const result = authUserResponseSchema.parse(response.body);
    expect(result.data).toEqual({
      id: result.data.id,
      email,
      role: 'viewer',
    });
    const row = await db.query.users.findFirst({
      where: sql`${schema.users.id} = ${result.data.id}`,
    });
    expect(row?.isActive).toBe(true);
    expect(row?.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    expect(
      Object.fromEntries(
        (row?.passwordHash.split('$')[3] ?? '')
          .split(',')
          .map((part) => part.split('=')),
      ),
    ).toEqual({ m: '19456', t: '2', p: '1' });
    expect(await verify(row?.passwordHash ?? '', password)).toBe(true);
    expect(response.text).not.toContain(password);
    expect(browser.cookies.has('datascope_session')).toBe(false);
    await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', browser.cookie())
      .expect(401);
  });

  it.each([
    { role: 'admin' },
    { role: 'analyst' },
    { isActive: false },
    { id: randomUUID() },
  ])(
    'rejects registration privilege or identity injection %#',
    async (extra) => {
      const email = `injection-${randomUUID()}@example.test`;
      const response = await browser.post('register', {
        email,
        password: randomBytes(24).toString('hex'),
        ...extra,
      });
      assertError(response, 400, 'VALIDATION_ERROR');
      expect(
        await db.query.users.findFirst({
          where: sql`${schema.users.email} = ${email}`,
        }),
      ).toBeUndefined();
    },
  );

  it('handles concurrent case-insensitive duplicate registration without overwriting an account', async () => {
    const email = `duplicate-${randomUUID()}@example.test`;
    const password = randomBytes(24).toString('hex');
    const responses = await Promise.all([
      browser.post('register', { email, password }),
      browser.post('register', { email: email.toUpperCase(), password }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const conflict = responses.find((r) => r.status === 409);
    if (!conflict) throw new Error('Expected registration conflict');
    assertError(conflict, 409, 'REGISTRATION_CONFLICT');
    const rows = await db.query.users.findMany({
      where: sql`lower(${schema.users.email}) = ${email}`,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.role).toBe('viewer');
    expect(await verify(rows[0]?.passwordHash ?? '', password)).toBe(true);
  });

  it('issues a fresh 24-hour absolute opaque session, stores only its hash, and fetches minimal identity', async () => {
    const account = await user();
    const start = Date.now();
    const result = await login(account);
    const token = browser.cookies.get('datascope_session');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    if (!token) throw new Error('Expected session');
    const stored = await db.query.authSessions.findFirst({
      where: sql`${schema.authSessions.tokenHash} = ${tokenHash(token)}`,
    });
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.userId).toBe(account.id);
    expect(
      (stored?.expiresAt.getTime() ?? 0) - (stored?.createdAt.getTime() ?? 0),
    ).toBe(86400000);
    expect(Date.parse(result.expiresAt)).toBeGreaterThanOrEqual(
      start + 86400000,
    );
    expect(result.data).toEqual({
      id: account.id,
      email: account.email,
      role: 'viewer',
    });
    expect(JSON.stringify(result)).not.toContain(token);
    const response = await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', browser.cookie())
      .expect(200);
    expect(authUserResponseSchema.parse(response.body).data).toEqual(
      result.data,
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
    const unchanged = await db.query.authSessions.findFirst({
      where: sql`${schema.authSessions.id} = ${stored?.id ?? ''}`,
    });
    expect(unchanged).toEqual(stored);
  });

  it.each(['admin', 'analyst', 'viewer'] as const)(
    'logs in existing %s accounts with current database roles',
    async (role) => {
      const account = await user(role);
      expect((await login(account)).data.role).toBe(role);
    },
  );

  it('verifies the existing seed Argon2id hash policy without rewriting it', async () => {
    const account = await user('analyst');
    const seedHash = await hash(account.password, { type: argon2id });
    await db
      .update(schema.users)
      .set({ passwordHash: seedHash })
      .where(sql`${schema.users.id} = ${account.id}`);
    expect((await login(account)).data.role).toBe('analyst');
    const after = await db.query.users.findFirst({
      where: sql`${schema.users.id} = ${account.id}`,
    });
    expect(after?.passwordHash).toBe(seedHash);
  });

  it('serves actual production auth cookies with __Host scope, Secure and matching deletion flags', async () => {
    await app.close();
    closeApp = undefined;
    await openApp('https://datascope.example.test');
    const account = await user();
    const response = await browser.post('login', {
      email: account.email,
      password: account.password,
    });
    expect(response.status).toBe(200);
    const cookies: unknown = response.headers['set-cookie'];
    if (!Array.isArray(cookies)) throw new Error('Expected production cookies');
    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).toEqual(
        expect.stringMatching(
          /^__Host-datascope_(session|csrf)=[0-9a-f]{64}; Max-Age=86400;.*Path=\/; HttpOnly; SameSite=Lax; Secure$/,
        ),
      );
      expect(cookie).not.toContain('Domain=');
    }
    expect(browser.cookies.has('datascope_session')).toBe(false);
    await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', browser.cookie())
      .expect(200);
    const logout = await browser.post('logout');
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^__Host-datascope_session=; Max-Age=0;.*Path=\/; HttpOnly; SameSite=Lax; Secure$/,
        ),
      ]),
    );
  });

  it('rotates session/CSRF on login and revokes the prior browser session', async () => {
    const account = await user();
    const anonymous = browser.csrf;
    await login(account);
    const previous = browser.cookies.get('datascope_session') ?? '';
    const oldCsrf = browser.csrf;
    await login(account);
    expect(browser.cookies.get('datascope_session')).not.toBe(previous);
    expect(browser.csrf).not.toBe(oldCsrf);
    expect(oldCsrf).not.toBe(anonymous);
    await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', `datascope_session=${previous}`)
      .expect(401);
    const row = await db.query.authSessions.findFirst({
      where: sql`${schema.authSessions.tokenHash} = ${tokenHash(previous)}`,
    });
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it('revokes on logout, clears matching cookie scope and rejects replay', async () => {
    const account = await user();
    await login(account);
    const previous = browser.cookie();
    const response = await browser.post('logout');
    expect(response.status).toBe(200);
    expect(logoutResponseSchema.parse(response.body).data.loggedOut).toBe(true);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'datascope_session=; Max-Age=0; Expires=Thu, 01 Jan 1970',
        ),
      ]),
    );
    await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', previous)
      .expect(401);
    assertError(await browser.post('logout'), 401, 'UNAUTHENTICATED');
  });

  it('rejects unsupported logout inputs without revoking the active session', async () => {
    await login(await user());
    assertError(
      await browser.post('logout', { userId: randomUUID() }),
      400,
      'VALIDATION_ERROR',
    );
    await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', browser.cookie())
      .expect(200);
  });

  it('applies no-store and error privacy to case-insensitive auth routes', async () => {
    const response = await request(app.getHttpServer()).get('/API/V1/AUTH/ME');
    assertError(response, 401, 'UNAUTHENTICATED');
  });

  it('rejects actual expired sessions and does not renew their expiry', async () => {
    const account = await user();
    const token = randomBytes(32).toString('hex');
    await db.insert(schema.authSessions).values({
      userId: account.id,
      tokenHash: tokenHash(token),
      createdAt: new Date(Date.now() - 7200000),
      expiresAt: new Date(Date.now() - 3600000),
    });
    const response = await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', `datascope_session=${token}`);
    assertError(response, 401, 'UNAUTHENTICATED');
  });

  it('rechecks deactivation and role changes on each authenticated request', async () => {
    const account = await user();
    await login(account);
    await db
      .update(schema.users)
      .set({ role: 'analyst' })
      .where(sql`${schema.users.id} = ${account.id}`);
    const changed = await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', browser.cookie())
      .expect(200);
    expect(authUserResponseSchema.parse(changed.body).data.role).toBe(
      'analyst',
    );
    await db
      .update(schema.users)
      .set({ isActive: false })
      .where(sql`${schema.users.id} = ${account.id}`);
    assertError(
      await request(app.getHttpServer())
        .get(`${route}/me`)
        .set('Cookie', browser.cookie()),
      401,
      'UNAUTHENTICATED',
    );
    assertError(
      await browser.post('login', {
        email: account.email,
        password: account.password,
      }),
      401,
      'INVALID_CREDENTIALS',
    );
  });

  it('rechecks a concurrent password/status change before session insertion', async () => {
    const account = await user();
    await db
      .update(schema.users)
      .set({ passwordHash: '!changed-non-login-fixture' })
      .where(sql`${schema.users.id} = ${account.id}`);
    await expect(
      app
        .get(AuthRepository)
        .createSession(account.id, account.passwordHash, undefined),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      await db.query.authSessions.findFirst({
        where: sql`${schema.authSessions.userId} = ${account.id}`,
      }),
    ).toBeUndefined();
  });

  it('returns identical credential errors for wrong password, unknown user and inactive account', async () => {
    const active = await user();
    const inactive = await user('viewer', false);
    const responses = [
      await browser.post('login', {
        email: active.email,
        password: 'incorrect-password',
      }),
      await browser.post('login', {
        email: `missing-${randomUUID()}@example.test`,
        password: 'incorrect-password',
      }),
      await browser.post('login', {
        email: inactive.email,
        password: inactive.password,
      }),
    ];
    for (const response of responses)
      assertError(response, 401, 'INVALID_CREDENTIALS');
    expect(responses.map((r) => apiErrorSchema.parse(r.body).message)).toEqual(
      Array(3).fill('Unable to sign in with those credentials'),
    );
    expect(browser.cookies.has('datascope_session')).toBe(false);
  });

  it.each(['', 'plain', '%ZZ', randomBytes(32).toString('hex')])(
    'denies missing/malformed/unknown sessions %#',
    async (cookie) => {
      const response = await request(app.getHttpServer())
        .get(`${route}/me`)
        .set('Cookie', `datascope_session=${cookie}`);
      assertError(response, 401, 'UNAUTHENTICATED');
    },
  );

  it('denies duplicate session cookies instead of choosing an attacker-controlled path', async () => {
    await login(await user());
    const response = await request(app.getHttpServer())
      .get(`${route}/me`)
      .set(
        'Cookie',
        `${browser.cookie()}; datascope_session=${randomBytes(32).toString('hex')}`,
      );
    assertError(response, 401, 'UNAUTHENTICATED');
  });

  it.each([
    'missing-token',
    'tampered-token',
    'missing-cookie',
    'wrong-origin',
    'null-origin',
    'no-source',
    'cross-site',
    'same-site-subdomain',
  ])(
    'blocks unsafe registration before a database mutation: %s',
    async (kind) => {
      const email = `csrf-${randomUUID()}@example.test`;
      const attempt = request(app.getHttpServer())
        .post(`${route}/register`)
        .send({ email, password: randomBytes(24).toString('hex') });
      if (kind !== 'no-source')
        attempt.set(
          'Origin',
          kind === 'wrong-origin'
            ? 'https://attacker.example'
            : kind === 'null-origin'
              ? 'null'
              : kind === 'same-site-subdomain'
                ? 'http://other.localhost:3000'
                : origin,
        );
      if (kind !== 'missing-cookie') attempt.set('Cookie', browser.cookie());
      if (kind !== 'missing-token')
        attempt.set(
          'X-CSRF-Token',
          kind === 'tampered-token'
            ? `${browser.csrf.slice(0, -1)}${browser.csrf.endsWith('0') ? '1' : '0'}`
            : browser.csrf,
        );
      if (kind === 'cross-site') attempt.set('Sec-Fetch-Site', 'cross-site');
      assertError(await attempt, 403, 'CSRF_REJECTED');
      expect(
        await db.query.users.findFirst({
          where: sql`${schema.users.email} = ${email}`,
        }),
      ).toBeUndefined();
    },
  );

  it('supports exact Referer fallback and rejects prefix-lookalike origins', async () => {
    const valid = await request(app.getHttpServer())
      .post(`${route}/login`)
      .set('Referer', `${origin}/login`)
      .set('Cookie', browser.cookie())
      .set('X-CSRF-Token', browser.csrf)
      .send({
        email: `missing-${randomUUID()}@example.test`,
        password: 'invalid',
      });
    assertError(valid, 401, 'INVALID_CREDENTIALS');
    const invalid = await request(app.getHttpServer())
      .post(`${route}/login`)
      .set('Referer', `${origin}.attacker.test/login`)
      .set('Cookie', browser.cookie())
      .set('X-CSRF-Token', browser.csrf)
      .send({});
    assertError(invalid, 403, 'CSRF_REJECTED');
  });

  it('binds CSRF to session and rejects stale anonymous and other-browser tokens', async () => {
    const anonymousCsrf = browser.csrf;
    await login(await user());
    const second = new Browser(app.getHttpServer());
    await second.bootstrap();
    for (const token of [anonymousCsrf, second.csrf]) {
      const response = await request(app.getHttpServer())
        .post(`${route}/logout`)
        .set('Origin', origin)
        .set('Cookie', browser.cookie())
        .set('X-CSRF-Token', token)
        .send({});
      assertError(response, 403, 'CSRF_REJECTED');
    }
    await request(app.getHttpServer())
      .get(`${route}/me`)
      .set('Cookie', browser.cookie())
      .expect(200);
  });

  it('keeps bootstrap stable for multiple tabs, blocks disallowed bootstrap and exposes no credentialed CORS', async () => {
    const previous = browser.csrf;
    const bootstrap = await browser.bootstrap();
    expect(browser.csrf).toBe(previous);
    expect(bootstrap.headers['access-control-allow-origin']).toBeUndefined();
    assertError(
      await request(app.getHttpServer())
        .get(`${route}/csrf`)
        .set('Origin', 'https://attacker.test'),
      403,
      'CSRF_REJECTED',
    );
  });

  it('rejects simple form content types even with a valid token', async () => {
    const response = await request(app.getHttpServer())
      .post(`${route}/login`)
      .set('Origin', origin)
      .set('Cookie', browser.cookie())
      .set('X-CSRF-Token', browser.csrf)
      .type('form')
      .send('email=a%40example.test&password=test');
    assertError(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects malformed login values and extra fields with safe contract errors', async () => {
    for (const body of [
      { email: 'bad', password: 'x' },
      { email: 'a@example.test', password: '🔐'.repeat(33) },
      { email: 'a@example.test', password: 'x', role: 'admin' },
    ])
      assertError(await browser.post('login', body), 400, 'VALIDATION_ERROR');
  });

  it('sanitizes malformed JSON and bounded-parser failures before controller execution', async () => {
    for (const [body, status] of [
      ['{"password":"sensitive-json', 400],
      [JSON.stringify({ password: 'x'.repeat(110000) }), 413],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`${route}/login`)
        .set('Origin', origin)
        .set('Cookie', browser.cookie())
        .set('X-CSRF-Token', browser.csrf)
        .type('json')
        .send(body);
      assertError(response, status, 'INVALID_REQUEST');
      expect(response.text).not.toContain('sensitive-json');
    }
  });

  it('enforces normalized account limits and returns Retry-After', async () => {
    const email = `limited-${randomUUID()}@example.test`;
    for (let attempt = 0; attempt < 5; attempt++)
      assertError(
        await browser.post('login', {
          email: attempt % 2 ? email.toUpperCase() : email,
          password: 'incorrect',
        }),
        401,
        'INVALID_CREDENTIALS',
      );
    const response = await browser.post('login', {
      email,
      password: 'incorrect',
    });
    assertError(response, 429, 'RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(900);
  });

  it('reserves IP attempts concurrently and ignores spoofed forwarding headers', async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request(app.getHttpServer())
          .post(`${route}/login`)
          .set('Origin', origin)
          .set('Cookie', browser.cookie())
          .set('X-CSRF-Token', browser.csrf)
          .set('X-Forwarded-For', `192.0.2.${String(index + 1)}`)
          .send({
            email: `missing-${randomUUID()}@example.test`,
            password: 'wrong',
          }),
      ),
    );
    expect(responses.filter((r) => r.status === 401)).toHaveLength(10);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(2);
    for (const response of responses.filter((r) => r.status === 429))
      assertError(response, 429, 'RATE_LIMITED');
  });

  it('limits registration without depending on whether an email already exists', async () => {
    const body = {
      email: `registration-limit-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('hex'),
    };
    expect((await browser.post('register', body)).status).toBe(201);
    for (let attempt = 0; attempt < 4; attempt++)
      assertError(
        await browser.post('register', body),
        409,
        'REGISTRATION_CONFLICT',
      );
    assertError(
      await browser.post('register', {
        ...body,
        email: `another-${randomUUID()}@example.test`,
      }),
      429,
      'RATE_LIMITED',
    );
  });

  it('sanitizes real database failures and preserves public health contracts', async () => {
    // Only this newly created disposable database is affected; restore even on failure.
    await db.execute(
      sql`alter table public.users rename to auth_failure_users`,
    );
    try {
      const response = await browser.post('login', {
        email: 'db-unavailable@example.test',
        password: 'incorrect',
      });
      assertError(response, 500, 'INTERNAL_ERROR');
      await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200, { status: 'ok' });
      await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503, {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Service is not ready',
        });
    } finally {
      await db.execute(
        sql`alter table public.auth_failure_users rename to users`,
      );
    }
  });
});
