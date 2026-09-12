import { hash } from 'argon2';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createE2EApp, closeOwnerDb, ownerDb, resetDb } from './e2e-app';
import { E2EClient } from './e2e-client';
import { sha256 } from '../src/modules/auth/support/crypto.util';

/**
 * Invitations end to end, against a REAL Postgres (`dontpanic_e2e`), with the
 * app running under the **restricted** role — the same one production uses. It
 * matters here more than in most suites: an invitation is the one object that
 * is read by someone who has no session at all, and written by an admin who
 * must not be able to reach another company's rows. Both halves are only
 * genuinely tested if RLS is actually in force.
 *
 * The three questions this file exists to answer:
 *
 *  1. Does the happy path produce a real, logged-in user in the right company?
 *  2. Does a link stop working the moment it should — used, revoked, expired?
 *  3. Can one company touch another's invitations? (It must not, and the
 *     guarantee is Postgres's, not the service's `where` clause.)
 */
describe('Invitations (e2e)', () => {
  let app: NestFastifyApplication;

  const PASSWORD = 'Sup3rSecret!';
  const INVITEE_PASSWORD = 'Even5tronger!';

  /**
   * Prefix on every slug and e-mail this suite creates. The suites share one
   * database and hand it back empty; the prefix is what makes a row that
   * escaped anyway point at the suite that left it.
   */
  const SUITE = 'invitee2e';

  const ACME = { slug: `${SUITE}-acme`, email: `admin@${SUITE}-acme.test` };
  const GLOBEX = { slug: `${SUITE}-globex`, email: `admin@${SUITE}-globex.test` };

  /** Direct reads go through the owner connection: the app's restricted role
   *  sees nothing outside a tenant scope, so it would report every table as
   *  empty and the assertions would pass for the wrong reason. */
  const db = ownerDb();

  let acmeId: string;
  let globexId: string;

  beforeAll(async () => {
    app = await createE2EApp();
  });

  afterAll(async () => {
    // Hand the database back empty — the next suite's createE2EApp() asserts it.
    await resetDb();
    await app.close();
    await closeOwnerDb();
  });

  beforeEach(async () => {
    await resetDb();

    // Seeded through the owner connection, because the app's client cannot
    // create rows for a tenant it is not scoped to — which is the property
    // under test further down.
    const passwordHash = await hash(PASSWORD);
    for (const company of [ACME, GLOBEX]) {
      const tenant = await db.tenant.create({
        data: { slug: company.slug, name: company.slug, email: company.email, status: 'ACTIVE' },
      });
      const profile = await db.profile.create({
        data: { tenantId: tenant.id, code: 'ADMIN', name: 'Administrator', system: true },
      });
      await db.user.create({
        data: {
          tenantId: tenant.id,
          email: company.email,
          name: company.slug,
          passwordHash,
          role: 'ADMIN',
          emailVerified: true,
          profileId: profile.id,
        },
      });
      if (company === ACME) acmeId = tenant.id;
      else globexId = tenant.id;
    }
  });

  async function newClient(): Promise<E2EClient> {
    const client = new E2EClient(app);
    await client.bootstrapCsrf();
    return client;
  }

  /** Signs in one of the seeded admins and returns its primed client. */
  async function loginAs(company: { email: string }): Promise<E2EClient> {
    const client = await newClient();
    const login = await client.post('/api/auth/login', {
      email: company.email,
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    return client;
  }

  /**
   * The raw token is mailed and never persisted (only its SHA-256 is), and the
   * console mail driver does not surface it — so mint one we know: overwrite
   * the stored hash with the hash of a token of our choosing. Same trick the
   * auth suite uses for the verification code, for the same reason.
   */
  async function forceToken(invitationId: string, raw: string): Promise<string> {
    await db.invitation.update({
      where: { id: invitationId },
      data: { tokenHash: sha256(raw) },
    });
    return raw;
  }

  /** Invite someone into ACME and return the id plus a token we can replay. */
  async function inviteIntoAcme(
    handle = 'ford',
    over: Record<string, unknown> = {},
  ): Promise<{ id: string; token: string; email: string; client: E2EClient }> {
    const client = await loginAs(ACME);
    const email = `${handle}@${SUITE}.test`;
    const res = await client.post('/api/admin/invitations', {
      email,
      name: 'Ford Prefect',
      role: 'USER',
      ...over,
    });
    expect(res.status).toBe(201);
    const id = res.body.id as string;
    return { id, token: await forceToken(id, `raw-${handle}-token-000000000000`), email, client };
  }

  describe('the happy path', () => {
    it('turns a mailed link into a real user in the inviting company', async () => {
      const { id, token, email } = await inviteIntoAcme();

      const preview = await (await newClient()).get(`/api/auth/invitations/${token}`);
      expect(preview.status).toBe(200);
      expect(preview.body.email).toBe(email);
      expect(preview.body.tenantName).toBe(ACME.slug);

      const accepting = await newClient();
      const accept = await accepting.post('/api/auth/invitations/accept', {
        token,
        name: 'Ford Prefect',
        password: INVITEE_PASSWORD,
        acceptTerms: true,
      });
      expect(accept.status).toBe(201);

      // Accepting signs you in: no second trip through the login form.
      expect(accepting.hasCookie('access_token')).toBe(true);
      expect(accepting.hasCookie('refresh_token')).toBe(true);

      const created = await db.user.findUnique({ where: { email } });
      expect(created?.tenantId).toBe(acmeId);
      // Verified because the click on the mailed link IS the proof of the
      // address — unlike the old flow, where it was the admin's word.
      expect(created?.emailVerified).toBe(true);
      expect(created?.role).toBe('USER');

      const row = await db.invitation.findUnique({ where: { id } });
      expect(row?.status).toBe('ACCEPTED');
      expect(row?.acceptedUserId).toBe(created?.id);
    });

    it('records the legal acceptance in the invitee’s own name', async () => {
      const { token, email } = await inviteIntoAcme('trillian');
      const client = await newClient();
      await client.post('/api/auth/invitations/accept', {
        token,
        name: 'Trillian',
        password: INVITEE_PASSWORD,
        acceptTerms: true,
      });

      const user = await db.user.findUnique({ where: { email } });
      const acceptances = await db.legalAcceptance.findMany({ where: { userId: user!.id } });
      // The company having accepted the terms earlier was the company's act,
      // not this person's.
      expect(acceptances.map((a) => a.document).sort()).toEqual(['PRIVACY_POLICY', 'TERMS_OF_USE']);
    });

    it('lets the new user straight into the API with the cookies it just got', async () => {
      const { token } = await inviteIntoAcme('zaphod');
      const client = await newClient();
      await client.post('/api/auth/invitations/accept', {
        token,
        name: 'Zaphod',
        password: INVITEE_PASSWORD,
        acceptTerms: true,
      });

      const me = await client.get('/api/users/me');
      expect(me.status).toBe(200);
      expect(me.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('a link that should no longer work', () => {
    it('refuses a token nobody issued', async () => {
      const res = await (await newClient()).get('/api/auth/invitations/not-a-real-token-at-all');
      expect(res.status).toBe(404);
    });

    it('refuses the same token twice', async () => {
      const { token } = await inviteIntoAcme('marvin');
      const body = {
        token,
        name: 'Marvin',
        password: INVITEE_PASSWORD,
        acceptTerms: true,
      };
      expect((await (await newClient()).post('/api/auth/invitations/accept', body)).status).toBe(
        201,
      );

      // Replaying it must not produce a second account, nor resurrect the first.
      const replay = await (await newClient()).post('/api/auth/invitations/accept', body);
      expect(replay.status).toBeGreaterThanOrEqual(400);
    });

    it('refuses a revoked invitation', async () => {
      const { id, token, client } = await inviteIntoAcme('slartibartfast');

      const revoke = await client.delete(`/api/admin/invitations/${id}`);
      expect(revoke.status).toBe(200);
      expect((await db.invitation.findUnique({ where: { id } }))?.status).toBe('REVOKED');

      const accept = await (
        await newClient()
      ).post('/api/auth/invitations/accept', {
        token,
        name: 'Slartibartfast',
        password: INVITEE_PASSWORD,
        acceptTerms: true,
      });
      expect(accept.status).toBeGreaterThanOrEqual(400);
    });

    it('refuses an expired invitation, and says the same thing as for a wrong one', async () => {
      const { id, token } = await inviteIntoAcme('agrajag');
      await db.invitation.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const expired = await (await newClient()).get(`/api/auth/invitations/${token}`);
      const unknown = await (await newClient()).get('/api/auth/invitations/some-other-token-xyz');

      // Identical answers on purpose: distinguishing "expired" from "never
      // existed" would tell an attacker which guesses were once real.
      expect(expired.status).toBe(unknown.status);
      expect(expired.body.message).toBe(unknown.body.message);
    });
  });

  describe('isolation between companies', () => {
    it('does not show one company the other’s invitations', async () => {
      await inviteIntoAcme('ford');

      const globex = await loginAs(GLOBEX);
      const list = await globex.get('/api/admin/invitations');
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([]);
      expect(list.body.total).toBe(0);
    });

    // The one that would be a data breach. The service filters by tenant, but
    // that filtering is convenience — this asserts the row is unreachable even
    // when its id is known, which is Postgres's job.
    it('refuses to revoke an invitation belonging to another company', async () => {
      const { id } = await inviteIntoAcme('ford');

      const globex = await loginAs(GLOBEX);
      const res = await globex.delete(`/api/admin/invitations/${id}`);
      expect(res.status).toBe(404);

      // Still untouched — a 404 that had actually revoked the row would be the
      // worst of both worlds.
      expect((await db.invitation.findUnique({ where: { id } }))?.status).toBe('PENDING');
    });

    it('refuses to resend another company’s invitation', async () => {
      const { id } = await inviteIntoAcme('ford');

      const globex = await loginAs(GLOBEX);
      expect((await globex.post(`/api/admin/invitations/${id}/resend`)).status).toBe(404);
      expect((await db.invitation.findUnique({ where: { id } }))?.resentCount).toBe(0);
    });

    it('lets both companies invite the same address without colliding', async () => {
      const shared = `zaphod@${SUITE}.test`;
      await inviteIntoAcme('acme-side', { email: shared });

      const globex = await loginAs(GLOBEX);
      const second = await globex.post('/api/admin/invitations', {
        email: shared,
        role: 'USER',
      });
      // The uniqueness that exists is per (tenant, e-mail) and only over live
      // invitations — two companies courting the same person is legitimate.
      expect(second.status).toBe(201);

      const rows = await db.invitation.findMany({ where: { email: shared } });
      expect(rows.map((r) => r.tenantId).sort()).toEqual([acmeId, globexId].sort());
    });

    it('refuses a second live invitation for the same address in one company', async () => {
      const { client, email } = await inviteIntoAcme('ford');
      const again = await client.post('/api/admin/invitations', { email, role: 'USER' });
      expect(again.status).toBe(409);
    });
  });

  describe('privilege', () => {
    it('does not let an ordinary member invite anybody', async () => {
      // A USER in ACME, seeded directly.
      const member = { email: `member@${SUITE}.test` };
      await db.user.create({
        data: {
          tenantId: acmeId,
          email: member.email,
          name: 'Member',
          passwordHash: await hash(PASSWORD),
          role: 'USER',
          emailVerified: true,
        },
      });

      const client = await newClient();
      expect(
        (await client.post('/api/auth/login', { email: member.email, password: PASSWORD })).status,
      ).toBe(200);

      const res = await client.post('/api/admin/invitations', {
        email: `nope@${SUITE}.test`,
        role: 'USER',
      });
      expect(res.status).toBe(403);
    });

    // A company ADMIN minting a SUPERADMIN would be an escalation out of the
    // tenant altogether. The contract refuses the value; this proves the wire
    // refuses it too.
    it('refuses to invite a SUPERADMIN', async () => {
      const client = await loginAs(ACME);
      const res = await client.post('/api/admin/invitations', {
        email: `god@${SUITE}.test`,
        role: 'SUPERADMIN',
      });
      expect(res.status).toBe(400);
    });
  });
});
