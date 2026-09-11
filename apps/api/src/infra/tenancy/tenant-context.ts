import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

/**
 * Access level of the request in flight. It decides what Postgres lets you see.
 *
 *  - `tenant`   — the normal case: only rows of the authenticated user's tenant.
 *  - `platform` — SUPERADMIN in the /admin panel: crosses tenants.
 *  - `system`   — the internal authentication path, which has to find the user
 *                 before it can know which tenant they belong to. Deliberately
 *                 narrow: see `PrismaService.asSystem`.
 */
export type TenantScope =
  { kind: 'tenant'; tenantId: string } | { kind: 'platform' } | { kind: 'system' };

export interface TenantStore {
  scope: TenantScope;
  /** The open transaction, once the request has started one. */
  tx?: Prisma.TransactionClient;
}

const storage = new AsyncLocalStorage<TenantStore>();

export const TenantContext = {
  /** Runs `fn` under the given scope. Outside a `run`, there is no scope at all. */
  run<T>(store: TenantStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  /** The current scope, or `undefined` when the code runs outside a request. */
  get(): TenantStore | undefined {
    return storage.getStore();
  },

  /**
   * The request's tenant. Throws when there is none — it never returns a
   * default, because a silent default here is a data leak.
   */
  requireTenantId(): string {
    const store = storage.getStore();
    if (!store || store.scope.kind !== 'tenant') {
      throw new Error(
        'No tenant in context. Every operation on a company’s data must run inside TenantContext.run().',
      );
    }
    return store.scope.tenantId;
  },

  /** Attaches the transaction client to the current scope (used by PrismaService). */
  setTransaction(tx: Prisma.TransactionClient | undefined): void {
    const store = storage.getStore();
    if (store) store.tx = tx;
  },
};
