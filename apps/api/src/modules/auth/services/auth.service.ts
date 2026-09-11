import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { SessionEndReason } from '@prisma/client';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SessionEndedReason,
  TwoFactorChallenge,
  UserDto,
} from '@dontpanic/shared';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { TenantContext } from '../../../infra/tenancy/tenant-context';
import { CACHE_PROVIDER, type CacheProvider } from '../../../core/cache/cache.provider';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../../../core/mail/mail.provider';
import { TokenService, type IssuedTokens } from './token.service';
import { TwoFactorService } from './two-factor.service';
import { generateNumericCode, generateRawToken, sha256 } from '../support/crypto.util';
import { verificationCodeEmail, type EmailLocale } from '../support/email-templates';
import { toUserDto } from '../support/user.mapper';

/** Context captured from the request for audit logging and token binding. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  locale?: EmailLocale;
}

/** Result of login: either tokens to set as cookies, or a 2FA challenge. */
export type LoginResult =
  | { kind: 'tokens'; user: UserDto; tokens: IssuedTokens }
  | { kind: 'challenge'; challenge: TwoFactorChallenge };

const EMAIL_VERIFY_TTL = 15 * 60; // 15min — verification-code lifetime
const EMAIL_VERIFY_MAX_ATTEMPTS = 5; // wrong codes before the code is invalidated
const EMAIL_RESEND_COOLDOWN = 60; // 1min between resend requests
const PASSWORD_RESET_TTL = 60 * 60; // 1h
const LOGIN_TICKET_TTL = 5 * 60; // 5min for the 2FA second step
const TWO_FACTOR_MAX_ATTEMPTS = 5; // failed 2FA codes before the ticket is burned

/**
 * A precomputed Argon2 hash of a random string, verified against on logins for
 * non-existent/soft-deleted accounts so the expensive hashing step is paid on
 * EVERY login — closing the user-enumeration timing oracle.
 */
const DUMMY_PASSWORD_HASH = argon2.hash(randomBytes(32).toString('hex'));

/**
 * Stored reason -> the reason as the browser is allowed to hear it.
 *
 * Two enums on purpose. The column is forensic and records every ending,
 * including `ROTATED` — the ordinary, invisible replacement of a token by its
 * successor, which happens every few minutes and means nothing to the person
 * using the app. It is absent from this map so it can never be translated and
 * shown; anything that falls off the map simply says nothing.
 */
const WIRE_REASON: Partial<Record<SessionEndReason, SessionEndedReason>> = {
  LOGOUT: 'logout',
  REUSE_DETECTED: 'reuse-detected',
  SIGNED_IN_ELSEWHERE: 'signed-in-elsewhere',
};

/**
 * A 401 that also says WHY the session is gone.
 *
 * The message stays the same terse 'Invalid session' it has always been — the
 * explanation rides in a separate, closed field, so nothing about which token
 * existed or when it died leaks into free text.
 */
