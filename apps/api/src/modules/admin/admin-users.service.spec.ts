import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminUsersService } from './admin-users.service';

jest.mock('argon2');

const ctx = { ip: '1.2.3.4', userAgent: 'UA' };

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'arthur@dent.dev',
  name: 'Arthur',
  role: 'USER',
  emailVerified: true,
  twoFactorEnabled: false,
  lockedUntil: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

describe('AdminUsersService', () => {
  let prisma: any;
  let tokenService: any;
  let service: AdminUsersService;
  const mockedArgon = argon2 as jest.Mocked<typeof argon2>;

  beforeEach(() => {
    mockedArgon.hash.mockResolvedValue('hashed-pw');
    prisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      // Our service passes [count(), findMany()] — resolve them together.
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    tokenService = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    service = new AdminUsersService(prisma, tokenService);
  });

  describe('list', () => {
    it('maps rows and derives locked/deleted + totalPages', async () => {
      prisma.user.count.mockReturnValue(3);
      prisma.user.findMany.mockReturnValue([
        userRow({ id: 'u1' }),
        userRow({ id: 'u2', lockedUntil: new Date(Date.now() + 10_000) }),
        userRow({ id: 'u3', deletedAt: new Date() }),
      ]);
      const res = await service.list({ page: 1, limit: 20 } as never);
      expect(res.total).toBe(3);
      expect(res.totalPages).toBe(1);
      expect(res.items).toHaveLength(3);
      expect(res.items[1].locked).toBe(true);
      expect(res.items[2].deleted).toBe(true);
    });

    it('applies the search filter and pagination offsets', async () => {
      prisma.user.count.mockReturnValue(0);
      prisma.user.findMany.mockReturnValue([]);
      const res = await service.list({ page: 2, limit: 10, search: 'ford' } as never);
      const arg = prisma.user.findMany.mock.calls[0][0];
      expect(arg.skip).toBe(10);
      expect(arg.take).toBe(10);
      expect(JSON.stringify(arg.where)).toContain('ford');
      expect(res.totalPages).toBe(1);
    });
  });

  describe('create', () => {
    const input = { email: 'New@X.com', name: 'New', password: 'Sup3rSecret!', role: 'USER' };

    it('creates a verified user, hashes the password and audits', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(userRow({ id: 'u9', email: 'new@x.com', name: 'New' }));
      const res = await service.create('admin1', input as never, ctx);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'new@x.com',
          name: 'New',
          passwordHash: 'hashed-pw',
          role: 'USER',
          emailVerified: true,
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalled();
      expect(res.id).toBe('u9');
    });

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2', email: 'new@x.com' }));
      await expect(service.create('admin1', input as never, ctx)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('setRole', () => {
    it('changes a role and audits', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(userRow({ id: 'u2', role: 'ADMIN' }));
      const res = await service.setRole('admin1', 'u2', 'ADMIN', ctx);
      expect(res.role).toBe('ADMIN');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('refuses to change your own role', async () => {
      await expect(service.setRole('u1', 'u1', 'ADMIN', ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setRole('admin1', 'ghost', 'ADMIN', ctx)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setLocked', () => {
    it('locks a user and revokes their sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(
        userRow({ id: 'u2', lockedUntil: new Date(Date.now() + 1000) }),
      );
      const res = await service.setLocked('admin1', 'u2', true, ctx);
      expect(prisma.user.update.mock.calls[0][0].data.lockedUntil).toBeInstanceOf(Date);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u2');
      expect(res.locked).toBe(true);
    });

    it('unlocks a user without revoking sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(userRow({ id: 'u2' }));
      await service.setLocked('admin1', 'u2', false, ctx);
      expect(prisma.user.update.mock.calls[0][0].data.lockedUntil).toBeNull();
      expect(tokenService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('refuses to lock your own account', async () => {
      await expect(service.setLocked('u1', 'u1', true, ctx)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('softDelete', () => {
    it('soft-deletes, revokes sessions and audits', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(userRow({ id: 'u2', deletedAt: new Date() }));
      await service.softDelete('admin1', 'u2', ctx);
      expect(prisma.user.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u2');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('refuses to delete your own account', async () => {
      await expect(service.softDelete('u1', 'u1', ctx)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
