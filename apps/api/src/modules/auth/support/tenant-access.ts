import { ForbiddenException } from '@nestjs/common';
import type { Plan, Tenant } from '@prisma/client';
import type { TenantDto } from '@dontpanic/shared';

/**
 * The slice of a tenant the access decision needs. Taking a narrow `select`
 * avoids loading the whole row on every request.
 */
export interface TenantAccessState {
  status: Tenant['status'];
  trialEndsAt: Date | null;
  deletedAt?: Date | null;
}

/**
 * Decides whether a user of the company may use the API.
 *
 * The same predicate at login and on every authenticated request: a suspended,
 * cancelled or trial-expired company neither gets in nor continues. The
 * messages are sober and distinguish only what the customer needs in order to
 * act — no dates, no internal reasons, no billing state.
 */
export function assertTenantAllowed(tenant: TenantAccessState | null): void {
  if (!tenant || tenant.deletedAt) {
    throw new ForbiddenException('The company for this account is not available.');
  }

  switch (tenant.status) {
    case 'SUSPENDED':
      throw new ForbiddenException(
        'Your company’s access is suspended. Contact support to resolve it.',
      );
    case 'CANCELED':
      throw new ForbiddenException(
        'Your company’s subscription was cancelled. Contact support to reactivate it.',
      );
    case 'TRIAL':
      if (tenant.trialEndsAt && tenant.trialEndsAt.getTime() <= Date.now()) {
        throw new ForbiddenException(
          'Your company’s trial has ended. Contact support to choose a plan.',
        );
      }
      return;
    default:
      return;
  }
}

/** Maps a tenant row onto the public contract. */
export function toTenantDto(tenant: Tenant, plan?: Pick<Plan, 'name'> | null): TenantDto {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    legalName: tenant.legalName,
    taxId: tenant.taxId,
    email: tenant.email,
    phone: tenant.phone,
    status: tenant.status,
    trialEndsAt: tenant.trialEndsAt ? tenant.trialEndsAt.toISOString() : null,
    planId: tenant.planId,
    planName: plan?.name ?? null,
    locale: tenant.locale,
    currency: tenant.currency,
    timezone: tenant.timezone,
    createdAt: tenant.createdAt.toISOString(),
  };
}
