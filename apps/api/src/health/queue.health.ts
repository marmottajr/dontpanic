import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { QUEUE_PROVIDER, type QueueProvider } from '../core/queue/queue.provider';

/**
 * Terminus indicator for the queue backend.
 *
 * Worth its own check rather than leaning on the cache one: they can point at
 * different Redis instances, and a queue that cannot be reached means mail and
 * every other background job are piling up unsent — which is invisible from the
 * request path.
 */
@Injectable()
export class QueueHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(QUEUE_PROVIDER) private readonly queue: QueueProvider,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.queue.ping();
      return indicator.up();
    } catch (err) {
      return indicator.down({ message: err instanceof Error ? err.message : String(err) });
    }
  }
}
