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
  /** The texts sent to `destination`, oldest first. */
  messages: (destination: string) => string[];
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
    // One listening server for the whole file. Left to itself, supertest opens and closes a
    // port for every request, and a request now and then reached a port already handed to
    // another server: random 404 and 401 answers on a loaded machine.
    await app.listen(0, '127.0.0.1');
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
      // Security notices (ADR-023) carry no code: the last message that has one.
      const text =
        sentTo(destination)
          .map((message) => message.text)
          .findLast((candidate) => /\b\d{6}\b/.test(candidate)) ?? '';
      const code = /\b(\d{6})\b/.exec(text)?.[1];
      if (!code) throw new Error(`No code was sent to ${destination}`);
      return code;
    },
    messageCount: (destination) => sentTo(destination).length,
    messages: (destination) => sentTo(destination).map((message) => message.text),
  };
}
