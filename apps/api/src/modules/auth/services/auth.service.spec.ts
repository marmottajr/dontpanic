import { BadRequestException, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { makeUser } from '../../../../test/factories';
import { makePrismaMock } from '../../../../test/prisma-mock';
import { sha256 } from '../support/crypto.util';
import { AuthService } from './auth.service';

jest.mock('argon2');

const CONFIG: Record<string, unknown> = {
  WEB_ORIGIN: 'http://localhost:3000',
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_LOCK_DURATION: 900,
  REFRESH_REUSE_GRACE: 10,
};

function makeConfig() {
  return { get: (key: string) => CONFIG[key] } as never;
}

const ctx = { ip: '1.2.3.4', userAgent: 'UA' };

/**
 * The message of the Nth mail job handed to the queue. Transactional mail is no
 * longer sent inline, so the observable effect of a flow is the job it enqueued
 * — asserting the name too keeps a typo'd job name from passing as a send.
 */
function enqueuedMail(queue: any, index = 0): any {
  const [name, payload] = queue.enqueue.mock.calls[index];
  expect(name).toBe('mail.send');
  return payload.message;
}

/**
 * The `sessionEnded` reason carried by a rejection, or undefined when it carries
 * none. Read off the exception body, which is exactly what the global filter
 * sees before deciding whether to let the field through.
 */
async function sessionEndedOf(promise: Promise<unknown>): Promise<string | undefined> {
  const err: unknown = await promise.then(
    () => {
      throw new Error('expected the call to reject');
    },
    (e: unknown) => e,
  );
  const body = (err as { getResponse: () => unknown }).getResponse();
  return (body as { sessionEnded?: string }).sessionEnded;
}

describe('AuthService', () => {
  let prisma: any;
  let tokenService: any;
  let twoFactor: any;
  let cache: any;
  let queue: any;
  let service: AuthService;

  const mockedArgon = argon2 as jest.Mocked<typeof argon2>;

  beforeEach(() => {
    mockedArgon.hash.mockResolvedValue('hashed-pw');
    mockedArgon.verify.mockResolvedValue(true);

    // The service reads and writes through `prisma.db` (the request's scoped
    // transaction) — the double's `db` IS the mock, so the assertions below can
    // still name the delegates directly.
    prisma = makePrismaMock({
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      emailVerificationToken: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    });
    tokenService = {
      issueTokensForUser: jest.fn().mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT' }),
      issueTokensInFamily: jest.fn().mockResolvedValue({
        tokens: { accessToken: 'AT2', refreshToken: 'RT2' },
        refreshTokenId: 'rt-new',
      }),
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
    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(prisma, makeConfig(), tokenService, twoFactor, cache, queue);
  });

  // --- sendVerificationCode ----------------------------------------------

  describe('sendVerificationCode', () => {
    it('replaces any live code with a fresh one and mails it', async () => {
      await service.sendVerificationCode('u-new', 'new@user.dev', 'New User', 'pt-BR');

      // One active code per user: the old rows go before the new one is written.
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u-new' },
      });
      // The raw code never lands in the database — only its sha256.
      const written = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      expect(written.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(written).not.toHaveProperty('code');
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      const message = enqueuedMail(queue);
      expect(message.to).toBe('new@user.dev');
      // The code the user has to type must travel in the mail body, and be the
      // very one whose hash was stored — a mismatch would fail every verify.
      const code = /\b(\d{6})\b/.exec(message.text as string)?.[1];
      expect(code).toBeDefined();
      expect(sha256(code as string)).toBe(written.tokenHash);
      expect(message.html).toContain(code);
    });

    it('resolves when enqueuing fails, logging instead of failing the caller', async () => {
      queue.enqueue.mockRejectedValue(new Error('redis down'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(
        service.sendVerificationCode('u-new', 'new@user.dev', 'New User', 'pt-BR'),
      ).resolves.toBeUndefined();
      await new Promise((resolve) => setImmediate(resolve)); // flush the fire-and-forget catch

      // Swallowed on purpose: resend is the recovery path, and a queue outage
      // must not turn a successful signup into a 500.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('redis down'));
      warn.mockRestore();
    });
  });

  // --- verifyEmail -------------------------------------------------------

  describe('verifyEmail', () => {
    const EMAIL = 'arthur@dent.dev';
    const unverified = { id: 'u1', email: EMAIL, emailVerified: false, deletedAt: null };
    const tokenRow = (code: string, over: Record<string, unknown> = {}) => ({
      id: 't1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
      tokenHash: sha256(code),
      createdAt: new Date(),
      ...over,
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail(EMAIL, '123456', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('is idempotent for an already-verified account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...unverified, emailVerified: true });
      const res = await service.verifyEmail(EMAIL, '123456', {});
      expect(res.message).toMatch(/verified/i);
    });

    it('blocks and clears the code after too many attempts', async () => {
      prisma.user.findUnique.mockResolvedValue(unverified);
      cache.get.mockResolvedValue('5');
      await expect(service.verifyEmail(EMAIL, '123456', {})).rejects.toThrow(/Too many/);
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalled();
    });

    it('rejects a wrong code and counts the attempt', async () => {
      prisma.user.findUnique.mockResolvedValue(unverified);
      prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenRow('999999'));
      await expect(service.verifyEmail(EMAIL, '123456', {})).rejects.toThrow(/Invalid or expired/);
      expect(cache.incr).toHaveBeenCalled();
    });

    it('rejects an expired code', async () => {
      prisma.user.findUnique.mockResolvedValue(unverified);
      prisma.emailVerificationToken.findFirst.mockResolvedValue(
        tokenRow('123456', { expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.verifyEmail(EMAIL, '123456', {})).rejects.toThrow(/Invalid or expired/);
    });

    it('verifies a valid code, marks it used and clears the attempt counter', async () => {
      prisma.user.findUnique.mockResolvedValue(unverified);
      prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenRow('123456'));
      const res = await service.verifyEmail(EMAIL, '123456', {});
      expect(prisma.atomic).toHaveBeenCalledTimes(1);
      expect(cache.del).toHaveBeenCalled();
      expect(res.message).toMatch(/verified/i);
    });
  });

  describe('resendVerification', () => {
    const EMAIL = 'arthur@dent.dev';

    it('does nothing while on cooldown but returns the generic message', async () => {
      cache.get.mockResolvedValue('1'); // cooldown active
      const res = await service.resendVerification(EMAIL, {});
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(res.message).toMatch(/code/i);
    });

    it('sends a new code for an existing unverified account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: EMAIL,
        name: 'Arthur',
        emailVerified: false,
        deletedAt: null,
      });
      await service.resendVerification(EMAIL, { locale: 'en' });
      expect(cache.set).toHaveBeenCalled();
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      expect(enqueuedMail(queue).to).toBe(EMAIL);
    });

    it('stays silent (no send) for an unknown account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.resendVerification(EMAIL, {});
      expect(queue.enqueue).not.toHaveBeenCalled();
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

    /** A row as findUnique returns it: live and rotatable unless overridden. */
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'rt-1',
      userId: 'u1',
      familyId: 'fam-1',
      revokedAt: null,
      replacedById: null,
      expiresAt: new Date(Date.now() + 100000),
      ...over,
    });

    it('detects reuse of an already-revoked token and nukes the family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
      expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'REUSE_DETECTED');
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

    it('treats a lost claim race outside the grace window as theft', async () => {
      // The winner rotated this row long ago -> a late replay, i.e. real theft.
      const stale = row({ revokedAt: new Date(Date.now() - 60_000), replacedById: 'rt-other' });
      prisma.refreshToken.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(stale);
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
      expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'REUSE_DETECTED');
    });

    it('rotates successfully: claims the row, mints a successor in the same family', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(row());
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.refresh(rawToken, ctx);
      expect(res.tokens).toEqual({ accessToken: 'AT2', refreshToken: 'RT2' });
      expect(tokenService.issueTokensInFamily).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1' }),
        'fam-1',
        ctx,
      );
      // The successor is minted BEFORE the claim, and both fields land in the
      // SAME conditional write — so the row is never revoked-without-successor.
      expect(tokenService.issueTokensInFamily.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.refreshToken.updateMany.mock.invocationCallOrder[0],
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null, replacedById: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'ROTATED', replacedById: 'rt-new' },
      });
      // No second write to fill in replacedById after the fact.
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rejects when the owning user was soft-deleted', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(row());
      prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
      await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
    });

    // --- what the browser is told --------------------------------------
    //
    // A bare 401 is why someone signed out by a replay of their own session
    // sees the ordinary login screen and concludes the product is broken.

    describe('sessionEnded', () => {
      it('says reuse-detected when a rotated token is replayed too late', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(
          row({ revokedAt: new Date(Date.now() - 60_000), replacedById: 'rt-winner' }),
        );
        prisma.refreshToken.count.mockResolvedValue(1);
        await expect(sessionEndedOf(service.refresh(rawToken, ctx))).resolves.toBe(
          'reuse-detected',
        );
      });

      it('says logout when the replayed token was ended by the user themselves', async () => {
        // Same hard response (the family still dies), softer story: a tab that
        // slept through its owner's logout is not a thief, and crying theft
        // there is how a real warning gets ignored later.
        prisma.refreshToken.findUnique.mockResolvedValue(
          row({ revokedAt: new Date(), revokedReason: 'LOGOUT' }),
        );
        await expect(sessionEndedOf(service.refresh(rawToken, ctx))).resolves.toBe('logout');
        expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'REUSE_DETECTED');
      });

      it('never dresses the invisible ROTATED up as an explanation', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(
          row({ revokedAt: new Date(Date.now() - 60_000), revokedReason: 'ROTATED' }),
        );
        await expect(sessionEndedOf(service.refresh(rawToken, ctx))).resolves.toBe(
          'reuse-detected',
        );
      });

      it('says expired when the token simply ran out', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(
          row({ expiresAt: new Date(Date.now() - 1000) }),
        );
        await expect(sessionEndedOf(service.refresh(rawToken, ctx))).resolves.toBe('expired');
      });

      it('explains nothing for a token it has never seen', async () => {
        // No row, no evidence — guessing a reason here would be inventing one.
        prisma.refreshToken.findUnique.mockResolvedValue(null);
        await expect(sessionEndedOf(service.refresh(rawToken, ctx))).resolves.toBeUndefined();
      });

      it('explains nothing when the account itself is gone', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(row());
        prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
        await expect(sessionEndedOf(service.refresh(rawToken, ctx))).resolves.toBeUndefined();
      });
    });

    // --- the reuse grace window (two tabs refreshing at once) --------------

    describe('grace window', () => {
      /** A row rotated `agoMs` ago, i.e. revoked WITH a successor. */
      const rotated = (agoMs: number) =>
        row({ revokedAt: new Date(Date.now() - agoMs), replacedById: 'rt-winner' });

      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1' }));
      });

      it('serves a token that was rotated moments ago while the family is alive', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(rotated(500));
        prisma.refreshToken.count.mockResolvedValue(1); // the winner's token

        const res = await service.refresh(rawToken, ctx);
        expect(res.tokens).toEqual({ accessToken: 'AT2', refreshToken: 'RT2' });
        expect(tokenService.revokeFamily).not.toHaveBeenCalled();
        // The row belongs to the winner: this caller claims nothing.
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      });

      it('still treats a LATE replay as theft even with a successor', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(rotated(60_000));
        prisma.refreshToken.count.mockResolvedValue(1);

        await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
        expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'REUSE_DETECTED');
      });

      it('refuses a recently rotated token once the family is dead', async () => {
        // revokeFamily leaves the revokedAt of already-revoked rows untouched,
        // so recency alone would keep letting a killed session back in.
        prisma.refreshToken.findUnique.mockResolvedValue(rotated(500));
        prisma.refreshToken.count.mockResolvedValue(0);

        await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
        expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'REUSE_DETECTED');
      });

      it('a logout-revoked token is theft, not concurrency (no successor)', async () => {
        prisma.refreshToken.findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
        prisma.refreshToken.count.mockResolvedValue(1);

        await expect(service.refresh(rawToken, ctx)).rejects.toThrow('Invalid session');
        expect(tokenService.revokeFamily).toHaveBeenCalledWith('fam-1', 'REUSE_DETECTED');
        expect(prisma.refreshToken.count).not.toHaveBeenCalled(); // short-circuited
      });

      it('serves the loser of a claim race when the winner just rotated', async () => {
        // Reads live, loses the conditional write, re-reads and finds a fresh
        // rotation: two tabs, not a thief.
        prisma.refreshToken.findUnique
          .mockResolvedValueOnce(row())
          .mockResolvedValueOnce(rotated(50));
        prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
        prisma.refreshToken.count.mockResolvedValue(1);

        const res = await service.refresh(rawToken, ctx);
        expect(res.tokens).toEqual({ accessToken: 'AT2', refreshToken: 'RT2' });
        expect(tokenService.revokeFamily).not.toHaveBeenCalled();
        // The token this request just minted must not count as the family's life.
        expect(prisma.refreshToken.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ NOT: { id: 'rt-new' } }),
          }),
        );
      });
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
      expect(tokenService.revokeToken).toHaveBeenCalledWith('rt-1', 'LOGOUT');
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
      await expect(
        service.forgotPassword({ email: 'x@y.z' } as never, ctx),
      ).resolves.toBeUndefined();
      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('says nothing for a soft-deleted account either', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ deletedAt: new Date() }));
      await service.forgotPassword({ email: 'x@y.z' } as never, ctx);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('creates a reset token and sends the email for an existing account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', email: 'real@user.dev' }));
      await service.forgotPassword({ email: 'real@user.dev' } as never, ctx);
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      const message = enqueuedMail(queue);
      expect(message.to).toBe('real@user.dev');
      expect(message.subject).toMatch(/reset your password/i);
      // The link has to carry the RAW token; only its sha256 is stored.
      expect(message.html).toContain('/reset-password?token=');
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
      expect(prisma.atomic).toHaveBeenCalledTimes(1);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('u1', 'LOGOUT');
      expect(res.message).toMatch(/Password updated/i);
    });
  });

  describe('audit', () => {
    it('stamps the company on a sign-in, so a customer can see their own access log', async () => {
      // Authentication runs in system scope, where there is no tenant on the
      // scope to copy — resolving it from the user is what keeps login events
      // visible to the company they belong to.
      prisma.user.findUnique.mockResolvedValue({ tenantId: 'tenant-7' });

      await service.audit('auth.login', 'user-1', { ip: '203.0.113.4', userAgent: 'jest' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'auth.login',
            tenantId: 'tenant-7',
            userId: 'user-1',
            ip: '203.0.113.4',
          }),
        }),
      );
    });

    it('writes no tenant when there is no user to resolve one from', async () => {
      await service.audit('auth.forgot_password', null, {});
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: null }) }),
      );
    });

    it('never lets a failed audit break the request path', async () => {
      prisma.user.findUnique.mockResolvedValue({ tenantId: 'tenant-7' });
      prisma.auditLog.create.mockRejectedValue(new Error('audit table is on fire'));
      await expect(service.audit('auth.login', 'user-1', {})).resolves.toBeUndefined();
    });
  });
});
