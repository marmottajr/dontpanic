import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

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

  beforeEach(() => {
    prisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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
      expect(res.totalPages).toBe(1); // never below 1
    });
  });

  describe('setRole', () => {
    it('changes a role', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(userRow({ id: 'u2', role: 'ADMIN' }));
      const res = await service.setRole('admin1', 'u2', 'ADMIN');
      expect(res.role).toBe('ADMIN');
    });

    it('refuses to change your own role', async () => {
      await expect(service.setRole('u1', 'u1', 'ADMIN')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFound for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setRole('admin1', 'ghost', 'ADMIN')).rejects.toBeInstanceOf(
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
      const res = await service.setLocked('u2', true);
      expect(prisma.user.update.mock.calls[0][0].data.lockedUntil).toBeInstanceOf(Date);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u2');
      expect(res.locked).toBe(true);
    });

    it('unlocks a user without revoking sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(userRow({ id: 'u2' }));
      await service.setLocked('u2', false);
      expect(prisma.user.update.mock.calls[0][0].data.lockedUntil).toBeNull();
      expect(tokenService.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('soft-deletes and revokes sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(userRow({ id: 'u2' }));
      prisma.user.update.mockResolvedValue(userRow({ id: 'u2', deletedAt: new Date() }));
      await service.softDelete('admin1', 'u2');
      expect(prisma.user.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u2');
    });

    it('refuses to delete your own account', async () => {
      await expect(service.softDelete('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
