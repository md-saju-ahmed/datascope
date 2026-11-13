import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { livenessResponseSchema } from '@datascope/contracts';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import {
  APP_ENVIRONMENT,
  parseEnvironment,
} from '../src/config/environment.js';

describe('API liveness', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_ENVIRONMENT)
      .useValue(
        parseEnvironment({
          NODE_ENV: 'test',
          DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/unavailable',
          DB_CONNECTION_TIMEOUT_MS: 100,
          DB_STATEMENT_TIMEOUT_MS: 100,
        }),
      )
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns only the public process status using the shared contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(livenessResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
    });
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('does not expose an unversioned health route', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(404);
  });

  it('returns a controlled 503 when a real database connection is unavailable', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503);
    expect(response.body).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Service is not ready',
    });
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });
});
