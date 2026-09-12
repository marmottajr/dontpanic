import { QueueModule } from './queue.module';
import type { JobRouter } from './job-router.service';
import type { QueueProvider } from '../../core/queue/queue.provider';

/**
 * Wiring, but wiring whose failure is silent: without this registration the
 * memory adapter has no handler, `enqueue` takes its drop-and-warn branch, and
 * no transactional mail is ever sent in dev or in the e2e suite — with every
 * request still answering 200. Worth a test even though `*.module.ts` is
 * outside the coverage scope.
 */
describe('QueueModule', () => {
  const build = (driver: 'memory' | 'bullmq') => {
    const queue = { consume: jest.fn() } as unknown as QueueProvider & { consume: jest.Mock };
    const router = { run: jest.fn() } as unknown as JobRouter & { run: jest.Mock };
    const config = { get: jest.fn().mockReturnValue(driver) };
    return { queue, router, module: new QueueModule(config as never, queue, router) };
  };

  it('registers the inline handler on the memory driver', async () => {
    const { queue, router, module } = build('memory');
    await module.onModuleInit();

    expect(queue.consume).toHaveBeenCalledTimes(1);

    // And the handler really reaches the router, rather than being a stub that
    // satisfies the call count.
    const handler = queue.consume.mock.calls[0][0] as (e: unknown) => Promise<void>;
    const envelope = { name: 'mail.send', payload: {}, tenantId: null };
    await handler(envelope);
    expect(router.run).toHaveBeenCalledWith(envelope);
  });

  it('registers nothing on the bullmq driver, where the worker consumes', async () => {
    // Consuming here too would mean the API quietly doing the background work
    // it was split apart to avoid.
    const { queue, module } = build('bullmq');
    await module.onModuleInit();
    expect(queue.consume).not.toHaveBeenCalled();
  });
});
