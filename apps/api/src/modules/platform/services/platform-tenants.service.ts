import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Tenant } from '@prisma/client';
import type {
  ChangePlanInput,
  ExtendTrialInput,
  Paginated,
  PlatformTenantDto,
  PlatformTenantListQuery,
  SuspendTenantInput,
} from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { runAsPlatform, type PlatformActor } from '../support/platform-scope';
import { writePlatformAudit } from '../support/platform-audit';

type TenantWithCount = Tenant & { _count: { users: number }; plan: { name: string } | null };

function toDto(tenant: TenantWithCount): PlatformTenantDto {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    legalName: tenant.legalName,
    taxId: tenant.taxId,
    email: tenant.email,
    phone: tenant.phone,
    status: tenant.status,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    planId: tenant.planId,
    planName: tenant.plan?.name ?? null,
    locale: tenant.locale,
    currency: tenant.currency,
    timezone: tenant.timezone,
    createdAt: tenant.createdAt.toISOString(),
    userCount: tenant._count.users,
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    suspendedReason: tenant.suspendedReason,
    canceledAt: tenant.canceledAt?.toISOString() ?? null,
  };
}

const INCLUDE = { _count: { select: { users: true } }, plan: { select: { name: true } } } as const;

/**
 * The operator's view of the customer base. Everything here runs in platform
 * scope — the only scope that crosses companies — and every change writes its
 * audit row in the same transaction (see `writePlatformAudit`).
 */
@Injectable()
export class PlatformTenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PlatformTenantListQuery): Promise<Paginated<PlatformTenantDto>> {
    const { page, limit, status, search } = query;
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { slug: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    return runAsPlatform(this.prisma, async (tx) => {
      const [total, rows] = await Promise.all([
        tx.tenant.count({ where }),
        tx.tenant.findMany({
          where,
          include: INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return {
        items: rows.map(toDto),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    });
  }

  async get(id: string): Promise<PlatformTenantDto> {
    const tenant = await runAsPlatform(this.prisma, (tx) =>
      tx.tenant.findFirst({ where: { id, deletedAt: null }, include: INCLUDE }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');
    return toDto(tenant);
  }

  async suspend(
    id: string,
    input: SuspendTenantInput,
    actor: PlatformActor,
  ): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.suspend', () => ({
      status: 'SUSPENDED' as const,
      suspendedAt: new Date(),
      suspendedReason: input.reason,
    }));
  }

  async reactivate(id: string, actor: PlatformActor): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.reactivate', () => ({
      status: 'ACTIVE' as const,
      suspendedAt: null,
      suspendedReason: null,
      canceledAt: null,
    }));
  }

  async extendTrial(
    id: string,
    input: ExtendTrialInput,
    actor: PlatformActor,
  ): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.extend_trial', (current) => {
      // Extend from whichever is later: an expired trial extends from today,
      // a live one from its current end. Otherwise "add 7 days" to a trial that
      // ended a month ago would still leave it expired.
      const from =
        current.trialEndsAt && current.trialEndsAt.getTime() > Date.now()
          ? current.trialEndsAt
          : new Date();
      return {
        status: 'TRIAL' as const,
        trialEndsAt: new Date(from.getTime() + input.days * 24 * 60 * 60 * 1000),
      };
    });
  }

  async changePlan(
    id: string,
    input: ChangePlanInput,
    actor: PlatformActor,
  ): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.change_plan', async (current, tx) => {
      const plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan) throw new BadRequestException('Plan not found');
      // Moving to a smaller plan is allowed even when the company is over the
      // new limit: the operator is fixing a commercial fact, and blocking the
      // change would leave them stuck. The limit then bites on the next create.
      return {
        planId: plan.id,
        ...(current.status === 'TRIAL' ? { status: 'ACTIVE' as const } : {}),
      };
    });
  }

  /** Every state change takes the same shape: read, patch, audit — atomically. */
  private async transition(
    id: string,
    actor: PlatformActor,
    action: string,
    patch: (
      current: Tenant,
      tx: Prisma.TransactionClient,
    ) => Prisma.TenantUpdateInput | Promise<Prisma.TenantUpdateInput>,
  ): Promise<PlatformTenantDto> {
    return runAsPlatform(this.prisma, async (tx) => {
      const current = await tx.tenant.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Tenant not found');

      const data = await patch(current, tx);
      const updated = await tx.tenant.update({ where: { id }, data, include: INCLUDE });

      await writePlatformAudit(tx, {
        action,
        tenantId: id,
        actor,
        valuesBefore: { status: current.status, planId: current.planId },
        valuesAfter: { status: updated.status, planId: updated.planId },
      });

      return toDto(updated);
    });
  }
}
