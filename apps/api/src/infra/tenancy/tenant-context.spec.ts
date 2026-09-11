import { setTimeout as delay } from 'node:timers/promises';
import type { Prisma } from '@prisma/client';
import { TenantContext } from './tenant-context';

const tx = { name: 'tx' } as unknown as Prisma.TransactionClient;
const other = { name: 'other' } as unknown as Prisma.TransactionClient;

describe('TenantContext', () => {
  describe('get', () => {
    it('has no scope outside of a run', () => {
      expect(TenantContext.get()).toBeUndefined();
    });

    it('exposes the scope of the enclosing run', () => {
      TenantContext.run({ scope: { kind: 'tenant', tenantId: 't-1' } }, () => {
        expect(TenantContext.get()?.scope).toEqual({ kind: 'tenant', tenantId: 't-1' });
      });
    });

    it('drops the scope once the run returns', () => {
      TenantContext.run({ scope: { kind: 'platform' } }, () => undefined);
      expect(TenantContext.get()).toBeUndefined();
    });

    it('lets an inner run shadow the outer one, and restores it on exit', () => {
      TenantContext.run({ scope: { kind: 'tenant', tenantId: 'outer' } }, () => {
        TenantContext.run({ scope: { kind: 'tenant', tenantId: 'inner' } }, () => {
          expect(TenantContext.requireTenantId()).toBe('inner');
        });
        expect(TenantContext.requireTenantId()).toBe('outer');
      });
    });

    it('returns the value produced by the callback', () => {
      expect(TenantContext.run({ scope: { kind: 'system' } }, () => 'value')).toBe('value');
    });
  });

  describe('requireTenantId', () => {
    it('throws outside of any request scope instead of returning a default', () => {
      // A silent omission here would mean a query with no tenant — that is, a
      // data leak. Failing is the correct behaviour.
      expect(() => TenantContext.requireTenantId()).toThrow(/No tenant in context/);
    });

    it('returns the tenant of the current scope', () => {
      TenantContext.run({ scope: { kind: 'tenant', tenantId: 'tenant-9' } }, () => {
        expect(TenantContext.requireTenantId()).toBe('tenant-9');
      });
    });

    it('throws under the platform scope — a SUPERADMIN has no tenant of its own', () => {
      TenantContext.run({ scope: { kind: 'platform' } }, () => {
        expect(() => TenantContext.requireTenantId()).toThrow(/No tenant in context/);
      });
    });

    it('throws under the system scope', () => {
      TenantContext.run({ scope: { kind: 'system' } }, () => {
        expect(() => TenantContext.requireTenantId()).toThrow(/No tenant in context/);
      });
    });
  });

  describe('async propagation', () => {
    it('survives awaits, timers and microtasks inside the same run', async () => {
      await TenantContext.run({ scope: { kind: 'tenant', tenantId: 't-async' } }, async () => {
        await Promise.resolve();
        expect(TenantContext.requireTenantId()).toBe('t-async');
        await delay(1);
        expect(TenantContext.requireTenantId()).toBe('t-async');
        await Promise.all([
          (async () => {
            await delay(1);
            expect(TenantContext.requireTenantId()).toBe('t-async');
          })(),
        ]);
      });
      expect(TenantContext.get()).toBeUndefined();
    });

    it('keeps two concurrent requests on their own tenant', async () => {
      // The case that matters most: two requests interleaved in the same
      // process must never see each other's tenant.
      const seen: string[] = [];
      const request = (tenantId: string, wait: number): Promise<void> =>
        TenantContext.run({ scope: { kind: 'tenant', tenantId } }, async () => {
          await delay(wait);
          seen.push(TenantContext.requireTenantId());
        });

      await Promise.all([request('a', 5), request('b', 1), request('c', 3)]);

      expect(seen).toEqual(['b', 'c', 'a']);
    });

    it('does not leak the scope into work started outside the run', async () => {
      let escaped: string | undefined = 'unset';
      const outside = new Promise<void>((resolve) => {
        setImmediate(() => {
          escaped = TenantContext.get()?.scope.kind;
          resolve();
        });
      });
      TenantContext.run({ scope: { kind: 'tenant', tenantId: 't-1' } }, () => undefined);
      await outside;
      expect(escaped).toBeUndefined();
    });
  });

  describe('setTransaction', () => {
    it('attaches and detaches the transaction of the current scope', () => {
      TenantContext.run({ scope: { kind: 'tenant', tenantId: 't-1' } }, () => {
        expect(TenantContext.get()?.tx).toBeUndefined();
        TenantContext.setTransaction(tx);
        expect(TenantContext.get()?.tx).toBe(tx);
        TenantContext.setTransaction(undefined);
        expect(TenantContext.get()?.tx).toBeUndefined();
      });
    });

    it('touches only the innermost scope', () => {
      TenantContext.run({ scope: { kind: 'tenant', tenantId: 'outer' }, tx }, () => {
        TenantContext.run({ scope: { kind: 'tenant', tenantId: 'inner' } }, () => {
          TenantContext.setTransaction(other);
          expect(TenantContext.get()?.tx).toBe(other);
        });
        expect(TenantContext.get()?.tx).toBe(tx);
      });
    });

    it('is a no-op outside of a run instead of throwing', () => {
      // Called by PrismaService in the `finally`; throwing out of scope would
      // mask the original error of the operation.
      expect(() => TenantContext.setTransaction(tx)).not.toThrow();
      expect(TenantContext.get()).toBeUndefined();
    });
  });
});
