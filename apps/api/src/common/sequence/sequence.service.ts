import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * Gap-free counters, numbered **per tenant**.
 *
 * The real problem is concurrency: two users creating an invoice at the same
 * instant would both read `MAX(number) + 1` and land on the same value. A
 * unique index `(tenantId, number)` would catch the collision, but by throwing
 * a 500 in one of their faces.
 *
 * The fix is a **per-tenant advisory lock**, taken inside the request's
 * transaction: the second request waits for the first and then reads the new
 * number. The lock is `xact`, so it is released with the transaction even when
 * something fails — there is no way to leave it held.
 *
 * We deliberately do NOT use a Postgres sequence: a sequence is global, so it
 * would leave gaps per tenant (and aborted transactions burn numbers). Where a
 * number is printed on a document people expect 1, 2, 3 with nothing missing.
 *
 * Soft-deleted rows should stay inside the maximum the caller reports: a number
 * that was issued is never handed out twice.
 */

/**
 * Reads the highest number currently in use for the tenant. It receives the
 * very transaction that holds the lock — read through it, not through another
 * client, or the lock protects nothing.
 */
export type CurrentMaxReader = (
  tx: Prisma.TransactionClient,
) => Promise<number | bigint | null | undefined>;

@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The tenant's next number for `label`. Must run inside the transaction of
   * the write that will consume it, so that a rollback gives the number back.
   *
   * @param label   counter name, e.g. `invoice-number`. Two labels never wait
   *                on each other, and neither do two tenants.
   * @param tenantId the company the counter belongs to.
   * @param currentMax reads the highest number already used — typically a
   *                `aggregate({ _max: … })` on the table that stores it.
   */
  async next(label: string, tenantId: string, currentMax: CurrentMaxReader): Promise<number> {
    return this.prisma.atomic(async (tx) => {
      await this.lock(tx, label, tenantId);
      const max = await currentMax(tx);
      return Number(max ?? 0) + 1;
    });
  }

  /**
   * `hashtext` turns the key into a stable int32; the label keeps this counter
   * from colliding with any other counter using the same mechanism.
   */
  private async lock(tx: Prisma.TransactionClient, label: string, tenantId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${label}:${tenantId}`}))`;
  }
}
