import { Logger } from '@nestjs/common';
import type { JobEnvelope } from '../../core/queue/jobs';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { MemoryQueueAdapter } from './memory-queue.adapter';

const MESSAGE = { to: 'arthur@dent.dev', subject: 'Hi', html: '<p>Hi</p>' };

/** Enqueues from inside a given scope, the way a request would. */
function underScope<T>(scope: TenantScope, fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ scope }, fn);
}

describe('MemoryQueueAdapter', () => {
  let adapter: MemoryQueueAdapter;
  let handled: JobEnvelope[];
  let handler: jest.Mock;

  beforeEach(() => {
    adapter = new MemoryQueueAdapter();
    handled = [];
    handler = jest.fn(async (envelope: JobEnvelope) => {
      handled.push(envelope);
    });
  });

  // --- tenant capture -----------------------------------------------------
  //
  // Captured at enqueue time, because that is the only moment the tenant is
  // knowable: the handler runs with no request around it.

  describe('tenant capture', () => {
    it('stamps the enqueuing request’s tenant on the envelope', async () => {
      await adapter.consume(handler);

      await underScope({ kind: 'tenant', tenantId: 'tenant-42' }, () =>
        adapter.enqueue('mail.send', { message: MESSAGE }),
      );

      expect(handled[0].tenantId).toBe('tenant-42');
    });

    it('stamps null when there is no scope at all', async () => {
      await adapter.consume(handler);

      await adapter.enqueue('mail.send', { message: MESSAGE });

      expect(handled[0].tenantId).toBeNull();
    });

    it.each<[string, TenantScope]>([
      ['platform', { kind: 'platform' }],
      ['system', { kind: 'system' }],
    ])('stamps null when enqueuing from a %s scope', async (_label, scope) => {
      // Only a `tenant` scope carries an id. A platform or system request spans
      // companies, so there is no single tenant the job could inherit — and
      // inventing one would run the job against the wrong company's rows.
      await adapter.consume(handler);

      await underScope(scope, () => adapter.enqueue('mail.send', { message: MESSAGE }));

      expect(handled[0].tenantId).toBeNull();
    });

    it('forces null when systemWide is set, even inside a tenant request', async () => {
      await adapter.consume(handler);

      await underScope({ kind: 'tenant', tenantId: 'tenant-42' }, () =>
        adapter.enqueue('tokens.purge-expired', {}, { systemWide: true }),
      );

      expect(handled[0].tenantId).toBeNull();
    });

    it('keeps the tenant when systemWide is explicitly false', async () => {
      await adapter.consume(handler);

      await underScope({ kind: 'tenant', tenantId: 'tenant-42' }, () =>
        adapter.enqueue('mail.send', { message: MESSAGE }, { systemWide: false }),
      );

      expect(handled[0].tenantId).toBe('tenant-42');
    });
  });

  // --- inline execution ---------------------------------------------------

  describe('running the handler', () => {
    it('passes the job name and payload through unchanged', async () => {
      await adapter.consume(handler);

      await adapter.enqueue('mail.send', { message: MESSAGE });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handled[0]).toEqual({
        name: 'mail.send',
        payload: { message: MESSAGE },
        tenantId: null,
      });
    });

    it('awaits the handler, so a test that enqueues never races it', async () => {
      // Inline means inline: `await enqueue(...)` has to imply the job is done,
      // otherwise every assertion written after it is a coin flip.
      let done = false;
      await adapter.consume(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        done = true;
      });

      await adapter.enqueue('mail.send', { message: MESSAGE });

      expect(done).toBe(true);
    });

    it('propagates a handler failure to the caller', async () => {
      // No retry here by design; the caller (dispatchMail) decides what to do.
      await adapter.consume(async () => {
        throw new Error('smtp down');
      });

      await expect(adapter.enqueue('mail.send', { message: MESSAGE })).rejects.toThrow('smtp down');
    });
  });

  describe('with no handler registered', () => {
    it('warns and drops the job instead of discarding it silently', async () => {
      // The API process with QUEUE_DRIVER=memory: nothing consumes. Dropping is
      // the honest outcome, but it has to be visible in the logs.
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(adapter.enqueue('mail.send', { message: MESSAGE })).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('mail.send'));
      warn.mockRestore();
    });

    it('drops again after close, which unregisters the handler', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await adapter.consume(handler);
      await adapter.close();

      await adapter.enqueue('mail.send', { message: MESSAGE });

      expect(handler).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('pings without a backend to reach', async () => {
    // The "backend" is this process, so liveness is a tautology — but the health
    // indicator still has to get a resolved promise.
    await expect(adapter.ping()).resolves.toBeUndefined();
  });
});
