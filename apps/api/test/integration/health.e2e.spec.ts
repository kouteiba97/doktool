import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { loadEnv } from '../../src/config/env.js';
import { requireDatabaseUrl } from './database.js';

describe('GET /v1/health (real database)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const env = loadEnv({ DATABASE_URL: requireDatabaseUrl(), NODE_ENV: 'test' });
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
});
