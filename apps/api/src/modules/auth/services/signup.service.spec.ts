import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { LEGAL_VERSIONS } from '@dontpanic/shared';
import { SignupService } from './signup.service';

jest.mock('argon2');

const INPUT = {
  companyName: 'Sirius Cybernetics',
  slug: 'sirius-cybernetics',
  name: 'Marvin',
  email: 'marvin@sirius.dev',
  password: 'Sup3rSecret!',
  acceptTerms: true as const,
};

const ctx = { ip: '1.2.3.4', userAgent: 'UA', locale: 'en' as const };

/** One write the service asked the database to perform, in order. */
interface Write {
  table: string;
  data: Record<string, unknown>;
  /** Which `asSystem()` call was in flight — i.e. which transaction. */
  scope: number;
}

/**
 * A scoped-client double that records what landed, in the order it landed and
 * under the transaction it landed in.
 *
 * Signup's whole point is that a company, its profiles and its first user are
 * written together or not at all — a claim about *which transaction* the writes
 * went through, not about how many times some mock was called. So the double
 * keeps the rows and stamps each with the scope that was open.
 */
function makeStore(plan: Record<string, unknown> | null) {
  const writes: Write[] = [];
  let scope = 0;
  let sequence = 0;

  const create = (table: string) =>
    jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      sequence += 1;
      // createdAt/updatedAt stand in for the defaults Postgres fills in; the DTO
      // mappers read them, so a double without them is not a row.
      const row = {
        id: `${table}-${sequence}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      writes.push({ table, data: row, scope });
      return row;
    });
  const createMany = (table: string) =>
    jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      for (const row of data) writes.push({ table, data: row, scope });
      return { count: data.length };
    });

  const tx = {
    plan: { findFirst: jest.fn().mockResolvedValue(plan) },
    tenant: { findUnique: jest.fn().mockResolvedValue(null), create: create('tenant') },
    profile: { create: create('profile') },
    permission: { createMany: createMany('permission') },
    user: { findUnique: jest.fn().mockResolvedValue(null), create: create('user') },
    legalAcceptance: { createMany: createMany('legalAcceptance') },
  };

  return {
    tx,
    writes,
    rows: (table: string) => writes.filter((w) => w.table === table),
    enterScope: () => {
      scope += 1;
    },
  };
}

describe('SignupService', () => {
  const mockedArgon = argon2 as jest.Mocked<typeof argon2>;

  let prisma: any;
  let auth: any;
  let service: SignupService;
  let store: ReturnType<typeof makeStore>;

  /** Wires the doubles; `plan` is what `plan.findFirst` returns inside the tx. */
  function setup(plan: Record<string, unknown> | null = null, publicSignupEnabled = true) {
    store = makeStore(plan);
    prisma = {
      asSystem: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        store.enterScope();
        return fn(store.tx);
      }),
    };
    auth = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      audit: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: () => publicSignupEnabled } as never;
    service = new SignupService(prisma, config, auth);
  }

  beforeEach(() => {
    mockedArgon.hash.mockResolvedValue('hashed-pw');
    setup({ id: 'plan-1', name: 'Starter', trialDays: 30 });
  });

  // --- what signup refuses ------------------------------------------------

  // The flag is a deployment decision, and the API is the half that enforces
  // it: the web app's NEXT_PUBLIC_SIGNUP_ENABLED can disagree or be stale, and
  // a form rendering against a closed API must not be able to create anything.
  it('refuses every public signup when registration is closed, before any work', async () => {
    setup({ id: 'plan-1', name: 'Starter', trialDays: 30 }, false);

    await expect(service.signup(INPUT, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.signup(INPUT, ctx)).rejects.toThrow('Public registration is closed.');
    // Not one read, not one hash: the refusal happens before the database and
    // before argon2, so a closed deployment is not also a free CPU burner.
    expect(prisma.asSystem).not.toHaveBeenCalled();
    expect(mockedArgon.hash).not.toHaveBeenCalled();
  });

  it('refuses a reserved slug without touching the database', async () => {
    await expect(service.signup({ ...INPUT, slug: 'admin' }, ctx)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.asSystem).not.toHaveBeenCalled();
  });

  it('refuses a slug another company already holds', async () => {
    store.tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-existing' });
    await expect(service.signup(INPUT, ctx)).rejects.toThrow('This address is not available');
    expect(store.writes).toHaveLength(0);
  });

  it('refuses an e-mail that already has an account', async () => {
    store.tx.user.findUnique.mockResolvedValue({ id: 'user-existing' });
    await expect(service.signup(INPUT, ctx)).rejects.toThrow(
      'An account with this email already exists',
    );
    expect(store.writes).toHaveLength(0);
  });

  // The pre-check above is a courtesy; it cannot see a signup that is still in
  // flight. Postgres is what actually decides, and its verdict arrives as a
  // unique violation that has to read like the friendly message, not like a 500.
  it('turns a losing race on the slug into the same 409', async () => {
    store.tx.tenant.create.mockRejectedValue(uniqueViolation('tenants_slug_key'));
    await expect(service.signup(INPUT, ctx)).rejects.toThrow('This address is not available');
  });

  it('turns a losing race on the e-mail into the same 409', async () => {
    store.tx.user.create.mockRejectedValue(uniqueViolation('users_email_key'));
    await expect(service.signup(INPUT, ctx)).rejects.toThrow(
      'An account with this email already exists',
    );
  });

  // Not every driver reports which constraint blew up. With nothing to read,
  // the address message is the safe guess: it names no account.
  it('falls back to the slug message when the violation names no constraint', async () => {
    store.tx.tenant.create.mockRejectedValue(uniqueViolation());
    await expect(service.signup(INPUT, ctx)).rejects.toThrow('This address is not available');
  });

  it('lets any other failure through untranslated', async () => {
    store.tx.tenant.create.mockRejectedValue(new Error('connection reset'));
    await expect(service.signup(INPUT, ctx)).rejects.toThrow('connection reset');
  });

  function uniqueViolation(target?: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: target ? { target } : undefined,
    });
  }

  // --- what signup creates ------------------------------------------------

  it('creates the company, its profiles and its first admin in ONE transaction', async () => {
    const result = await service.signup({ ...INPUT, taxId: '42', companyPhone: '+55 11' }, ctx);

    // Every row landed in the same transaction — no half-built company can
    // survive a failure half-way through.
    expect(new Set(store.writes.map((w) => w.scope)).size).toBe(1);
    // …and in an order the foreign keys allow: the company before what hangs
    // off it, the profile before the user that points at it.
    expect(collapse(store.writes.map((w) => w.table))).toEqual([
      'tenant',
      'profile',
      'permission',
      'profile',
      'permission',
      'user',
      'legalAcceptance',
    ]);

    const tenant = store.rows('tenant')[0].data;
    expect(tenant).toMatchObject({
      slug: INPUT.slug,
      name: INPUT.companyName,
      email: INPUT.email,
      phone: '+55 11',
      taxId: '42',
      status: 'TRIAL',
      planId: 'plan-1',
    });

    // Both system profiles, flagged so nobody can delete the one that
    // administers the company.
    const profiles = store.rows('profile').map((w) => w.data);
    expect(profiles.map((p) => p.code)).toEqual(['ADMIN', 'MEMBER']);
    expect(profiles.every((p) => p.system === true)).toBe(true);
    expect(profiles.every((p) => p.tenantId === tenant.id)).toBe(true);

    // The person who signed up owns the company: ADMIN role AND ADMIN profile.
    const user = store.rows('user')[0].data;
    expect(user).toMatchObject({
      tenantId: tenant.id,
      email: INPUT.email,
      name: INPUT.name,
      passwordHash: 'hashed-pw',
      role: 'ADMIN',
      profileId: profiles[0].id,
    });
    expect(mockedArgon.hash).toHaveBeenCalledWith(INPUT.password);

    // The acceptance is evidence, and it is written with the account it belongs
    // to — including the version of each document actually in force.
    expect(store.rows('legalAcceptance').map((w) => w.data)).toEqual([
      {
        document: 'TERMS_OF_USE',
        version: LEGAL_VERSIONS.terms,
        tenantId: tenant.id,
        userId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      {
        document: 'PRIVACY_POLICY',
        version: LEGAL_VERSIONS.privacy,
        tenantId: tenant.id,
        userId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    ]);

    // The new administrator still has to prove the e-mail is theirs.
    expect(auth.sendVerificationCode).toHaveBeenCalledWith(user.id, INPUT.email, INPUT.name, 'en');
    expect(auth.audit).toHaveBeenCalledWith('auth.signup', user.id, ctx, {
      tenantId: tenant.id,
      slug: INPUT.slug,
    });

    // The response carries the company and a user with no secrets in it.
    expect(result.tenant).toMatchObject({ slug: INPUT.slug, planName: 'Starter' });
    expect(result.user.email).toBe(INPUT.email);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('takes the trial length from the default plan', async () => {
    const before = Date.now();
    await service.signup(INPUT, ctx);
    const { trialEndsAt } = store.rows('tenant')[0].data as { trialEndsAt: Date };

    expect(daysFrom(before, trialEndsAt)).toBe(30);
    expect(store.tx.plan.findFirst).toHaveBeenCalledWith({
      where: { isDefault: true, active: true },
    });
  });

  it('falls back to a 14-day trial and no plan when none is flagged default', async () => {
    setup(null);
    const before = Date.now();
    const result = await service.signup(INPUT, ctx);

    const tenant = store.rows('tenant')[0].data as { planId: unknown; trialEndsAt: Date };
    expect(tenant.planId).toBeNull();
    expect(daysFrom(before, tenant.trialEndsAt)).toBe(14);
    // A company on no plan reports no plan, rather than inventing one.
    expect(result.tenant.planName).toBeNull();
  });

  it('normalises slug and e-mail, and stores the optional fields as null when absent', async () => {
    await service.signup({ ...INPUT, slug: 'SIRIUS-CYBERNETICS', email: 'Marvin@Sirius.DEV' }, {});

    expect(store.tx.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'sirius-cybernetics' },
      select: { id: true },
    });
    expect(store.rows('tenant')[0].data).toMatchObject({
      slug: 'sirius-cybernetics',
      email: 'marvin@sirius.dev',
      phone: null,
      taxId: null,
    });
    // An empty context means an anonymous acceptance, not a missing one.
    expect(store.rows('legalAcceptance')[0].data).toMatchObject({ ip: null, userAgent: null });
    // No locale on the request: the mail falls back to the default language.
    expect(auth.sendVerificationCode.mock.calls[0][3]).toBe('pt-BR');
  });

  function daysFrom(start: number, end: Date): number {
    return Math.round((end.getTime() - start) / 86_400_000);
  }

  /** Squashes runs of the same table so the assertion reads as an order, not a tally. */
  function collapse(tables: string[]): string[] {
    return tables.filter((table, i) => table !== tables[i - 1]);
  }
});
