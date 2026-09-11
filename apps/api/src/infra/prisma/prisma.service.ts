import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../../config/env';
import { TenantContext, type TenantScope } from '../tenancy/tenant-context';

/**
 * Prisma 7 uses driver adapters — this is the swap point for the database.
 * To move off Postgres: change `provider` in prisma/schema/main.prisma and swap
 * PrismaPg for the matching @prisma/adapter-* here. The rest of the app is
 * untouched.
 *
 * This class is also where multi-tenant isolation crosses from the JWT into
 * Postgres: `withScope` opens a transaction, declares the scope with SET LOCAL,
 * and only then runs the work. The RLS policies read that scope.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.assertNotSuperuser();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Refuses to start connected as a superuser.
   *
   * A SUPERUSER (or any role with BYPASSRLS) ignores Row Level Security even
   * with FORCE ROW LEVEL SECURITY on the tables. If the API connected that way
   * every isolation policy would be decorative and one company would read
   * another's data without anything visibly failing. We would rather not start
   * at all — in production. In dev and test it warns loudly and continues, so
   * nobody is blocked before running the app-role migration.
   */
  private async assertNotSuperuser(): Promise<void> {
    const [row] = await this.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean; rolname: string }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    if (!row || (!row.rolsuper && !row.rolbypassrls)) return;

    const message =
      `The API is connected to the database as "${row.rolname}", which bypasses Row Level ` +
      `Security (rolsuper=${row.rolsuper}, rolbypassrls=${row.rolbypassrls}). Tenant isolation ` +
      `would not be enforced. Point DATABASE_URL at the restricted role (dontpanic_app) and ` +
      `leave the database owner to DATABASE_ADMIN_URL.`;

    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new Error(message);
    }
    this.logger.error(message);
  }

  /**
   * Runs `fn` in a transaction where the tenant scope is declared to Postgres.
   *
   * `set_config(..., true)` is local to the transaction: it ends with it, so a
   * scope can never leak from one request to the next on a pooled connection.
   */
  async withScope<T>(
    scope: TenantScope,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // Always establish the context store, so `this.db` resolves to this
    // transaction even when withScope is called from a public route, outside
    // the interceptor.
    return TenantContext.run({ scope }, () =>
      this.$transaction(async (tx) => {
        switch (scope.kind) {
          case 'tenant':
            await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${scope.tenantId}, true)`;
            break;
          case 'platform':
            await tx.$executeRaw`SELECT set_config('app.platform_admin', 'on', true)`;
            break;
          case 'system':
            await tx.$executeRaw`SELECT set_config('app.system', 'on', true)`;
            break;
        }
        TenantContext.setTransaction(tx);
        try {
          return await fn(tx);
        } finally {
          TenantContext.setTransaction(undefined);
        }
      }),
    );
  }

  /** Sugar for the normal case: operate inside one concrete tenant. */
  async forTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.withScope({ kind: 'tenant', tenantId }, fn);
  }

  /** Crosses tenants. SUPERADMIN only, in the platform panel. */
  async asPlatform<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.withScope({ kind: 'platform' }, fn);
  }

  /**
   * Bypasses tenant isolation. It exists for one reason: authenticating someone
   * requires finding them by e-mail before you know their company. Restricted
   * to the auth module and onboarding; any other use is a bug.
   */
  async asSystem<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.withScope({ kind: 'system' }, fn);
  }

  /**
   * Runs several writes atomically.
   *
   * Inside a request there is already an open transaction (the one declaring
   * the tenant to Postgres), and opening another on top would be invalid —
   * PrismaPromises created from a transaction cannot be handed to
   * `$transaction`. So: if a transaction is already in flight, run inside it
   * (it is already atomic); outside a request, open one.
   */
  async atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tx = TenantContext.get()?.tx;
    if (tx) return fn(tx);
    return this.$transaction((newTx) => fn(newTx));
  }

  /**
   * The client services should use: `this.prisma.db.user.findMany(...)`.
   *
   * Returns the scoped transaction of the request in flight. Outside any scope
   * it returns the base client — which, with RLS on, sees no tenant rows at
   * all. That is deliberate: forgetting the scope yields an empty result, never
   * the wrong company's data.
   */
  get db(): Prisma.TransactionClient {
    const tx = TenantContext.get()?.tx;
    if (tx) return tx;
    return this as unknown as Prisma.TransactionClient;
  }
}
