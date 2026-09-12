import type { JobEnvelope, JobName, JobPayloads } from './jobs';

/** Port for durable background work. Adapters: BullMQ (Redis) and Memory. */
export const QUEUE_PROVIDER = Symbol('QUEUE_PROVIDER');

export interface EnqueueOptions {
  /** Total tries, including the first. Defaults to the driver's setting. */
  attempts?: number;
  /** Delay before the first attempt. */
  delayMs?: number;
  /** Cron expression for repeatable work, e.g. hourly cleanup. */
  repeatCron?: string;
  /**
   * Deduplication key. Enqueuing the same id twice while the first is still
   * pending is a no-op — what keeps a retried request from sending two e-mails.
   */
  jobId?: string;
  /**
   * Run without a tenant scope. Only for work that genuinely spans companies
   * (maintenance, platform aggregates). Everything else should inherit the
   * caller's tenant, which is the default.
   */
  systemWide?: boolean;
}

/** Runs one job. Registered by the worker; never called from the API process. */
export type JobHandler = (envelope: JobEnvelope) => Promise<void>;

export interface QueueProvider {
  enqueue<N extends JobName>(
    name: N,
    payload: JobPayloads[N],
    options?: EnqueueOptions,
  ): Promise<void>;

  /** Starts consuming. The API process never calls this — only the worker does. */
  consume(handler: JobHandler): Promise<void>;

  /** Liveness probe for health checks; rejects if the backend is unreachable. */
  ping(): Promise<void>;

  close(): Promise<void>;
}
