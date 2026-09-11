import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';
import {
  PlanLimitsService,
  planAllowsConcurrentSessions,
  planResourceLimit,
} from './plan-limits.service';

const TENANT_ID = 'tenant-1';

function plan(over: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    code: 'starter',
    name: 'Starter',
    maxUsers: 1,
    limits: { projects: 2 },
    features: { concurrentSessions: false },
    ...over,
  };
}

describe('planAllowsConcurrentSessions', () => {
  it('is true only when the flag is explicitly the boolean true', () => {
    expect(planAllowsConcurrentSessions({ concurrentSessions: true })).toBe(true);
  });

  // Every mistake has to fall on the restrictive side: a plan nobody configured
  // must not hand out shared sessions by accident.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['missing', {}],
    ['false', { concurrentSessions: false }],
    ['a truthy string', { concurrentSessions: 'true' }],
    ['a truthy number', { concurrentSessions: 1 }],
    ['an array', [{ concurrentSessions: true }]],
    ['a number instead of an object', 42],
    ['a string instead of an object', 'concurrentSessions'],
  ])('is false when the flag is %s', (_label, features) => {
    expect(planAllowsConcurrentSessions(features as never)).toBe(false);
  });
});

describe('planResourceLimit', () => {
  it('reads a finite number out of the free-form limits column', () => {
    expect(planResourceLimit({ projects: 10 }, 'projects')).toBe(10);
  });

  it('keeps a zero limit, which means nothing is allowed', () => {
    expect(planResourceLimit({ projects: 0 }, 'projects')).toBe(0);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', [10]],
    ['a number', 10],
    ['a string', 'projects=10'],
  ])('is unlimited (null) when the column is %s', (_label, limits) => {
    expect(planResourceLimit(limits as never, 'projects')).toBeNull();
  });

  it.each([
    ['absent', {}],
    ['another resource', { reports: 3 }],
    ['a numeric string', { projects: '10' }],
    ['not a number', { projects: true }],
    ['NaN', { projects: Number.NaN }],
    ['Infinity', { projects: Number.POSITIVE_INFINITY }],
  ])('is unlimited (null) when the entry is %s', (_label, limits) => {
    expect(planResourceLimit(limits as never, 'projects')).toBeNull();
  });
});

