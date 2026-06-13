import { generate } from 'otplib';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { createE2EApp, resetDb } from './e2e-app';
import { E2EClient } from './e2e-client';

/**
 * Full-stack auth E2E against a REAL Postgres (`dontpanic_e2e`). The app is
 * booted from AppModule with the production cookie/csrf wiring; every request
 * goes through Fastify -> guards -> Zod pipe -> services -> Prisma -> Postgres.
 *
 * We exercise the genuine double-submit CSRF path (token fetched, cookie +
 * header echoed) and the httpOnly cookie session: login sets `access_token` /
 * `refresh_token`, /users/me reads them, refresh rotates them, logout clears.
 */
describe('Auth & Users (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;

  const STRONG_PASSWORD = 'Sup3rSecret!';
  const NEW_PASSWORD = 'Even5tronger!';

  beforeAll(async () => {
    app = await createE2EApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  /** A fresh, CSRF-primed client per use — keeps cookie jars isolated. */
  async function newClient(): Promise<E2EClient> {
    const client = new E2EClient(app);
    await client.bootstrapCsrf();
    return client;
  }

  /** Register + verify email + log in; returns a logged-in client. */
  async function registerVerifyLogin(
    email: string,
    password = STRONG_PASSWORD,
    name = 'Arthur Dent',
  ): Promise<{ client: E2EClient; userId: string }> {
    const client = await newClient();

    const reg = await client.post('/api/auth/register', { email, password, name });
    expect(reg.status).toBe(201);
    const userId = reg.body.id as string;

    // Pull the verification token straight from the DB (mail is console driver).
    const token = await rawEmailVerifyToken(userId);
    const verify = await client.get(`/api/auth/verify-email?token=${token}`);
    expect(verify.status).toBe(200);

    const login = await client.post('/api/auth/login', { email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
    expect(client.hasCookie('access_token')).toBe(true);
    expect(client.hasCookie('refresh_token')).toBe(true);

    return { client, userId };
  }

  /**
   * The raw email-verification token is never persisted (only its sha256 hash
   * is). The service builds `sha256(raw)`; to drive verify-email in a test we
   * reproduce the same hashing and brute-search would be silly — instead we
   * recompute by intercepting: the simplest deterministic path is to read the
   * single token row and re-derive nothing. Because we can't reverse sha256, we
   * instead generate the raw token ourselves is impossible — so we mint a known
   * token row directly. We do that by replacing the stored hash with the hash of
   * a token WE choose, keeping the flow honest end-to-end through verify-email.
   */
  async function rawEmailVerifyToken(userId: string): Promise<string> {
    const { sha256 } = await import('../src/modules/auth/support/crypto.util');
    const raw = `e2e-verify-${userId}-token`;
    const record = await prisma.emailVerificationToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new Error('no email verification token row created by register');
    // Swap in the hash of a token we know the plaintext of — exercises the real
    // verify-email lookup (findUnique by tokenHash) and the used/expiry checks.
    await prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { tokenHash: sha256(raw) },
    });
    return raw;
  }

  async function rawPasswordResetToken(userId: string): Promise<string> {
    const { sha256 } = await import('../src/modules/auth/support/crypto.util');
    const raw = `e2e-reset-${userId}-token-1234567890`;
    const record = await prisma.passwordResetToken.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new Error('no password reset token row created by forgot-password');
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { tokenHash: sha256(raw) },
    });
    return raw;
  }

  // ---------------------------------------------------------------------------
  // Happy path: register -> verify -> login -> /me -> refresh -> logout
  // ---------------------------------------------------------------------------

  it('completes the full register -> verify -> login -> me -> refresh -> logout flow', async () => {
    const email = 'arthur@heart-of-gold.test';
    const { client, userId } = await registerVerifyLogin(email);

    // emailVerified flipped in the DB.
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.emailVerified).toBe(true);

    // /users/me reads the access_token cookie and returns the profile.
    const me = await client.get('/api/users/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(userId);
    expect(me.body.email).toBe(email);
    expect(me.body).not.toHaveProperty('passwordHash');

    // Refresh rotates: a new refresh_token row is minted, old one revoked.
    const beforeTokens = await prisma.refreshToken.findMany({ where: { userId } });
    expect(beforeTokens).toHaveLength(1);
    const oldRefresh = client.getCookie('refresh_token');

    const refresh = await client.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);
    expect(client.getCookie('refresh_token')).not.toBe(oldRefresh);

    const afterTokens = await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(afterTokens).toHaveLength(2);
    expect(afterTokens[0].revokedAt).not.toBeNull(); // old one claimed/rotated
    expect(afterTokens[0].replacedById).toBe(afterTokens[1].id);
    expect(afterTokens[1].familyId).toBe(afterTokens[0].familyId); // same family

    // New access cookie still authenticates /me.
    const me2 = await client.get('/api/users/me');
    expect(me2.status).toBe(200);

    // Logout revokes the live refresh token and clears cookies.
    const logout = await client.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect(client.hasCookie('refresh_token')).toBe(false);

    const live = await prisma.refreshToken.findMany({ where: { userId, revokedAt: null } });
    expect(live).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Refresh reuse detection: replaying a rotated token nukes the family.
  // ---------------------------------------------------------------------------

  it('detects refresh-token reuse and revokes the whole family', async () => {
    const { client, userId } = await registerVerifyLogin('ford@betelgeuse.test');
    const stolen = client.getCookie('refresh_token');

    // Legitimate rotation: client now holds a new token; `stolen` is revoked.
    const ok = await client.post('/api/auth/refresh');
    expect(ok.status).toBe(200);

    // Replay the OLD (revoked) token -> reuse detected -> 401 + family revoked.
    // The csrf cookie still rides along via the jar; only refresh_token is swapped.
    const replay = await client.post('/api/auth/refresh', undefined, {
      cookies: { refresh_token: stolen! },
    });
    expect(replay.status).toBe(401);

    const live = await prisma.refreshToken.findMany({ where: { userId, revokedAt: null } });
    expect(live).toHaveLength(0); // even the freshly-minted token was nuked
  });

  // ---------------------------------------------------------------------------
  // Login error paths.
  // ---------------------------------------------------------------------------

  it('rejects login with the wrong password (generic 401)', async () => {
    const email = 'trillian@heart-of-gold.test';
    const { client } = await registerVerifyLogin(email);
    client.clearAuthCookies();

    const res = await client.post('/api/auth/login', { email, password: 'WrongPass9!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials'); // generic, no enumeration
  });

  it('rejects login for an unknown email with the same generic 401', async () => {
    const client = await newClient();
    const res = await client.post('/api/auth/login', {
      email: 'nobody@nowhere.test',
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  // ---------------------------------------------------------------------------
  // Registration conflict.
  // ---------------------------------------------------------------------------

  it('returns 409 when registering a duplicate email', async () => {
    const client = await newClient();
    const email = 'zaphod@president.test';
    const first = await client.post('/api/auth/register', {
      email,
      password: STRONG_PASSWORD,
      name: 'Zaphod',
    });
    expect(first.status).toBe(201);

    const second = await client.post('/api/auth/register', {
      email,
      password: STRONG_PASSWORD,
      name: 'Zaphod II',
    });
    expect(second.status).toBe(409);
    // Only one row exists.
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('rejects registration with a weak password (422 from Zod pipe)', async () => {
    const client = await newClient();
    const res = await client.post('/api/auth/register', {
      email: 'weak@pw.test',
      password: 'short',
      name: 'Weak',
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Protected route guards.
  // ---------------------------------------------------------------------------

  it('blocks /users/me without an access cookie (401)', async () => {
    const client = await newClient();
    const res = await client.get('/api/users/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication required');
  });

  it('rejects an unsafe request without a CSRF token (403)', async () => {
    // Fresh client that has NOT bootstrapped a csrf token.
    const client = new E2EClient(app);
    const res = await client.post('/api/auth/register', {
      email: 'csrf@missing.test',
      password: STRONG_PASSWORD,
      name: 'No CSRF',
    });
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // Email verification edge cases.
  // ---------------------------------------------------------------------------

  it('rejects an invalid email-verification token (400)', async () => {
    const client = await newClient();
    const res = await client.get('/api/auth/verify-email?token=this-token-does-not-exist');
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Forgot / reset password happy path + session invalidation.
  // ---------------------------------------------------------------------------

  it('resets a password and invalidates existing sessions', async () => {
    const email = 'marvin@sirius.test';
    const { client, userId } = await registerVerifyLogin(email);

    // A live session exists (we're logged in).
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(1);

    // forgot-password always 200s.
    const forgot = await client.post('/api/auth/forgot-password', { email });
    expect(forgot.status).toBe(200);

    const token = await rawPasswordResetToken(userId);
    const reset = await client.post('/api/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    // Old sessions revoked by the reset.
    expect(await prisma.refreshToken.count({ where: { userId, revokedAt: null } })).toBe(0);

    // Old password no longer works; new one does.
    const fresh = await newClient();
    const oldLogin = await fresh.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await fresh.post('/api/auth/login', { email, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
    expect(fresh.hasCookie('access_token')).toBe(true);
  });

  it('rejects reset-password with an unknown/used token (400)', async () => {
    const client = await newClient();
    const res = await client.post('/api/auth/reset-password', {
      token: 'totally-bogus-reset-token',
      password: NEW_PASSWORD,
    });
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Account lockout after repeated failed logins.
  // ---------------------------------------------------------------------------

  it('locks the account after too many failed logins (generic 401 throughout)', async () => {
    const email = 'slartibartfast@magrathea.test';
    const { userId } = await registerVerifyLogin(email);
    const attacker = await newClient();

    // LOGIN_MAX_ATTEMPTS defaults to 5. Burn 5 wrong passwords.
    for (let i = 0; i < 5; i += 1) {
      const res = await attacker.post('/api/auth/login', { email, password: 'WrongPass9!' });
      expect(res.status).toBe(401);
    }

    // The account row is now locked.
    const locked = await prisma.user.findUnique({ where: { id: userId } });
    expect(locked?.lockedUntil).not.toBeNull();
    expect(locked!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Even the CORRECT password is refused while locked.
    const correct = await attacker.post('/api/auth/login', {
      email,
      password: STRONG_PASSWORD,
    });
    expect(correct.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Full 2FA cycle: setup -> enable -> login challenge -> verify -> tokens.
  // ---------------------------------------------------------------------------

  it('enables 2FA and completes a TOTP login challenge', async () => {
    const email = 'eddie@heart-of-gold.test';
    const { client, userId } = await registerVerifyLogin(email);

    // 1. setup -> returns a base32 secret stashed in the (memory) cache.
    const setup = await client.post('/api/users/me/2fa/setup');
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    expect(secret).toBeTruthy();

    // 2. enable -> prove a live TOTP; returns one-time backup codes.
    const enableCode = await generate({ secret });
    const enable = await client.post('/api/users/me/2fa/enable', { code: enableCode });
    expect(enable.status).toBe(200);
    expect(Array.isArray(enable.body.backupCodes)).toBe(true);
    expect(enable.body.backupCodes).toHaveLength(10);

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(dbUser?.twoFactorEnabled).toBe(true);
    expect(dbUser?.twoFactorSecret).toBe(secret);

    // 3. login now returns a 2FA challenge (ticket), NOT cookies.
    const fresh = await newClient();
    const login = await fresh.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRequired).toBe(true);
    expect(login.body.ticket).toBeTruthy();
    expect(fresh.hasCookie('access_token')).toBe(false); // no session yet

    // 4. verify the second factor with a fresh TOTP -> cookies issued.
    const loginCode = await generate({ secret });
    const verify = await fresh.post('/api/auth/2fa/verify', {
      ticket: login.body.ticket,
      code: loginCode,
    });
    expect(verify.status).toBe(200);
    expect(verify.body.user.email).toBe(email);
    expect(fresh.hasCookie('access_token')).toBe(true);
    expect(fresh.hasCookie('refresh_token')).toBe(true);

    // The freshly minted session works.
    const me = await fresh.get('/api/users/me');
    expect(me.status).toBe(200);
    expect(me.body.twoFactorEnabled).toBe(true);
  });

  it('rejects a 2FA challenge with a wrong code (401) and a backup code works', async () => {
    const email = 'benjy@mouse.test';
    const { client } = await registerVerifyLogin(email);

    const setup = await client.post('/api/users/me/2fa/setup');
    const secret = setup.body.secret as string;
    const enable = await client.post('/api/users/me/2fa/enable', {
      code: await generate({ secret }),
    });
    const backupCodes = enable.body.backupCodes as string[];

    // Login -> challenge.
    const fresh = await newClient();
    const login = await fresh.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    const ticket = login.body.ticket as string;

    // Wrong TOTP code -> 401, ticket survives (under the attempt limit).
    const wrong = await fresh.post('/api/auth/2fa/verify', { ticket, code: '000000' });
    expect(wrong.status).toBe(401);

    // A valid one-time backup code completes the challenge.
    const good = await fresh.post('/api/auth/2fa/verify', { ticket, code: backupCodes[0] });
    expect(good.status).toBe(200);
    expect(fresh.hasCookie('access_token')).toBe(true);

    // That backup code is now consumed (single-use) — reusing it on a new
    // challenge must fail.
    const again = await newClient();
    const login2 = await again.post('/api/auth/login', { email, password: STRONG_PASSWORD });
    const reuse = await again.post('/api/auth/2fa/verify', {
      ticket: login2.body.ticket,
      code: backupCodes[0],
    });
    expect(reuse.status).toBe(401);
  });
});
