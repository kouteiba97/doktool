import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../../config/env.js';

/** A job pg-boss runs on a cron schedule. */
interface ScheduledJob {
  name: string;
  cron: string;
  handler: () => Promise<void>;
}

/** A queue consumer: runs once per job queued with enqueue(). */
interface Worker {
  name: string;
  handler: (data: Record<string, unknown>) => Promise<void>;
}

/**
 * Background jobs on pg-boss (ADR-007), in its own `pgboss` schema. Modules register recurring
 * jobs and on-demand workers during `onModuleInit`; they start once the application has
 * bootstrapped, only when JOBS_ENABLED is true.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly scheduled: ScheduledJob[] = [];
  private readonly workers: Worker[] = [];
  private boss: PgBoss | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Declares a recurring job (cron in UTC). Names are unique. */
  register(name: string, cron: string, handler: () => Promise<void>): void {
    this.assertUnique(name);
    this.scheduled.push({ name, cron, handler });
  }

  /** Declares an on-demand queue fed by {@link enqueue}. Names are unique. */
  registerWorker(name: string, handler: (data: Record<string, unknown>) => Promise<void>): void {
    this.assertUnique(name);
    this.workers.push({ name, handler });
  }

  /**
   * Queues one job. When jobs are disabled in this process the call is a no-op, and the owning
   * module's recurring sweep picks the work up in the process that runs jobs.
   */
  async enqueue(name: string, data: Record<string, unknown>): Promise<void> {
    if (!this.workers.some((worker) => worker.name === name)) {
      throw new Error(`No worker registered for job "${name}"`);
    }
    if (this.boss) await this.boss.send(name, data);
  }

  /** Names of the registered recurring jobs and workers. */
  registeredJobs(): string[] {
    return [...this.scheduled, ...this.workers].map((job) => job.name);
  }

  /**
   * Starts pg-boss once every module has registered its jobs: creates the queues, the schedules
   * and the workers. Does nothing when JOBS_ENABLED is false.
   */
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
    for (const worker of this.workers) {
      await boss.createQueue(worker.name);
      await boss.work<Record<string, unknown>>(worker.name, async (jobs) => {
        for (const job of jobs) await worker.handler(job.data);
      });
    }
    this.boss = boss;
    this.logger.log(
      `Started ${this.scheduled.length} recurring job(s) and ${this.workers.length} worker(s).`,
    );
  }

  /** Stops pg-boss, letting running jobs finish. */
  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true });
    this.boss = null;
  }

  /** Refuses two jobs with the same name (a programming error, caught at boot). */
  private assertUnique(name: string): void {
    if (this.registeredJobs().includes(name)) throw new Error(`Job "${name}" is registered twice`);
  }
}
