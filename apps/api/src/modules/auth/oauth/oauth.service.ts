import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type User } from '@prisma/client';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';
import {
  LEGAL_VERSIONS,
  RESERVED_TENANT_SLUGS,
  TWO_FACTOR_TICKET_COOKIE,
  oauthProviders,
  type CompleteOAuthSignupInput,
  type CompleteOAuthSignupResponse,
  type OAuthErrorCode,
  type OAuthProvider,
  type OAuthProvidersResponse,
} from '@dontpanic/shared';
import type { Env } from '../../../config/env';
import { CACHE_PROVIDER, type CacheProvider } from '../../../core/cache/cache.provider';
import {
  OAUTH_REGISTRY,
  type OAuthAdapter,
  type OAuthIdentity,
  type OAuthRegistry,
} from '../../../core/oauth/oauth.provider';
import { oauthCookiePath } from '../../../infra/oauth/callback-url';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { provisionTenant } from '../../tenants/support/tenant-provisioning';
import { AuthService, type RequestContext } from '../services/auth.service';
import { TokenService, type IssuedTokens } from '../services/token.service';
import { CookieService } from '../support/cookies';
import { generateRawToken, sha256 } from '../support/crypto.util';
import { assertTenantAllowed, toTenantDto } from '../support/tenant-access';
import { toUserDto } from '../support/user.mapper';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  decodeFlowState,
  encodeFlowState,
  pkceChallenge,
  type OAuthIntent,
} from './oauth-state';

const RESERVED = new Set<string>(RESERVED_TENANT_SLUGS);

/**
 * How long an unknown identity may sit waiting for a company name and slug.
 * Longer than the flow cookie, because the person is now filling in a form.
 */
const PENDING_TTL_SECONDS = 15 * 60;

/** Our provider names as Postgres spells them. */
const PRISMA_PROVIDER: Record<OAuthProvider, 'GOOGLE' | 'APPLE' | 'GITHUB'> = {
  google: 'GOOGLE',
  apple: 'APPLE',
  github: 'GITHUB',
};

/** What the callback ends up doing, decided inside the one system-scoped read. */
type CallbackOutcome =
  | { kind: 'error'; code: OAuthErrorCode }
  | { kind: 'session'; tokens: IssuedTokens }
  /**
   * First factor proved, second still owed. Social sign-in must not be a way
   * around TOTP: a user who deliberately turned it on has said that possessing
   * the mailbox is not sufficient, and a provider redirect proves exactly that
   * and nothing more. `TwoFactorGateGuard` does not close this — it only checks
   * that 2FA is *enabled*, never that this session passed it.
   */
  | { kind: 'two-factor'; ticket: string }
  | { kind: 'unknown-identity' };

/** The verified identity parked for the "finish your registration" form. */
interface PendingRegistration {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string | null;
}

