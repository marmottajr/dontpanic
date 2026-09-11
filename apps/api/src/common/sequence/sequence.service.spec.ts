import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import { SequenceService } from './sequence.service';

/**
 * `atomic` is the real thing's contract: it hands the caller the transaction in
 * flight. The mock records the raw SQL calls made through that transaction.
 */
function makePrisma(executeRaw = jest.fn().mockResolvedValue(1)): {
  prisma: PrismaService;
  tx: Prisma.TransactionClient;
  executeRaw: jest.Mock;
} {
  const tx = { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient;
  const prisma = {
    atomic: jest.fn(<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => fn(tx)),
  } as unknown as PrismaService;
  return { prisma, tx, executeRaw };
}

describe('SequenceService', () => {
  it('takes the advisory lock BEFORE reading the maximum', async () => {
    // Reading the maximum before locking would be exactly the race this
    // service exists to prevent.
    const order: string[] = [];
    const { prisma, executeRaw } = makePrisma(
      jest.fn(async () => {
        order.push('lock');
        return 1;
      }),
    );
    const service = new SequenceService(prisma);

    await expect(
      service.next('invoice-number', 'tenant-1', async () => {
        order.push('read');
        return 6;
      }),
    ).resolves.toBe(7);

    expect(order).toEqual(['lock', 'read']);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('runs inside the request transaction, so a rollback returns the number', async () => {
    const { prisma } = makePrisma();
    const service = new SequenceService(prisma);

    await service.next('invoice-number', 'tenant-1', async () => 0);

    expect(prisma.atomic).toHaveBeenCalledTimes(1);
  });

  it('reads the maximum through the very transaction that holds the lock', async () => {
    const { prisma, tx } = makePrisma();
    const service = new SequenceService(prisma);
    const reader = jest.fn().mockResolvedValue(3);

    await expect(service.next('order-number', 'tenant-1', reader)).resolves.toBe(4);
    expect(reader).toHaveBeenCalledWith(tx);
  });

  it('scopes the lock key to label and tenant, so nobody waits on a stranger', async () => {
    const keys: unknown[] = [];
    const { prisma } = makePrisma(
      jest.fn(async (_strings: unknown, ...values: unknown[]) => {
        keys.push(values[0]);
        return 1;
      }),
    );
    const service = new SequenceService(prisma);

    await service.next('invoice-number', 'tenant-a', async () => 1);
    await service.next('invoice-number', 'tenant-b', async () => 1);
    await service.next('order-number', 'tenant-a', async () => 1);

    expect(keys).toEqual([
      'invoice-number:tenant-a',
      'invoice-number:tenant-b',
      'order-number:tenant-a',
    ]);
  });

  it('starts at 1 when the tenant has nothing numbered yet', async () => {
    const { prisma } = makePrisma();
    const service = new SequenceService(prisma);

    await expect(service.next('invoice-number', 'tenant-1', async () => null)).resolves.toBe(1);
    await expect(service.next('invoice-number', 'tenant-1', async () => undefined)).resolves.toBe(
      1,
    );
  });

  it('accepts a bigint maximum, as aggregate() on a BigInt column returns', async () => {
    const { prisma } = makePrisma();
    const service = new SequenceService(prisma);

    await expect(service.next('invoice-number', 'tenant-1', async () => 41n)).resolves.toBe(42);
  });
});
