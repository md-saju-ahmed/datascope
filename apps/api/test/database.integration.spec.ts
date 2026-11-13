import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from '@datascope/db';
import { readinessResponseSchema } from '@datascope/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';
import { DatabaseService } from '../src/database/database.service.js';

const repositoryRoot = fileURLToPath(
  new URL('../../../../../', import.meta.url),
);

function compose(...args: string[]): void {
  execFileSync(
    'docker',
    [
      'compose',
      '--project-directory',
      repositoryRoot,
      '--profile',
      'test',
      ...args,
    ],
    {
      cwd: repositoryRoot,
      timeout: 60000,
      stdio: 'pipe',
      windowsHide: true,
    },
  );
}

describe('real PostgreSQL provider and readiness', () => {
  let app: INestApplication<Server>;
  let database: DatabaseService;

  beforeAll(async () => {
    const rawUrl = process.env.DATABASE_TEST_URL;
    if (!rawUrl)
      throw new Error(
        'DATABASE_TEST_URL is required; run pnpm env:init and pnpm db:test:up',
      );
    const url = new URL(rawUrl);
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/datascope_test' ||
      url.username !== 'datascope_test_app'
    ) {
      throw new Error(
        'Integration tests require the designated local datascope_test database and application role',
      );
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: rawUrl,
          DB_POOL_MAX: 2,
          DB_CONNECTION_TIMEOUT_MS: 500,
          DB_STATEMENT_TIMEOUT_MS: 200,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    const { configureApp } = await import('../src/configure-app.js');
    configureApp(app);
    await app.init();
    database = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app.close();
    expect(database.pool.totalCount).toBe(0);
  });

  it('executes Drizzle SQL as the isolated non-superuser application role', async () => {
    const result = await database.db.execute<{
      user_name: string;
      db_name: string;
      is_superuser: boolean;
      can_create_database: boolean;
      can_create_role: boolean;
    }>(sql`select current_user as user_name, current_database() as db_name,
      rolsuper as is_superuser, rolcreatedb as can_create_database,
      rolcreaterole as can_create_role from pg_roles where rolname = current_user`);
    expect(result.rows).toEqual([
      {
        user_name: 'datascope_test_app',
        db_name: 'datascope_test',
        is_superuser: false,
        can_create_database: false,
        can_create_role: false,
      },
    ]);
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);
    expect(readinessResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('reuses connections and bounds simultaneous PostgreSQL connections', async () => {
    const first = await database.pool.query<{ pid: number }>(
      'select pg_backend_pid() as pid',
    );
    const second = await database.pool.query<{ pid: number }>(
      'select pg_backend_pid() as pid',
    );
    expect(typeof first.rows[0]?.pid).toBe('number');
    expect(second.rows[0]?.pid).toBe(first.rows[0]?.pid);
    await Promise.all(
      Array.from({ length: 8 }, () =>
        database.pool.query('select pg_sleep(0.05)'),
      ),
    );
    expect(database.pool.totalCount).toBeGreaterThan(0);
    expect(database.pool.totalCount).toBeLessThanOrEqual(2);
    expect(database.pool.waitingCount).toBe(0);
    expect(database.pool.idleCount).toBe(database.pool.totalCount);
  });

  it('cancels a slow query using the server timeout and remains usable', async () => {
    await expect(
      database.pool.query('select pg_sleep(1)'),
    ).rejects.toMatchObject({ code: '57014' });
    expect(await database.isReady()).toBe(true);
  });

  it('keeps liveness during an outage and recovers its pool after a database restart', async () => {
    // Only the dedicated Compose test service is stopped; no data is reset/deleted.
    compose('stop', 'postgres_test');
    try {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
      const failed = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);
      expect(failed.body).toEqual({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Service is not ready',
      });
    } finally {
      compose('up', '-d', '--wait', 'postgres_test');
    }
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      ready = await database.isReady();
      if (ready) break;
      await delay(100);
    }
    expect(ready).toBe(true);
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });
});