/** What the callback route was handed, whether by query string or form post. */
export interface OAuthCallbackParams {
  code?: string;
  state?: string;
  /** The provider's own error (`access_denied` when the user says no). */
  error?: string;
  /** Apple's one-shot `user` field. */
  user?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    @Inject(OAUTH_REGISTRY) private readonly registry: OAuthRegistry,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly cookies: CookieService,
    private readonly auth: AuthService,
  ) {}

  // --- discovery -----------------------------------------------------------

  listProviders(): OAuthProvidersResponse {
    // Ordered by the shared list rather than by insertion, so the buttons do
    // not reshuffle when someone reorders OAUTH_PROVIDERS in the env.
    return {
      providers: oauthProviders.filter((name) => this.registry.has(name)),
      signupEnabled: this.signupEnabled(),
    };
  }

  // --- step 1: leaving --------------------------------------------------------

  /** Returns the provider URL to redirect to, having armed the flow cookie. */
  start(provider: string, intent: OAuthIntent, reply: FastifyReply): string {
    const adapter = this.adapterOrThrow(provider);

    const state = generateRawToken();
    const nonce = generateRawToken(16);
    const verifier = adapter.usesPkce ? generateRawToken(32) : undefined;

    this.setFlowCookie(reply, {
      p: adapter.name,
      s: state,
      n: nonce,
      ...(verifier ? { v: verifier } : {}),
      i: intent,
    });

    return adapter.authorizationUrl({
      state,
      nonce,
      ...(verifier ? { codeChallenge: pkceChallenge(verifier) } : {}),
    });
  }

  // --- step 2: coming back ----------------------------------------------------

  /**
   * Everything that can go wrong here ends as a redirect, never as a thrown
   * error: the browser arrived by following a link from another site, so a JSON
   * 400 would leave the user staring at a blank page. The only exception is an
   * unconfigured provider, which is a 404 before any of this runs.
   */
  async handleCallback(
    provider: string,
    params: OAuthCallbackParams,
    rawCookie: string | undefined,
    ctx: RequestContext,
    reply: FastifyReply,
  ): Promise<string> {
    const adapter = this.adapterOrThrow(provider);

    const flow = decodeFlowState(rawCookie);
    // Burned on sight, whatever happens next. The cookie is the one thing that
    // proves this callback belongs to a flow this browser started — leaving it
    // in place would let the same authorization response be replayed, and would
    // also strand a stale cookie over the next attempt.
    this.clearFlowCookie(reply);

    // This comparison IS the CSRF defence of the OAuth flow. Without it an
    // attacker completes an authorization with *their* provider account and
    // feeds the resulting code to a victim's browser, silently binding the
    // victim's session to the attacker's identity. A missing cookie counts as a
    // mismatch: fail closed.
    if (!flow || flow.p !== adapter.name || !params.state || flow.s !== params.state) {
      return this.errorRedirect('failed');
    }

    // `error=access_denied` is the user pressing Cancel. It gets the same
    // opaque code as everything else — the login screen has one place to say
    // "that did not work", and distinguishing outcomes here only helps someone
    // probing the endpoint.
    if (params.error || !params.code) {
      return this.errorRedirect('failed');
    }

    let identity: OAuthIdentity;
    try {
      identity = await adapter.exchange({
        code: params.code,
        nonce: flow.n,
        ...(flow.v ? { codeVerifier: flow.v } : {}),
        formPostUser: params.user ?? null,
      });
    } catch (err) {
      // The reason lives in the log, never in the URL: a provider's error text
      // can name accounts and client ids.
      this.logger.warn(`OAuth exchange with ${adapter.name} failed: ${String(err)}`);
      return this.errorRedirect('failed');
    }

    // An address the provider has not confirmed is a claim, not a fact. Anyone
    // able to open an account there could type someone else's address into it,
    // and everything below matches DontPanic users by e-mail — so accepting it
    // would be handing over an account to whoever asked for it loudest.
    if (!identity.email || !identity.emailVerified) {
      return this.errorRedirect('unverified_email');
    }

    const email = identity.email.toLowerCase();
    const outcome = await this.resolveIdentity(adapter.name, identity, email, ctx);

    if (outcome.kind === 'error') return this.errorRedirect(outcome.code);
    if (outcome.kind === 'session') {
      // Minted inside the transaction (the refresh row needs a scope to be
      // written under), handed to the browser out here, where the reply lives —
      // exactly the split the login route makes. Setting the cookies is not
      // optional bookkeeping: without it the user completes the whole round
      // trip, lands on the app with no session, gets bounced to /login and
      // clicks the button again, for ever.
      this.cookies.setAccessCookie(reply, outcome.tokens.accessToken);
      this.cookies.setRefreshCookie(reply, outcome.tokens.refreshToken);
      return this.config.get('WEB_ORIGIN', { infer: true });
    }

    if (outcome.kind === 'two-factor') {
      // No session yet — only a ticket, handed over the one channel a redirect
      // has. It goes in a cookie rather than the query string so it stays out
      // of browser history, the Referer header and any proxy log between here
      // and the login screen.
      //
      // Readable by JavaScript on purpose: the page has to put it in the body
      // of `POST /auth/2fa/verify`, and that is the same exposure the password
      // flow already accepts — there, the ticket arrives in a JSON response the
      // page reads. What actually limits the damage is what the ticket is: five
      // minutes, single use, burned on the first verify, and useless without a
      // live TOTP code.
      reply.setCookie(TWO_FACTOR_TICKET_COOKIE, outcome.ticket, this.twoFactorTicketCookie());
      return `${this.config.get('WEB_ORIGIN', { infer: true })}/login?twofactor=1`;
    }

    return this.parkPendingRegistration(adapter.name, identity, email, flow.i);
  }

  /**
   * Find the person behind the identity, in system scope.
   *
   * System scope for the same reason login is: there is no tenant to derive a
   * scope from until we know who this is, and under RLS an unscoped read
   * returns nothing — every identity would look brand new and every returning
   * user would be pushed at the registration form.
   *
   * The session is minted inside the same transaction: `TokenService` writes
   * the refresh token through `prisma.db`, which resolves to whatever scope is
   * open, and outside one that write has no scope to satisfy.
   */
  private async resolveIdentity(
    provider: OAuthProvider,
    identity: OAuthIdentity,
    email: string,
    ctx: RequestContext,
  ): Promise<CallbackOutcome> {
    return this.prisma.asSystem(async (tx): Promise<CallbackOutcome> => {
      const link = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: PRISMA_PROVIDER[provider],
            providerAccountId: identity.providerAccountId,
          },
        },
        select: { userId: true },
      });

      // The subject is the key, and only the subject. Falling back to the
      // e-mail is what LINKS a new identity to an existing account — a
      // deliberate second step, not the primary lookup, because addresses get
      // reassigned and subjects do not.
      const user: User | null = link
        ? await tx.user.findUnique({ where: { id: link.userId } })
        : await tx.user.findUnique({ where: { email } });

      if (!user) return { kind: 'unknown-identity' };

      // A deleted account must not be resurrected by a social button, and a
      // SUPERADMIN has no company — its session belongs to the platform panel
      // and is not something a provider redirect should be able to mint.
      if (user.deletedAt || user.role === 'SUPERADMIN') {
        return { kind: 'error', code: 'account_conflict' };
      }

      const tenant = user.tenantId
        ? await tx.tenant.findUnique({
            where: { id: user.tenantId },
            select: { status: true, trialEndsAt: true, deletedAt: true },
          })
        : null;
      try {
        assertTenantAllowed(tenant);
      } catch {
        // assertTenantAllowed speaks in sentences meant for an API response.
        // Here the answer has to fit in a query parameter, so the whole family
        // of "this company cannot be used" collapses into one code.
        return { kind: 'error', code: 'account_conflict' };
      }

      if (!link) {
        const created = await this.linkAccount(tx, user, provider, identity);
        if (!created) return { kind: 'error', code: 'account_conflict' };
      }

      // The provider just proved the address. An account that signed up but
      // never opened the verification e-mail is verified by this, and leaving
      // it unverified would park a fully authenticated user behind a code they
      // no longer have any reason to enter.
      if (!user.emailVerified) {
        await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      }

      // Second factor owed: stop here with a ticket instead of a session. The
      // ticket is the one `POST /auth/2fa/verify` already understands, so the
      // second step is the same code, the same burn-on-use and the same
      // per-ticket attempt counter as it is after a password.
      if (user.twoFactorEnabled) {
        const ticket = await this.auth.createLoginTicket(user.id);
        await this.audit(tx, 'auth.oauth.2fa_required', user.id, user.tenantId, ctx, {
          provider,
          linked: !link,
        });
        return { kind: 'two-factor', ticket };
      }

      const tokens = await this.tokens.issueTokensForUser(
        { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
        ctx,
      );
      await this.audit(tx, 'auth.oauth.login', user.id, user.tenantId, ctx, {
        provider,
        linked: !link,
      });

      return { kind: 'session', tokens };
    });
  }

  /**
   * Attach the identity to an existing user.
   *
   * Only ever reached with an address the provider verified — that check is the
   * whole licence to do this, because linking on an unverified address is
   * account takeover with extra steps.
   *
   * Returns false when the database refuses, which in practice means the same
   * person clicked twice and a concurrent request won the unique index, or this
   * user already has a different account on this provider. Neither is worth a
   * 500 on a redirect route.
   */
  private async linkAccount(
    tx: Prisma.TransactionClient,
    user: User,
    provider: OAuthProvider,
    identity: OAuthIdentity,
  ): Promise<boolean> {
    try {
      await tx.oAuthAccount.create({
        data: {
          // Copied from the user, never from the request: it is what puts this
          // row inside the same RLS policy as everything else the company owns.
          tenantId: user.tenantId,
          userId: user.id,
          provider: PRISMA_PROVIDER[provider],
          providerAccountId: identity.providerAccountId,
          email: identity.email,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Nobody owns this address yet.
   *
   * Which is where the flow has to stop and ask, because creating a company
   * needs a name and a slug and no identity provider has any way of knowing
   * either. Deriving them from the address would produce companies called
   * `joao-silva-gmail-com` — and a slug is in URLs and invitations for ever.
   *
   * So the verified identity is parked in a short-lived, single-use ticket and
   * the browser goes to a form. The ticket is what makes the e-mail on that
   * form trustworthy: the browser never gets to assert it.
   */
  private async parkPendingRegistration(
    provider: OAuthProvider,
    identity: OAuthIdentity,
    email: string,
    intent: OAuthIntent,
  ): Promise<string> {
    if (!this.signupEnabled()) {
      // Same wall, two doors. Someone who clicked "sign in" is told there is no
      // account; someone who clicked "sign up" is told signup is closed.
      return this.errorRedirect(intent === 'signup' ? 'signup_disabled' : 'no_account');
    }

    const ticket = generateRawToken();
    const pending: PendingRegistration = {
      provider,
      providerAccountId: identity.providerAccountId,
      email,
      name: identity.name,
    };
    await this.cache.set(this.pendingKey(ticket), JSON.stringify(pending), PENDING_TTL_SECONDS);

    const origin = this.config.get('WEB_ORIGIN', { infer: true });
    return `${origin}/signup/complete?ticket=${encodeURIComponent(ticket)}`;
  }

  // --- step 3: finishing a registration ---------------------------------------

  async completeSignup(
    input: CompleteOAuthSignupInput,
    ctx: RequestContext,
    reply: FastifyReply,
  ): Promise<CompleteOAuthSignupResponse> {
    if (!this.signupEnabled()) {
      throw new ForbiddenException('Public registration is closed.');
    }

    const pending = await this.burnTicket(input.ticket);
    const slug = input.slug.toLowerCase();
    const email = pending.email.toLowerCase();

    if (RESERVED.has(slug)) {
      throw new ConflictException('This address is not available');
    }

    const [slugTaken, emailTaken] = await this.prisma.asSystem(async (tx) =>
      Promise.all([
        tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
        tx.user.findUnique({ where: { email }, select: { id: true } }),
      ]),
    );
    if (slugTaken) throw new ConflictException('This address is not available');
    // The identity was unknown when the ticket was minted; by now the same
    // person may have finished a second tab. The pre-check is courtesy, the
    // unique index below is the guarantee.
    if (emailTaken) throw new ConflictException('An account with this email already exists');

    try {
      return await this.prisma.asSystem(async (tx) => {
        const { tenant, adminProfileId, planName } = await provisionTenant(tx, {
          slug,
          name: input.companyName,
          email,
          phone: input.companyPhone ?? null,
          taxId: input.taxId ?? null,
          status: 'TRIAL',
        });

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            name: input.name,
            // No password at all — this account signs in through the provider.
            // Null rather than an unguessable hash, because null is a fact the
            // rest of the system can act on (see `verifyPassword`), while a
            // random hash is a lie that only looks like a credential.
            passwordHash: null,
            // Legitimate here and nowhere else in signup: the provider asserted
            // the address and we refused the callback unless it said verified.
            // Mailing a code to an address its owner just authenticated with
            // would be ceremony, not proof.
            emailVerified: true,
            role: 'ADMIN',
            profileId: adminProfileId,
          },
        });

        await tx.oAuthAccount.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            provider: PRISMA_PROVIDER[pending.provider],
            providerAccountId: pending.providerAccountId,
            email,
          },
        });

        await tx.legalAcceptance.createMany({
          data: [
            { document: 'TERMS_OF_USE' as const, version: LEGAL_VERSIONS.terms },
            { document: 'PRIVACY_POLICY' as const, version: LEGAL_VERSIONS.privacy },
          ].map((doc) => ({
            ...doc,
            tenantId: tenant.id,
            userId: user.id,
            ip: ctx.ip ?? null,
            userAgent: ctx.userAgent ?? null,
          })),
        });

        const tokens = await this.tokens.issueTokensForUser(
          { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
          ctx,
        );
        await this.audit(tx, 'auth.oauth.signup', user.id, tenant.id, ctx, {
          provider: pending.provider,
          slug,
        });

        this.cookies.setAccessCookie(reply, tokens.accessToken);
        this.cookies.setRefreshCookie(reply, tokens.refreshToken);

        return {
          user: toUserDto(user),
          tenant: toTenantDto(tenant, planName ? { name: planName } : null),
        };
      });
    } catch (error) {
      // The race the pre-check cannot close: two tabs, or the same identity
      // arriving twice. Postgres decides and we translate its verdict.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        throw new ConflictException(
          target.includes('email') || target.includes('provider')
            ? 'An account with this email already exists'
            : 'This address is not available',
        );
      }
      throw error;
    }
  }

  /**
   * Read the ticket and destroy it, in that order and before anything is
   * created. Single use: a ticket that survived a failed attempt could be
   * replayed to make a second company out of one authorization.
   *
   * Read-then-delete is not atomic, so two simultaneous submissions can both
   * get past this point. What stops them is the unique index on the e-mail —
   * the same backstop public signup relies on.
   */
  private async burnTicket(ticket: string): Promise<PendingRegistration> {
    const key = this.pendingKey(ticket);
    const raw = await this.cache.get(key);
    await this.cache.del(key);

    // Deliberately one message for "never existed", "already used" and
    // "expired". The registration form has nothing useful to do with the
    // difference, and a caller poking at it would learn which tickets are real.
    const invalid = new BadRequestException('This registration link is no longer valid.');
    if (!raw) throw invalid;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw invalid;
    }
    const pending = parsed as Partial<PendingRegistration> | null;
    if (
      !pending ||
      typeof pending.email !== 'string' ||
      typeof pending.providerAccountId !== 'string' ||
      typeof pending.provider !== 'string' ||
      !(oauthProviders as readonly string[]).includes(pending.provider)
    ) {
      throw invalid;
    }

    return {
      provider: pending.provider as OAuthProvider,
      providerAccountId: pending.providerAccountId,
      email: pending.email,
      name: typeof pending.name === 'string' ? pending.name : null,
    };
  }

  // --- plumbing ---------------------------------------------------------------

  /** 404, not 400: whether a provider is configured is not public information. */
  private adapterOrThrow(provider: string): OAuthAdapter {
    const adapter = this.registry.get(provider as OAuthProvider);
    if (!adapter) throw new NotFoundException('Unknown sign-in provider');
    return adapter;
  }

  private signupEnabled(): boolean {
    return this.config.get('PUBLIC_SIGNUP_ENABLED', { infer: true });
  }

  /**
   * Hashed like every other opaque token in this codebase: the ticket is 256
   * bits of randomness handed to a browser, and only its digest is stored, so a
   * dumped Redis is not a pile of usable registration links.
   */
  private pendingKey(ticket: string): string {
    return `oauth:pending:${sha256(ticket)}`;
  }

  private errorRedirect(code: OAuthErrorCode): string {
    return `${this.config.get('WEB_ORIGIN', { infer: true })}/login?error=${code}`;
  }

  private flowCookieOptions(): CookieSerializeOptions {
    return {
      httpOnly: true,
      secure:
        this.config.get('COOKIE_SECURE', { infer: true }) ||
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      // `lax`, and it MUST be lax. Under `strict` the browser withholds the
      // cookie on a navigation that originated at accounts.google.com — which
      // is precisely the request this cookie exists for — so every callback
      // would read as a forged state and the flow could never complete. Lax
      // still keeps it off cross-site subrequests, and the state comparison,
      // not the cookie's own delivery rules, is what defends the flow.
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      // The path the BROWSER will ask for, derived from the callback base URL —
      // which points at the web origin, because the browser reaches the API
      // only through the BFF proxy. Using the API's own route here would set a
      // cookie that is never sent back.
      path: oauthCookiePath(this.config.get('OAUTH_CALLBACK_BASE_URL', { infer: true })),
      maxAge: OAUTH_STATE_TTL_SECONDS,
    };
  }

  /**
   * Carries the pending 2FA ticket from the callback to the login screen.
   *
   * Scoped to `/` because the page that reads it is the web app's own login
   * route, not anything under the OAuth callback path, and short-lived so a
   * ticket nobody used stops existing at roughly the moment the cache entry
   * behind it does.
   */
  private twoFactorTicketCookie(): CookieSerializeOptions {
    return {
      httpOnly: false,
      secure:
        this.config.get('COOKIE_SECURE', { infer: true }) ||
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
      maxAge: AuthService.LOGIN_TICKET_TTL,
    };
  }

  private setFlowCookie(reply: FastifyReply, state: Parameters<typeof encodeFlowState>[0]): void {
    reply.setCookie(OAUTH_STATE_COOKIE, encodeFlowState(state), this.flowCookieOptions());
  }

  private clearFlowCookie(reply: FastifyReply): void {
    const { maxAge: _maxAge, ...options } = this.flowCookieOptions();
    reply.clearCookie(OAUTH_STATE_COOKIE, options);
  }

  /**
   * Audit written here rather than through `AuthService.audit`, which resolves
   * the tenant with an extra query it does not need: at every call site below
   * the company is already in hand. Same shape, same never-break-the-request
   * contract — an audit row that fails must not cost the user their sign-in.
   */
  private async audit(
    tx: Prisma.TransactionClient,
    action: string,
    userId: string,
    tenantId: string | null,
    ctx: RequestContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await tx.auditLog.create({
        data: {
          action,
          tenantId,
          userId,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          metadata: metadata as object,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log "${action}": ${String(err)}`);
    }
  }
}
