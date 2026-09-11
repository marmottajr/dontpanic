import { ForbiddenException } from '@nestjs/common';
import type { Tenant } from '@prisma/client';
import { assertTenantAllowed, toTenantDto, type TenantAccessState } from './tenant-access';

const DAY = 24 * 60 * 60 * 1000;

const state = (over: Partial<TenantAccessState> = {}): TenantAccessState => ({
  status: 'ACTIVE',
  trialEndsAt: null,
  deletedAt: null,
  ...over,
});

/** Everything the message must never contain: dates, reasons, billing internals. */
function expectSoberMessage(run: () => void): string {
  let message = '';
  try {
    run();
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no ISO date
  expect(message).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/); // no formatted date
  expect(message).not.toMatch(/invoice|payment|overdue|chargeback|fraud|reason|plan_/i);
  return message;
}

describe('assertTenantAllowed', () => {
  it('lets an active company through', () => {
    expect(() => assertTenantAllowed(state())).not.toThrow();
  });

  it('lets a trial that is still running through', () => {
    expect(() =>
      assertTenantAllowed(state({ status: 'TRIAL', trialEndsAt: new Date(Date.now() + DAY) })),
    ).not.toThrow();
  });

  it('lets a trial with no end date through', () => {
    expect(() => assertTenantAllowed(state({ status: 'TRIAL', trialEndsAt: null }))).not.toThrow();
  });

  it('refuses a suspended company', () => {
    const run = () => assertTenantAllowed(state({ status: 'SUSPENDED' }));
    expect(run).toThrow(ForbiddenException);
    expect(expectSoberMessage(run)).toMatch(/suspended/i);
  });

  it('refuses a cancelled company', () => {
    const run = () => assertTenantAllowed(state({ status: 'CANCELED' }));
    expect(run).toThrow(ForbiddenException);
    expect(expectSoberMessage(run)).toMatch(/cancelled/i);
  });

  it('refuses a company whose trial has ended, without naming the date', () => {
    const run = () =>
      assertTenantAllowed(
        state({ status: 'TRIAL', trialEndsAt: new Date('2020-01-02T03:04:05.000Z') }),
      );
    expect(run).toThrow(ForbiddenException);
    expect(expectSoberMessage(run)).toMatch(/trial has ended/i);
  });

  it('refuses a trial that expires exactly now — the boundary closes the door', () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect(() =>
        assertTenantAllowed(state({ status: 'TRIAL', trialEndsAt: new Date(now) })),
      ).toThrow(ForbiddenException);
    } finally {
      clock.mockRestore();
    }
  });

  it('refuses a soft-deleted company, whatever its status says', () => {
    const run = () => assertTenantAllowed(state({ deletedAt: new Date() }));
    expect(run).toThrow(ForbiddenException);
    expect(expectSoberMessage(run)).toMatch(/not available/i);
  });

  it('refuses when there is no company row at all', () => {
    // A forged tenant id finds nothing under RLS: that has to be a refusal.
    const run = () => assertTenantAllowed(null);
    expect(run).toThrow(ForbiddenException);
    expect(expectSoberMessage(run)).toMatch(/not available/i);
  });

  it('accepts the narrow shape without the optional deletedAt', () => {
    expect(() => assertTenantAllowed({ status: 'ACTIVE', trialEndsAt: null })).not.toThrow();
  });

  it('never says which of the refusals happened in the same words', () => {
    const messages = (['SUSPENDED', 'CANCELED'] as const).map((status) =>
      expectSoberMessage(() => assertTenantAllowed(state({ status }))),
    );
    expect(new Set(messages).size).toBe(2);
  });
});

describe('toTenantDto', () => {
  const tenant = (over: Partial<Tenant> = {}): Tenant =>
    ({
      id: 't-1',
      slug: 'acme',
      name: 'Acme',
      legalName: 'Acme Ltda',
      taxId: '12345678000199',
      email: 'contact@acme.test',
      phone: '+55 11 99999-0000',
      status: 'ACTIVE',
      trialEndsAt: null,
      planId: 'plan-1',
      locale: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date('2024-03-01T10:00:00.000Z'),
      updatedAt: new Date('2024-03-02T10:00:00.000Z'),
      deletedAt: null,
      suspendedAt: null,
      suspendedReason: 'fraud investigation',
      canceledAt: null,
      ...over,
    }) as Tenant;

  it('maps the row onto the public contract with dates as ISO strings', () => {
    const dto = toTenantDto(tenant(), { name: 'Pro' });
    expect(dto).toEqual({
      id: 't-1',
      slug: 'acme',
      name: 'Acme',
      legalName: 'Acme Ltda',
      taxId: '12345678000199',
      email: 'contact@acme.test',
      phone: '+55 11 99999-0000',
      status: 'ACTIVE',
      trialEndsAt: null,
      planId: 'plan-1',
      planName: 'Pro',
      locale: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      createdAt: '2024-03-01T10:00:00.000Z',
    });
  });

  it('serialises the trial end date when there is one', () => {
    const dto = toTenantDto(tenant({ trialEndsAt: new Date('2024-04-01T00:00:00.000Z') }));
    expect(dto.trialEndsAt).toBe('2024-04-01T00:00:00.000Z');
  });

  it('reports a null plan name when the tenant has no plan', () => {
    expect(toTenantDto(tenant(), null).planName).toBeNull();
    expect(toTenantDto(tenant()).planName).toBeNull();
  });

  it('never leaks the internal suspension bookkeeping', () => {
    const dto = toTenantDto(tenant({ status: 'SUSPENDED', suspendedAt: new Date() }), null);
    expect(dto).not.toHaveProperty('suspendedReason');
    expect(dto).not.toHaveProperty('suspendedAt');
    expect(dto).not.toHaveProperty('deletedAt');
    expect(JSON.stringify(dto)).not.toContain('fraud investigation');
  });
});
