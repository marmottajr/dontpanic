import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { SessionEndReason } from '@prisma/client';
import type { Role } from '@dontpanic/shared';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { generateRawToken, sha256 } from '../support/crypto.util';

/** Claims carried by the access JWT. `sub` is the user id (RFC 7519). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  /**
   * The user's company. This is what the tenant scope is derived from, and the
   * only place it may come from: a header or body field could be swapped by the
   * caller, a signed claim cannot. Absent for SUPERADMIN, who has no company.
   */
  tid?: string | null;
  /** Rotation family of the session this token belongs to (for session mgmt). */
  fam?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

interface IssueContext {
  userAgent?: string | null;
  ip?: string | null;
}

/**
 * Mints access JWTs and persists refresh tokens. Refresh tokens are opaque
 * random strings whose SHA-256 hash is stored with a `familyId` — the unit of
 * rotation and theft detection. Access and refresh secrets are distinct, so an
 * access token can never be replayed as a refresh token.
 *
 * Every revocation path takes the reason as a REQUIRED argument and writes it to
 * `revokedReason`. Required, not optional-with-a-default: a default is the one
 * thing a future call site can silently inherit, and a session that ended for an
 * unknown reason is a session the app cannot explain to the person it happened
 * to. The compiler asks the question so nobody has to remember it.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Issue a fresh access JWT plus a brand-new refresh token in a NEW family.
   * Used at login and after 2FA — i.e. whenever a session is born.
   */
  async issueTokensForUser(
    user: { id: string; email: string; role: Role; tenantId?: string | null },
    ctx: IssueContext = {},
  ): Promise<IssuedTokens> {
    const familyId = randomUUID();
    return this.mint(user, familyId, ctx);
  }

  /**
   * Issue tokens that continue an existing rotation family. Used on refresh so
   * the whole lineage can be revoked together if reuse is ever detected.
   */
  async issueTokensInFamily(
    user: { id: string; email: string; role: Role; tenantId?: string | null },
    familyId: string,
    ctx: IssueContext = {},
  ): Promise<{ tokens: IssuedTokens; refreshTokenId: string }> {
    return this.mintWithId(user, familyId, ctx);
  }

  private async mint(
    user: { id: string; email: string; role: Role; tenantId?: string | null },
    familyId: string,
    ctx: IssueContext,
  ): Promise<IssuedTokens> {
    const { tokens } = await this.mintWithId(user, familyId, ctx);
    return tokens;
  }

  private async mintWithId(
    user: { id: string; email: string; role: Role; tenantId?: string | null },
    familyId: string,
    ctx: IssueContext,
  ): Promise<{ tokens: IssuedTokens; refreshTokenId: string }> {
    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tid: user.tenantId ?? null,
      fam: familyId,
    });

    const refreshToken = generateRawToken();
    const ttl = this.config.get('JWT_REFRESH_TTL', { infer: true });
    const record = await this.prisma.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + ttl * 1000),
        userAgent: ctx.userAgent ?? null,
        ip: ctx.ip ?? null,
      },
    });

    return { tokens: { accessToken, refreshToken }, refreshTokenId: record.id };
  }

  /**
   * Revoke every still-active token in a family — the response to detected theft.
   *
   * Rows already revoked keep the reason they were revoked with: the first
   * ending of a token is the true one, and overwriting it would erase, say, the
   * user's own logout under a later family-wide sweep.
   */
  async revokeFamily(familyId: string, reason: SessionEndReason): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Revoke a single refresh token (logout, or rotation when it has a successor). */
  async revokeToken(id: string, reason: SessionEndReason, replacedById?: string): Promise<void> {
    await this.prisma.db.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason, replacedById: replacedById ?? null },
    });
  }

  /** Revoke all of a user's refresh tokens (password reset / change). */
  async revokeAllForUser(userId: string, reason: SessionEndReason): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Revoke every family EXCEPT the caller's current one ("sign out everywhere else"). */
  async revokeOtherFamilies(
    userId: string,
    keepFamilyId: string,
    reason: SessionEndReason,
  ): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null, NOT: { familyId: keepFamilyId } },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
