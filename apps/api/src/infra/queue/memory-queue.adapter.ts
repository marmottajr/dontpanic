import { Logger } from '@nestjs/common';
import type { EnqueueOptions, JobHandler, QueueProvider } from '../../core/queue/queue.provider';
import type { JobEnvelope, JobEnvelopeOf, JobName, JobPayloads } from '../../core/queue/jobs';
import { TenantContext } from '../tenancy/tenant-context';

/**
 * QUEUE_DRIVER=memory. Runs the handler inline, in the enqueuing process.
 *
 * For tests and for `pnpm dev` without a worker: the effect of a job is
 * observable immediately, which is what a test wants to assert. It is NOT a
 * queue — there is no durability, no retry and no separate process, so the
 * failure modes it can reproduce are limited. That is deliberate: a fake that
 * pretended to retry would let a broken handler look fine.
 *
 * With no handler registered (the API process, memory driver) jobs are dropped
 * with a warning rather than silently discarded.
 */
export class MemoryQueueAdapter implements QueueProvider {
  private readonly logger = new Logger(MemoryQueueAdapter.name);
  private handler: JobHandler | null = null;

  async enqueue<N extends JobName>(
    name: N,
    payload: JobPayloads[N],
    options: EnqueueOptions = {},
  ): Promise<void> {
    const scope = TenantContext.get()?.scope;
    const envelope: JobEnvelopeOf<N> = {
      name,
      payload,
      tenantId: options.systemWide || scope?.kind !== 'tenant' ? null : scope.tenantId,
    };

    if (!this.handler) {
      this.logger.warn(`No handler registered; dropping job "${name}".`);
      return;
    }

    // Awaited on purpose: inline means inline. A test that enqueues and then
    // asserts must not race the handler.
    await this.handler(envelope as JobEnvelope);
  }

  async consume(handler: JobHandler): Promise<void> {
    this.handler = handler;
  }

  async ping(): Promise<void> {
    // Nothing to reach: the "backend" is this process.
  }

  async close(): Promise<void> {
    this.handler = null;
  }
}
