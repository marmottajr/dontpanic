import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { makeUser } from '../../../../test/factories';
import { sha256 } from '../support/crypto.util';
import { AuthService } from './auth.service';

jest.mock('argon2');

const CONFIG: Record<string, unknown> = {
  WEB_ORIGIN: 'http://localhost:3000',
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCK_DURATION: 900,
};

function makeConfig() {
  return { get: (key: string) => CONFIG[key] } as never;
}

const ctx = { ip: '1.2.3.4', userAgent: 'UA' };

describe('AuthService', () => {
  let prisma: any;
  let tokenService: any;
  let twoFactor: any;
  let cache: any;
  let mail: any;
  let service: AuthService;

  const mockedArgon = argon2 as jest.Mocked<typeof argon2>;

  beforeEach(() => {
    mockedArgon.hash.mockResolvedValue('hashed-pw');
    mockedArgon.verify.mockResolvedValue(true);

    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      refreshToken: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    tokenService = {
      issueTokensForUser: jest
        .fn()
        .mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT' }),
      issueTokensInFamily: jest
        .fn()
        .mockResolvedValue({ tokens: { accessToken: 'AT2', refreshToken: 'RT2' }, refreshTokenId: 'rt-new' }),
      revokeFamily: jest.fn().mockResolvedValue(undefined),
      revokeToken: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };
    twoFactor = {
      verifyTotp: jest.fn().mockResolvedValue(false),
      consumeBackupCode: jest.fn().mockResolvedValue(false),
    };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(1),
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(prisma, makeConfig(), tokenService, twoFactor, cache, mail);
  });

  // --- register ----------------------------------------------------------

  describe('register', () => {
    const input = { email: 'new@user.dev', password: 'Sup3rSecret!', name: 'New User' };

    it('rejects a duplicate email with 409', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await expect(service.register(input as never, ctx)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password, creates the user, and sends a verification email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = makeUser({ id: 'u-new', email: input.email, name: input.name });
      prisma.user.create.mockResolvedValue(created);

      const dto = await service.register(input as never, ctx);

      expect(mockedArgon.hash).toHaveBeenCalledWith(input.password);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: input.email, passwordHash: 'hashed-pw', name: input.name },
      });
      // Verification token persisted as a hash, and an email dispatched.
      expect(prisma.emailVerificationToken.create).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].to).toBe(input.email);
      // Returns a safe DTO (no secrets).
      expect(dto).not.toHaveProperty('passwordHash');
      expect(dto.email).toBe(input.email);
    });
  });

  // --- verifyEmail -------------------------------------------------------

  describe('verifyEmail', () => {
    it('rejects an unknown token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail('raw')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an already-used token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
      });
      await expect(service.verifyEmail('raw')).rejects.toThrow(/Invalid or expired/);
    });

    it('rejects an expired token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('raw')).rejects.toThrow(/Invalid or expired/);
    });

    it('verifies a valid token (looked up by its hash) and marks it used', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      const res = await service.verifyEmail('raw-token');
      expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256('raw-token') },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(res.message).toMatch(/verified/i);
    });
  });

  // --- login -------------------------------------------------------------

  describe('login', () => {
    const input = { email: 'arthur@dent.dev', password: 'correct-horse' };

    it('returns a generic error when the lockout counter is at the limit (no argon2)', async () => {
      cache.get.mockResolvedValue('5');
      await expect(service.login(input as never, ctx)).rejects.toThrow('Invalid credentials');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockedArgon.verify).not.toHaveBeenCalled();
    });

    it('rejects a non-existent account generically but still pays the argon2 cost', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login(input as never, ctx)).rejects.toThrow('Invalid credentials');
      // Dummy-hash verify keeps timing constant.
      expect(mockedArgon.verify).toHaveBeenCalled();
      // Failed attempt recorded in the cache bucket.
      expect(cache.incr).toHaveBeenCalled();
    });

    it('rejects a wrong password and records the failed attempt against the user', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      mockedArgon.verify.mockResolvedValue(false);
      prisma.user.update.mockResolvedValue(makeUser({ id: 'u1', failedLoginAttempts: 1 }));

      await expect(service.login(input as never, ctx)).rejects.toThrow('Invalid credentials');
      expect(cache.incr).toHaveBeenCalledWith('login:attempts:arthur@dent.dev', 900);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginAttempts: { increment: 1 } },
      });
    });

    it('locks the account once failed attempts reach the limit', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      mockedArgon.verify.mockResolvedValue(false);
      prisma.user.update.mockResolvedValue(makeUser({ id: 'u1', failedLoginAttempts: 5 }));

      await expect(service.login(input as never, ctx)).rejects.toThrow('Invalid credentials');
      // Second update sets lockedUntil.
      const lockCall = prisma.user.update.mock.calls.find(
        (c: any[]) => c[0].data.lockedUntil instanceof Date,
      );
      expect(lockCall).toBeDefined();
    });

    it('refuses a user whose account-column lock is still active', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ lockedUntil: new Date(Date.now() + 60000) }),
      );
      await expect(service.login(input as never, ctx)).rejects.toThrow('Invalid credentials');
      // Should not even reach argon2 verify of the real password (returns early).
      expect(tokenService.issueTokensForUser).not.toHaveBeenCalled();
    });

    it('returns a 2FA challenge (ticket) when 2FA is enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', twoFactorEnabled: true }));
      mockedArgon.verify.mockResolvedValue(true);

      const result = await service.login(input as never, ctx);
      expect(result.kind).toBe('challenge');
      if (result.kind === 'challenge') {
        expect(result.challenge.twoFactorRequired).toBe(true);
        expect(typeof result.challenge.ticket).toBe('string');
      }
      // A ticket is stashed in cache; no tokens issued yet.
      expect(cache.set).toHaveBeenCalled();
      expect(tokenService.issueTokensForUser).not.toHaveBeenCalled();
    });

    it('issues tokens and clears counters on a clean success', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', failedLoginAttempts: 2, twoFactorEnabled: false }),
      );
      prisma.user.update.mockResolvedValue(makeUser({ id: 'u1' }));
      mockedArgon.verify.mockResolvedValue(true);

      const result = await service.login(input as never, ctx);
      expect(result.kind).toBe('tokens');
      if (result.kind === 'tokens') {
        expect(result.tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
        expect(result.user).not.toHaveProperty('passwordHash');
      }
      expect(cache.del).toHaveBeenCalledWith('login:attempts:arthur@dent.dev');
      // Reset the failed counter since it was > 0.
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    it('treats a soft-deleted account as invalid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', deletedAt: new Date() }));
      // Dummy-hash verify yields false anyway for a deleted account; the failed
      // attempt mirrors onto the user row, so user.update must return a row.
      prisma.user.update.mockResolvedValue(makeUser({ id: 'u1', failedLoginAttempts: 1 }));
      await expect(service.login(input as never, ctx)).rejects.toThrow('Invalid credentials');
      expect(tokenService.issueTokensForUser).not.toHaveBeenCalled();
    });
  });

  // --- verifyTwoFactor ---------------------------------------------------

  describe('verifyTwoFactor', () => {
    it('rejects an unknown / expired ticket', async () => {
      cache.get.mockResolvedValue(null);
      await expect(service.verifyTwoFactor('ticket', '123456', ctx)).rejects.toThrow(
        /Invalid or expired 2FA challenge/,
      );
    });

    it('rejects when the user no longer has 2FA enabled', async () => {
      cache.get.mockResolvedValue('u1');
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: false, twoFactorSecret: null }),
      );
      await expect(service.verifyTwoFactor('ticket', '123456', ctx)).rejects.toThrow(
        /Invalid or expired 2FA challenge/,
      );
    });

    it('issues tokens on a valid TOTP code and burns the ticket', async () => {
      cache.get.mockResolvedValue('u1');
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      twoFactor.verifyTotp.mockResolvedValue(true);

      const res = await service.verifyTwoFactor('ticket', '123456', ctx);
      expect(res.tokens).toEqual({ accessToken: 'AT', refreshToken: 'RT' });
      // Ticket + fail counter cleared.
      expect(cache.del).toHaveBeenCalledWith('2fa:ticket:ticket');
      expect(cache.del).toHaveBeenCalledWith('2fa:fails:ticket');
    });

    it('accepts a backup code when TOTP fails', async () => {
      cache.get.mockResolvedValue('u1');
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      twoFactor.verifyTotp.mockResolvedValue(false);
      twoFactor.consumeBackupCode.mockResolvedValue(true);

      const res = await service.verifyTwoFactor('ticket', 'backup-code', ctx);
      expect(res.tokens).toBeDefined();
      expect(twoFactor.consumeBackupCode).toHaveBeenCalledWith('u1', 'backup-code');
    });

    it('counts a failed code and throws; does not issue tokens', async () => {
      cache.get.mockResolvedValue('u1');
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      twoFactor.verifyTotp.mockResolvedValue(false);
      twoFactor.consumeBackupCode.mockResolvedValue(false);
      cache.incr.mockResolvedValue(1);

      await expect(service.verifyTwoFactor('ticket', 'bad', ctx)).rejects.toThrow(
        'Invalid 2FA code',
      );
      expect(cache.incr).toHaveBeenCalledWith('2fa:fails:ticket', expect.any(Number));
      expect(tokenService.issueTokensForUser).not.toHaveBeenCalled();
    });

    it('burns the ticket and locks the account after too many 2FA failures', async () => {
      cache.get.mockResolvedValue('u1');
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      twoFactor.verifyTotp.mockResolvedValue(false);
      twoFactor.consumeBackupCode.mockResolvedValue(false);
      cache.incr.mockResolvedValue(5); // reaches TWO_FACTOR_MAX_ATTEMPTS

      await expect(service.verifyTwoFactor('ticket', 'bad', ctx)).rejects.toThrow(
        'Invalid 2FA code',
      );
      expect(cache.del).toHaveBeenCalledWith('2fa:ticket:ticket');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { lockedUntil: expect.any(Date) },
      });
    });
  });

  // --- refresh -----------------------------------------------------------

  describe('refresh', () => {
    const rawToken = 'raw-refresh-token';

    it('rejects an unknown refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
    });

    it('detects reuse of an already-revoked token and nukes the family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        familyId: 'fam-1',
        revokedAt: new Date(),
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
      expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1');
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        familyId: 'fam-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
      expect(tokenService.revokeFamily).not.toHaveBeenCalled();
    });

    it('treats a lost claim race (count 0) as theft and revokes the family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        familyId: 'fam-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
      expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1');
    });

    it('rotates successfully: claims the row, mints a successor in the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        familyId: 'fam-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.refresh(rawToken, ctx);
      expect(res.tokens).toEqual({ accessToken: 'AT2', refreshToken: 'RT2' });
      expect(tokenService.issueTokensInFamily).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1' }),
        'fam-1',
        ctx,
      );
      // Old row points at its replacement.
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { replacedById: 'rt-new' },
      });
    });

    it('rejects when the owning user was soft-deleted', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        familyId: 'fam-1',
        revokedAt: null,
        replacedById: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
    });
  });

  // --- logout ------------------------------------------------------------

  describe('logout', () => {
    it('is a no-op when no token cookie is present', async () => {
      await service.logout(undefined, ctx);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('revokes the token when found and active', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        revokedAt: null,
      });
      await service.logout('raw', ctx);
      expect(tokenService.revokeToken).toHaveBeenCalledWith('rt-1');
    });

    it('does nothing if the token is already revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'u1',
        revokedAt: new Date(),
      });
      await service.logout('raw', ctx);
      expect(tokenService.revokeToken).not.toHaveBeenCalled();
    });
  });

  // --- forgot password ---------------------------------------------------

  describe('forgotPassword', () => {
    it('never reveals a non-existent account (no mail, no token)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.forgotPassword({ email: 'x@y.z' } as never, ctx)).resolves.toBeUndefined();
      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('says nothing for a soft-deleted account either', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
      await service.forgotPassword({ email: 'x@y.z' } as never, ctx);
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('creates a reset token and sends the email for an existing account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', email: 'real@user.dev' }));
      await service.forgotPassword({ email: 'real@user.dev' } as never, ctx);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].to).toBe('real@user.dev');
    });
  });

  // --- reset password ----------------------------------------------------

  describe('resetPassword', () => {
    it('rejects an invalid / expired / used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 't', password: 'NewPass1!' } as never, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
      });
      await expect(
        service.resetPassword({ token: 't', password: 'NewPass1!' } as never, ctx),
      ).rejects.toThrow(/Invalid or expired/);
    });

    it('updates the password, marks the token used, and revokes all sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'pr-1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      const res = await service.resetPassword(
        { token: 'raw', password: 'NewPass1!' } as never,
        ctx,
      );
      expect(mockedArgon.hash).toHaveBeenCalledWith('NewPass1!');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u1');
      expect(res.message).toMatch(/Password updated/i);
    });
  });
});
