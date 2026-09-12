import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LEGAL_VERSIONS, TWO_FACTOR_TICKET_COOKIE } from '@dontpanic/shared';
import type { OAuthAdapter, OAuthIdentity } from '../../../core/oauth/oauth.provider';
import { OAuthService, type OAuthCallbackParams } from './oauth.service';
import { OAUTH_STATE_COOKIE, encodeFlowState } from './oauth-state';

const NOW = new Date('2026-09-12T10:00:00.000Z');
const WEB = 'http://localhost:4200';

const CONFIG: Record<string, unknown> = {
  WEB_ORIGIN: WEB,
  COOKIE_DOMAIN: 'localhost',
  COOKIE_SECURE: false,
  NODE_ENV: 'test',
  OAUTH_CALLBACK_BASE_URL: `${WEB}/api/auth/oauth`,
  PUBLIC_SIGNUP_ENABLED: true,
};

const IDENTITY: OAuthIdentity = {
  providerAccountId: 'google-sub-1',
  email: 'Arthur@Dent.dev',
  emailVerified: true,
  name: 'Arthur Dent',
};

const ctx = { ip: '1.2.3.4', userAgent: 'UA', locale: 'en' as const };

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'arthur@dent.dev',
    name: 'Arthur Dent',
    passwordHash: null,
    avatarUrl: null,
    role: 'ADMIN',
    emailVerified: true,
    twoFactorEnabled: false,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function tenantRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tenant-1',
    slug: 'sirius',
    name: 'Sirius Cybernetics',
    legalName: null,
    taxId: null,
    email: 'arthur@dent.dev',
    phone: null,
    status: 'TRIAL',
    trialEndsAt: null,
    planId: null,
    locale: 'pt-BR',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    createdAt: NOW,
    ...over,
  };
}

/** A reply double that records what the service did to the browser's cookies. */
function makeReply() {
  return { setCookie: jest.fn(), clearCookie: jest.fn() };
}

function makeAdapter(over: Partial<OAuthAdapter> = {}): OAuthAdapter {
  return {
    name: 'google',
    usesFormPost: false,
    usesPkce: true,
    authorizationUrl: jest.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?x=1'),
    exchange: jest.fn(async () => IDENTITY),
    ...over,
  } as OAuthAdapter;
}

function setup(options: { adapter?: OAuthAdapter; config?: Record<string, unknown> } = {}) {
  const adapter = options.adapter ?? makeAdapter();
  const registry = new Map([[adapter.name, adapter]]);

  const tx = {
    plan: { findFirst: jest.fn().mockResolvedValue(null) },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenantRow()),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        tenantRow({ ...data, id: 'tenant-new' }),
      ),
    },
    profile: {
      create: jest.fn(async ({ data }: { data: { code: string } }) => ({
        id: `profile-${data.code}`,
        ...data,
      })),
    },
    permission: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        userRow({ ...data, id: 'user-new' }),
      ),
      update: jest.fn().mockResolvedValue(userRow()),
    },
    oAuthAccount: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    legalAcceptance: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };

  const prisma = { asSystem: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const tokens = {
    issueTokensForUser: jest
      .fn()
      .mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
  };
  const cookies = { setAccessCookie: jest.fn(), setRefreshCookie: jest.fn() };
  // The real AuthService mints the login ticket the second-factor step consumes;
  // here only that one method matters, and it is shared rather than reimplemented
  // precisely so the OAuth hand-off cannot drift from the password one.
  const auth = { createLoginTicket: jest.fn().mockResolvedValue('ticket-2fa') };
  const values = { ...CONFIG, ...options.config };
  const config = { get: jest.fn((key: string) => values[key]) };

  const service = new OAuthService(
    registry,
    cache as never,
    config as never,
    prisma as never,
    tokens as never,
    cookies as never,
    auth as never,
  );

  return { service, adapter, registry, tx, prisma, cache, tokens, cookies, auth };
}

