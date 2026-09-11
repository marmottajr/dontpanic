import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlatformTenantListQuery } from '@dontpanic/shared';
import { makePrismaMock, type PrismaMock } from '../../../../test/prisma-mock';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';
import type { PlatformActor } from '../support/platform-scope';
import { PlatformTenantsService } from './platform-tenants.service';

const ACTOR: PlatformActor = { id: 'operator-1', ip: '10.0.0.1', userAgent: 'jest' };
const NOW = new Date('2026-09-11T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-1',
    slug: 'megadodo',
    name: 'Megadodo Publications',
    legalName: null,
    taxId: null,
    email: 'ford@megadodo.test',
    phone: null,
    postalCode: null,
    street: null,
    number: null,
    complement: null,
    district: null,
    city: null,
    state: null,
    country: null,
    locale: 'pt-BR',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    planId: null,
    plan: null,
    status: 'ACTIVE',
    trialEndsAt: null,
    suspendedAt: null,
    suspendedReason: null,
    canceledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    _count: { users: 0 },
    ...overrides,
  };
}

const query = (overrides: Partial<PlatformTenantListQuery> = {}): PlatformTenantListQuery => ({
  page: 1,
  limit: 20,
  ...overrides,
});

describe('PlatformTenantsService', () => {
  let prisma: PrismaMock;
  let service: PlatformTenantsService;

  beforeEach(() => {
    prisma = makePrismaMock({
      tenant: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      plan: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    });
    service = new PlatformTenantsService(prisma as unknown as PrismaService);
  });

  describe('scope', () => {
    it('crosses companies only through the platform scope', async () => {
      await service.list(query());
      expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
      expect(prisma.forTenant).not.toHaveBeenCalled();
      expect(prisma.asSystem).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('maps rows, counts users and paginates', async () => {
      prisma.tenant.count.mockResolvedValue(3);
      prisma.tenant.findMany.mockResolvedValue([
        makeTenant({ _count: { users: 4 }, plan: { name: 'Pro' }, planId: 'plan-1' }),
        makeTenant({ id: 'tenant-2', slug: 'sirius', plan: null }),
      ]);

      const result = await service.list(query({ page: 2, limit: 10 }));

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10, orderBy: { createdAt: 'desc' } }),
      );
      expect(result).toMatchObject({ total: 3, page: 2, limit: 10, totalPages: 1 });
      expect(result.items[0]).toMatchObject({
        id: 'tenant-1',
        userCount: 4,
        planId: 'plan-1',
        planName: 'Pro',
        createdAt: NOW.toISOString(),
      });
      // No plan connected: the name is null, not undefined or a crash.
      expect(result.items[1].planName).toBeNull();
    });

    it('serialises the optional dates as ISO strings, and as null when absent', async () => {
      const suspendedAt = new Date('2026-09-01T00:00:00.000Z');
      const canceledAt = new Date('2026-09-02T00:00:00.000Z');
      const trialEndsAt = new Date('2026-09-30T00:00:00.000Z');
      prisma.tenant.count.mockResolvedValue(2);
      prisma.tenant.findMany.mockResolvedValue([
        makeTenant({
          status: 'SUSPENDED',
          suspendedAt,
          suspendedReason: 'unpaid',
          canceledAt,
          trialEndsAt,
        }),
        makeTenant({ id: 'tenant-2' }),
      ]);

      const [suspended, plain] = (await service.list(query())).items;

      expect(suspended).toMatchObject({
        status: 'SUSPENDED',
        suspendedAt: suspendedAt.toISOString(),
        suspendedReason: 'unpaid',
        canceledAt: canceledAt.toISOString(),
        trialEndsAt: trialEndsAt.toISOString(),
      });
      expect(plain).toMatchObject({
        suspendedAt: null,
        suspendedReason: null,
        canceledAt: null,
        trialEndsAt: null,
      });
    });

    it('never lists a soft-deleted company', async () => {
      await service.list(query());

      expect(prisma.tenant.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
      expect(prisma.tenant.count.mock.calls[0][0].where.deletedAt).toBeNull();
    });

    it('filters by status when one is asked for, and leaves the filter out otherwise', async () => {
      await service.list(query({ status: 'SUSPENDED' }));
      expect(prisma.tenant.findMany.mock.calls[0][0].where.status).toBe('SUSPENDED');

      await service.list(query());
      expect(prisma.tenant.findMany.mock.calls[1][0].where).not.toHaveProperty('status');
    });

    it('searches slug, name and e-mail case-insensitively', async () => {
      await service.list(query({ search: 'Mega' }));

      const where = prisma.tenant.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { slug: { contains: 'Mega', mode: 'insensitive' } },
        { name: { contains: 'Mega', mode: 'insensitive' } },
        { email: { contains: 'Mega', mode: 'insensitive' } },
      ]);
      // Same where for the count, or the page numbers would not match the rows.
      expect(prisma.tenant.count.mock.calls[0][0].where).toEqual(where);
    });

    it('adds no OR clause when nothing was searched for', async () => {
      await service.list(query());
      expect(prisma.tenant.findMany.mock.calls[0][0].where).not.toHaveProperty('OR');
    });

    it('never filters by a tenant id — the operator’s list is not scoped to a company', async () => {
      await service.list(query({ search: 'x', status: 'ACTIVE' }));
      expect(prisma.tenant.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
    });

    it('reports one page when there is nothing to show, never zero', async () => {
      prisma.tenant.count.mockResolvedValue(0);

      const result = await service.list(query());

      // A UI that renders "page 1 of 0" is a bug report waiting to happen.
      expect(result.items).toEqual([]);
      expect(result.totalPages).toBe(1);
    });

    it('rounds the page count up on a partial last page', async () => {
      prisma.tenant.count.mockResolvedValue(41);
      expect((await service.list(query({ limit: 20 }))).totalPages).toBe(3);
    });
  });

  describe('get', () => {
    it('returns the company, soft-deleted rows excluded from the lookup', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant({ _count: { users: 2 } }));

      const dto = await service.get('tenant-1');

      expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'tenant-1', deletedAt: null } }),
      );
      expect(dto).toMatchObject({ id: 'tenant-1', userCount: 2 });
    });

    it('404s on an unknown or soft-deleted company', async () => {
      prisma.tenant.findFirst.mockResolvedValue(null);
      await expect(service.get('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('transition', () => {
    it('404s before touching anything when the company is unknown or soft-deleted', async () => {
      prisma.tenant.findFirst.mockResolvedValue(null);

      await expect(service.suspend('ghost', { reason: 'fraud' }, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.tenant.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('records what the row looked like before and after the change', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant({ status: 'TRIAL', planId: 'plan-1' }));
      prisma.tenant.update.mockResolvedValue(
        makeTenant({ status: 'SUSPENDED', planId: 'plan-1', suspendedAt: NOW }),
      );

      await service.suspend('tenant-1', { reason: 'fraud' }, ACTOR);

      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'platform.tenant.suspend',
        tenantId: 'tenant-1',
        userId: 'operator-1',
        entity: 'Tenant',
        entityId: 'tenant-1',
        valuesBefore: { status: 'TRIAL', planId: 'plan-1' },
        valuesAfter: { status: 'SUSPENDED', planId: 'plan-1' },
        ip: '10.0.0.1',
        userAgent: 'jest',
      });
    });

    it('writes the change and its audit row into the same transaction', async () => {
      // A request already in platform scope: runAsPlatform must reuse this tx,
      // so both writes roll back together if either one fails.
      const requestTx = {
        tenant: {
          findFirst: jest.fn().mockResolvedValue(makeTenant()),
          update: jest.fn().mockResolvedValue(makeTenant({ status: 'SUSPENDED' })),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      };

      await TenantContext.run(
        { scope: { kind: 'platform' }, tx: requestTx as unknown as Prisma.TransactionClient },
        () => service.suspend('tenant-1', { reason: 'fraud' }, ACTOR),
      );

      expect(requestTx.tenant.update).toHaveBeenCalledTimes(1);
      expect(requestTx.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.asPlatform).not.toHaveBeenCalled();
      expect(prisma.tenant.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('fails the whole change when the audit row cannot be written', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant());
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'SUSPENDED' }));
      prisma.auditLog.create.mockRejectedValue(new Error('audit write failed'));

      // The update above is inside the same transaction, so it rolls back with
      // the rejection: no untraceable suspension survives.
      await expect(service.suspend('tenant-1', { reason: 'fraud' }, ACTOR)).rejects.toThrow(
        'audit write failed',
      );
    });
  });

  describe('suspend', () => {
    it('marks the company suspended, stamping the moment and the reason', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant());
      prisma.tenant.update.mockResolvedValue(
        makeTenant({ status: 'SUSPENDED', suspendedAt: NOW, suspendedReason: 'unpaid invoice' }),
      );

      const dto = await service.suspend('tenant-1', { reason: 'unpaid invoice' }, ACTOR);

      const call = prisma.tenant.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'tenant-1' });
      expect(call.data).toMatchObject({ status: 'SUSPENDED', suspendedReason: 'unpaid invoice' });
      expect(call.data.suspendedAt).toBeInstanceOf(Date);
      expect(dto.status).toBe('SUSPENDED');
      expect(dto.suspendedReason).toBe('unpaid invoice');
    });
  });

  describe('reactivate', () => {
    it('clears suspension and cancellation together', async () => {
      prisma.tenant.findFirst.mockResolvedValue(
        makeTenant({ status: 'SUSPENDED', suspendedAt: NOW, suspendedReason: 'unpaid' }),
      );
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'ACTIVE' }));

      await service.reactivate('tenant-1', ACTOR);

      expect(prisma.tenant.update.mock.calls[0][0].data).toEqual({
        status: 'ACTIVE',
        suspendedAt: null,
        suspendedReason: null,
        canceledAt: null,
      });
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe(
        'platform.tenant.reactivate',
      );
    });
  });

  describe('extendTrial', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('extends a live trial from its current end date', async () => {
      const endsAt = new Date(NOW.getTime() + 5 * DAY);
      prisma.tenant.findFirst.mockResolvedValue(
        makeTenant({ status: 'TRIAL', trialEndsAt: endsAt }),
      );
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'TRIAL' }));

      await service.extendTrial('tenant-1', { days: 10 }, ACTOR);

      const data = prisma.tenant.update.mock.calls[0][0].data;
      expect(data.status).toBe('TRIAL');
      expect((data.trialEndsAt as Date).getTime()).toBe(endsAt.getTime() + 10 * DAY);
    });

    it('extends an expired trial from today, not from the date it ran out', async () => {
      prisma.tenant.findFirst.mockResolvedValue(
        makeTenant({ trialEndsAt: new Date(NOW.getTime() - 40 * DAY) }),
      );
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'TRIAL' }));

      await service.extendTrial('tenant-1', { days: 7 }, ACTOR);

      // Adding 7 days to a trial that died a month ago would leave it expired.
      const data = prisma.tenant.update.mock.calls[0][0].data;
      expect((data.trialEndsAt as Date).getTime()).toBe(NOW.getTime() + 7 * DAY);
    });

    it('starts the trial from today for a company that never had one', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant({ trialEndsAt: null }));
      prisma.tenant.update.mockResolvedValue(makeTenant({ status: 'TRIAL' }));

      await service.extendTrial('tenant-1', { days: 30 }, ACTOR);

      const data = prisma.tenant.update.mock.calls[0][0].data;
      expect((data.trialEndsAt as Date).getTime()).toBe(NOW.getTime() + 30 * DAY);
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe(
        'platform.tenant.extend_trial',
      );
    });
  });

  describe('changePlan', () => {
    it('rejects a plan that does not exist, and changes nothing', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant());
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.changePlan('tenant-1', { planId: 'ghost-plan' }, ACTOR),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tenant.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('lifts a company out of TRIAL into ACTIVE when it takes a plan', async () => {
      prisma.tenant.findFirst.mockResolvedValue(makeTenant({ status: 'TRIAL' }));
      prisma.plan.findUnique.mockResolvedValue({ id: 'plan-2', code: 'pro' });
      prisma.tenant.update.mockResolvedValue(
        makeTenant({ status: 'ACTIVE', planId: 'plan-2', plan: { name: 'Pro' } }),
      );

      const dto = await service.changePlan('tenant-1', { planId: 'plan-2' }, ACTOR);

      expect(prisma.tenant.update.mock.calls[0][0].data).toEqual({
        planId: 'plan-2',
        status: 'ACTIVE',
      });
      expect(dto).toMatchObject({ status: 'ACTIVE', planId: 'plan-2', planName: 'Pro' });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'platform.tenant.change_plan',
        valuesBefore: { status: 'TRIAL', planId: null },
        valuesAfter: { status: 'ACTIVE', planId: 'plan-2' },
      });
    });

    it.each(['ACTIVE', 'SUSPENDED', 'CANCELED'])(
      'moves the plan of a %s company without touching its status',
      async (status) => {
        prisma.tenant.findFirst.mockResolvedValue(makeTenant({ status }));
        prisma.plan.findUnique.mockResolvedValue({ id: 'plan-3', code: 'basic' });
        prisma.tenant.update.mockResolvedValue(makeTenant({ status, planId: 'plan-3' }));

        await service.changePlan('tenant-1', { planId: 'plan-3' }, ACTOR);

        // Downgrading a suspended company must not quietly reactivate it.
        expect(prisma.tenant.update.mock.calls[0][0].data).toEqual({ planId: 'plan-3' });
      },
    );
  });
});
