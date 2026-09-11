import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';

/**
 * Runs `fn` in platform scope — the only scope that crosses companies.
 *
 * `TenantScopeInterceptor` already opens that scope when the request user is a
 * SUPERADMIN; in that case we reuse the transaction in flight, because opening
 * another on top would spend a second pool connection and break atomicity
 * between a change and its audit row. Outside a request (tests, jobs) it opens
 * a fresh one with `asPlatform`.
 *
 * What this helper guarantees either way: nothing here ever reads or writes
 * under a tenant scope or under `@SystemScope()`.
 */
export function runAsPlatform<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const store = TenantContext.get();
  if (store?.scope.kind === 'platform' && store.tx) return fn(store.tx);
  return prisma.asPlatform(fn);
}

/** Who acted and from where — stored on every audit row the panel writes. */
export interface PlatformActor {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
}
