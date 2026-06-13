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
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: TokenService;

  const user = { id: 'u1', email: 'a@b.com', role: 'USER' as const };

  beforeEach(() => {
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt'),
      verify: jest.fn().mockReturnValue({ sub: 'u1', email: 'a@b.com', role: 'USER' }),
    };
    prisma = {
      refreshToken: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rt-1', ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
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

  describe('issueTokensInFamily (rotation)', () => {
    it('keeps the supplied familyId and returns the new row id', async () => {
      const { tokens, refreshTokenId } = await service.issueTokensInFamily(
        user,
        'family-xyz',
        {},
      );
      expect(refreshTokenId).toBe('rt-1');
      expect(tokens.accessToken).toBe('signed.jwt');
      expect(prisma.refreshToken.create.mock.calls[0][0].data.familyId).toBe('family-xyz');
    });
  });

  describe('revocation', () => {
    it('revokeFamily revokes every still-active token in the family', async () => {
      await service.revokeFamily('fam-1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokeToken marks one token revoked and records its replacement', async () => {
      await service.revokeToken('rt-9', 'rt-10');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-9' },
        data: { revokedAt: expect.any(Date), replacedById: 'rt-10' },
      });
    });

    it('revokeToken without a replacement sets replacedById null', async () => {
      await service.revokeToken('rt-9');
      expect(prisma.refreshToken.update.mock.calls[0][0].data.replacedById).toBeNull();
    });

    it('revokeAllForUser revokes every active token for the user', async () => {
      await service.revokeAllForUser('u1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
