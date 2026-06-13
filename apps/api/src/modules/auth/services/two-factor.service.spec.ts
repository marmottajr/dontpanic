import { generate, generateSecret } from 'otplib';
import * as argon2 from 'argon2';
import { TwoFactorService } from './two-factor.service';

// Mock only the QR rendering (binary/encoding heavy); keep real TOTP + argon2.
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,QR=='),
}));

const CONFIG: Record<string, unknown> = { TOTP_ISSUER: 'DontPanic' };

function makeConfig() {
  return { get: (key: string) => CONFIG[key] } as never;
}

// This suite exercises REAL argon2 (10 hashes in generateBackupCodes) and real
// otplib TOTP. Argon2 is deliberately CPU-heavy, so under parallel test load it
// can exceed Jest's 5s default — give it generous headroom for determinism.
jest.setTimeout(30_000);

describe('TwoFactorService', () => {
  let prisma: {
    $transaction: jest.Mock;
    twoFactorBackupCode: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: TwoFactorService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      twoFactorBackupCode: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service = new TwoFactorService(makeConfig(), prisma as never);
  });

  describe('generateSetup', () => {
    it('returns a base32 secret, an otpauth URI and a QR data url', async () => {
      const setup = await service.generateSetup('arthur@dent.dev');

      expect(setup.secret).toMatch(/^[A-Z2-7]+$/); // RFC 4648 base32
      expect(setup.otpauthUrl).toContain('otpauth://totp/');
      expect(setup.otpauthUrl).toContain('issuer=DontPanic');
      expect(setup.otpauthUrl).toContain(encodeURIComponent('arthur@dent.dev'));
      expect(setup.qrCodeDataUrl).toBe('data:image/png;base64,QR==');
    });
  });

  describe('verifyTotp', () => {
    it('accepts a freshly generated code for the secret', async () => {
      const secret = generateSecret();
      const code = await generate({ secret });
      expect(await service.verifyTotp(secret, code)).toBe(true);
    });

    it('rejects a wrong code', async () => {
      const secret = generateSecret();
      expect(await service.verifyTotp(secret, '000000')).toBe(false);
    });

    it('rejects a code generated for a different secret', async () => {
      const code = await generate({ secret: generateSecret() });
      expect(await service.verifyTotp(generateSecret(), code)).toBe(false);
    });
  });

  describe('generateBackupCodes', () => {
    it('returns 10 formatted raw codes plus matching argon2 hashes', async () => {
      const { raw, hashes } = await service.generateBackupCodes();
      expect(raw).toHaveLength(10);
      expect(hashes).toHaveLength(10);
      for (const code of raw) {
        expect(code).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
      }
      // Each hash verifies against its own raw code, and not a foreign one.
      expect(await argon2.verify(hashes[0], raw[0])).toBe(true);
      expect(await argon2.verify(hashes[0], raw[1])).toBe(false);
    });
  });

  describe('replaceBackupCodes', () => {
    it('wipes old codes then inserts the new hashes in one transaction', async () => {
      await service.replaceBackupCodes('u1', ['h1', 'h2']);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.twoFactorBackupCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
      });
      expect(prisma.twoFactorBackupCode.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'u1', codeHash: 'h1' },
          { userId: 'u1', codeHash: 'h2' },
        ],
      });
    });
  });

  describe('consumeBackupCode', () => {
    it('redeems a matching unused code and marks it used (single-use)', async () => {
      const hash = await argon2.hash('abcde-12345');
      prisma.twoFactorBackupCode.findMany.mockResolvedValue([{ id: 'bc-1', codeHash: hash }]);

      expect(await service.consumeBackupCode('u1', 'abcde-12345')).toBe(true);
      expect(prisma.twoFactorBackupCode.update).toHaveBeenCalledWith({
        where: { id: 'bc-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    it('returns false and consumes nothing when no code matches', async () => {
      const hash = await argon2.hash('correct-code1');
      prisma.twoFactorBackupCode.findMany.mockResolvedValue([{ id: 'bc-1', codeHash: hash }]);

      expect(await service.consumeBackupCode('u1', 'wrong-guess1')).toBe(false);
      expect(prisma.twoFactorBackupCode.update).not.toHaveBeenCalled();
    });

    it('returns false when there are no unused codes', async () => {
      prisma.twoFactorBackupCode.findMany.mockResolvedValue([]);
      expect(await service.consumeBackupCode('u1', 'anything-here')).toBe(false);
    });
  });
});
