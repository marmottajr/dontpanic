import { Injectable } from '@nestjs/common';
import type { PlatformStatsDto, TenantStatus } from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { runAsPlatform } from '../support/platform-scope';

/** How far back the signup series goes, in days. */
const WINDOW_DAYS = 30;

@Injectable()
export class PlatformStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<PlatformStatsDto> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));

    // Upper bound as well as lower. Without it a row dated in the future —
    // clock skew between app servers, or backdated-forward seed data — lands on
    // a key the pre-filled map does not have, and `Map.set` appends a 31st
    // bucket at the end, breaking both the fixed length and the ordering the
    // DTO promises.
    const until = new Date(since);
    until.setUTCDate(since.getUTCDate() + WINDOW_DAYS);

    return runAsPlatform(this.prisma, async (tx) => {
      const [byStatus, totalUsers, recent] = await Promise.all([
        tx.tenant.groupBy({ by: ['status'], _count: true, where: { deletedAt: null } }),
        tx.user.count({ where: { deletedAt: null } }),
        tx.tenant.findMany({
          where: { deletedAt: null, createdAt: { gte: since, lt: until } },
          select: { createdAt: true },
        }),
      ]);

      const tenants = Object.fromEntries(byStatus.map((row) => [row.status, row._count])) as Record<
        TenantStatus,
        number
      >;

      // Bucket in JS rather than SQL: the window is small, and a date_trunc
      // would bind the query to Postgres for no measurable gain.
      const counts = new Map<string, number>();
      for (let i = 0; i < WINDOW_DAYS; i += 1) {
        const day = new Date(since);
        day.setUTCDate(since.getUTCDate() + i);
        counts.set(day.toISOString().slice(0, 10), 0);
      }
      for (const row of recent) {
        const key = row.createdAt.toISOString().slice(0, 10);
        const current = counts.get(key);
        // The query is bounded to the window, so every key is pre-filled. The
        // guard is what keeps the invariant true anyway: a row outside it is
        // dropped, never appended as an extra bucket at the end, which would
        // break both the fixed length and the ordering the DTO promises.
        if (current === undefined) continue;
        counts.set(key, current + 1);
      }

      return {
        tenants,
        totalTenants: byStatus.reduce((sum, row) => sum + row._count, 0),
        totalUsers,
        signups: [...counts].map(([date, count]) => ({ date, count })),
      };
    });
  }
}
