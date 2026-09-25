import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../../config/env.js';

interface ScheduledJob {
  name: string;
  cron: string;
  handler: () => Promise<void>;
}

/**
 * Background jobs on pg-boss (ADR-007), in its own `pgboss` schema. Modules register recurring
 * jobs during `onModuleInit`; they start once the application has bootstrapped, only when
 * JOBS_ENABLED is true.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly scheduled: ScheduledJob[] = [];
  private boss: PgBoss | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Declares a recurring job (cron in UTC). Names are unique. */
  register(name: string, cron: string, handler: () => Promise<void>): void {
    if (this.scheduled.some((job) => job.name === name)) {
      throw new Error(`Job "${name}" is registered twice`);
    }
    this.scheduled.push({ name, cron, handler });
  }

  /** Names of the registered recurring jobs. */
  registeredJobs(): string[] {
    return this.scheduled.map((job) => job.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.JOBS_ENABLED) return;
    const boss = new PgBoss({ connectionString: this.env.DATABASE_URL, schema: 'pgboss' });
    boss.on('error', (error: Error) => this.logger.error(error.stack ?? error.message));
    await boss.start();
    for (const job of this.scheduled) {
      await boss.createQueue(job.name);
      await boss.schedule(job.name, job.cron);
      await boss.work(job.name, async () => {
        await job.handler();
      });
    }
    this.boss = boss;
    this.logger.log(`Started ${this.scheduled.length} recurring job(s).`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true });
    this.boss = null;
  }
}
