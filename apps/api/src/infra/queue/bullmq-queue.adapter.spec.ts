/* eslint-disable @typescript-eslint/no-explicit-any */
import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { JobEnvelope } from '../../core/queue/jobs';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { BullmqQueueAdapter, type BullmqQueueOptions } from './bullmq-queue.adapter';

// Unit test: BullMQ and ioredis are replaced wholesale, so what is under test is
// the wiring — the options handed to them — and not Redis itself. The instance
// registries have to be named `mock*` to survive jest.mock hoisting.
const mockQueues: any[] = [];
const mockWorkers: any[] = [];
const mockConnections: any[] = [];

jest.mock('bullmq', () => ({
  Queue: jest.fn((name: string, opts: unknown) => {
    const instance = {
      name,
      opts,
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockQueues.push(instance);
    return instance;
  }),
  Worker: jest.fn((name: string, processor: (job: unknown) => Promise<void>, opts: unknown) => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const instance = {
      name,
      processor,
      opts,
      listeners,
      on: jest.fn((event: string, fn: (...args: any[]) => void) => listeners.set(event, fn)),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockWorkers.push(instance);
    return instance;
  }),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn((url: string, opts: unknown) => {
    const instance: any = {
      url,
      opts,
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
    };
    instance.duplicate = jest.fn(() => ({ duplicateOf: instance }));
    mockConnections.push(instance);
    return instance;
  }),
}));

const MockQueue = Queue as unknown as jest.Mock;
const MockWorker = Worker as unknown as jest.Mock;
const MockRedis = IORedis as unknown as jest.Mock;

const OPTIONS: BullmqQueueOptions = {
  redisUrl: 'redis://localhost:4203',
  prefix: '{dontpanic}',
  queueName: 'dontpanic',
  concurrency: 5,
  defaultAttempts: 5,
  backoffMs: 2000,
};

const MESSAGE = { to: 'arthur@dent.dev', subject: 'Hi', html: '<p>Hi</p>' };

const theQueue = (): any => mockQueues[mockQueues.length - 1];
const theWorker = (): any => mockWorkers[mockWorkers.length - 1];
const theConnection = (): any => mockConnections[mockConnections.length - 1];

/** The BullMQ job options of the most recent `queue.add` call. */
const addedOptions = (): any => theQueue().add.mock.calls.at(-1)[2];
/** The envelope of the most recent `queue.add` call. */
const addedEnvelope = (): any => theQueue().add.mock.calls.at(-1)[1];

describe('BullmqQueueAdapter', () => {
  let adapter: BullmqQueueAdapter;

  beforeEach(() => {
    mockQueues.length = 0;
    mockWorkers.length = 0;
    mockConnections.length = 0;
    adapter = new BullmqQueueAdapter(OPTIONS);
  });

  // --- connection and queue construction ---------------------------------

  describe('construction', () => {
    it('disables ioredis request retries, which BullMQ’s blocking reads require', () => {
      // Without `maxRetriesPerRequest: null` ioredis aborts the blocking read
      // BullMQ uses and the worker quietly stops consuming — jobs then pile up
      // in Redis with nothing obviously wrong in any log.
      expect(MockRedis).toHaveBeenCalledTimes(1);
      expect(MockRedis).toHaveBeenCalledWith('redis://localhost:4203', {
        maxRetriesPerRequest: null,
      });
    });

    it('passes the queue name, prefix and connection through', () => {
      expect(MockQueue).toHaveBeenCalledTimes(1);
      const [name, opts] = MockQueue.mock.calls[0];
      // The prefix namespaces every key so two apps can share one Redis; get it
      // wrong and this app consumes the other's jobs.
      expect(name).toBe('dontpanic');
      expect(opts.prefix).toBe('{dontpanic}');
      expect(opts.connection).toBe(theConnection());
    });

    it('sets the retry policy as the default for every job', () => {
      expect(MockQueue.mock.calls[0][1].defaultJobOptions).toEqual({
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 1000 },
      });
    });
  });

  // --- enqueue ------------------------------------------------------------

  describe('enqueue', () => {
    it('adds the job under its own name with the full envelope as data', async () => {
      await adapter.enqueue('mail.send', { message: MESSAGE });

      expect(theQueue().add).toHaveBeenCalledTimes(1);
      expect(theQueue().add.mock.calls[0][0]).toBe('mail.send');
      expect(addedEnvelope()).toEqual({
        name: 'mail.send',
        payload: { message: MESSAGE },
        tenantId: null,
      });
    });

    it('passes no per-job options when none were given', async () => {
      await adapter.enqueue('mail.send', { message: MESSAGE });

      // Not `{ attempts: undefined, … }`: an explicit undefined would override
      // the queue's defaultJobOptions and silently disable retries.
      expect(addedOptions()).toEqual({});
    });

    it('maps attempts, delay and the dedup id onto BullMQ’s names', async () => {
      await adapter.enqueue(
        'mail.send',
        { message: MESSAGE },
        { attempts: 2, delayMs: 1500, jobId: 'verify:u1' },
      );

      expect(addedOptions()).toEqual({ attempts: 2, delay: 1500, jobId: 'verify:u1' });
    });

    it('turns repeatCron into repeat.pattern', async () => {
      // BullMQ renamed `repeat.cron` to `repeat.pattern`; the old key is taken
      // without complaint and the job then simply never repeats.
      await adapter.enqueue('tokens.purge-expired', {}, { repeatCron: '17 * * * *' });

      expect(addedOptions()).toEqual({ repeat: { pattern: '17 * * * *' } });
    });

    it('carries every option at once without dropping any', async () => {
      await adapter.enqueue(
        'tokens.purge-expired',
        {},
        {
          attempts: 3,
          delayMs: 10,
          jobId: 'tokens-purge-expired',
          repeatCron: '17 * * * *',
          systemWide: true,
        },
      );

      expect(addedOptions()).toEqual({
        attempts: 3,
        delay: 10,
        jobId: 'tokens-purge-expired',
        repeat: { pattern: '17 * * * *' },
      });
    });
  });

  // --- tenant capture -----------------------------------------------------

  describe('tenant capture', () => {
    const enqueueUnder = async (scope: TenantScope, systemWide?: boolean): Promise<any> => {
      await TenantContext.run({ scope }, () =>
        adapter.enqueue('mail.send', { message: MESSAGE }, { systemWide }),
      );
      return addedEnvelope();
    };

    it('stamps the enqueuing request’s tenant on the envelope', async () => {
      // Captured here because the worker cannot know it: it runs with no request
      // around it, and a job reading under no scope sees an empty database.
      const envelope = await enqueueUnder({ kind: 'tenant', tenantId: 'tenant-42' });

      expect(envelope.tenantId).toBe('tenant-42');
    });

    it.each<[string, TenantScope]>([
      ['platform', { kind: 'platform' }],
      ['system', { kind: 'system' }],
    ])('stamps null when enqueuing from a %s scope', async (_label, scope) => {
      // Only a `tenant` scope contributes an id: a cross-company request has no
      // single tenant the job could legitimately inherit.
      expect((await enqueueUnder(scope)).tenantId).toBeNull();
    });

    it('stamps null outside any request', async () => {
      await adapter.enqueue('mail.send', { message: MESSAGE });

      expect(addedEnvelope().tenantId).toBeNull();
    });

    it('forces null when systemWide is set, even inside a tenant request', async () => {
      const envelope = await enqueueUnder({ kind: 'tenant', tenantId: 'tenant-42' }, true);

      expect(envelope.tenantId).toBeNull();
    });
  });

  // --- consume ------------------------------------------------------------

  describe('consume', () => {
    it('starts a worker on the same queue and prefix, with the configured concurrency', async () => {
      await adapter.consume(jest.fn());

      const [name, , opts] = MockWorker.mock.calls[0];
      expect(name).toBe('dontpanic');
      expect(opts.prefix).toBe('{dontpanic}');
      expect(opts.concurrency).toBe(5);
    });

    it('gives the worker its own connection rather than sharing the producer’s', async () => {
      // The worker blocks on its connection; sharing the Queue's would park
      // every `add` behind a blocking read.
      await adapter.consume(jest.fn());

      expect(theConnection().duplicate).toHaveBeenCalledTimes(1);
      expect(MockWorker.mock.calls[0][2].connection.duplicateOf).toBe(theConnection());
    });

    it('feeds the job data to the handler as the envelope', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      const envelope: JobEnvelope = {
        name: 'mail.send',
        payload: { message: MESSAGE },
        tenantId: 'tenant-42',
      };
      await adapter.consume(handler);

      await theWorker().processor({ data: envelope });

      expect(handler).toHaveBeenCalledWith(envelope);
    });

    it('logs a failed job with its name and attempt count', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await adapter.consume(jest.fn());

      theWorker().listeners.get('failed')(
        { name: 'mail.send', attemptsMade: 2 },
        new Error('smtp down'),
      );

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Job mail.send failed (attempt 2): smtp down'),
      );
      error.mockRestore();
    });

    it('still logs when BullMQ reports a failure with no job attached', async () => {
      // Happens when the payload could not even be deserialised; the log must
      // not become the second failure.
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await adapter.consume(jest.fn());

      theWorker().listeners.get('failed')(undefined, new Error('boom'));

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Job unknown failed (attempt 0): boom'),
      );
      error.mockRestore();
    });
  });

  // --- liveness and shutdown ---------------------------------------------

  describe('ping', () => {
    it('pings the Redis connection', async () => {
      await adapter.ping();

      expect(theConnection().ping).toHaveBeenCalledTimes(1);
    });

    it('propagates a failure so the health check can report down', async () => {
      theConnection().ping.mockRejectedValue(new Error('no redis'));

      await expect(adapter.ping()).rejects.toThrow('no redis');
    });
  });

  describe('close', () => {
    it('drains the worker before shutting the queue and connection down', async () => {
      await adapter.consume(jest.fn());

      await adapter.close();

      expect(theWorker().close).toHaveBeenCalledTimes(1);
      expect(theQueue().close).toHaveBeenCalledTimes(1);
      expect(theConnection().quit).toHaveBeenCalledTimes(1);
    });

    it('closes cleanly in the API process, which never started a worker', async () => {
      await expect(adapter.close()).resolves.toBeUndefined();

      expect(mockWorkers).toHaveLength(0);
      expect(theQueue().close).toHaveBeenCalledTimes(1);
    });
  });
});