/** The cookie a browser would be carrying mid-flow. */
const flowCookie = (over: Record<string, unknown> = {}) =>
  encodeFlowState({
    p: 'google',
    s: 'state-1',
    n: 'nonce-1',
    v: 'verifier-1',
    i: 'login',
    ...over,
  } as never);

const CALLBACK: OAuthCallbackParams = { code: 'c0de', state: 'state-1' };

describe('OAuthService — discovery', () => {
  it('lists only the providers this deployment has adapters for', () => {
    const { service } = setup();
    expect(service.listProviders()).toEqual({ providers: ['google'], signupEnabled: true });
  });

  it('reports signup being closed, so the web app can hide the option', () => {
    const { service } = setup({ config: { PUBLIC_SIGNUP_ENABLED: false } });
    expect(service.listProviders().signupEnabled).toBe(false);
  });
});

describe('OAuthService — start', () => {
  it('arms a short-lived, path-scoped, lax cookie and hands back the provider url', () => {
    const { service, adapter } = setup();
    const reply = makeReply();

    expect(service.start('google', 'login', reply as never)).toContain('accounts.google.com');

    const [name, , options] = reply.setCookie.mock.calls[0] as [string, string, never];
    expect(name).toBe(OAUTH_STATE_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      // strict would be withheld on the navigation back from the provider —
      // the exact request the cookie exists for.
      sameSite: 'lax',
      path: '/api/auth/oauth',
      maxAge: 600,
    });

    const [request] = (adapter.authorizationUrl as jest.Mock).mock.calls[0] as [
      { state: string; nonce: string; codeChallenge?: string },
    ];
    expect(request.state).toEqual(expect.any(String));
    expect(request.codeChallenge).toEqual(expect.any(String));
  });

  it('sends no PKCE challenge to a provider that does not do PKCE', () => {
    const adapter = makeAdapter({ name: 'apple', usesPkce: false, usesFormPost: true });
    const { service } = setup({ adapter });
    service.start('apple', 'signup', makeReply() as never);

    const [request] = (adapter.authorizationUrl as jest.Mock).mock.calls[0] as [
      { codeChallenge?: string },
    ];
    expect(request.codeChallenge).toBeUndefined();
  });

  it('404s an unconfigured provider — its absence is not public information', () => {
    const { service } = setup();
    expect(() => service.start('github', 'login', makeReply() as never)).toThrow(NotFoundException);
  });
});

