import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * The audit trail: every write that touches money, a contract or stock leaves a
 * record of who did what, and when.
 *
 * Two decisions are baked in here, and both matter.
 *
 * The row is written with the SAME transaction client as the change it
 * describes, so the log and the fact it describes commit or roll back together.
 * A log row pointing at a change that never happened is worse than no log.
 *
 * And a failure of the audit write never brings the business operation down:
 * it is logged as a warning and the caller carries on. A record saved without a
 * log is a problem; a record NOT saved because the log failed is a worse one.
 */

export interface AuditActor {
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  /** The company the audited row belongs to. */
  tenantId: string;
  /** Dotted verb, e.g. `catalog.product.update`. */
  action: string;
  /** Table the action is about, when it is about one entity. */
  entity?: string | null;
  entityId?: string | null;
  actor?: AuditActor;
  valuesBefore?: unknown;
  valuesAfter?: unknown;
  metadata?: Record<string, unknown>;
}

const logger = new Logger('Audit');

/**
 * Appends one audit row inside the caller's transaction.
 *
 * @param tx the transaction client of the write being audited — pass the `tx`
 *   from `PrismaService.atomic()`, never `prisma.db` resolved separately.
 */
export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        userId: entry.actor?.userId ?? null,
        ip: entry.actor?.ip ?? null,
        userAgent: entry.actor?.userAgent ?? null,
        // `undefined` leaves the column untouched (SQL NULL); `null` would be
        // stored as the JSON literal `null`, which reads back as a value.
        valuesBefore: (entry.valuesBefore ?? undefined) as Prisma.InputJsonValue | undefined,
        valuesAfter: (entry.valuesAfter ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: entry.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    logger.warn(`Failed to write audit log "${entry.action}": ${String(err)}`);
  }
}
