import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { User } from '@prisma/client';
import type {
  ChangePasswordInput,
  EmailChangeRequestInput,
  EmailChangeVerifyInput,
  SessionDto,
  TwoFactorDisableInput,
  TwoFactorEnableInput,
  TwoFactorSetupResponse,
  UpdateProfileInput,
  UserDataExport,
  UserDto,
  SecurityStatus,
} from '@dontpanic/shared';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { CACHE_PROVIDER, type CacheProvider } from '../../../core/cache/cache.provider';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
} from '../../../core/mail/mail.provider';
import { TwoFactorService } from '../../auth/services/two-factor.service';
import { TokenService } from '../../auth/services/token.service';
import { generateNumericCode, sha256 } from '../../auth/support/crypto.util';
import { verificationCodeEmail, type EmailLocale } from '../../auth/support/email-templates';
import { toUserDto } from '../../auth/support/user.mapper';

/** Context captured from the request for audit logging and email locale. */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  locale?: EmailLocale;
}

/** A pending 2FA secret lives in the cache only until the user enables it. */
const PENDING_2FA_TTL = 10 * 60; // 10 minutes
/** A pending email change (code + target address) lives in the cache for 15min. */
const EMAIL_CHANGE_TTL = 15 * 60;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CACHE_PROVIDER) private readonly cache: CacheProvider,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  /**
   * Send transactional mail WITHOUT blocking the request. A slow SMTP host must
   * not slow the API response; failures are logged, not surfaced (resend flows
   * exist). Swap this for a durable queue (e.g. BullMQ) behind the same call.
   */
  private dispatchMail(message: MailMessage): void {
    void this.mail.send(message).catch((err) => {
      this.logger.warn(`Mail dispatch failed (${message.subject}): ${String(err)}`);
    });
  }

  // --- profile -----------------------------------------------------------

  async getProfile(userId: string): Promise<UserDto> {
    const user = await this.requireActiveUser(userId);
    return toUserDto(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    await this.requireActiveUser(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { name: input.name },
    });
    return toUserDto(updated);
  }

  // --- password ----------------------------------------------------------

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.requireActiveUser(userId);

    const currentOk = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!currentOk) {
      // Re-auth failure stays terse — leaks nothing about the account.
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await argon2.hash(input.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // A password change invalidates every session — force re-login everywhere.
    await this.tokenService.revokeAllForUser(userId);
    await this.audit('user.password_changed', userId, ctx);
  }

  // --- 2FA ----------------------------------------------------------------

  private pendingSecretKey(userId: string): string {
    return `2fa:pending:${userId}`;
  }

  /** Drives the 2FA onboarding on the client (forced setup vs snoozable prompt). */
  async getSecurityStatus(userId: string): Promise<SecurityStatus> {
    const user = await this.requireActiveUser(userId);
    const twoFactorRequired = this.config.get('TWO_FACTOR_REQUIRED', { infer: true });
    const remindDue = !user.twoFactorRemindAt || user.twoFactorRemindAt <= new Date();
    return {
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorRequired,
      shouldPrompt: !user.twoFactorEnabled && !twoFactorRequired && remindDue,
    };
  }

  /** "Not now": don't nudge again about 2FA for 24h. */
  async snoozeTwoFactorPrompt(userId: string): Promise<void> {
    await this.requireActiveUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorRemindAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
  }

  async setupTwoFactor(userId: string): Promise<TwoFactorSetupResponse> {
    const user = await this.requireActiveUser(userId);
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const setup = await this.twoFactor.generateSetup(user.email);
    // Stash the candidate secret until the user proves they can produce a code.
    await this.cache.set(this.pendingSecretKey(userId), setup.secret, PENDING_2FA_TTL);
    return setup;
  }

  async enableTwoFactor(
    userId: string,
    input: TwoFactorEnableInput,
    ctx: RequestContext,
  ): Promise<string[]> {
    const user = await this.requireActiveUser(userId);
    if (user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const pendingSecret = await this.cache.get(this.pendingSecretKey(userId));
    if (!pendingSecret) {
      throw new BadRequestException('No pending 2FA setup — start setup again');
    }

    const valid = await this.twoFactor.verifyTotp(pendingSecret, input.code);
    if (!valid) {
      throw new BadRequestException('Invalid verification code');
    }

    const { raw, hashes } = await this.twoFactor.generateBackupCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: pendingSecret, twoFactorEnabled: true },
    });
    await this.twoFactor.replaceBackupCodes(userId, hashes);
    await this.cache.del(this.pendingSecretKey(userId));
    await this.audit('user.2fa_enabled', userId, ctx);

    // Returned exactly once — never retrievable again.
    return raw;
  }

  async disableTwoFactor(
    userId: string,
    input: TwoFactorDisableInput,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.requireActiveUser(userId);
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Re-prove identity: a live TOTP code OR the account password.
    const accepted = input.code
      ? await this.twoFactor.verifyTotp(user.twoFactorSecret, input.code)
      : input.password
        ? await argon2.verify(user.passwordHash, input.password)
        : false;
    if (!accepted) {
      throw new UnauthorizedException('Verification failed');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      }),
      this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    ]);
    await this.cache.del(this.pendingSecretKey(userId));
    await this.audit('user.2fa_disabled', userId, ctx);
  }

  // --- active sessions (refresh-token rotation families) -----------------

  /** List active sessions, one per rotation family, marking the current one. */
  async listSessions(userId: string, currentFamilyId?: string): Promise<SessionDto[]> {
    await this.requireActiveUser(userId);
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    const byFamily = new Map<string, typeof tokens>();
    for (const token of tokens) {
      const list = byFamily.get(token.familyId);
      if (list) list.push(token);
      else byFamily.set(token.familyId, [token]);
    }

    const sessions = [...byFamily.entries()].map(([familyId, list]) => {
      const newest = list[0]; // createdAt desc → newest first
      const oldest = list[list.length - 1];
      return {
        id: familyId,
        current: familyId === currentFamilyId,
        ip: newest.ip,
        userAgent: newest.userAgent,
        createdAt: oldest.createdAt.toISOString(),
        lastUsedAt: newest.createdAt.toISOString(),
      };
    });

    // Current session first, then most-recently-used.
    return sessions.sort((a, b) =>
      a.current === b.current ? b.lastUsedAt.localeCompare(a.lastUsedAt) : a.current ? -1 : 1,
    );
  }

  /** Revoke one session (rotation family). Verifies it belongs to the caller. */
  async revokeSession(userId: string, familyId: string, ctx: RequestContext): Promise<void> {
    await this.requireActiveUser(userId);
    const owned = await this.prisma.refreshToken.findFirst({ where: { userId, familyId } });
    if (!owned) {
      throw new NotFoundException('Session not found');
    }
    await this.tokenService.revokeFamily(familyId);
    await this.audit('user.session_revoked', userId, ctx, { familyId });
  }

  /** Sign out everywhere else — revoke every family but the current one. */
  async revokeOtherSessions(
    userId: string,
    currentFamilyId: string | undefined,
    ctx: RequestContext,
  ): Promise<void> {
    await this.requireActiveUser(userId);
    if (!currentFamilyId) {
      throw new BadRequestException('Cannot identify the current session');
    }
    await this.tokenService.revokeOtherFamilies(userId, currentFamilyId);
    await this.audit('user.sessions_revoked_others', userId, ctx, { keep: currentFamilyId });
  }

  // --- email change (by code, two steps) ---------------------------------

  private emailChangeKey(userId: string): string {
    return `email-change:${userId}`;
  }

  /** Step 1: verify the password, ensure the new address is free, email a code. */
  async requestEmailChange(
    userId: string,
    input: EmailChangeRequestInput,
    ctx: RequestContext,
  ): Promise<void> {
    const user = await this.requireActiveUser(userId);

    const passwordOk = await argon2.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newEmail = input.newEmail.toLowerCase();
    if (newEmail === user.email.toLowerCase()) {
      throw new BadRequestException('That is already your email address');
    }
    const taken = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (taken && !taken.deletedAt) {
      throw new ConflictException('That email is already in use');
    }

    const code = generateNumericCode(6);
    await this.cache.set(
      this.emailChangeKey(userId),
      JSON.stringify({ newEmail, codeHash: sha256(code) }),
      EMAIL_CHANGE_TTL,
    );
    const mail = verificationCodeEmail({ name: user.name, code, locale: ctx.locale ?? 'pt-BR' });
    this.dispatchMail({ to: newEmail, subject: mail.subject, html: mail.html, text: mail.text });
    await this.audit('user.email_change_requested', userId, ctx, { newEmail });
  }

  /** Step 2: confirm the code and switch the account over to the new address. */
  async verifyEmailChange(
    userId: string,
    input: EmailChangeVerifyInput,
    ctx: RequestContext,
  ): Promise<{ message: string }> {
    await this.requireActiveUser(userId);

    const raw = await this.cache.get(this.emailChangeKey(userId));
    if (!raw) {
      throw new BadRequestException('No pending email change — start again');
    }
    const { newEmail, codeHash } = JSON.parse(raw) as { newEmail: string; codeHash: string };
    if (sha256(input.code) !== codeHash) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Re-check the address is still free (someone could have taken it meanwhile).
    const taken = await this.prisma.user.findUnique({ where: { email: newEmail } });
    if (taken && taken.id !== userId && !taken.deletedAt) {
      throw new ConflictException('That email is already in use');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { email: newEmail, emailVerified: true },
    });
    await this.cache.del(this.emailChangeKey(userId));
    await this.audit('user.email_changed', userId, ctx, { newEmail });

    return { message: "Email updated. Don't Panic." };
  }

  // --- LGPD: access (export) & erasure (delete) --------------------------

  async exportData(userId: string): Promise<UserDataExport> {
    const user = await this.requireActiveUser(userId);
    const auditLogs = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      profile: toUserDto(user),
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        ip: log.ip,
        userAgent: log.userAgent,
        metadata: (log.metadata ?? null) as unknown,
        createdAt: log.createdAt.toISOString(),
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  async eraseAccount(userId: string, ctx: RequestContext): Promise<void> {
    await this.requireActiveUser(userId);

    // Soft-delete + anonymize: keep the row for referential integrity and audit
    // lineage, but scrub PII and disable any path back into the account.
    const anonymousEmail = `deleted+${randomUUID()}@deleted.invalid`;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          email: anonymousEmail,
          name: 'Deleted user',
          avatarUrl: null,
          twoFactorEnabled: false,
          twoFactorSecret: null,
          // Lock the credential so the anonymized account can never authenticate.
          passwordHash: await argon2.hash(randomUUID()),
        },
      }),
      this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
    ]);

    // Kill every session and the pending-2FA cache entry.
    await this.tokenService.revokeAllForUser(userId);
    await this.cache.del(this.pendingSecretKey(userId));
    await this.audit('user.account_erased', userId, ctx);
  }

  // --- helpers -----------------------------------------------------------

  /** Fetch a non-deleted user or fail. Soft-deleted accounts behave as gone. */
  private async requireActiveUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.deletedAt) {
      throw new ForbiddenException('This account has been deleted');
    }
    return user;
  }

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
}
