import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PlanDto, UpsertPlanInput } from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { runAsPlatform } from '../support/platform-scope';

type PlanRow = Prisma.PlanGetPayload<Record<string, never>>;

function toDto(plan: PlanRow): PlanDto {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    currency: plan.currency,
    trialDays: plan.trialDays,
    maxUsers: plan.maxUsers,
    maxStorageMb: plan.maxStorageMb,
    active: plan.active,
  };
}

/** Plans are global, not per tenant — only the operator touches them. */
@Injectable()
export class PlatformPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PlanDto[]> {
    const rows = await runAsPlatform(this.prisma, (tx) =>
      tx.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] }),
    );
    return rows.map(toDto);
  }

  async create(input: UpsertPlanInput): Promise<PlanDto> {
    return runAsPlatform(this.prisma, async (tx) => {
      await this.clearDefaultIfNeeded(tx, input.isDefault);
      try {
        return toDto(await tx.plan.create({ data: this.toData(input) }));
      } catch (error) {
        throw this.translate(error);
      }
    });
  }

  async update(id: string, input: UpsertPlanInput): Promise<PlanDto> {
    return runAsPlatform(this.prisma, async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Plan not found');
      await this.clearDefaultIfNeeded(tx, input.isDefault, id);
      try {
        return toDto(await tx.plan.update({ where: { id }, data: this.toData(input) }));
      } catch (error) {
        throw this.translate(error);
      }
    });
  }

  private toData(input: UpsertPlanInput): Prisma.PlanCreateInput {
    return {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents,
      currency: input.currency,
      trialDays: input.trialDays,
      maxUsers: input.maxUsers ?? null,
      maxStorageMb: input.maxStorageMb ?? null,
      ...(input.limits ? { limits: input.limits } : {}),
      ...(input.features ? { features: input.features } : {}),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      ...(input.active === undefined ? {} : { active: input.active }),
    };
  }

  /**
   * Exactly one plan may be the default — it is what a public signup lands on.
   * Clearing the old one in the same transaction keeps that true even if two
   * operators tick the box at once.
   */
  private async clearDefaultIfNeeded(
    tx: Prisma.TransactionClient,
    isDefault: boolean | undefined,
    exceptId?: string,
  ): Promise<void> {
    if (!isDefault) return;
    await tx.plan.updateMany({
      where: { isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }

  private translate(error: unknown): unknown {
    const known = error as { code?: string };
    if (known?.code === 'P2002') return new BadRequestException('A plan with that code exists');
    return error;
  }
}
