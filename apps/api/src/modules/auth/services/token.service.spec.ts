import { makePrismaMock, type PrismaMock } from '../../../../test/prisma-mock';
import { sha256 } from '../support/crypto.util';
import { TokenService } from './token.service';

const CONFIG: Record<string, unknown> = {
  JWT_ACCESS_SECRET: 'access-secret-0123456789',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 604800,
};

function makeConfig() {
  return {
    get: (key: string) => CONFIG[key],
    getOrThrow: (key: string) => {
      const v = CONFIG[key];
      if (v === undefined) throw new Error(`missing ${key}`);
      return v;
    },
  } as never;
}

describe('TokenService', () => {
  let jwt: { sign: jest.Mock; verify: jest.Mock };
  let prisma: PrismaMock & {
    refreshToken: {
      create: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    tenant: { findUnique: jest.Mock };
  };
  let service: TokenService;

  const user = { id: 'u1', email: 'a@b.com', role: 'USER' as const };

  beforeEach(() => {
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt'),
      verify: jest.fn().mockReturnValue({ sub: 'u1', email: 'a@b.com', role: 'USER' }),
    };
    prisma = makePrismaMock({
      refreshToken: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: 'rt-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    service = new TokenService(jwt as never, makeConfig(), prisma as never);
  });

  describe('access tokens', () => {
    it('signs with the access secret and TTL', () => {
      const token = service.signAccessToken({ sub: 'u1', email: 'a@b.com', role: 'USER' });
      expect(token).toBe('signed.jwt');
      expect(jwt.sign).toHaveBeenCalledWith(
        { sub: 'u1', email: 'a@b.com', role: 'USER' },
        expect.objectContaining({ secret: 'access-secret-0123456789', expiresIn: 900 }),
      );
    });

    it('verifies with the access secret', () => {
      const payload = service.verifyAccessToken('some.jwt');
      expect(payload).toEqual({ sub: 'u1', email: 'a@b.com', role: 'USER' });
      expect(jwt.verify).toHaveBeenCalledWith(
        'some.jwt',
        expect.objectContaining({ secret: 'access-secret-0123456789' }),
      );
    });
  });

  describe('issueTokensForUser (new family)', () => {
    it('mints an access JWT and persists a hashed refresh token in a new family', async () => {
      const tokens = await service.issueTokensForUser(user, { ip: '1.2.3.4', userAgent: 'UA' });

      expect(tokens.accessToken).toBe('signed.jwt');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.refreshToken.length).toBeGreaterThan(0);

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      // Stored hash must be the SHA-256 of the RAW token (never the raw token itself).
      expect(data.tokenHash).toBe(sha256(tokens.refreshToken));
      expect(data.tokenHash).not.toBe(tokens.refreshToken);
      expect(data.userId).toBe('u1');
      expect(data.userAgent).toBe('UA');
      expect(data.ip).toBe('1.2.3.4');
      // familyId is a fresh uuid.
      expect(data.familyId).toMatch(/^[0-9a-f-]{36}$/);
      // expiresAt ~ now + refresh ttl.
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('generates a distinct family per call', async () => {
      await service.issueTokensForUser(user);
      await service.issueTokensForUser(user);
      const f1 = prisma.refreshToken.create.mock.calls[0][0].data.familyId;
      const f2 = prisma.refreshToken.create.mock.calls[1][0].data.familyId;
      expect(f1).not.toBe(f2);
    });

    it('defaults ip/userAgent to null when no context is given', async () => {
      await service.issueTokensForUser(user);
      const data = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(data.ip).toBeNull();
      expect(data.userAgent).toBeNull();
    });
  });

  // The plan's `concurrentSessions` flag, which until now existed everywhere
  // (column, enum, wire reason, i18n) except at the moment it was supposed to
  // act. It acts here, at the single point where a session is born, so the
  // password, 2FA and OAuth doors cannot each drift their own copy of it.
  describe('issueTokensForUser (single session per plan)', () => {
    const member = { id: 'u1', email: 'a@b.com', role: 'USER' as const, tenantId: 't1' };

    it('ends every other session when the plan does not grant concurrent ones', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ plan: { features: {} } });

      await service.issueTokensForUser(member);

      const kept = prisma.refreshToken.create.mock.calls[0][0].data.familyId;
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null, NOT: { familyId: kept } },
        data: { revokedAt: expect.any(Date), revokedReason: 'SIGNED_IN_ELSEWHERE' },
      });
    });

    it('spares the family it just created, so the new sign-in survives', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ plan: { features: {} } });
      await service.issueTokensForUser(member);
      const where = prisma.refreshToken.updateMany.mock.calls[0][0].where;
      expect(where.NOT.familyId).toBe(prisma.refreshToken.create.mock.calls[0][0].data.familyId);
    });

    it('leaves other sessions alone when the plan grants concurrent sessions', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        plan: { features: { concurrentSessions: true } },
      });
      await service.issueTokensForUser(member);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('treats a tenant with no plan as not granting them', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ plan: null });
      await service.issueTokensForUser(member);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('leaves a user with no company (SUPERADMIN) alone — there is no plan to read', async () => {
      await service.issueTokensForUser(user);
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('issueTokensInFamily (rotation)', () => {
    it('keeps the supplied familyId and returns the new row id', async () => {
      const { tokens, refreshTokenId } = await service.issueTokensInFamily(user, 'family-xyz', {});
      expect(refreshTokenId).toBe('rt-1');
      expect(tokens.accessToken).toBe('signed.jwt');
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe('family-xyz');
    });
  });

  describe('revocation', () => {
    // Every path records WHY the session ended. The column is what later lets
    // the app tell someone they were signed out by a replay rather than leaving
    // them staring at a login screen that looks broken.
    it('revokeFamily revokes every still-active token in the family with the reason', async () => {
      await service.revokeFamily('fam-1', 'REUSE_DETECTED');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'REUSE_DETECTED' },
      });
    });

    it('revokeFamily leaves already-revoked rows alone, so their reason survives', async () => {
      await service.revokeFamily('fam-1', 'REUSE_DETECTED');
      // `revokedAt: null` in the filter is what protects the earlier reason.
      expect(prisma.refreshToken.updateMany.mock.calls[0][0].where.revokedAt).toBeNull();
    });

    it('revokeToken marks one token revoked with its reason and replacement', async () => {
      await service.revokeToken('rt-9', 'LOGOUT', 'rt-10');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-9' },
        data: { revokedAt: expect.any(Date), revokedReason: 'LOGOUT', replacedById: 'rt-10' },
      });
    });

    it('revokeToken without a replacement sets replacedById null', async () => {
      await service.revokeToken('rt-9', 'LOGOUT');
      expect(prisma.refreshToken.update.mock.calls[0][0].data.replacedById).toBeNull();
    });

    it('revokeAllForUser revokes every active token for the user with the reason', async () => {
      await service.revokeAllForUser('u1', 'LOGOUT');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'LOGOUT' },
      });
    });

    it('revokeOtherFamilies revokes every active token except the kept family', async () => {
      await service.revokeOtherFamilies('u1', 'fam-keep', 'LOGOUT');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null, NOT: { familyId: 'fam-keep' } },
        data: { revokedAt: expect.any(Date), revokedReason: 'LOGOUT' },
      });
    });
  });
});