describe('OAuthService — callback refusals', () => {
  const call = async (
    over: { params?: OAuthCallbackParams; cookie?: string; adapter?: OAuthAdapter } = {},
    config?: Record<string, unknown>,
  ) => {
    const kit = setup({
      ...(over.adapter ? { adapter: over.adapter } : {}),
      ...(config ? { config } : {}),
    });
    const reply = makeReply();
    const redirect = await kit.service.handleCallback(
      'google',
      over.params ?? CALLBACK,
      over.cookie === undefined ? flowCookie() : over.cookie,
      ctx,
      reply as never,
    );
    return { ...kit, reply, redirect };
  };

  it('404s an unconfigured provider before anything else happens', async () => {
    const { service } = setup();
    await expect(
      service.handleCallback('apple', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).rejects.toThrow(NotFoundException);
  });

  it('burns the flow cookie on every callback, successful or not', async () => {
    const { reply } = await call({ cookie: '' });
    expect(reply.clearCookie).toHaveBeenCalledWith(OAUTH_STATE_COOKIE, expect.anything());
  });

  it('refuses a callback with no flow cookie', async () => {
    const { redirect } = await call({ cookie: '' });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
  });

  it('refuses a state that does not match the cookie — this is the flow’s CSRF check', async () => {
    const { redirect } = await call({ params: { code: 'c', state: 'someone-elses' } });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
  });

  it('refuses a callback with no state at all', async () => {
    const { redirect } = await call({ params: { code: 'c' } });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
  });

  it('refuses a cookie that belongs to a different provider’s flow', async () => {
    const { redirect } = await call({ cookie: flowCookie({ p: 'apple' }) });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
  });

  it('treats the user pressing Cancel like everything else that failed', async () => {
    const { redirect } = await call({ params: { state: 'state-1', error: 'access_denied' } });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
  });

  it('refuses a callback with no code', async () => {
    const { redirect } = await call({ params: { state: 'state-1' } });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
  });

  it('keeps a provider’s own error message out of the URL', async () => {
    const adapter = makeAdapter({
      exchange: jest.fn(async () => {
        throw new Error('client_secret for acme-42 is expired');
      }),
    });
    const { redirect } = await call({ adapter });
    expect(redirect).toBe(`${WEB}/login?error=failed`);
    expect(redirect).not.toContain('acme-42');
  });

  it('stops at an address the provider has not verified', async () => {
    const adapter = makeAdapter({
      exchange: jest.fn(async () => ({ ...IDENTITY, emailVerified: false })),
    });
    const { redirect, prisma } = await call({ adapter });
    expect(redirect).toBe(`${WEB}/login?error=unverified_email`);
    // And never looks anyone up: an unverified address must not even be matched.
    expect(prisma.asSystem).not.toHaveBeenCalled();
  });

  it('stops when the provider gave no address at all', async () => {
    const adapter = makeAdapter({ exchange: jest.fn(async () => ({ ...IDENTITY, email: null })) });
    const { redirect } = await call({ adapter });
    expect(redirect).toBe(`${WEB}/login?error=unverified_email`);
  });
});

describe('OAuthService — callback for a known identity', () => {
  it('signs in a linked account and sends the browser home WITH the session cookies', async () => {
    const kit = setup();
    kit.tx.oAuthAccount.findUnique.mockResolvedValue({ userId: 'user-1' });
    kit.tx.user.findUnique.mockResolvedValue(userRow());
    const reply = makeReply();

    const redirect = await kit.service.handleCallback(
      'google',
      CALLBACK,
      flowCookie(),
      ctx,
      reply as never,
    );

    expect(redirect).toBe(WEB);
    // Minting tokens and forgetting to hand them over is the failure where
    // every step "worked": the user lands on the app with no session, is
    // bounced to /login, and clicks the button again for ever.
    expect(kit.cookies.setAccessCookie).toHaveBeenCalledWith(reply, 'access');
    expect(kit.cookies.setRefreshCookie).toHaveBeenCalledWith(reply, 'refresh');
    expect(kit.tx.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(kit.tokens.issueTokensForUser).toHaveBeenCalledWith(
      { id: 'user-1', email: 'arthur@dent.dev', role: 'ADMIN', tenantId: 'tenant-1' },
      ctx,
    );
    expect(kit.tx.oAuthAccount.create).not.toHaveBeenCalled();
  });

  it('links a verified address to the existing account, copying the tenant onto the row', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow());
    const reply = makeReply();

    const redirect = await kit.service.handleCallback(
      'google',
      CALLBACK,
      flowCookie(),
      ctx,
      reply as never,
    );

    expect(redirect).toBe(WEB);
    expect(kit.cookies.setAccessCookie).toHaveBeenCalledWith(reply, 'access');
    expect(kit.cookies.setRefreshCookie).toHaveBeenCalledWith(reply, 'refresh');
    // Matched on the lower-cased address; the provider sent it mixed case.
    expect(kit.tx.user.findUnique).toHaveBeenCalledWith({ where: { email: 'arthur@dent.dev' } });
    expect(kit.tx.oAuthAccount.create).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'GOOGLE',
        providerAccountId: 'google-sub-1',
        email: 'Arthur@Dent.dev',
      },
    });
  });

  it('marks the user verified, since the provider just proved the address', async () => {
    const kit = setup();
    kit.tx.oAuthAccount.findUnique.mockResolvedValue({ userId: 'user-1' });
    kit.tx.user.findUnique.mockResolvedValue(userRow({ emailVerified: false }));

    await kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never);

    expect(kit.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerified: true },
    });
  });

  it('refuses a soft-deleted account rather than resurrecting it', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow({ deletedAt: NOW }));
    const reply = makeReply();
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, reply as never),
    ).resolves.toBe(`${WEB}/login?error=account_conflict`);
    expect(kit.tokens.issueTokensForUser).not.toHaveBeenCalled();
    expect(kit.cookies.setAccessCookie).not.toHaveBeenCalled();
  });

  it('refuses a SUPERADMIN — the platform session is not a provider’s to mint', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow({ role: 'SUPERADMIN', tenantId: null }));
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).resolves.toBe(`${WEB}/login?error=account_conflict`);
  });

  it('refuses when the company itself may not be used', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow());
    kit.tx.tenant.findUnique.mockResolvedValue(tenantRow({ status: 'SUSPENDED' }));
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).resolves.toBe(`${WEB}/login?error=account_conflict`);
  });

  it('refuses a user with no company at all', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow({ tenantId: null }));
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).resolves.toBe(`${WEB}/login?error=account_conflict`);
  });

  it('gives up quietly when a concurrent request already claimed the link', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow());
    kit.tx.oAuthAccount.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7',
        meta: { target: 'provider_providerAccountId' },
      }),
    );
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).resolves.toBe(`${WEB}/login?error=account_conflict`);
  });

  it('does not swallow a database failure that is not a unique violation', async () => {
    const kit = setup();
    kit.tx.user.findUnique.mockResolvedValue(userRow());
    kit.tx.oAuthAccount.create.mockRejectedValue(new Error('connection reset'));
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).rejects.toThrow('connection reset');
  });

  it('writes an audit row, and survives one that cannot be written', async () => {
    const kit = setup();
    kit.tx.oAuthAccount.findUnique.mockResolvedValue({ userId: 'user-1' });
    kit.tx.user.findUnique.mockResolvedValue(userRow());
    kit.tx.auditLog.create.mockRejectedValue(new Error('rls'));

    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).resolves.toBe(WEB);
    expect(kit.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'auth.oauth.login', tenantId: 'tenant-1' }),
    });
  });
});

