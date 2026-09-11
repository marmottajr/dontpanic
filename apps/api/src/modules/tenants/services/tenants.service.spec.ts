import { NotFoundException } from '@nestjs/common';
import { makePrismaMock } from '../../../../test/prisma-mock';
import { TenantContext } from '../../../infra/tenancy/tenant-context';
import { TenantsService } from './tenants.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

const tenantRow = (overrides: Record<string, unknown> = {}) => ({
  id: TENANT_ID,
  slug: 'acme',
  name: 'Acme',
  legalName: null,
  taxId: null,
  email: 'a@acme.test',
  phone: null,
  status: 'ACTIVE' as const,
  trialEndsAt: null,
  planId: null,
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  plan: null,
  ...overrides,
});

describe('TenantsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: TenantsService;

  const inTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    TenantContext.run({ scope: { kind: 'tenant', tenantId: TENANT_ID } }, fn);

  beforeEach(() => {
    prisma = makePrismaMock({
      tenant: { findUnique: jest.fn(), update: jest.fn() },
      tenantBranding: { findUnique: jest.fn(), upsert: jest.fn() },
    });
    service = new TenantsService(prisma as never);
  });

  describe('me', () => {
    it('reads the company from the scope, never from an argument', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantRow({ plan: { name: 'Free' } }));
      const dto = await inTenant(() => service.me());

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TENANT_ID } }),
      );
      expect(dto.planName).toBe('Free');
    });

    it('refuses outside a tenant scope instead of picking a default', async () => {
      // A silent default here would be a cross-company read.
      await expect(service.me()).rejects.toThrow(/No tenant in context/);
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('reports a company the scope cannot see as not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(inTenant(() => service.me())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('flattens the nested address onto the row', async () => {
      prisma.tenant.update.mockResolvedValue(tenantRow());
      await inTenant(() =>
        service.update({ name: 'Acme Ltd', address: { city: 'Lisbon', country: 'PT' } }),
      );

      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          data: expect.objectContaining({ name: 'Acme Ltd', city: 'Lisbon', country: 'PT' }),
        }),
      );
    });

    it('works with no address at all', async () => {
      prisma.tenant.update.mockResolvedValue(tenantRow());
      await inTenant(() => service.update({ name: 'Acme Ltd' }));
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Acme Ltd' } }),
      );
    });

    it('cannot be told which company to update', async () => {
      await expect(service.update({ name: 'Elsewhere' })).rejects.toThrow(/No tenant in context/);
    });
  });

  describe('plan', () => {
    const planRow = {
      id: '99999999-9999-9999-9999-999999999999',
      code: 'free',
      name: 'Free',
      description: null,
      priceCents: 0,
      currency: 'BRL',
      trialDays: 14,
      maxUsers: 5,
      maxStorageMb: null,
      active: true,
    };

    it('returns null when the company has no plan attached', async () => {
      // `Tenant.planId` is onDelete: SetNull, so a plan deleted in the platform
      // panel leaves the company planless rather than dangling.
      prisma.tenant.findUnique.mockResolvedValue({ plan: null });
      await expect(inTenant(() => service.plan())).resolves.toBeNull();
    });

    it('returns the commercial shape of the plan, not its internals', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        plan: { ...planRow, limits: {}, features: {} },
      });
      const dto = await inTenant(() => service.plan());

      expect(dto).toEqual(planRow);
      // `limits` and `features` are enforcement details, not public contract.
      expect(dto).not.toHaveProperty('limits');
      expect(dto).not.toHaveProperty('features');
    });

    it('refuses outside a tenant scope', async () => {
      await expect(service.plan()).rejects.toThrow(/No tenant in context/);
    });
  });

  describe('branding', () => {
    const row = {
      logoUrl: null,
      primaryColor: '#0D9488',
      secondaryColor: '#D97706',
      typography: null,
      documentFooter: null,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    it('returns null when the company never set any', async () => {
      prisma.tenantBranding.findUnique.mockResolvedValue(null);
      await expect(inTenant(() => service.branding())).resolves.toBeNull();
    });

    it('serialises the timestamp', async () => {
      prisma.tenantBranding.findUnique.mockResolvedValue(row);
      const dto = await inTenant(() => service.branding());
      expect(dto?.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('upserts, so the first save and later edits take the same path', async () => {
      prisma.tenantBranding.upsert.mockResolvedValue(row);
      await inTenant(() =>
        service.saveBranding({ primaryColor: '#111111', secondaryColor: '#222222' }),
      );

      const call = prisma.tenantBranding.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ tenantId: TENANT_ID });
      expect(call.create).toMatchObject({ tenantId: TENANT_ID, primaryColor: '#111111' });
      // Optional fields become explicit nulls rather than being left untouched:
      // clearing a logo has to actually clear it.
      expect(call.update).toMatchObject({ logoUrl: null, typography: null, documentFooter: null });
    });

    it('refuses to save outside a tenant scope', async () => {
      await expect(
        service.saveBranding({ primaryColor: '#111111', secondaryColor: '#222222' }),
      ).rejects.toThrow(/No tenant in context/);
    });
  });
});
