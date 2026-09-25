// Boots the real application against the test database for end-to-end tests.
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { MessageDelivery } from '../../src/infrastructure/messaging/message-delivery.js';
import { testEnv } from '../support/env.js';
import { requireDatabaseUrl } from './database.js';

export interface TestApp {
  http: () => ReturnType<typeof request>;
  prisma: () => PrismaService;
  get: <T>(token: abstract new (...args: never[]) => T) => T;
  /** The 6-digit code of the last message sent to `destination`. */
  lastCode: (destination: string) => string;
  /** Number of messages sent to `destination`. */
  messageCount: (destination: string) => number;
}

let sequence = 0;
/** A unique e-mail per test run and call, so tests never collide in the shared database. */
export function uniqueEmail(label: string): string {
  return `${label}.${Date.now().toString(36)}${(sequence++).toString(36)}@test.doktool.dz`;
}

/** Registers hooks that start the app once per file and reset rate limits before each test. */
export function useTestApp(): TestApp {
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

  beforeEach(async () => {
    await app.get(PrismaService).rateLimitCounter.deleteMany();
  });

  const sentTo = (destination: string) =>
    app.get(MessageDelivery).sent.filter((message) => message.to === destination);

  return {
    http: () => request(app.getHttpServer() as Server),
    prisma: () => app.get(PrismaService),
    get: (token) => app.get(token),
    lastCode(destination) {
      const text = sentTo(destination).at(-1)?.text ?? '';
      const code = /\b(\d{6})\b/.exec(text)?.[1];
      if (!code) throw new Error(`No code was sent to ${destination}`);
      return code;
    },
    messageCount: (destination) => sentTo(destination).length,
  };
}
