import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { makeUser } from '../../../../test/factories';
import { UsersService } from './users.service';

jest.mock('argon2');

const ctx = { ip: '1.2.3.4', userAgent: 'UA' };

describe('UsersService', () => {
  let prisma: any;
  let twoFactor: any;
  let tokenService: any;
  let cache: any;
  let config: any;
  let service: UsersService;

  const mockedArgon = argon2 as jest.Mocked<typeof argon2>;

  beforeEach(() => {
    mockedArgon.hash.mockResolvedValue('new-hash');
    mockedArgon.verify.mockResolvedValue(true);

    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      twoFactorBackupCode: { deleteMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    twoFactor = {
      generateSetup: jest
        .fn()
        .mockResolvedValue({ secret: 'SECRET', otpauthUrl: 'otpauth://x', qrCodeDataUrl: 'data:' }),
      verifyTotp: jest.fn().mockResolvedValue(true),
      generateBackupCodes: jest
        .fn()
        .mockResolvedValue({ raw: ['code-1', 'code-2'], hashes: ['h1', 'h2'] }),
      replaceBackupCodes: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    config = { get: jest.fn().mockReturnValue(false) }; // 2FA optional by default
    service = new UsersService(prisma, twoFactor, tokenService, config, cache);
  });

  describe('getSecurityStatus', () => {
    const baseUser = {
      id: 'u1',
      email: 'a@b.com',
      twoFactorEnabled: false,
      twoFactorRemindAt: null,
      deletedAt: null,
    };

    it('prompts when 2FA is optional, disabled and not snoozed', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      const s = await service.getSecurityStatus('u1');
      expect(s).toEqual({ twoFactorEnabled: false, twoFactorRequired: false, shouldPrompt: true });
    });

    it('does not prompt while the 24h snooze is active', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        twoFactorRemindAt: new Date(Date.now() + 3_600_000),
      });
      expect((await service.getSecurityStatus('u1')).shouldPrompt).toBe(false);
    });

    it('never prompts when 2FA is required (forced setup instead)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      config.get.mockReturnValue(true);
      const s = await service.getSecurityStatus('u1');
      expect(s).toEqual({ twoFactorEnabled: false, twoFactorRequired: true, shouldPrompt: false });
    });

    it('does not prompt once 2FA is enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, twoFactorEnabled: true });
      expect((await service.getSecurityStatus('u1')).shouldPrompt).toBe(false);
    });
  });

  describe('snoozeTwoFactorPrompt', () => {
    it('pushes the next reminder ~24h ahead', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', deletedAt: null });
      await service.snoozeTwoFactorPrompt('u1');
      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'u1' });
      expect(arg.data.twoFactorRemindAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    });
  });

  // --- requireActiveUser (via getProfile) --------------------------------

  describe('getProfile', () => {
    it('returns a safe DTO for an active user', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      const dto = await service.getProfile('u1');
      expect(dto.id).toBe('u1');
      expect(dto).not.toHaveProperty('passwordHash');
    });

    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws Forbidden when the account is soft-deleted', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
      await expect(service.getProfile('u1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // --- updateProfile -----------------------------------------------------

  describe('updateProfile', () => {
    it('updates the name and returns a DTO', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      prisma.user.update.mockResolvedValue(makeUser({ id: 'u1', name: 'Zaphod' }));
      const dto = await service.updateProfile('u1', { name: 'Zaphod' } as never);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { name: 'Zaphod' },
      });
      expect(dto.name).toBe('Zaphod');
    });
  });

  // --- changePassword ----------------------------------------------------

  describe('changePassword', () => {
    const input = { currentPassword: 'old', newPassword: 'BrandNew1!' };

    it('rejects when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      mockedArgon.verify.mockResolvedValue(false);
      await expect(service.changePassword('u1', input as never, ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(tokenService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('updates the password and revokes all sessions on success', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      mockedArgon.verify.mockResolvedValue(true);
      await service.changePassword('u1', input as never, ctx);
      expect(mockedArgon.hash).toHaveBeenCalledWith('BrandNew1!');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new-hash' },
      });
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u1');
    });
  });

  // --- 2FA setup / enable / disable -------------------------------------

  describe('setupTwoFactor', () => {
    it('generates a setup and stashes the pending secret in cache', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', twoFactorEnabled: false }));
      const setup = await service.setupTwoFactor('u1');
      expect(setup.secret).toBe('SECRET');
      expect(cache.set).toHaveBeenCalledWith('2fa:pending:u1', 'SECRET', expect.any(Number));
    });

    it('rejects when 2FA is already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ twoFactorEnabled: true }));
      await expect(service.setupTwoFactor('u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('enableTwoFactor', () => {
    it('rejects when there is no pending setup', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', twoFactorEnabled: false }));
      cache.get.mockResolvedValue(null);
      await expect(service.enableTwoFactor('u1', { code: '123456' } as never, ctx)).rejects.toThrow(
        /start setup again/,
      );
    });

    it('rejects an invalid verification code', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', twoFactorEnabled: false }));
      cache.get.mockResolvedValue('PENDING');
      twoFactor.verifyTotp.mockResolvedValue(false);
      await expect(service.enableTwoFactor('u1', { code: '000000' } as never, ctx)).rejects.toThrow(
        'Invalid verification code',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('enables 2FA, stores the secret + backup codes, and returns raw codes once', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', twoFactorEnabled: false }));
      cache.get.mockResolvedValue('PENDING-SECRET');
      twoFactor.verifyTotp.mockResolvedValue(true);

      const codes = await service.enableTwoFactor('u1', { code: '123456' } as never, ctx);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { twoFactorSecret: 'PENDING-SECRET', twoFactorEnabled: true },
      });
      expect(twoFactor.replaceBackupCodes).toHaveBeenCalledWith('u1', ['h1', 'h2']);
      expect(cache.del).toHaveBeenCalledWith('2fa:pending:u1');
      expect(codes).toEqual(['code-1', 'code-2']);
    });
  });

  describe('disableTwoFactor', () => {
    it('rejects when 2FA is not enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: false, twoFactorSecret: null }),
      );
      await expect(
        service.disableTwoFactor('u1', { code: '123456' } as never, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when neither a valid code nor password is provided', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      await expect(service.disableTwoFactor('u1', {} as never, ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('disables via a valid TOTP code and clears secret + backup codes', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      twoFactor.verifyTotp.mockResolvedValue(true);
      await service.disableTwoFactor('u1', { code: '123456' } as never, ctx);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(cache.del).toHaveBeenCalledWith('2fa:pending:u1');
    });

    it('disables via the account password when no code is given', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      mockedArgon.verify.mockResolvedValue(true);
      await service.disableTwoFactor('u1', { password: 'pw' } as never, ctx);
      expect(mockedArgon.verify).toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  // --- LGPD export -------------------------------------------------------

  describe('exportData', () => {
    it('returns a profile + audit logs and NEVER leaks secrets', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ id: 'u1', passwordHash: 'SECRET-HASH', twoFactorSecret: 'TOTP-SECRET' }),
      );
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          action: 'auth.login',
          ip: '1.1.1.1',
          userAgent: 'UA',
          metadata: { foo: 'bar' },
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
      ]);

      const out = await service.exportData('u1');

      expect(out.profile.id).toBe('u1');
      expect(out.auditLogs).toHaveLength(1);
      expect(out.auditLogs[0].action).toBe('auth.login');
      expect(out.exportedAt).toBeDefined();

      const serialised = JSON.stringify(out);
      expect(serialised).not.toContain('SECRET-HASH');
      expect(serialised).not.toContain('TOTP-SECRET');
      expect(out.profile).not.toHaveProperty('passwordHash');
      expect(out.profile).not.toHaveProperty('twoFactorSecret');
    });
  });

  // --- LGPD erasure ------------------------------------------------------

  describe('eraseAccount', () => {
    it('anonymizes the row, wipes 2FA, revokes sessions and clears the pending cache', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      await service.eraseAccount('u1', ctx);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Inspect the user.update operation built inside the transaction array.
      const updateCall = prisma.user.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'u1' });
      expect(updateCall.data.name).toBe('Deleted user');
      expect(updateCall.data.email).toMatch(/^deleted\+.*@deleted\.invalid$/);
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
      expect(updateCall.data.twoFactorEnabled).toBe(false);
      expect(updateCall.data.twoFactorSecret).toBeNull();
      expect(updateCall.data.avatarUrl).toBeNull();
      // Credential re-hashed to a random value (mock returns 'new-hash').
      expect(mockedArgon.hash).toHaveBeenCalled();

      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u1');
      expect(cache.del).toHaveBeenCalledWith('2fa:pending:u1');
    });

    it('refuses to erase an already-deleted account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
      await expect(service.eraseAccount('u1', ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
