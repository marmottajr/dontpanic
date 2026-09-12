// .env first, then Sentry (which reads it), then everything they instrument.
import './load-env';
import './instrument';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { QUEUE_PROVIDER, type QueueProvider } from './core/queue/queue.provider';
import { JobRouter } from './infra/queue/job-router.service';

/**
 * The worker process. Same AppModule, no HTTP server.
 *
 * It is a separate process on purpose: a slow SMTP host, a long report or a
 * crash mid-job must not touch request latency, and work that fails has to be
 * retried rather than lost with the request that started it.
 *
 * Run it alongside the API (`pnpm --filter @dontpanic/api worker`). With
 * QUEUE_DRIVER=memory there is nothing to consume — jobs run inline in the API
 * — so the worker exits instead of idling and pretending to do something.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);
  const config = app.get(ConfigService) as ConfigService<Env, true>;

  if (config.get('QUEUE_DRIVER', { infer: true }) === 'memory') {
    logger.warn('QUEUE_DRIVER=memory: jobs run inline in the API, so this worker has no work.');
    await app.close();
    return;
  }

  const queue = app.get<QueueProvider>(QUEUE_PROVIDER);
  const router = app.get(JobRouter);

  await queue.consume((envelope) => router.run(envelope));

  // Maintenance that belongs to nobody in particular. Registered from the
  // worker, with a fixed jobId so N workers do not install N schedules.
  await queue.enqueue(
    'tokens.purge-expired',
    {},
    { repeatCron: '17 * * * *', jobId: 'tokens-purge-expired', systemWide: true },
  );

  logger.log('Worker consuming jobs.');

  // Drain in flight work before dying, so a deploy does not kill a running job.
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} received, draining…`);
    await queue.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
