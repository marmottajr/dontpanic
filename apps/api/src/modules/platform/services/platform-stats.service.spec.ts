import { makePrismaMock, type PrismaMock } from '../../../../test/prisma-mock';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { PlatformStatsService } from './platform-stats.service';

/** Mid-day on purpose: the window must snap to UTC midnight, not to "now". */
const NOW = new Date('2026-09-11T12:00:00.000Z');
const WINDOW_DAYS = 30;

describe('PlatformStatsService', () => {
  let prisma: PrismaMock;
  let service: PlatformStatsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = makePrismaMock({
      tenant: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { count: jest.fn().mockResolvedValue(0) },
    });
    service = new PlatformStatsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads the whole customer base through the platform scope only', async () => {
    await service.stats();

    expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
    expect(prisma.forTenant).not.toHaveBeenCalled();
    expect(prisma.asSystem).not.toHaveBeenCalled();
  });

  it('counts companies per status and adds them up to the total', async () => {
    prisma.tenant.groupBy.mockResolvedValue([
      { status: 'TRIAL', _count: 4 },
      { status: 'ACTIVE', _count: 9 },
      { status: 'SUSPENDED', _count: 2 },
    ]);
    prisma.user.count.mockResolvedValue(120);

    const stats = await service.stats();

    expect(stats.tenants).toEqual({ TRIAL: 4, ACTIVE: 9, SUSPENDED: 2 });
    expect(stats.totalTenants).toBe(15);
    expect(stats.totalUsers).toBe(120);
  });

  it('ignores soft-deleted companies and users everywhere', async () => {
    await service.stats();

    expect(prisma.tenant.groupBy.mock.calls[0][0].where).toEqual({ deletedAt: null });
    expect(prisma.user.count.mock.calls[0][0].where).toEqual({ deletedAt: null });
    expect(prisma.tenant.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });

  it('excludes companies created before the window, in the query rather than in JS', async () => {
    await service.stats();

    const since = prisma.tenant.findMany.mock.calls[0][0].where.createdAt.gte as Date;
    // 30 days ending today, so the oldest bucket is 29 days back at UTC midnight.
    expect(since.toISOString()).toBe('2026-08-13T00:00:00.000Z');
    // Only the dates are read: the panel shows a curve, not company records.
    expect(prisma.tenant.findMany.mock.calls[0][0].select).toEqual({ createdAt: true });
  });

  it('returns one bucket per day of the window, oldest first and zero-filled', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { createdAt: new Date('2026-09-11T00:30:00.000Z') },
      { createdAt: new Date('2026-09-11T23:59:59.000Z') },
      { createdAt: new Date('2026-09-09T10:00:00.000Z') },
      { createdAt: new Date('2026-08-13T06:00:00.000Z') },
    ]);

    const { signups } = await service.stats();

    expect(signups).toHaveLength(WINDOW_DAYS);
    expect(signups[0]).toEqual({ date: '2026-08-13', count: 1 });
    expect(signups[WINDOW_DAYS - 1]).toEqual({ date: '2026-09-11', count: 2 });
    expect(signups.find((day) => day.date === '2026-09-09')?.count).toBe(1);
    // A day with no signups is a zero, not a gap the chart has to guess at.
    expect(signups.find((day) => day.date === '2026-09-10')?.count).toBe(0);
    expect(signups.map((day) => day.date)).toEqual([...signups].map((day) => day.date).sort());
    expect(signups.reduce((sum, day) => sum + day.count, 0)).toBe(4);
  });

  it('gives a dense zero series when nobody signed up at all', async () => {
    const { signups, totalTenants } = await service.stats();

    expect(signups).toHaveLength(WINDOW_DAYS);
    expect(signups.every((day) => day.count === 0)).toBe(true);
    expect(totalTenants).toBe(0);
  });

  it('crosses the month boundary without losing or duplicating a day', async () => {
    const { signups } = await service.stats();

    const dates = signups.map((day) => day.date);
    expect(new Set(dates).size).toBe(WINDOW_DAYS);
    expect(dates).toContain('2026-08-31');
    expect(dates).toContain('2026-09-01');
  });

  it('never grows a bucket for a row outside the window', async () => {
    // Clock skew between app servers, or seed data dated forward, would
    // otherwise append a 31st bucket at the end — breaking both the fixed
    // length and the oldest-first ordering the DTO promises.
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    prisma.tenant.groupBy.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.tenant.findMany.mockResolvedValue([{ createdAt: future }]);

    const stats = await service.stats();

    expect(stats.signups).toHaveLength(30);
    expect(stats.signups.every((entry) => entry.count === 0)).toBe(true);
    const dates = stats.signups.map((entry) => entry.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
