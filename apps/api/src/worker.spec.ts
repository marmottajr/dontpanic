/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NestFactory } from '@nestjs/core';

// The worker is a bootstrap module: importing it runs it. Everything it reaches
// for is replaced, so what is left under test is the wiring — which is exactly
// where the interesting decisions live (exit under the memory driver, one
// repeatable purge no matter how many workers, drain before dying).
jest.mock('./load-env', () => ({}));
jest.mock('./instrument', () => ({}));
jest.mock('./app.module', () => ({ AppModule: class AppModule {} }));
jest.mock('nestjs-pino', () => ({ Logger: class Logger {} }));
jest.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: jest.fn() },
}));

const createContext = NestFactory.createApplicationContext as jest.Mock;

describe('worker bootstrap', () => {
  let app: { get: jest.Mock; useLogger: jest.Mock; close: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock };
  let config: { get: jest.Mock };
  let queue: { consume: jest.Mock; enqueue: jest.Mock; close: jest.Mock };
  let router: { run: jest.Mock };
  let signals: Map<string, () => void>;
  let exit: jest.SpyInstance;

  /** Imports the worker fresh and lets its top-level `void bootstrap()` settle. */
  async function bootWorker(): Promise<void> {
    jest.isolateModules(() => {
      require('./worker');
    });
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    logger = { log: jest.fn(), warn: jest.fn() };
    config = { get: jest.fn().mockReturnValue('bullmq') };
    queue = {
      consume: jest.fn().mockResolvedValue(undefined),
      enqueue: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    router = { run: jest.fn().mockResolvedValue(undefined) };
    app = {
      // Resolved by shape, not by identity: each test re-imports the worker in
      // a fresh module registry, so the QUEUE_PROVIDER symbol and the JobRouter
      // class it asks for are not the ones this file could import.
      get: jest.fn((token: any) => {
        if (typeof token === 'symbol') return queue;
        if (token?.name === 'JobRouter') return router;
        if (token?.name === 'ConfigService') return config;
        return logger;
      }),
      useLogger: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    createContext.mockResolvedValue(app);

    signals = new Map();
    jest
      .spyOn(process, 'on')
      .mockImplementation((event: string | symbol, handler: (...args: any[]) => void) => {
        signals.set(String(event), handler as () => void);
        return process;
      });
    exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exits instead of idling when jobs run inline in the API', async () => {
    // QUEUE_DRIVER=memory means the API executes jobs itself. A worker that
    // stayed up would look healthy while consuming nothing at all.
    config.get.mockReturnValue('memory');

    await bootWorker();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('memory'));
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(queue.consume).not.toHaveBeenCalled();
  });

  it('consumes through the router, so every job gets its tenant scope back', async () => {
    await bootWorker();

    expect(queue.consume).toHaveBeenCalledTimes(1);
    const envelope = { name: 'mail.send', payload: {}, tenantId: 't1' };
    await queue.consume.mock.calls[0][0](envelope);
    expect(router.run).toHaveBeenCalledWith(envelope);
  });

  it('registers the token purge as one shared repeatable job, outside any tenant', async () => {
    await bootWorker();

    // The fixed jobId is what stops N workers installing N schedules, and
    // systemWide is what lets the purge see every company's expired rows.
    expect(queue.enqueue).toHaveBeenCalledWith(
      'tokens.purge-expired',
      {},
      { repeatCron: '17 * * * *', jobId: 'tokens-purge-expired', systemWide: true },
    );
  });

  it.each(['SIGTERM', 'SIGINT'])('drains in-flight work on %s before exiting', async (signal) => {
    await bootWorker();

    signals.get(signal)?.();
    await new Promise((resolve) => setImmediate(resolve));

    // Closing the queue first is the point: a deploy must not kill a job that
    // is halfway through sending an e-mail.
    expect(queue.close).toHaveBeenCalledTimes(1);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
