import type { Prisma, Tenant } from '@prisma/client';
import { SYSTEM_PROFILES, permissionsForProfile } from '@dontpanic/shared';

/**
 * Bringing a company into existence.
 *
 * Extracted because three unrelated doors now lead here — public signup, the
 * operator creating a company from the platform panel, and an unknown social
 * identity finishing its registration — and a company created by one of them
 * has to be indistinguishable from a company created by the others. When this
 * lived inside SignupService, "add the same profiles the seed adds" was a rule
 * enforced by whoever remembered it.
 *
 * Always called inside a transaction the caller already opened. That is not a
 * convenience: a company with no profiles, or with profiles but no
 * administrator, is an orphan nobody else knows how to repair, so the caller
 * gets to decide what else lives or dies with it (the first user, the legal
 * acceptance, the invitation).
 */

/** How long a trial runs when no plan says otherwise. */
export const FALLBACK_TRIAL_DAYS = 14;

export interface ProvisionTenantInput {
  slug: string;
  name: string;
  email: string;
  legalName?: string | null;
  taxId?: string | null;
  phone?: string | null;
  locale?: string;
  currency?: string;
  timezone?: string;
  /** TRIAL unless the caller is an operator recording a closed sale. */
  status?: 'TRIAL' | 'ACTIVE';
  /** Explicit plan, or null to fall back to whichever plan is `isDefault`. */
  planId?: string | null;
  /** Overrides the plan's own `trialDays`. Ignored when status is not TRIAL. */
  trialDays?: number;
}

export interface ProvisionedTenant {
  tenant: Tenant;
  /** The ADMIN profile's id — what the first user is attached to. */
  adminProfileId: string | null;
  planName: string | null;
}

/**
 * Creates the tenant row and its system profiles, with permissions.
 *
 * The profiles come from the same shared matrix the seed reads
 * (`SYSTEM_PROFILES` + `permissionsForProfile`), so a company created here and
 * one created by `db:seed` cannot drift apart — which they did, quietly, for as
 * long as the two lists were written out twice.
 */
export async function provisionTenant(
  tx: Prisma.TransactionClient,
  input: ProvisionTenantInput,
): Promise<ProvisionedTenant> {
  const plan = input.planId
    ? await tx.plan.findFirst({ where: { id: input.planId, active: true } })
    : await tx.plan.findFirst({ where: { isDefault: true, active: true } });

  const status = input.status ?? 'TRIAL';
  // A company the operator marked ACTIVE has no trial to end. Leaving a date on
  // it would arm `assertTenantAllowed` to lock out a paying customer the moment
  // a date nobody meant to set went by.
  const trialDays = input.trialDays ?? plan?.trialDays ?? FALLBACK_TRIAL_DAYS;
  const trialEndsAt =
    status === 'TRIAL' ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null;

  const tenant = await tx.tenant.create({
    data: {
      slug: input.slug,
      name: input.name,
      email: input.email,
      legalName: input.legalName ?? null,
      taxId: input.taxId ?? null,
      phone: input.phone ?? null,
      status,
      trialEndsAt,
      planId: plan?.id ?? null,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
    },
  });

  let adminProfileId: string | null = null;
  for (const { code, name } of SYSTEM_PROFILES) {
    const profile = await tx.profile.create({
      data: { tenantId: tenant.id, code, name, system: true },
    });
    if (code === 'ADMIN') adminProfileId = profile.id;
    const permissions = permissionsForProfile(code);
    if (permissions.length > 0) {
      await tx.permission.createMany({
        data: permissions.map((p) => ({ profileId: profile.id, ...p })),
      });
    }
  }

  return { tenant, adminProfileId, planName: plan?.name ?? null };
}
