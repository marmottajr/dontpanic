import type { Prisma } from '@prisma/client';
import { makePrismaMock, type PrismaMock } from '../../../../test/prisma-mock';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';
import { runAsPlatform } from './platform-scope';

/** Two transactions we can tell apart: the request's, and a freshly opened one. */
const REQUEST_TX = { marker: 'request-tx' } as unknown as Prisma.TransactionClient;
const FRESH_TX = { marker: 'fresh-tx' } as unknown as Prisma.TransactionClient;

function makePrisma(): PrismaService & PrismaMock {
  const prisma = makePrismaMock();
  // The shared double hands the callback its own client; here we need a tx that
  // is visibly *not* the request one, so the two paths can be told apart.
  prisma.asPlatform = jest.fn(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    fn(FRESH_TX),
  );
  return prisma as unknown as PrismaService & PrismaMock;
}

describe('runAsPlatform', () => {
  it('reuses the request transaction when the scope is already platform', async () => {
    const prisma = makePrisma();

    const used = await TenantContext.run({ scope: { kind: 'platform' }, tx: REQUEST_TX }, () =>
      runAsPlatform(prisma, async (tx) => tx),
    );

    // Opening a second transaction on top would spend another pool connection
    // and break atomicity between a change and its audit row.
    expect(used).toBe(REQUEST_TX);
    expect(prisma.asPlatform).not.toHaveBeenCalled();
  });

  it('opens a fresh platform transaction when the platform scope has none yet', async () => {
    const prisma = makePrisma();

    const used = await TenantContext.run({ scope: { kind: 'platform' } }, () =>
      runAsPlatform(prisma, async (tx) => tx),
    );

    expect(used).toBe(FRESH_TX);
    expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
  });

  it('never reuses a tenant transaction — that would be the operator acting inside one company', async () => {
    const prisma = makePrisma();

    const used = await TenantContext.run(
      { scope: { kind: 'tenant', tenantId: 'tenant-1' }, tx: REQUEST_TX },
      () => runAsPlatform(prisma, async (tx) => tx),
    );

    expect(used).toBe(FRESH_TX);
    expect(used).not.toBe(REQUEST_TX);
    expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
  });

  it('never reuses a system transaction either — @SystemScope() ignores isolation altogether', async () => {
    const prisma = makePrisma();

    const used = await TenantContext.run({ scope: { kind: 'system' }, tx: REQUEST_TX }, () =>
      runAsPlatform(prisma, async (tx) => tx),
    );

    expect(used).toBe(FRESH_TX);
    expect(used).not.toBe(REQUEST_TX);
    expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
  });

  it('opens a platform transaction outside any request (jobs, tests)', async () => {
    const prisma = makePrisma();

    const used = await runAsPlatform(prisma, async (tx) => tx);

    expect(used).toBe(FRESH_TX);
    expect(prisma.asPlatform).toHaveBeenCalledTimes(1);
  });

  it('passes the callback result straight back to the caller', async () => {
    const prisma = makePrisma();

    await expect(runAsPlatform(prisma, async () => 'done')).resolves.toBe('done');
  });
});