function sessionEnded(reason: SessionEndedReason): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: HttpStatus.UNAUTHORIZED,
    error: 'Unauthorized',
    message: 'Invalid session',
    sessionEnded: reason,
  });
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: TokenService,
    private readonly twoFactor: TwoFactorService,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /**
   * Send transactional mail WITHOUT blocking the request — a slow SMTP host must
   * not slow auth responses. Failures are logged, not surfaced (resend/forgot
   * flows recover). A durable queue (BullMQ) can later slot in behind this call.
   */
  private dispatchMail(message: MailMessage): void {
    void this.mail.send(message).catch((err) => {
      this.logger.warn(`Mail dispatch failed (${message.subject}): ${String(err)}`);
    });
  }

  // --- e-mail verification ----------------------------------------------

  /** Public so SignupService reuses the same verification path. */
  async sendVerificationCode(
    userId: string,
    email: string,
    name: string,
    locale: EmailLocale,
  ): Promise<void> {
    // One active code per user.
    await this.prisma.db.emailVerificationToken.deleteMany({ where: { userId } });
    const code = generateNumericCode(6);
    await this.prisma.db.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: sha256(code),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL * 1000),
      },
    });
    await this.cache.del(this.verifyAttemptsKey(email));
    const mail = verificationCodeEmail({ name, code, locale });
    this.dispatchMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  }

  private verifyAttemptsKey(email: string): string {
    return `email-verify:attempts:${email}`;
  }

  async verifyEmail(
    email: string,
    code: string,
    ctx: RequestContext,
  ): Promise<{ message: string }> {
    const invalid = (): never => {
      throw new BadRequestException('Invalid or expired code');
    };

    const user = await this.prisma.db.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return invalid();
    if (user.emailVerified) return { message: "Already verified. Don't Panic." };

    const attemptsKey = this.verifyAttemptsKey(email);
    const attempts = Number((await this.cache.get(attemptsKey)) ?? '0');
    if (attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
      await this.prisma.db.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      throw new BadRequestException('Too many attempts — request a new code');
    }

    const record = await this.prisma.db.emailVerificationToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      record.tokenHash !== sha256(code)
    ) {
      await this.cache.incr(attemptsKey, EMAIL_VERIFY_TTL);
      return invalid();
    }

    // One transaction: an account marked verified whose code is still live, or
    // a burnt code on an unverified account, are both states nobody can repair.
    await this.prisma.atomic(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });
    await this.cache.del(attemptsKey);
    await this.audit('auth.email_verified', user.id, ctx, {});

    return { message: "Email verified. Don't Panic — you're all set." };
  }

  async resendVerification(email: string, ctx: RequestContext): Promise<{ message: string }> {
    const generic = {
      message: 'If that account exists and is unverified, a new code is on its way.',
    };
    const cooldownKey = `email-verify:resend:${email}`;
    if (await this.cache.get(cooldownKey)) return generic;

    const user = await this.prisma.db.user.findUnique({ where: { email } });
    if (user && !user.deletedAt && !user.emailVerified) {
      await this.cache.set(cooldownKey, '1', EMAIL_RESEND_COOLDOWN);
      await this.sendVerificationCode(user.id, user.email, user.name, ctx.locale ?? 'pt-BR');
    }
    return generic;
  }

  // --- login & lockout ---------------------------------------------------

  async login(input: LoginInput, ctx: RequestContext): Promise<LoginResult> {
    const lockKey = `login:attempts:${input.email}`;
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
    const lockDuration = this.config.get('LOGIN_LOCK_DURATION', { infer: true });

    // Fast path: too many recent failures for this email — refuse without even
    // hitting Argon2 (cheap DoS protection), but stay generic.
    const attempts = Number((await this.cache.get(lockKey)) ?? '0');
    if (attempts >= maxAttempts) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.db.user.findUnique({ where: { email: input.email } });

    // Account-column lockout (survives cache flush; per-user, not per-attempt-bucket).
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Always pay the Argon2 cost so the response timing does not reveal whether
    // the email exists. For a missing/soft-deleted account we verify against a
    // fixed dummy hash and discard the result.
    let passwordOk: boolean;
    if (user && !user.deletedAt) {
      passwordOk = await argon2.verify(user.passwordHash, input.password);
    } else {
      await argon2.verify(await DUMMY_PASSWORD_HASH, input.password);
      passwordOk = false;
    }

    if (!user || user.deletedAt || !passwordOk) {
      await this.registerFailedAttempt(lockKey, lockDuration, maxAttempts, user?.id ?? null);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success — clear counters.
    await this.cache.del(lockKey);
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    if (user.twoFactorEnabled) {
      const ticket = await this.createLoginTicket(user.id);
      await this.audit('auth.login.2fa_required', user.id, ctx);
      return { kind: 'challenge', challenge: { twoFactorRequired: true, ticket } };
    }

    const tokens = await this.tokenService.issueTokensForUser(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      ctx,
    );
    await this.audit('auth.login', user.id, ctx);
    return { kind: 'tokens', user: toUserDto(user), tokens };
  }

  /**
   * Runs a write that has to SURVIVE the rejection that follows it.
   *
   * The whole request runs inside one transaction, so throwing rolls it back —
   * and that would quietly undo exactly the bookkeeping a rejection exists for:
   * the failed-attempt counter, the account lock, the revoked token family. An
   * attacker could then guess passwords for ever, because every wrong guess
   * would erase its own evidence. So these writes get a transaction of their
   * own, committed before we refuse.
   *
   * Legal only while the request transaction has not written the rows involved:
   * two transactions touching the same row would wait on each other and the
   * request would hang instead of failing.
   */
  private async durably(fn: () => Promise<void>): Promise<void> {
    await this.prisma.asSystem(fn);
  }

  private async registerFailedAttempt(
    lockKey: string,
    lockDuration: number,
    maxAttempts: number,
    userId: string | null,
  ): Promise<void> {
    await this.cache.incr(lockKey, lockDuration);
    if (!userId) return;
    // Mirror the failure onto the user row; lock the account once over the limit.
    await this.durably(async () => {
      const updated = await this.prisma.db.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      if (updated.failedLoginAttempts >= maxAttempts) {
        await this.prisma.db.user.update({
          where: { id: userId },
          data: { lockedUntil: new Date(Date.now() + lockDuration * 1000) },
        });
      }
    });
  }

  // --- 2FA second step ---------------------------------------------------

  private ticketKey(ticket: string): string {
    return `2fa:ticket:${ticket}`;
  }

  private twoFactorFailKey(ticket: string): string {
    return `2fa:fails:${ticket}`;
  }

  private async createLoginTicket(userId: string): Promise<string> {
    const ticket = generateRawToken();
    await this.cache.set(this.ticketKey(ticket), userId, LOGIN_TICKET_TTL);
    return ticket;
  }

  async verifyTwoFactor(
    ticket: string,
    code: string,
    ctx: RequestContext,
  ): Promise<{ user: UserDto; tokens: IssuedTokens }> {
    const userId = await this.cache.get(this.ticketKey(ticket));
    if (!userId) {
      throw new UnauthorizedException('Invalid or expired 2FA challenge');
    }

    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Invalid or expired 2FA challenge');
    }

    const totpOk = await this.twoFactor.verifyTotp(user.twoFactorSecret, code);
    const accepted = totpOk || (await this.twoFactor.consumeBackupCode(user.id, code));
    if (!accepted) {
      // Brute-force guard: a 6-digit TOTP has only 1M values and a ±1 step
      // window, so the ticket must not be a free pool of guesses. Count failures
      // per ticket; once over the limit, burn the ticket so the attacker is
      // forced all the way back to the password step.
      const fails = await this.cache.incr(this.twoFactorFailKey(ticket), LOGIN_TICKET_TTL);
      await this.audit('auth.2fa.failed', user.id, ctx, { attempt: fails });
      if (fails >= TWO_FACTOR_MAX_ATTEMPTS) {
        await this.cache.del(this.ticketKey(ticket));
        await this.cache.del(this.twoFactorFailKey(ticket));
        // Mirror onto the account lockout exactly like password failures.
        const lockDuration = this.config.get('LOGIN_LOCK_DURATION', { infer: true });
        await this.prisma.db.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + lockDuration * 1000) },
        });
        await this.audit('auth.2fa.locked', user.id, ctx);
      }
      throw new UnauthorizedException('Invalid 2FA code');
    }

    // One-time ticket: burn it so the second step can't be replayed.
    await this.cache.del(this.ticketKey(ticket));
    await this.cache.del(this.twoFactorFailKey(ticket));

    const tokens = await this.tokenService.issueTokensForUser(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      ctx,
    );
    await this.audit('auth.login.2fa', user.id, ctx, {
      method: totpOk ? 'totp' : 'backup_code',
    });
    return { user: toUserDto(user), tokens };
  }

  // --- refresh rotation & reuse detection --------------------------------

  async refresh(
    rawRefreshToken: string,
    ctx: RequestContext,
  ): Promise<{ user: UserDto; tokens: IssuedTokens }> {
    const tokenHash = sha256(rawRefreshToken);
    const record = await this.prisma.db.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) {
      throw new UnauthorizedException('Invalid session');
    }

    // REUSE DETECTION: a token that's already revoked (i.e. previously rotated
    // away or logged out) being presented again means it was stolen and replayed
    // — UNLESS the rotation happened moments ago and the session is still alive,
    // which is just a second tab refreshing with the same cookie. Real replay
    // still nukes the entire family.
    const alreadyRotated = Boolean(record.revokedAt || record.replacedById);
    if (alreadyRotated && !(await this.isConcurrentRotation(record))) {
      await this.rejectAsReuse(record, ctx);
    }

    if (record.expiresAt < new Date()) {
      // Nothing went wrong here: sessions are meant to end. Saying so is what
      // stops an ordinary expiry from looking like a bug to the person who just
      // got bounced to the login screen.
      throw sessionEnded('expired');
    }

    const user = await this.prisma.db.user.findUnique({ where: { id: record.userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid session');
    }

    // Mint first, claim second. The order matters: `revokedAt` and `replacedById`
    // are now written by the SAME conditional update, so there is never an
    // instant where the row reads as revoked-but-without-a-successor — the state
    // a concurrent request could not tell apart from theft.
    const { tokens, refreshTokenId } = await this.tokenService.issueTokensInFamily(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      record.familyId,
      ctx,
    );

    if (alreadyRotated) {
      // Inside the grace window: the row belongs to whoever won the rotation.
      // Nothing to claim — this caller just gets its own successor in the family.
      await this.audit('auth.refresh.concurrent', user.id, ctx, { familyId: record.familyId });
      return { user: toUserDto(user), tokens };
    }

    // Atomically CLAIM this token. The transition unrevoked->revoked for a single
    // row is one guarded conditional write whose row-count tells us whether we
    // won. Two concurrent refreshes of the SAME token race here: exactly one
    // updates 1 row, the loser updates 0 — closing the TOCTOU replay hole.
    const claimed = await this.prisma.db.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null, replacedById: null },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED', replacedById: refreshTokenId },
    });
    if (claimed.count === 0) {
      // We lost the race. Re-read the row: if the winner rotated it just now and
      // the family is still alive, this is concurrency, not theft.
      const current = await this.prisma.db.refreshToken.findUnique({ where: { id: record.id } });
      if (current && (await this.isConcurrentRotation(current, refreshTokenId))) {
        await this.audit('auth.refresh.concurrent', user.id, ctx, { familyId: record.familyId });
        return { user: toUserDto(user), tokens };
      }
      // Genuine reuse — revokeFamily also kills the successor we just minted.
      await this.rejectAsReuse(record, ctx);
    }

    await this.audit('auth.refresh', user.id, ctx);
    return { user: toUserDto(user), tokens };
  }

  /** Detected theft: kill the whole lineage and refuse. Never returns. */
  private async rejectAsReuse(
    record: { familyId: string; userId: string; revokedReason?: SessionEndReason | null },
    ctx: RequestContext,
  ): Promise<never> {
    await this.durably(async () => {
      await this.tokenService.revokeFamily(record.familyId, 'REUSE_DETECTED');
      await this.audit('auth.refresh.reuse_detected', record.userId, ctx, {
        familyId: record.familyId,
      });
    });
    this.logger.warn(`Refresh token reuse detected for family ${record.familyId}; family revoked`);
    // The family dies either way — replaying a dead token is how a stolen one
    // behaves. But what the USER is told depends on how this token died: a tab
    // that slept through its owner's own logout is not a theft, and crying
    // theft there teaches people to ignore the one warning that matters.
    // `ROTATED` and an unrevoked row both fall through to the honest answer.
    const known = record.revokedReason ? WIRE_REASON[record.revokedReason] : undefined;
    throw sessionEnded(known ?? 'reuse-detected');
  }

  /**
   * Re-presenting an already-rotated token is theft — **except** when the
   * rotation just happened and the session is still alive.
   *
   * Three conditions, all necessary:
   * - the token was **rotated** (it has a successor), not revoked by logout or
   *   by a family revocation — those leave `replacedById` null;
   * - the rotation was less than `REFRESH_REUSE_GRACE` seconds ago;
   * - the family still has a live token. Without this, a token rotated inside
   *   the window would keep being accepted after the family was revoked, because
   *   `revokeFamily` does not touch the `revokedAt` of rows already revoked.
   */
  private async isConcurrentRotation(
    record: { familyId: string; revokedAt: Date | null; replacedById: string | null },
    /** Token minted by this request: not confirmed yet, so it doesn't count as life. */
    ignoreTokenId?: string,
  ): Promise<boolean> {
    if (!record.replacedById || !record.revokedAt) return false;

    const graceMs = this.config.get('REFRESH_REUSE_GRACE', { infer: true }) * 1000;
    if (Date.now() - record.revokedAt.getTime() > graceMs) return false;

    const alive = await this.prisma.db.refreshToken.count({
      where: {
        familyId: record.familyId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(ignoreTokenId ? { NOT: { id: ignoreTokenId } } : {}),
      },
    });
    return alive > 0;
  }

  // --- logout ------------------------------------------------------------

  async logout(rawRefreshToken: string | undefined, ctx: RequestContext): Promise<void> {
    if (!rawRefreshToken) return;
    const record = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash: sha256(rawRefreshToken) },
    });
    if (record && !record.revokedAt) {
      await this.tokenService.revokeToken(record.id, 'LOGOUT');
      await this.audit('auth.logout', record.userId, ctx);
    }
  }

  // --- forgot / reset password ------------------------------------------

  async forgotPassword(input: ForgotPasswordInput, ctx: RequestContext): Promise<void> {
    const user = await this.prisma.db.user.findUnique({ where: { email: input.email } });
    // Always return 200 to the caller; only send mail if the account exists.
    // Never reveal whether the email is registered.
    if (!user || user.deletedAt) return;

    const raw = generateRawToken();
    await this.prisma.db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL * 1000),
      },
    });
    const link = `${this.config.get('WEB_ORIGIN', { infer: true })}/reset-password?token=${raw}`;
    this.dispatchMail({
      to: user.email,
      subject: 'Reset your password — DontPanic',
      html: `<p>Don't Panic. Someone (hopefully you) asked to reset your password.</p><p><a href="${link}">Choose a new password</a></p><p>This link expires in 1 hour. If it wasn't you, ignore this email.</p>`,
      text: `Don't Panic. Reset your password: ${link} (expires in 1 hour). If it wasn't you, ignore this email.`,
    });
    await this.audit('auth.forgot_password', user.id, ctx);
  }

  async resetPassword(
    input: ResetPasswordInput,
    ctx: RequestContext,
  ): Promise<{ message: string }> {
    const tokenHash = sha256(input.token);
    const record = await this.prisma.db.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(input.password);
    // One transaction: a new password with the reset token still usable would
    // leave the account open to a second reset by whoever else holds the link.
    await this.prisma.atomic(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });

    // Invalidate every existing session — a reset means "lock everyone else out".
    // Recorded as LOGOUT: the account's owner deliberately ended those sessions.
    // There is no dedicated reason for a password change, and inventing one here
    // would mean a DB enum value the wire contract cannot express.
    await this.tokenService.revokeAllForUser(record.userId, 'LOGOUT');
    await this.audit('auth.reset_password', record.userId, ctx);

    return { message: "Password updated. Don't Panic — you can log in now." };
  }

  // --- audit -------------------------------------------------------------

  /** Public so SignupService writes through the same audit path. */
  async audit(
    action: string,
    userId: string | null,
    ctx: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    // The audit row has to satisfy the SAME RLS check as the request that
    // produced it. Written without a tenant while the request runs in tenant
    // scope, Postgres refuses it — and a refused statement aborts the whole
    // transaction, taking the operation being audited down with it. Swallowing
    // the error below would hide that, not undo it.
    //
    // In system scope (the whole authentication surface) there is no tenant to
    // read off the scope, so we resolve it from the user instead — otherwise a
    // company could never see its own sign-ins, which is precisely the part of
    // an audit trail a customer asks for. One indexed lookup, on a path that
    // runs once per authentication, and RLS permits the write because system
    // scope is allowed to address any tenant.
    const scope = TenantContext.get()?.scope;
    const tenantId =
      scope?.kind === 'tenant' ? scope.tenantId : ((await this.tenantOf(userId)) ?? null);
    try {
      await this.prisma.db.auditLog.create({
        data: {
          action,
          tenantId,
          userId,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          metadata: (metadata as object) ?? undefined,
        },
      });
    } catch (err) {
      // Audit must never break the request path.
      this.logger.warn(`Failed to write audit log "${action}": ${String(err)}`);
    }
  }

  /** The user's company, or null when there is no user or no company. */
  private async tenantOf(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const row = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });
    return row?.tenantId ?? null;
  }

  // exposed for clarity / potential reuse
  static readonly LOGIN_TICKET_TTL = LOGIN_TICKET_TTL;
}
