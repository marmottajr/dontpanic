import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { writeAudit } from './audit.util';

function makeTx(create: jest.Mock): Prisma.TransactionClient {
  return { auditLog: { create } } as unknown as Prisma.TransactionClient;
}

describe('writeAudit', () => {
  it('writes the row with the actor and the before/after values', async () => {
    const create = jest.fn().mockResolvedValue({});

    await writeAudit(makeTx(create), {
      tenantId: 'tenant-1',
      action: 'catalog.product.update',
      entity: 'products',
      entityId: 'product-1',
      actor: { userId: 'user-1', ip: '10.0.0.1', userAgent: 'jest' },
      valuesBefore: { price: '10.00' },
      valuesAfter: { price: '12.00' },
      metadata: { source: 'test' },
    });

    expect(create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-1',
      action: 'catalog.product.update',
      entity: 'products',
      entityId: 'product-1',
      userId: 'user-1',
      ip: '10.0.0.1',
      userAgent: 'jest',
      valuesBefore: { price: '10.00' },
      valuesAfter: { price: '12.00' },
      metadata: { source: 'test' },
    });
  });

  it('uses the transaction client it is given, not a client of its own', async () => {
    // The log has to commit or roll back with the change it describes.
    const create = jest.fn().mockResolvedValue({});
    const tx = makeTx(create);

    await writeAudit(tx, { tenantId: 'tenant-1', action: 'stock.movement.create' });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('normalises a missing entity, actor and values to null instead of guessing', async () => {
    const create = jest.fn().mockResolvedValue({});

    await writeAudit(makeTx(create), {
      tenantId: 'tenant-1',
      action: 'stock.movement.create',
    });

    const { data } = create.mock.calls[0][0];
    expect(data).toMatchObject({ entity: null, entityId: null, userId: null, ip: null });
    expect(data.userAgent).toBeNull();
    expect(data.valuesBefore).toBeUndefined();
    expect(data.valuesAfter).toBeUndefined();
    expect(data.metadata).toBeUndefined();
  });

  it('nulls out the parts of a partial actor that are absent', async () => {
    const create = jest.fn().mockResolvedValue({});

    await writeAudit(makeTx(create), {
      tenantId: 'tenant-1',
      action: 'catalog.product.create',
      entity: 'products',
      entityId: null,
      actor: { userId: 'user-1' },
    });

    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: 'user-1',
      ip: null,
      userAgent: null,
    });
  });

  it('does not bring the business operation down when the audit write fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const create = jest.fn().mockRejectedValue(new Error('RLS refused'));

    await expect(
      writeAudit(makeTx(create), { tenantId: 'tenant-1', action: 'finance.document.settle' }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('finance.document.settle'));
    warn.mockRestore();
  });
});
