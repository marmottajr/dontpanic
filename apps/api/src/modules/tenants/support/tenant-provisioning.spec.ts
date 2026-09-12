import type { Prisma } from '@prisma/client';
import { SYSTEM_PROFILES, permissionsForProfile } from '@dontpanic/shared';
import { FALLBACK_TRIAL_DAYS, provisionTenant } from './tenant-provisioning';

/**
 * A transaction client with just the four calls this helper makes. Narrow on
 * purpose: a fuller fake would let the helper start using something else
 * without the test noticing.
 */
function makeTx() {
  const created: { profiles: unknown[]; permissions: unknown[] } = {
    profiles: [],
    permissions: [],
  };
  let profileSeq = 0;

  const tx = {
    plan: { findFirst: jest.fn().mockResolvedValue(null) },
    tenant: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'tenant-1', ...data })),
    },
    profile: {
      create: jest.fn().mockImplementation(({ data }) => {
        const row = { id: `profile-${++profileSeq}`, ...data };
        created.profiles.push(row);
        return row;
      }),
    },
    permission: {
      createMany: jest.fn().mockImplementation(({ data }) => {
        created.permissions.push(...data);
        return { count: data.length };
      }),
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, spy: tx, created };
}

const BASE = { slug: 'acme', name: 'Acme', email: 'ops@acme.test' };

describe('provisionTenant', () => {
  it('creates the tenant with the caller’s details', async () => {
    const { tx, spy } = makeTx();

    await provisionTenant(tx, {
      ...BASE,
      legalName: 'Acme Ltda',
      taxId: '123',
      phone: '+55 11 0000-0000',
      locale: 'en-US',
      currency: 'USD',
      timezone: 'UTC',
    });

    expect(spy.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'acme',
        name: 'Acme',
        email: 'ops@acme.test',
        legalName: 'Acme Ltda',
        taxId: '123',
        phone: '+55 11 0000-0000',
        locale: 'en-US',
        currency: 'USD',
        timezone: 'UTC',
      }),
    });
  });

  it('leaves locale, currency and timezone to the schema defaults when unset', async () => {
    const { tx, spy } = makeTx();
    await provisionTenant(tx, BASE);

    const { data } = spy.tenant.create.mock.calls[0][0];
    // Absent, not null: passing null would overwrite the column default with
    // nothing and leave a tenant with no locale at all.
    expect(data).not.toHaveProperty('locale');
    expect(data).not.toHaveProperty('currency');
    expect(data).not.toHaveProperty('timezone');
  });

  // The whole reason this helper was extracted: signup, the platform panel and
  // the OAuth completion must all produce the same company, with the same
  // profiles the seed writes.
  it('creates every system profile with the shared permission matrix', async () => {
    const { tx, created } = makeTx();
    await provisionTenant(tx, BASE);

    expect(created.profiles).toHaveLength(SYSTEM_PROFILES.length);
    for (const { code } of SYSTEM_PROFILES) {
      expect(created.profiles).toContainEqual(
        expect.objectContaining({ code, system: true, tenantId: 'tenant-1' }),
      );
    }

    const expected = SYSTEM_PROFILES.flatMap(({ code }) => permissionsForProfile(code));
    expect(created.permissions).toHaveLength(expected.length);
  });

  it('returns the ADMIN profile id, which is what the first user hangs off', async () => {
    const { tx, created } = makeTx();
    const { adminProfileId } = await provisionTenant(tx, BASE);

    const admin = created.profiles.find((p) => (p as { code: string }).code === 'ADMIN');
    expect(adminProfileId).toBe((admin as { id: string }).id);
  });

  it('skips createMany for a profile whose matrix row is empty', async () => {
    const { tx, spy } = makeTx();
    await provisionTenant(tx, BASE);

    const withPermissions = SYSTEM_PROFILES.filter(
      ({ code }) => permissionsForProfile(code).length > 0,
    );
    expect(spy.permission.createMany).toHaveBeenCalledTimes(withPermissions.length);
  });

  describe('trial and plan', () => {
    it('falls back to the default plan when none is named', async () => {
      const { tx, spy } = makeTx();
      spy.plan.findFirst.mockResolvedValue({ id: 'plan-default', name: 'Free', trialDays: 30 });

      const { planName } = await provisionTenant(tx, BASE);

      expect(spy.plan.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, active: true },
      });
      expect(planName).toBe('Free');
      expect(spy.tenant.create.mock.calls[0][0].data.planId).toBe('plan-default');
    });

    it('takes the named plan when the caller chose one', async () => {
      const { tx, spy } = makeTx();
      spy.plan.findFirst.mockResolvedValue({ id: 'plan-pro', name: 'Pro', trialDays: 7 });

      await provisionTenant(tx, { ...BASE, planId: 'plan-pro' });

      // An inactive plan must not be adopted just because someone passed its id.
      expect(spy.plan.findFirst).toHaveBeenCalledWith({
        where: { id: 'plan-pro', active: true },
      });
    });

    it('uses the fallback trial length when no plan exists at all', async () => {
      const { tx, spy } = makeTx();
      const before = Date.now();

      await provisionTenant(tx, BASE);

      const { trialEndsAt } = spy.tenant.create.mock.calls[0][0].data;
      const days = (trialEndsAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(days).toBeCloseTo(FALLBACK_TRIAL_DAYS, 1);
    });

    it("prefers the caller's trialDays over the plan's", async () => {
      const { tx, spy } = makeTx();
      spy.plan.findFirst.mockResolvedValue({ id: 'p', name: 'Free', trialDays: 30 });
      const before = Date.now();

      await provisionTenant(tx, { ...BASE, trialDays: 3 });

      const { trialEndsAt } = spy.tenant.create.mock.calls[0][0].data;
      const days = (trialEndsAt.getTime() - before) / (24 * 60 * 60 * 1000);
      expect(days).toBeCloseTo(3, 1);
    });

    // A company the operator marked ACTIVE has no trial to end. Leaving a date
    // on it would arm assertTenantAllowed to lock out a paying customer the
    // moment a date nobody meant to set went by.
    it('leaves an ACTIVE company with no trial end date', async () => {
      const { tx, spy } = makeTx();
      spy.plan.findFirst.mockResolvedValue({ id: 'p', name: 'Pro', trialDays: 30 });

      await provisionTenant(tx, { ...BASE, status: 'ACTIVE' });

      expect(spy.tenant.create.mock.calls[0][0].data).toMatchObject({
        status: 'ACTIVE',
        trialEndsAt: null,
      });
    });

    it('defaults to TRIAL when the caller says nothing', async () => {
      const { tx, spy } = makeTx();
      await provisionTenant(tx, BASE);
      expect(spy.tenant.create.mock.calls[0][0].data.status).toBe('TRIAL');
    });
  });
});
