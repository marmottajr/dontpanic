import type { Prisma } from '@prisma/client';
import { writePlatformAudit } from './platform-audit';
import type { PlatformActor } from './platform-scope';

const ACTOR: PlatformActor = { id: 'operator-1', ip: '10.0.0.1', userAgent: 'jest' };

function makeTx() {
  return { auditLog: { create: jest.fn().mockResolvedValue({}) } };
}

describe('writePlatformAudit', () => {
  it('writes the row through the transaction object it was handed, not through any other client', async () => {
    const tx = makeTx();
    const other = makeTx();

    await writePlatformAudit(tx as unknown as Prisma.TransactionClient, {
      action: 'platform.tenant.suspend',
      tenantId: 'tenant-1',
      actor: ACTOR,
    });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(other.auditLog.create).not.toHaveBeenCalled();
  });

  it('records what was done, to whom, by whom and from where', async () => {
    const tx = makeTx();

    await writePlatformAudit(tx as unknown as Prisma.TransactionClient, {
      action: 'platform.tenant.change_plan',
      tenantId: 'tenant-1',
      actor: ACTOR,
      valuesBefore: { status: 'TRIAL', planId: null },
      valuesAfter: { status: 'ACTIVE', planId: 'plan-2' },
      metadata: { days: 7 },
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'platform.tenant.change_plan',
        tenantId: 'tenant-1',
        userId: 'operator-1',
        entity: 'Tenant',
        entityId: 'tenant-1',
        valuesBefore: { status: 'TRIAL', planId: null },
        valuesAfter: { status: 'ACTIVE', planId: 'plan-2' },
        metadata: { days: 7 },
        ip: '10.0.0.1',
        userAgent: 'jest',
      },
    });
  });

  it('stores null — never undefined — when the actor came without ip or user agent', async () => {
    const tx = makeTx();

    await writePlatformAudit(tx as unknown as Prisma.TransactionClient, {
      action: 'platform.tenant.reactivate',
      tenantId: 'tenant-1',
      actor: { id: 'operator-1' },
    });

    const data = tx.auditLog.create.mock.calls[0][0].data;
    expect(data.ip).toBeNull();
    expect(data.userAgent).toBeNull();
    expect(data.valuesBefore).toBeUndefined();
  });

  it('keeps an explicitly null ip and user agent as null', async () => {
    const tx = makeTx();

    await writePlatformAudit(tx as unknown as Prisma.TransactionClient, {
      action: 'platform.tenant.reactivate',
      tenantId: 'tenant-1',
      actor: { id: 'operator-1', ip: null, userAgent: null },
    });

    const data = tx.auditLog.create.mock.calls[0][0].data;
    expect(data.ip).toBeNull();
    expect(data.userAgent).toBeNull();
  });

  it('lets a failed write propagate — an untraceable suspension is worse than a failed one', async () => {
    const tx = makeTx();
    tx.auditLog.create.mockRejectedValue(new Error('audit table is read-only'));

    // Deliberately the opposite of the usual log-and-continue rule: if the
    // trail cannot be written, the change it describes must not happen either.
    await expect(
      writePlatformAudit(tx as unknown as Prisma.TransactionClient, {
        action: 'platform.tenant.suspend',
        tenantId: 'tenant-1',
        actor: ACTOR,
      }),
    ).rejects.toThrow('audit table is read-only');
  });
});