describe('PlanLimitsService', () => {
  let order: string[];
  let db: {
    tenant: { findUnique: jest.Mock };
    user: { count: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let service: PlanLimitsService;

  beforeEach(() => {
    order = [];
    db = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ plan: plan() }) },
      user: {
        count: jest.fn(() => {
          order.push('count:users');
          return Promise.resolve(0);
        }),
      },
      $executeRaw: jest.fn(() => {
        order.push('lock');
        return Promise.resolve(1);
      }),
    };
    service = new PlanLimitsService({ db } as unknown as PrismaService);
  });

  /** Runs with the tenant declared, exactly as a request would. */
  const inTenant = <T>(fn: () => Promise<T>, tenantId = TENANT_ID): Promise<T> =>
    TenantContext.run({ scope: { kind: 'tenant', tenantId } }, fn);

  /** Keeps the call-order trace while changing how many users exist. */
  const usersCount = (used: number) =>
    db.user.count.mockImplementation(() => {
      order.push('count:users');
      return Promise.resolve(used);
    });

  /** A registered counter for a product resource. */
  function registerProjects(used = 0): jest.Mock {
    const count = jest.fn(() => {
      order.push('count:projects');
      return Promise.resolve(used);
    });
    service.registerResource('projects', count as never);
    return count;
  }

  const lockKey = (call = 0) => db.$executeRaw.mock.calls[call][1];
  const lockSql = (call = 0) => (db.$executeRaw.mock.calls[call][0] as string[]).join('?');

  // ── Usage ──────────────────────────────────────────────────────────────────

  describe('usage', () => {
    it('reports users and every registered resource against their limits', async () => {
      db.user.count.mockResolvedValue(1);
      registerProjects(2);

      const usage = await inTenant(() => service.usage());

      expect(usage).toEqual({
        planCode: 'starter',
        planName: 'Starter',
        users: { used: 1, limit: 1 },
        resources: { projects: { used: 2, limit: 2 } },
        concurrentSessions: false,
      });
      expect(db.user.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, deletedAt: null, active: true },
      });
    });

    it('reports a registered resource the plan says nothing about as unlimited', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ limits: {} }) });
      registerProjects(99);

      const usage = await inTenant(() => service.usage());

      expect(usage.resources.projects).toEqual({ used: 99, limit: null });
    });

    it('reports no resources when the product registered none', async () => {
      const usage = await inTenant(() => service.usage());
      expect(usage.resources).toEqual({});
    });

    it('passes the request-scoped client and the context tenant to each counter', async () => {
      const count = registerProjects();
      await inTenant(() => service.usage());
      expect(count).toHaveBeenCalledWith(db, TENANT_ID);
    });

    it('reports unlimited seats and shared sessions for a plan that grants them', async () => {
      db.tenant.findUnique.mockResolvedValue({
        plan: plan({ maxUsers: null, features: { concurrentSessions: true } }),
      });

      const usage = await inTenant(() => service.usage());

      expect(usage.users.limit).toBeNull();
      expect(usage.concurrentSessions).toBe(true);
    });

    it('describes a company left without a plan, and still denies shared sessions', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: null });

      const usage = await inTenant(() => service.usage());

      expect(usage).toMatchObject({
        planCode: 'no-plan',
        planName: 'No plan',
        users: { used: 0, limit: null },
        concurrentSessions: false,
      });
    });

    it('survives a tenant row the transaction cannot see', async () => {
      db.tenant.findUnique.mockResolvedValue(null);
      const usage = await inTenant(() => service.usage());
      expect(usage.planName).toBe('No plan');
    });

    it('always counts by the tenant in context, never by an id from outside', async () => {
      await inTenant(() => service.usage(), 'another-company');
      expect(db.tenant.findUnique.mock.calls[0][0].where.id).toBe('another-company');
      expect(db.user.count.mock.calls[0][0].where.tenantId).toBe('another-company');
    });

    it('refuses to run outside a company scope', async () => {
      await expect(service.usage()).rejects.toThrow(/No tenant in context/);
    });
  });

  // ── Users ──────────────────────────────────────────────────────────────────

  describe('assertCanAddUser', () => {
    it('allows one more while there is a seat', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ maxUsers: 3 }) });
      db.user.count.mockResolvedValue(2);
      await expect(inTenant(() => service.assertCanAddUser())).resolves.toBeUndefined();
    });

    it('refuses at the limit, naming the plan, the seats and the usage', async () => {
      db.user.count.mockResolvedValue(1);
      const promise = inTenant(() => service.assertCanAddUser());
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(/Starter plan includes 1 user and .* already has 1/);
      await expect(promise).rejects.toThrow(/larger plan/);
    });

    it('refuses past the limit too, not only exactly at it', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ maxUsers: 2 }) });
      db.user.count.mockResolvedValue(5);
      await expect(inTenant(() => service.assertCanAddUser())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('pluralises the seats when the plan has more than one', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ name: 'Team', maxUsers: 4 }) });
      db.user.count.mockResolvedValue(4);
      await expect(inTenant(() => service.assertCanAddUser())).rejects.toThrow(
        /Team plan includes 4 users/,
      );
    });

    it('takes the advisory lock BEFORE counting — that ordering is the whole defence against two requests taking the last seat', async () => {
      usersCount(0);
      await inTenant(() => service.assertCanAddUser());
      expect(order).toEqual(['lock', 'count:users']);
      expect(lockSql()).toContain('pg_advisory_xact_lock');
      expect(lockKey()).toBe(`plan-limit:users:${TENANT_ID}`);
    });

    it('keeps the lock per company, so two companies never wait on each other', async () => {
      await inTenant(() => service.assertCanAddUser(), 'other-company');
      expect(lockKey()).toBe('plan-limit:users:other-company');
    });

    it('locks and counts even on the path that ends up refusing', async () => {
      usersCount(1);
      await expect(inTenant(() => service.assertCanAddUser())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(order).toEqual(['lock', 'count:users']);
    });

    it('neither locks nor counts when the plan has no seat limit', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ maxUsers: null }) });
      await inTenant(() => service.assertCanAddUser());
      expect(db.$executeRaw).not.toHaveBeenCalled();
      expect(db.user.count).not.toHaveBeenCalled();
    });

    it('does not block a company left without a plan', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: null });
      await expect(inTenant(() => service.assertCanAddUser())).resolves.toBeUndefined();
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('checks inside the caller transaction, so the seat is held until the insert lands', async () => {
      const tx = {
        tenant: db.tenant,
        user: { count: jest.fn().mockResolvedValue(0) },
        $executeRaw: jest.fn().mockResolvedValue(1),
      } as unknown as Prisma.TransactionClient;

      await inTenant(() => service.assertCanAddUser(tx));

      expect((tx as unknown as { $executeRaw: jest.Mock }).$executeRaw).toHaveBeenCalled();
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('refuses to run outside a company scope', async () => {
      await expect(service.assertCanAddUser()).rejects.toThrow(/No tenant in context/);
    });
  });

  // ── Product resources ──────────────────────────────────────────────────────

  describe('assertCanAddResource', () => {
    it('allows one more while the plan has room', async () => {
      registerProjects(1);
      await expect(
        inTenant(() => service.assertCanAddResource('projects')),
      ).resolves.toBeUndefined();
    });

    it('refuses at the limit, naming the plan, the limit and the usage', async () => {
      registerProjects(2);
      const promise = inTenant(() => service.assertCanAddResource('projects'));
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(/Starter plan allows 2 projects and .* already has 2/);
      await expect(promise).rejects.toThrow(/Remove one/);
    });

    it('takes the resource lock before counting, as for seats', async () => {
      registerProjects(0);
      await inTenant(() => service.assertCanAddResource('projects'));
      expect(order).toEqual(['lock', 'count:projects']);
      expect(lockSql()).toContain('pg_advisory_xact_lock');
      expect(lockKey()).toBe(`plan-limit:projects:${TENANT_ID}`);
    });

    it('refuses loudly for a resource no module registered', async () => {
      // Passing quietly would mean a typo at the call site silently removes the
      // limit — the one failure mode a limit must not have.
      await expect(inTenant(() => service.assertCanAddResource('ghosts'))).rejects.toThrow(
        /No counter registered for plan resource "ghosts"/,
      );
      expect(db.tenant.findUnique).not.toHaveBeenCalled();
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('does not limit a resource the plan says nothing about', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ limits: { reports: 1 } }) });
      const count = registerProjects(500);
      await expect(
        inTenant(() => service.assertCanAddResource('projects')),
      ).resolves.toBeUndefined();
      expect(db.$executeRaw).not.toHaveBeenCalled();
      expect(count).not.toHaveBeenCalled();
    });

    it('does not block a company left without a plan', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: null });
      registerProjects(500);
      await expect(
        inTenant(() => service.assertCanAddResource('projects')),
      ).resolves.toBeUndefined();
      expect(db.$executeRaw).not.toHaveBeenCalled();
    });

    it('refuses everything when the plan allows zero of the resource', async () => {
      db.tenant.findUnique.mockResolvedValue({ plan: plan({ limits: { projects: 0 } }) });
      registerProjects(0);
      await expect(inTenant(() => service.assertCanAddResource('projects'))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('gives each resource its own lock label, so they do not contend', async () => {
      registerProjects(0);
      service.registerResource('reports', (() => Promise.resolve(0)) as never);
      db.tenant.findUnique.mockResolvedValue({
        plan: plan({ limits: { projects: 2, reports: 2 } }),
      });

      await inTenant(() => service.assertCanAddResource('projects'));
      await inTenant(() => service.assertCanAddResource('reports'));

      expect(lockKey(0)).toBe(`plan-limit:projects:${TENANT_ID}`);
      expect(lockKey(1)).toBe(`plan-limit:reports:${TENANT_ID}`);
    });

    it('replaces a counter registered twice under the same name', async () => {
      registerProjects(0);
      const replacement = jest.fn().mockResolvedValue(2);
      service.registerResource('projects', replacement as never);
      await expect(inTenant(() => service.assertCanAddResource('projects'))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(replacement).toHaveBeenCalledWith(db, TENANT_ID);
    });

    it('checks inside the caller transaction', async () => {
      const count = jest.fn().mockResolvedValue(0);
      service.registerResource('projects', count as never);
      const tx = {
        tenant: db.tenant,
        $executeRaw: jest.fn().mockResolvedValue(1),
      } as unknown as Prisma.TransactionClient;

      await inTenant(() => service.assertCanAddResource('projects', tx));

      expect((tx as unknown as { $executeRaw: jest.Mock }).$executeRaw).toHaveBeenCalled();
      expect(db.$executeRaw).not.toHaveBeenCalled();
      expect(count).toHaveBeenCalledWith(tx, TENANT_ID);
    });

    it('refuses to run outside a company scope', async () => {
      registerProjects(0);
      await expect(service.assertCanAddResource('projects')).rejects.toThrow(
        /No tenant in context/,
      );
    });
  });
});
