import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import { toDataURL } from 'qrcode';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { TwoFactorSetupResponse } from '@dontpanic/shared';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';

const BACKUP_CODE_COUNT = 10;

/**
 * TOTP (RFC 6238) second factor + single-use backup codes.
 *
 * Owns nothing about *when* 2FA is required — it just generates secrets,
 * verifies codes, and manages backup codes. The users module composes
 * setup/enable/disable flows on top of this, and AuthModule uses it at login.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  /** Fresh Base32 secret + an otpauth:// URI + a scannable QR data URL. */
  async generateSetup(accountLabel: string): Promise<TwoFactorSetupResponse> {
    const secret = generateSecret();
    const issuer = this.config.get('TOTP_ISSUER', { infer: true });
    const otpauthUrl = generateURI({ issuer, label: accountLabel, secret });
    const qrCodeDataUrl = await toDataURL(otpauthUrl);
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /**
   * Verify a 6-digit TOTP code against a secret. A small epoch tolerance absorbs
   * clock skew between the server and the authenticator app.
   */
  async verifyTotp(secret: string, token: string): Promise<boolean> {
    const result = await verify({ secret, token, epochTolerance: 30 });
    return result.valid;
  }

  /** Generate N raw backup codes; returns the raw codes and their Argon2 hashes. */
  async generateBackupCodes(): Promise<{ raw: string[]; hashes: string[] }> {
    const raw: string[] = [];
    const hashes: string[] = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i += 1) {
      // 10 hex chars, grouped for readability — e.g. "a1b2c-3d4e5".
      const code = randomBytes(5).toString('hex');
      const formatted = `${code.slice(0, 5)}-${code.slice(5)}`;
      raw.push(formatted);
      hashes.push(await argon2.hash(formatted));
    }
    return { raw, hashes };
  }

  /** Persist freshly generated backup-code hashes, wiping any prior ones. */
  async replaceBackupCodes(userId: string, hashes: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorBackupCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  /**
   * Try to redeem a backup code: Argon2-compare against each unused code and,
   * on the first match, mark it used (single-use). Returns true if consumed.
   */
  async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const candidates = await this.prisma.twoFactorBackupCode.findMany({
      where: { userId, usedAt: null },
    });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.codeHash, code)) {
        await this.prisma.twoFactorBackupCode.update({
          where: { id: candidate.id },
          data: { usedAt: new Date() },
        });
        return true;
      }
    }
    return false;
  }
}
