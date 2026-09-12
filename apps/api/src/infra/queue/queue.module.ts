import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { QUEUE_PROVIDER, type QueueProvider } from '../../core/queue/queue.provider';
import { BullmqQueueAdapter } from './bullmq-queue.adapter';
import { MemoryQueueAdapter } from './memory-queue.adapter';
import { JobRouter } from './job-router.service';

@Global()
@Module({
  providers: [
    JobRouter,
    {
      provide: QUEUE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('QUEUE_DRIVER', { infer: true }) === 'memory'
          ? new MemoryQueueAdapter()
          : new BullmqQueueAdapter({
              redisUrl: config.get('REDIS_URL', { infer: true }),
              prefix: config.get('QUEUE_PREFIX', { infer: true }),
              queueName: config.get('QUEUE_NAME', { infer: true }),
              concurrency: config.get('QUEUE_CONCURRENCY', { infer: true }),
              defaultAttempts: config.get('QUEUE_ATTEMPTS', { infer: true }),
              backoffMs: config.get('QUEUE_BACKOFF', { infer: true }),
            }),
    },
  ],
  exports: [QUEUE_PROVIDER, JobRouter],
})
export class QueueModule implements OnModuleInit {
  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(QUEUE_PROVIDER) private readonly queue: QueueProvider,
    private readonly router: JobRouter,
  ) {}

  /**
   * On the memory driver, whoever enqueues also runs the job — so the handler
   * has to be registered here, in the API process.
   *
   * With `bullmq` this does nothing: the worker process owns consumption, and
   * registering a consumer in the API too would mean the API quietly doing
   * background work it was split apart to avoid.
   */
  async onModuleInit(): Promise<void> {
    if (this.config.get('QUEUE_DRIVER', { infer: true }) !== 'memory') return;
    await this.queue.consume((envelope) => this.router.run(envelope));
  }
}
