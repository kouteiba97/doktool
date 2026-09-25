import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from '../../src/health/health.controller.js';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service.js';

function controllerWithDatabase(up: boolean) {
  const prisma = { isReachable: vi.fn().mockResolvedValue(up) } as unknown as PrismaService;
  const status = vi.fn();
  const response = { status } as unknown as Response;
  return { controller: new HealthController(prisma), response, status };
}

describe('HealthController', () => {
  it('answers 200 ok when the database is reachable', async () => {
    const { controller, response, status } = controllerWithDatabase(true);
    const body = await controller.check(response);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(body).toMatchObject({ status: 'ok', database: 'up' });
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
  });

  it('answers 503 degraded when the database is unreachable', async () => {
    const { controller, response, status } = controllerWithDatabase(false);
    const body = await controller.check(response);
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body).toMatchObject({ status: 'degraded', database: 'down' });
  });
});