describe('OAuthService — callback for an unknown identity', () => {
  it('parks the verified identity and sends the browser to the company form', async () => {
    const kit = setup();
    const redirect = await kit.service.handleCallback(
      'google',
      CALLBACK,
      flowCookie(),
      ctx,
      makeReply() as never,
    );

    expect(redirect).toMatch(new RegExp(`^${WEB}/signup/complete\\?ticket=`));
    const [key, value, ttl] = kit.cache.set.mock.calls[0] as [string, string, number];
    // Hashed, like every other opaque token here: a dumped cache is not a pile
    // of usable registration links.
    expect(key).toMatch(/^oauth:pending:[0-9a-f]{64}$/);
    expect(ttl).toBe(900);
    expect(JSON.parse(value)).toEqual({
      provider: 'google',
      providerAccountId: 'google-sub-1',
      email: 'arthur@dent.dev',
      name: 'Arthur Dent',
    });
  });

  it('tells someone who tried to sign in that there is no account', async () => {
    const kit = setup({ config: { PUBLIC_SIGNUP_ENABLED: false } });
    await expect(
      kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, makeReply() as never),
    ).resolves.toBe(`${WEB}/login?error=no_account`);
    expect(kit.cache.set).not.toHaveBeenCalled();
  });

  it('tells someone who tried to sign up that signup is closed', async () => {
    const kit = setup({ config: { PUBLIC_SIGNUP_ENABLED: false } });
    await expect(
      kit.service.handleCallback(
        'google',
        CALLBACK,
        flowCookie({ i: 'signup' }),
        ctx,
        makeReply() as never,
      ),
    ).resolves.toBe(`${WEB}/login?error=signup_disabled`);
  });
});

