import { BadRequestException, Injectable } from '@nestjs/common';
import type { Plan, Prisma } from '@prisma/client';
import type { PlanUsageDto, PlanUsageEntry } from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';

/** How the app reads a tenant that has no plan attached. */
const NO_PLAN = { code: 'no-plan', name: 'No plan' } as const;

/**
 * Does the plan allow more than one session at a time?
 *
 * Reads the flag from `Plan.features`, which is free-form `Json`. **Absent,
 * malformed or false all mean no**: a plan nobody configured must not open the
 * door to shared sessions by accident — the mistake has to fall on the
 * restrictive side, or the limit stops being a limit.
 */
export function planAllowsConcurrentSessions(
  features: Prisma.JsonValue | null | undefined,
): boolean {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return false;
  return (features as Record<string, unknown>).concurrentSessions === true;
}

/** Reads a named counter out of the plan's free-form `limits` column. */
export function planResourceLimit(
  limits: Prisma.JsonValue | null | undefined,
  resource: string,
): number | null {
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return null;
  const value = (limits as Record<string, unknown>)[resource];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Counts the rows of one product resource for a tenant. */
export type ResourceCounter = (db: Prisma.TransactionClient, tenantId: string) => Promise<number>;

/**
 * The commercial plan doing its actual job: how many users and how much of each
 * product resource a company may have.
 *
 * There is a service for this because limits get enforced in several places
 * (creating a user, reactivating one, every door a resource is born through)
 * and a rule copied is a rule that drifts. The counting, the message and — what
 * matters most — the answer to concurrency all live here.
 *
 * **The race:** two requests creating the last user both read `used = 0` and
 * both pass. Counting before writing is not enough, because counting locks
 * nothing. The fix is a `pg_advisory_xact_lock` per company **and per
 * resource**, taken inside the request's transaction. The second request waits
 * for the first and only counts once its row exists — so it sees `used = 1` and
 * is refused. The lock is `xact`: it is released with the transaction, even if
 * that transaction fails.
 *
 * Each request takes at most one of these locks, and takes it before any other
 * work, so two requests can never acquire them in opposite orders.
 */
@Injectable()
export class PlanLimitsService {
  /**
   * Counters for product resources, registered by the feature modules that own
   * them. The boilerplate ships NONE, and that is not an omission: `users` is
   * built in because every SaaS has users, and there is no second resource
   * until a product invents one.
   */
  private readonly resources = new Map<string, ResourceCounter>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The extension point of this service — deliberately empty in the
   * boilerplate, and the only reason `assertCanAddResource` has no call site.
   *
   * Adding a limited resource to a product is three steps:
   *
   * 1. In the owning module's `onModuleInit`, declare how to count it:
   *    `planLimits.registerResource('projects', (db, tenantId) =>
   *       db.project.count({ where: { tenantId, deletedAt: null } }))`
   *    The counter receives the transaction, so it counts inside the same
   *    snapshot and the same advisory lock as the check that calls it.
   * 2. Put the ceiling in the plan: `Plan.limits = {"projects": 10}`. A name
   *    absent from `limits` means unlimited, which is what every existing plan
   *    keeps meaning after you add the resource.
   * 3. Call `assertCanAddResource('projects', tx)` in the SAME transaction that
   *    creates the row — every door the resource can be born through, creation
   *    and restore-from-trash alike. Outside the transaction the count locks
   *    nothing and the limit is decorative.
   *
   * The name is the join between the three, so it has to be spelled the same
   * in all of them; `assertCanAddResource` throws on a name nobody registered
   * precisely so a typo is loud instead of silently unlimited.
   */
  registerResource(name: string, count: ResourceCounter): void {
    this.resources.set(name, count);
  }

  /** Current consumption against the limits — what lets the UI warn in advance. */
  async usage(): Promise<PlanUsageDto> {
    const tenantId = TenantContext.requireTenantId();
    const db = this.prisma.db;
    const plan = await this.loadPlan(db, tenantId);

    const users = await this.countUsers(db, tenantId);
    const resources: Record<string, PlanUsageEntry> = {};
    for (const [name, count] of this.resources) {
      resources[name] = {
        used: await count(db, tenantId),
        limit: planResourceLimit(plan?.limits, name),
      };
    }

    return {
      planCode: plan?.code ?? NO_PLAN.code,
      planName: plan?.name ?? NO_PLAN.name,
      users: { used: users, limit: plan?.maxUsers ?? null },
      resources,
      concurrentSessions: planAllowsConcurrentSessions(plan?.features),
    };
  }

  /**
   * Is there a seat for one more user?
   *
   * Applies to creating and to **reactivating**: a deactivated account takes no
   * seat, and switching it back on takes one — without this call on the
   * reactivation path, the limit could be walked around by deactivating and
   * reactivating at will. Both call sites pass their own `tx`
   * (`InvitationsService.accept`, `AdminUsersService.setActive`), because the
   * lock below is only worth taking around the write it is protecting.
   */
  async assertCanAddUser(tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma.db;
    const tenantId = TenantContext.requireTenantId();
    const plan = await this.loadPlan(db, tenantId);
    if (!plan || plan.maxUsers === null) return;
    const limit = plan.maxUsers;

    await this.lock(db, `plan-limit:users:${tenantId}`);
    const used = await this.countUsers(db, tenantId);
    if (used < limit) return;

    const seats = limit === 1 ? '1 user' : `${limit} users`;
    throw new BadRequestException(
      `The ${plan.name} plan includes ${seats} and the company already has ${used} active. ` +
        'Deactivate someone who no longer uses the system, or move to a larger plan.',
    );
  }

  /**
   * Is there room for one more of a registered product resource?
   *
   * An unregistered name throws rather than passing. Returning quietly would
   * mean a typo — or renaming the key at the registration site — silently
   * removes the limit, which is the one failure mode a limit must not have.
   */
  async assertCanAddResource(name: string, tx?: Prisma.TransactionClient): Promise<void> {
    const count = this.resources.get(name);
    if (!count) {
      throw new Error(
        `No counter registered for plan resource "${name}". Call ` +
          'planLimits.registerResource() in the module that owns it.',
      );
    }

    const db = tx ?? this.prisma.db;
    const tenantId = TenantContext.requireTenantId();
    const plan = await this.loadPlan(db, tenantId);
    const limit = planResourceLimit(plan?.limits, name);
    if (!plan || limit === null) return;

    await this.lock(db, `plan-limit:${name}:${tenantId}`);
    const used = await count(db, tenantId);
    if (used < limit) return;

    throw new BadRequestException(
      `The ${plan.name} plan allows ${limit} ${name} and the company already has ${used}. ` +
        'Remove one, or move to a larger plan.',
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * A null plan (the tenant was left without one, `onDelete: SetNull`) blocks
   * nothing — refusing everything to a company because of a row deleted in the
   * platform panel would be worse than the problem. Concurrent sessions stay
   * closed either way: that permission has to be granted, never presumed.
   */
  private async loadPlan(db: Prisma.TransactionClient, tenantId: string): Promise<Plan | null> {
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    return tenant?.plan ?? null;
  }

  private countUsers(db: Prisma.TransactionClient, tenantId: string): Promise<number> {
    return db.user.count({ where: { tenantId, deletedAt: null, active: true } });
  }

  /** `hashtext` gives a stable int32; the label keeps this lock off the others. */
  private async lock(db: Prisma.TransactionClient, key: string): Promise<void> {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
}
