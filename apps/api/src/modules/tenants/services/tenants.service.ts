import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  PlanDto,
  TenantBrandingDto,
  TenantBrandingInput,
  TenantDto,
  UpdateTenantInput,
} from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';
import { toTenantDto } from '../../auth/support/tenant-access';

/**
 * What a company can see and change about itself.
 *
 * Every read and write here goes through `prisma.db`, which is the request's
 * scoped transaction — so the tenant id is never a parameter and never comes
 * from the client. `TenantContext.requireTenantId()` throws rather than
 * defaulting, because a silent default here would be a cross-company write.
 */
@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async me(): Promise<TenantDto> {
    const tenantId = TenantContext.requireTenantId();
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: { select: { name: true } } },
    });
    if (!tenant) throw new NotFoundException('Company not found');
    return toTenantDto(tenant, tenant.plan);
  }

  async update(input: UpdateTenantInput): Promise<TenantDto> {
    const tenantId = TenantContext.requireTenantId();
    const { address, ...rest } = input;

    // The address arrives as a nested object in the contract but is flat in the
    // table — spreading it here keeps the API shape from leaking the schema.
    const data: Prisma.TenantUpdateInput = { ...rest, ...(address ?? {}) };

    const tenant = await this.prisma.db.tenant.update({
      where: { id: tenantId },
      data,
      include: { plan: { select: { name: true } } },
    });
    return toTenantDto(tenant, tenant.plan);
  }

  /**
   * The company's current plan, or null when it has none. Separate from
   * `plan-usage`: this is the commercial shape of the plan, that one is how
   * much of it is spent — a screen usually wants one without the other.
   */
  async plan(): Promise<PlanDto | null> {
    const tenantId = TenantContext.requireTenantId();
    const row = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });
    const plan = row?.plan;
    if (!plan) return null;
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

  async branding(): Promise<TenantBrandingDto | null> {
    const tenantId = TenantContext.requireTenantId();
    const row = await this.prisma.db.tenantBranding.findUnique({ where: { tenantId } });
    if (!row) return null;
    return {
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      typography: row.typography,
      documentFooter: row.documentFooter,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async saveBranding(input: TenantBrandingInput): Promise<TenantBrandingDto> {
    const tenantId = TenantContext.requireTenantId();
    const data = {
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      typography: input.typography ?? null,
      documentFooter: input.documentFooter ?? null,
    };
    const row = await this.prisma.db.tenantBranding.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return {
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      typography: row.typography,
      documentFooter: row.documentFooter,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
