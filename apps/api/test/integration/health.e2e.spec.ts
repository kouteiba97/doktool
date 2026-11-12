import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { testEnv } from '../support/env.js';
import { requireDatabaseUrl } from './database.js';

describe('GET /v1/health (real database)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const env = testEnv({ DATABASE_URL: requireDatabaseUrl() });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the API and database as up', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/v1/health')
      .expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('gives every request an id, keeping a plain one sent by the proxy', async () => {
    const server = app.getHttpServer() as Server;
    const fresh = await request(server).get('/v1/health').expect(200);
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const kept = await request(server)
      .get('/v1/health')
      .set('X-Request-Id', 'edge-0123456789abcdef')
      .expect(200);
    expect(kept.headers['x-request-id']).toBe('edge-0123456789abcdef');

    // Anything that is not a short plain token never reaches the logs.
    const replaced = await request(server)
      .get('/v1/health')
      .set('X-Request-Id', 'x"; DROP <script>')
      .expect(200);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    // Errors carry it too, so a person can quote it.
    const missing = await request(server).get('/v1/me').expect(401);
    expect(missing.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