describe('OAuthService — completeSignup', () => {
  const INPUT = {
    ticket: 'ticket-token',
    companyName: 'Sirius Cybernetics',
    slug: 'Sirius',
    name: 'Arthur Dent',
    acceptTerms: true as const,
  };

  const PENDING = JSON.stringify({
    provider: 'google',
    providerAccountId: 'google-sub-1',
    email: 'arthur@dent.dev',
    name: 'Arthur Dent',
  });

  it('creates the company, the passwordless administrator and the link, then signs them in', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    // No company owns this slug yet — the default double answers the callback's
    // "load the user's tenant", not this pre-check.
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    const reply = makeReply();

    const result = await kit.service.completeSignup(INPUT, ctx, reply as never);

    // The ticket is burned before anything is created — one authorization must
    // not be able to produce two companies.
    expect(kit.cache.del).toHaveBeenCalledWith(kit.cache.get.mock.calls[0]?.[0]);

    expect(kit.tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'arthur@dent.dev',
        passwordHash: null,
        // Legitimate only because the callback refused anything the provider
        // had not verified.
        emailVerified: true,
        role: 'ADMIN',
        profileId: 'profile-ADMIN',
      }),
    });
    expect(kit.tx.oAuthAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-new',
        provider: 'GOOGLE',
        providerAccountId: 'google-sub-1',
      }),
    });
    expect(kit.tx.legalAcceptance.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ document: 'TERMS_OF_USE', version: LEGAL_VERSIONS.terms }),
        expect.objectContaining({ document: 'PRIVACY_POLICY', version: LEGAL_VERSIONS.privacy }),
      ],
    });
    expect(kit.cookies.setAccessCookie).toHaveBeenCalledWith(reply, 'access');
    expect(kit.cookies.setRefreshCookie).toHaveBeenCalledWith(reply, 'refresh');
    expect(result.user.email).toBe('arthur@dent.dev');
    expect(result.tenant.slug).toBe('sirius');
  });

  it('refuses outright when public registration is closed', async () => {
    const kit = setup({ config: { PUBLIC_SIGNUP_ENABLED: false } });
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      ForbiddenException,
    );
    expect(kit.cache.get).not.toHaveBeenCalled();
  });

  it('says the same thing for a ticket that expired, was used, or never existed', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(null);
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a ticket whose payload is not JSON', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue('{oops');
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a ticket whose payload is the wrong shape', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(JSON.stringify({ provider: 'facebook', email: 'x@y.z' }));
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('keeps a null name rather than inventing one', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(
      JSON.stringify({ provider: 'github', providerAccountId: '7', email: 'a@b.dev' }),
    );
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    await kit.service.completeSignup(INPUT, ctx, makeReply() as never);
    expect(kit.tx.oAuthAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'GITHUB' }),
    });
  });

  it('refuses a reserved slug', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    await expect(
      kit.service.completeSignup({ ...INPUT, slug: 'admin' }, ctx, makeReply() as never),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses a slug someone already took', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    kit.tx.tenant.findUnique.mockResolvedValue({ id: 'tenant-9' });
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      'This address is not available',
    );
  });

  it('refuses when the address was claimed while the form was open', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    kit.tx.user.findUnique.mockResolvedValue({ id: 'user-9' });
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      'An account with this email already exists',
    );
  });

  it('translates the unique violation the pre-check cannot close', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    kit.tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7',
        meta: { target: ['email'] },
      }),
    );
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      'An account with this email already exists',
    );
  });

  it('translates a slug collision the same way', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    kit.tx.tenant.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '7',
        meta: { target: ['slug'] },
      }),
    );
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      'This address is not available',
    );
  });

  it('does not disguise a failure that is not a collision', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    kit.tx.user.create.mockRejectedValue(new Error('disk full'));
    await expect(kit.service.completeSignup(INPUT, ctx, makeReply() as never)).rejects.toThrow(
      'disk full',
    );
  });

  it('names the plan on the tenant it returns', async () => {
    const kit = setup();
    kit.cache.get.mockResolvedValue(PENDING);
    kit.tx.tenant.findUnique.mockResolvedValue(null);
    kit.tx.plan.findFirst.mockResolvedValue({ id: 'plan-1', name: 'Starter', trialDays: 7 });
    const result = await kit.service.completeSignup(INPUT, ctx, makeReply() as never);
    expect(result.tenant.planName).toBe('Starter');
  });
});

