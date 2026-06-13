import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  TwoFactorChallenge,
  UserDto,
} from '@dontpanic/shared';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { CACHE_PROVIDER, type CacheProvider } from '../../../core/cache/cache.provider';
import { MAIL_PROVIDER, type MailProvider } from '../../../core/mail/mail.provider';
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

  // --- registration & e-mail verification -------------------------------

  async register(input: RegisterInput, ctx: RequestContext): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      // Registration legitimately reveals a taken e-mail (UX > the marginal
      // enumeration risk, which forgot-password already mitigates).
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: { email: input.email, passwordHash, name: input.name },
    });

    await this.sendVerificationCode(user.id, user.email, user.name, ctx.locale ?? 'pt-BR');
    await this.audit('auth.register', user.id, ctx, { email: user.email });

    return toUserDto(user);
  }

  private async sendVerificationCode(
    userId: string,
    email: string,
    name: string,
    locale: EmailLocale,
  ): Promise<void> {
    // One active code per user.
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId } });
    const code = generateNumericCode(6);
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: sha256(code),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL * 1000),
      },
    });
    await this.cache.del(this.verifyAttemptsKey(email));
    const mail = verificationCodeEmail({ name, code, locale });
    await this.mail.send({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
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

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return invalid();
    if (user.emailVerified) return { message: "Already verified. Don't Panic." };

    const attemptsKey = this.verifyAttemptsKey(email);
    const attempts = Number((await this.cache.get(attemptsKey)) ?? '0');
    if (attempts >= EMAIL_VERIFY_MAX_ATTEMPTS) {
      await this.prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      throw new BadRequestException('Too many attempts — request a new code');
    }

    const record = await this.prisma.emailVerificationToken.findFirst({
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

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
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

    const user = await this.prisma.user.findUnique({ where: { email } });
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

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

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
      await this.prisma.user.update({
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
      { id: user.id, email: user.email, role: user.role },
      ctx,
    );
    await this.audit('auth.login', user.id, ctx);
    return { kind: 'tokens', user: toUserDto(user), tokens };
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
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });
    if (updated.failedLoginAttempts >= maxAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + lockDuration * 1000) },
      });
    }
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

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
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
        await this.prisma.user.update({
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
      { id: user.id, email: user.email, role: user.role },
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
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) {
      throw new UnauthorizedException('Invalid session');
    }

    // REUSE DETECTION: a token that's already revoked (i.e. previously rotated
    // away or logged out) being presented again means it was stolen and replayed.
    // Nuke the entire family so neither the thief nor the victim can continue.
    if (record.revokedAt || record.replacedById) {
      await this.tokenService.revokeFamily(record.familyId);
      this.logger.warn(
        `Refresh token reuse detected for family ${record.familyId}; family revoked`,
      );
      await this.audit('auth.refresh.reuse_detected', record.userId, ctx, {
        familyId: record.familyId,
      });
      throw new UnauthorizedException('Invalid session');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid session');
    }

    // Atomically CLAIM this token before minting a successor. The transition
    // unrevoked->revoked for a single row is one guarded conditional write whose
    // row-count tells us whether we won. Two concurrent refreshes of the SAME
    // token race here: exactly one updates 1 row, the loser updates 0 and is
    // treated as reuse — closing the TOCTOU replay hole.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null, replacedById: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      // We lost the race (or it was already rotated/revoked): treat as theft.
      await this.tokenService.revokeFamily(record.familyId);
      this.logger.warn(
        `Refresh token reuse detected for family ${record.familyId}; family revoked`,
      );
      await this.audit('auth.refresh.reuse_detected', record.userId, ctx, {
        familyId: record.familyId,
      });
      throw new UnauthorizedException('Invalid session');
    }

    // We own the rotation now: mint the successor in the SAME family and point
    // the claimed row at its replacement (keeps the lineage auditable).
    const { tokens, refreshTokenId } = await this.tokenService.issueTokensInFamily(
      { id: user.id, email: user.email, role: user.role },
      record.familyId,
      ctx,
    );
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { replacedById: refreshTokenId },
    });

    await this.audit('auth.refresh', user.id, ctx);
    return { user: toUserDto(user), tokens };
  }

  // --- logout ------------------------------------------------------------

  async logout(rawRefreshToken: string | undefined, ctx: RequestContext): Promise<void> {
    if (!rawRefreshToken) return;
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawRefreshToken) },
    });
    if (record && !record.revokedAt) {
      await this.tokenService.revokeToken(record.id);
      await this.audit('auth.logout', record.userId, ctx);
    }
  }

  // --- forgot / reset password ------------------------------------------

  async forgotPassword(input: ForgotPasswordInput, ctx: RequestContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always return 200 to the caller; only send mail if the account exists.
    // Never reveal whether the email is registered.
    if (!user || user.deletedAt) return;

    const raw = generateRawToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL * 1000),
      },
    });
    const link = `${this.config.get('WEB_ORIGIN', { infer: true })}/reset-password?token=${raw}`;
    await this.mail.send({
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
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(input.password);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Invalidate every existing session — a reset means "lock everyone else out".
    await this.tokenService.revokeAllForUser(record.userId);
    await this.audit('auth.reset_password', record.userId, ctx);

    return { message: "Password updated. Don't Panic — you can log in now." };
  }

  // --- audit -------------------------------------------------------------

  private async audit(
    action: string,
    userId: string | null,
    ctx: RequestContext,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
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

  // exposed for clarity / potential reuse
  static readonly LOGIN_TICKET_TTL = LOGIN_TICKET_TTL;
}
