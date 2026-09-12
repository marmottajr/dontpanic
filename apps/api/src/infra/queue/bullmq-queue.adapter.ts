import { Logger } from '@nestjs/common';
import { Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { EnqueueOptions, JobHandler, QueueProvider } from '../../core/queue/queue.provider';
import type { JobEnvelope, JobEnvelopeOf, JobName, JobPayloads } from '../../core/queue/jobs';
import { TenantContext } from '../tenancy/tenant-context';

export interface BullmqQueueOptions {
  redisUrl: string;
  /** Namespaces the Redis keys, so two apps can share one Redis. */
  prefix: string;
  queueName: string;
  concurrency: number;
  defaultAttempts: number;
  backoffMs: number;
}

/**
 * Durable queue on Redis.
 *
 * The API process only ever enqueues; a separate worker process (src/worker.ts)
 * consumes. That split is the point: a slow SMTP host or a long report cannot
 * touch request latency, and a crash mid-job is retried instead of lost.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ's blocking commands — with
 * ioredis's default the blocking read aborts and the worker stops consuming.
 */
export class BullmqQueueAdapter implements QueueProvider {
  private readonly logger = new Logger(BullmqQueueAdapter.name);
  private readonly connection: Redis;
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(private readonly options: BullmqQueueOptions) {
    this.connection = new IORedis(options.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(options.queueName, {
      connection: this.connection,
      prefix: options.prefix,
      defaultJobOptions: {
        attempts: options.defaultAttempts,
        backoff: { type: 'exponential', delay: options.backoffMs },
        // Keep a short tail for debugging, not a growing archive in Redis.
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 1000 },
      },
    });
  }

  async enqueue<N extends JobName>(
    name: N,
    payload: JobPayloads[N],
    options: EnqueueOptions = {},
  ): Promise<void> {
    const envelope: JobEnvelopeOf<N> = {
      name,
      payload,
      // Captured here, not in the handler: at enqueue time we are inside the
      // request's scope and know the tenant; the worker never can.
      tenantId: options.systemWide ? null : currentTenantId(),
    };

    const jobOptions: JobsOptions = {
      ...(options.attempts === undefined ? {} : { attempts: options.attempts }),
      ...(options.delayMs === undefined ? {} : { delay: options.delayMs }),
      ...(options.jobId === undefined ? {} : { jobId: options.jobId }),
      ...(options.repeatCron === undefined ? {} : { repeat: { pattern: options.repeatCron } }),
    };

    await this.queue.add(name, envelope, jobOptions);
  }

  async consume(handler: JobHandler): Promise<void> {
    this.worker = new Worker(
      this.options.queueName,
      async (job) => handler(job.data as JobEnvelope),
      {
        connection: this.connection.duplicate(),
        prefix: this.options.prefix,
        concurrency: this.options.concurrency,
      },
    );

    // Logged, never swallowed: a job that keeps failing has to be visible
    // somewhere, and BullMQ's own retry is what decides whether it is final.
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Job ${job?.name ?? 'unknown'} failed (attempt ${job?.attemptsMade ?? 0}): ${err.message}`,
      );
    });
  }

  async ping(): Promise<void> {
    await this.connection.ping();
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }
}

/** The tenant of the request doing the enqueue, when there is one. */
function currentTenantId(): string | null {
  const scope = TenantContext.get()?.scope;
  return scope?.kind === 'tenant' ? scope.tenantId : null;
}