/**
 * The downgrade this closes: social sign-in must not be a way around a factor
 * the user deliberately turned on. `TwoFactorGateGuard` does not catch it — it
 * only checks that 2FA is *enabled*, never that this session passed it — so if
 * the callback minted a session here, clicking "Sign in with Google" would be
 * strictly weaker than typing the password.
 */
describe('OAuthService — a known identity that still owes a second factor', () => {
  function twoFactorKit() {
    const kit = setup();
    kit.tx.oAuthAccount.findUnique.mockResolvedValue({ userId: 'user-1' });
    kit.tx.user.findUnique.mockResolvedValue(userRow({ twoFactorEnabled: true }));
    return kit;
  }

  it('issues no session and sends the browser to the code step', async () => {
    const kit = twoFactorKit();
    const reply = makeReply();

    const redirect = await kit.service.handleCallback(
      'google',
      CALLBACK,
      flowCookie(),
      ctx,
      reply as never,
    );

    expect(redirect).toBe(`${WEB}/login?twofactor=1`);
    // The two assertions that matter: no tokens minted, no cookies handed over.
    expect(kit.tokens.issueTokensForUser).not.toHaveBeenCalled();
    expect(kit.cookies.setAccessCookie).not.toHaveBeenCalled();
    expect(kit.cookies.setRefreshCookie).not.toHaveBeenCalled();
  });

  it('hands over the same ticket `POST /auth/2fa/verify` already understands', async () => {
    const kit = twoFactorKit();
    const reply = makeReply();

    await kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, reply as never);

    // Minted by AuthService, not by a second copy of the ticket format living
    // here — the burn-on-use and the per-ticket attempt counter come with it.
    expect(kit.auth.createLoginTicket).toHaveBeenCalledWith('user-1');
    expect(reply.setCookie).toHaveBeenCalledWith(
      TWO_FACTOR_TICKET_COOKIE,
      'ticket-2fa',
      expect.objectContaining({ path: '/', sameSite: 'lax' }),
    );
  });

  it('keeps the ticket out of the query string', async () => {
    const kit = twoFactorKit();
    const reply = makeReply();

    const redirect = await kit.service.handleCallback(
      'google',
      CALLBACK,
      flowCookie(),
      ctx,
      reply as never,
    );

    // A redirect is the only channel available, and a URL is the one place a
    // secret should not travel: it lands in history, in Referer, and in every
    // proxy log between here and the login screen.
    expect(redirect).not.toContain('ticket-2fa');
  });

  it('leaves the ticket readable to script, as the password flow already does', async () => {
    const kit = twoFactorKit();
    const reply = makeReply();

    await kit.service.handleCallback('google', CALLBACK, flowCookie(), ctx, reply as never);

    // The login page has to put it in the body of the verify call. After a
    // password the ticket arrives in a JSON response the page reads, so this is
    // the same exposure — and what limits it is the ticket itself: five
    // minutes, single use, worthless without a live TOTP code.
    expect(reply.setCookie).toHaveBeenCalledWith(
      TWO_FACTOR_TICKET_COOKIE,
      'ticket-2fa',
      expect.objectContaining({ httpOnly: false }),
    );
  });
});
