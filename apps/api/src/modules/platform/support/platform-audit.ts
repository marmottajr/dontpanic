import type { Prisma } from '@prisma/client';
import type { PlatformActor } from './platform-scope';

export interface PlatformAuditEntry {
  action: string;
  tenantId: string;
  actor: PlatformActor;
  valuesBefore?: Prisma.InputJsonValue;
  valuesAfter?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes the platform panel's audit row **in the same transaction** as the
 * change it describes, and deliberately lets a failure propagate.
 *
 * This is the opposite of the usual log-and-continue rule, and for a reason:
 * suspending a company or moving it between plans is an act of the operator
 * against a customer. An untraceable suspension is worse than a failed one —
 * if the trail cannot be written, the change must not happen either.
 */
export async function writePlatformAudit(
  tx: Prisma.TransactionClient,
  entry: PlatformAuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: entry.action,
      tenantId: entry.tenantId,
      userId: entry.actor.id,
      entity: 'Tenant',
      entityId: entry.tenantId,
      valuesBefore: entry.valuesBefore,
      valuesAfter: entry.valuesAfter,
      metadata: entry.metadata,
      ip: entry.actor.ip ?? null,
      userAgent: entry.actor.userAgent ?? null,
    },
  });
}
