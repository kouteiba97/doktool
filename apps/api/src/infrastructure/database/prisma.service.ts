import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV, type Env } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * The single database client. Connects lazily on the first query, so booting the app (and
 * generating the OpenAPI document) never needs a reachable database.
 *
 * Table ownership (ADR-001): a domain module only writes the tables its section of
 * prisma/schema.prisma assigns to it.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    // Every session runs in UTC: the adapter sends dates without an offset, and a server whose
    // time zone is not UTC would otherwise store them shifted by its offset.
    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL, options: '-c TimeZone=UTC' }),
    });
  }

  /** True when the database answers a trivial query. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** Closes the database connections when the application shuts down. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
