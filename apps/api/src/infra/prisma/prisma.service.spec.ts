import type { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Env } from '../../config/env';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';
import { PrismaService } from './prisma.service';

interface Internals {
  $transaction: jest.Mock;
  $connect: jest.Mock;
  $disconnect: jest.Mock;
  $queryRaw: jest.Mock;
  logger: { error: jest.Mock };
  config: { get: jest.Mock };
}

interface TxDouble {
  $executeRaw: jest.Mock;
  calls: { strings: readonly string[]; values: unknown[] }[];
}

function makeTx(): Prisma.TransactionClient & TxDouble {
  const calls: TxDouble['calls'] = [];
  const tx = {
    calls,
    $executeRaw: jest.fn((strings: readonly string[], ...values: unknown[]) => {
      calls.push({ strings, values });
      return Promise.resolve(1);
    }),
  };
  return tx as unknown as Prisma.TransactionClient & TxDouble;
}

/**
 * Instantiates the service without building the real PrismaClient (which would
 * open a connection pool). Only the scope methods matter here, and they never
 * touch the network.
 */
function makeService(nodeEnv: Env['NODE_ENV'] = 'test'): {
  service: PrismaService;
  internals: Internals;
  tx: Prisma.TransactionClient & TxDouble;
} {
  const service = Object.create(PrismaService.prototype) as PrismaService;
  const tx = makeTx();
  const internals: Internals = {
    $transaction: jest.fn(
      async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => await fn(tx),
    ),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    logger: { error: jest.fn() },
    config: { get: jest.fn().mockReturnValue(nodeEnv) },
  };
  Object.assign(service, internals);
  return { service, internals, tx };
}

const setConfigOf = (tx: TxDouble): string =>
  tx.calls.map((call) => call.strings.join('?')).join(' | ');

