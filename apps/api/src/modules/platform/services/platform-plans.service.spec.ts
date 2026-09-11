import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { UpsertPlanInput } from '@dontpanic/shared';
import { makePrismaMock, type PrismaMock } from '../../../../test/prisma-mock';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { PlatformPlansService } from './platform-plans.service';

const NOW = new Date('2026-09-11T12:00:00.000Z');

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    code: 'pro',
    name: 'Professional',
    description: null,
    priceCents: 19900,
    currency: 'BRL',
    trialDays: 14,
    maxUsers: 10,
    maxStorageMb: null,
    limits: {},
    features: {},
    sortOrder: 1,
    isDefault: false,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const input = (overrides: Partial<UpsertPlanInput> = {}): UpsertPlanInput => ({
  code: 'pro',
  name: 'Professional',
  priceCents: 19900,
  currency: 'BRL',
  trialDays: 14,
  ...overrides,
});

/** What Prisma throws on a unique-constraint violation. */
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('PlatformPlansService', () => {
  let prisma: PrismaMock;
  let service: PlatformPlansService;

  beforeEach(() => {
    prisma = makePrismaMock({
      plan: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    service = new PlatformPlansService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('lists every plan cheapest-first inside its sort order, in platform scope', async () => {
      prisma.plan.findMany.mockResolvedValue([
        makePlan(),
        makePlan({ id: 'plan-2', code: 'free' }),
      ]);

      const plans = await service.list();

      expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
      expect(prisma.plan.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
      });
      expect(plans).toHaveLength(2);
      expect(plans[0]).toEqual({
        id: 'plan-1',
        code: 'pro',
        name: 'Professional',
        description: null,
        priceCents: 19900,
        currency: 'BRL',
        trialDays: 14,
        maxUsers: 10,
        maxStorageMb: null,
        active: true,
      });
    });

    it('never leaks the internal columns the panel does not ask for', async () => {
      prisma.plan.findMany.mockResolvedValue([makePlan({ limits: { projects: 3 } })]);

      const [plan] = await service.list();

      expect(plan).not.toHaveProperty('limits');
      expect(plan).not.toHaveProperty('isDefault');
    });
  });

  describe('create', () => {
    it('stores the optional fields explicitly as null when they were not sent', async () => {
      prisma.plan.create.mockResolvedValue(makePlan());

      await service.create(input());

      expect(prisma.plan.create.mock.calls[0][0].data).toEqual({
        code: 'pro',
        name: 'Professional',
        description: null,
        priceCents: 19900,
        currency: 'BRL',
        trialDays: 14,
        maxUsers: null,
        maxStorageMb: null,
      });
    });

    it('passes through limits, features and the ordering flags when they are sent', async () => {
      prisma.plan.create.mockResolvedValue(makePlan());

      await service.create(
        input({
          description: 'Everything',
          maxUsers: 25,
          maxStorageMb: 1024,
          limits: { projects: 10 },
          features: { concurrentSessions: true },
          sortOrder: 3,
          active: false,
        }),
      );

      expect(prisma.plan.create.mock.calls[0][0].data).toMatchObject({
        description: 'Everything',
        maxUsers: 25,
        maxStorageMb: 1024,
        limits: { projects: 10 },
        features: { concurrentSessions: true },
        sortOrder: 3,
        active: false,
      });
    });

    it('turns a duplicate code into a 400 instead of a raw database error', async () => {
      prisma.plan.create.mockRejectedValue(uniqueViolation);

      await expect(service.create(input())).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.create(input())).rejects.toThrow('A plan with that code exists');
    });

    it('rethrows any other database failure untouched, rather than mislabelling it', async () => {
      const boom = new Error('connection reset');
      prisma.plan.create.mockRejectedValue(boom);

      await expect(service.create(input())).rejects.toBe(boom);
    });

    it('unsets the previous default before creating the new one', async () => {
      prisma.plan.create.mockResolvedValue(makePlan({ isDefault: true }));

      await service.create(input({ isDefault: true }));

      // Exactly one default may exist: a public signup has to land somewhere
      // definite. Both writes share the transaction, so they cannot half-apply.
      expect(prisma.plan.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      expect(prisma.plan.create.mock.calls[0][0].data.isDefault).toBe(true);
    });

    it.each([
      ['not sent', undefined],
      ['explicitly false', false],
    ])('leaves the existing default alone when isDefault is %s', async (_label, isDefault) => {
      prisma.plan.create.mockResolvedValue(makePlan());

      await service.create(input({ isDefault }));

      expect(prisma.plan.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('404s on a plan that does not exist, and writes nothing', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(service.update('ghost', input())).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.plan.update).not.toHaveBeenCalled();
      expect(prisma.plan.updateMany).not.toHaveBeenCalled();
    });

    it('updates the plan it was given', async () => {
      prisma.plan.findUnique.mockResolvedValue(makePlan());
      prisma.plan.update.mockResolvedValue(makePlan({ name: 'Pro+' }));

      const dto = await service.update('plan-1', input({ name: 'Pro+' }));

      expect(prisma.plan.update.mock.calls[0][0].where).toEqual({ id: 'plan-1' });
      expect(dto.name).toBe('Pro+');
    });

    it('unsets the other defaults but never the row being updated', async () => {
      prisma.plan.findUnique.mockResolvedValue(makePlan());
      prisma.plan.update.mockResolvedValue(makePlan({ isDefault: true }));

      await service.update('plan-1', input({ isDefault: true }));

      // Without the exclusion the update would clear the flag it is about to
      // set, and the platform would end up with no default plan at all.
      expect(prisma.plan.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true, id: { not: 'plan-1' } },
        data: { isDefault: false },
      });
    });

    it('does not clear any default when the update is not about the default flag', async () => {
      prisma.plan.findUnique.mockResolvedValue(makePlan());
      prisma.plan.update.mockResolvedValue(makePlan());

      await service.update('plan-1', input({ isDefault: false }));

      expect(prisma.plan.updateMany).not.toHaveBeenCalled();
    });

    it('turns a code taken by another plan into a 400', async () => {
      prisma.plan.findUnique.mockResolvedValue(makePlan());
      prisma.plan.update.mockRejectedValue(uniqueViolation);

      await expect(service.update('plan-1', input({ code: 'free' }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rethrows any other database failure untouched', async () => {
      const boom = new Error('deadlock detected');
      prisma.plan.findUnique.mockResolvedValue(makePlan());
      prisma.plan.update.mockRejectedValue(boom);

      await expect(service.update('plan-1', input())).rejects.toBe(boom);
    });
  });
});