describe('PrismaService', () => {
  describe('withScope', () => {
    it('declares the tenant to Postgres before running the work', async () => {
      const { service, tx } = makeService();
      const order: string[] = [];
      tx.$executeRaw.mockImplementation((strings: readonly string[], ...values: unknown[]) => {
        order.push('set_config');
        tx.calls.push({ strings, values });
        return Promise.resolve(1);
      });

      await service.withScope({ kind: 'tenant', tenantId: 't-1' }, async () => {
        order.push('work');
        return 'done';
      });

      // Running the query before the SET LOCAL would leave RLS with no scope.
      expect(order).toEqual(['set_config', 'work']);
      expect(setConfigOf(tx)).toContain('app.current_tenant_id');
      expect(tx.calls[0].values).toEqual(['t-1']);
      // `true` in set_config = transaction-local: it does not survive into the
      // next request that reuses the same pooled connection.
      expect(tx.calls[0].strings.join('')).toContain('true');
    });

    it('binds the tenant as a parameter instead of interpolating it', async () => {
      // $executeRaw as a tagged template parameterises the value; building the
      // SQL by concatenation would open the door to injection through the JWT.
      const { service, tx } = makeService();
      await service.forTenant("t-1'; DROP TABLE users; --", async () => undefined);

      expect(tx.calls[0].values).toEqual(["t-1'; DROP TABLE users; --"]);
      expect(tx.calls[0].strings.join('')).not.toContain('DROP TABLE');
    });

    it('declares the platform scope for a SUPERADMIN', async () => {
      const { service, tx } = makeService();
      await service.asPlatform(async () => undefined);
      expect(setConfigOf(tx)).toContain('app.platform_admin');
      expect(setConfigOf(tx)).not.toContain('app.current_tenant_id');
      expect(tx.calls[0].values).toEqual([]);
      expect(tx.calls[0].strings.join('')).toContain('true');
    });

    it('declares the system scope', async () => {
      const { service, tx } = makeService();
      await service.asSystem(async () => undefined);
      expect(setConfigOf(tx)).toContain('app.system');
      expect(setConfigOf(tx)).not.toContain('app.platform_admin');
      expect(tx.calls[0].strings.join('')).toContain('true');
    });

    it('declares the scope exactly once per transaction', async () => {
      const { service, tx } = makeService();
      await service.forTenant('t-1', async () => undefined);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('exposes the transaction as `db` while the scope is open, and only then', async () => {
      const { service, tx } = makeService();

      expect(service.db).toBe(service);

      await service.forTenant('t-1', async (handle) => {
        expect(handle).toBe(tx);
        expect(service.db).toBe(tx);
        expect(TenantContext.requireTenantId()).toBe('t-1');
      });

      expect(service.db).toBe(service);
      expect(TenantContext.get()).toBeUndefined();
    });

    it('detaches the transaction even when the work throws', async () => {
      const { service } = makeService();

      await expect(
        service.forTenant('t-1', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      // Without the `finally`, a later `db` would hand back a dead transaction.
      expect(service.db).toBe(service);
    });

    it('returns the value produced by the work', async () => {
      const { service } = makeService();
      await expect(service.forTenant('t-1', async () => 42)).resolves.toBe(42);
    });

    it('opens a scope even outside a request, so a public route still gets `db`', async () => {
      const { service, tx } = makeService();
      const scope: TenantScope = { kind: 'system' };
      await service.withScope(scope, async () => {
        expect(service.db).toBe(tx);
        expect(TenantContext.get()?.scope).toEqual(scope);
      });
    });
  });

  describe('atomic', () => {
    it('reuses the in-flight request transaction instead of nesting a new one', async () => {
      const { service, internals, tx } = makeService();

      await service.forTenant('t-1', async () => {
        await service.atomic(async (handle) => {
          expect(handle).toBe(tx);
          return undefined;
        });
      });

      // Nesting $transaction inside the request's transaction is invalid in Prisma.
      expect(internals.$transaction).toHaveBeenCalledTimes(1);
    });

    it('opens its own transaction when there is no request scope', async () => {
      const { service, internals, tx } = makeService();

      await expect(
        service.atomic(async (handle) => (handle === tx ? 'same' : 'other')),
      ).resolves.toBe('same');
      expect(internals.$transaction).toHaveBeenCalledTimes(1);
    });

    it('opens its own transaction under a scope that has not attached one yet', async () => {
      const { service, internals } = makeService();

      await TenantContext.run({ scope: { kind: 'tenant', tenantId: 't-1' } }, async () => {
        await service.atomic(async () => undefined);
      });

      expect(internals.$transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates the failure so the caller can roll back', async () => {
      const { service } = makeService();
      await expect(
        service.atomic(async () => {
          throw new Error('write failed');
        }),
      ).rejects.toThrow('write failed');
    });
  });

  describe('lifecycle', () => {
    it('connects and checks the role on boot, and disconnects on shutdown', async () => {
      const { service, internals } = makeService();
      internals.$queryRaw.mockResolvedValue([
        { rolname: 'dontpanic_app', rolsuper: false, rolbypassrls: false },
      ]);

      await service.onModuleInit();
      expect(internals.$connect).toHaveBeenCalled();
      expect(internals.logger.error).not.toHaveBeenCalled();

      await service.onModuleDestroy();
      expect(internals.$disconnect).toHaveBeenCalled();
    });

    it('tolerates a role that the catalogue does not return', async () => {
      const { service, internals } = makeService();
      internals.$queryRaw.mockResolvedValue([]);
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(internals.logger.error).not.toHaveBeenCalled();
    });

    it('refuses to boot in production as a role that bypasses RLS', async () => {
      // Connected as a superuser, every isolation policy would be decorative
      // and nothing would visibly fail. We would rather not start at all.
      const { service, internals } = makeService('production');
      internals.$queryRaw.mockResolvedValue([
        { rolname: 'postgres', rolsuper: true, rolbypassrls: false },
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(/Row Level Security/);
      expect(internals.logger.error).not.toHaveBeenCalled();
    });

    it('refuses a role with BYPASSRLS in production, even when not a superuser', async () => {
      const { service, internals } = makeService('production');
      internals.$queryRaw.mockResolvedValue([
        { rolname: 'owner', rolsuper: false, rolbypassrls: true },
      ]);
      await expect(service.onModuleInit()).rejects.toThrow(/rolbypassrls=true/);
    });

    it('only warns outside production, so dev does not get blocked', async () => {
      const { service, internals } = makeService('development');
      internals.$queryRaw.mockResolvedValue([
        { rolname: 'postgres', rolsuper: true, rolbypassrls: true },
      ]);

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(internals.logger.error).toHaveBeenCalledWith(expect.stringContaining('postgres'));
    });
  });

  describe('construction', () => {
    it('builds the Postgres driver adapter from DATABASE_URL', () => {
      const config = {
        get: jest.fn().mockReturnValue('postgresql://app:secret@localhost:5432/dontpanic'),
      } as unknown as ConfigService<Env, true>;

      const service = new PrismaService(config);

      // PrismaClient hands back a proxy, so `instanceof` is no use here.
      expect(typeof service.withScope).toBe('function');
      expect(config.get).toHaveBeenCalledWith('DATABASE_URL', { infer: true });
    });
  });
});
