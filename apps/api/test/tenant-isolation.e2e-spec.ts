import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { hash } from 'argon2';
import { PrismaService } from '../src/infra/prisma/prisma.service';
import { closeOwnerDb, createE2EApp, ownerDb, resetDb } from './e2e-app';
import { E2EClient } from './e2e-client';

/**
 * The isolation guarantee, proven against a real Postgres.
 *
 * This suite only means something because the app connects as the RESTRICTED
 * role (see `e2e-setup.ts`). As the database owner — a superuser — every policy
 * would be bypassed and these assertions would pass while the isolation was
 * completely broken. If someone ever points the e2e `DATABASE_URL` at the
 * owner, this file goes green for the wrong reason; the first test below exists
 * to catch exactly that.
 */
describe('Tenant isolation (e2e)', () => {
  const PASSWORD = 'Sup3rSecret!';
  const ACME = { slug: 'iso-acme', email: 'admin@iso-acme.test' };
  const GLOBEX = { slug: 'iso-globex', email: 'admin@iso-globex.test' };

  let app: NestFastifyApplication;
  let acmeId: string;
  let globexId: string;
  let globexUserId: string;

  beforeAll(async () => {
    app = await createE2EApp();
    await resetDb();

    const passwordHash = await hash(PASSWORD);
    const db = ownerDb();

    // Two companies, one admin each, seeded through the owner connection —
    // the app's own client could not create rows for a tenant it is not scoped
    // to, which is the very property under test.
    for (const company of [ACME, GLOBEX]) {
      const tenant = await db.tenant.create({
        data: {
          slug: company.slug,
          name: company.slug,
          email: company.email,
          status: 'ACTIVE',
        },
      });
      const user = await db.user.create({
        data: {
          tenantId: tenant.id,
          email: company.email,
          name: company.slug,
          passwordHash,
          role: 'ADMIN',
          emailVerified: true,
        },
      });
      if (company === ACME) {
        acmeId = tenant.id;
      } else {
        globexId = tenant.id;
        globexUserId = user.id;
      }
    }
  });

  afterAll(async () => {
    await resetDb();
    await closeOwnerDb();
    await app.close();
  });

  async function signIn(email: string): Promise<E2EClient> {
    const client = new E2EClient(app);
    await client.bootstrapCsrf();
    const res = await client.post('/api/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(200);
    return client;
  }

  it('runs as a role that cannot bypass RLS — otherwise this suite proves nothing', async () => {
    const [row] = await ownerDb().$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'dontpanic_app'`;
    expect(row).toBeDefined();
    expect(row.rolsuper).toBe(false);
    expect(row.rolbypassrls).toBe(false);
  });

  it('shows an admin only their own company’s users', async () => {
    const client = await signIn(ACME.email);
    const res = await client.get('/api/admin/users');

    expect(res.status).toBe(200);
    const emails = (res.body.items as { email: string }[]).map((u) => u.email);
    expect(emails).toContain(ACME.email);
    expect(emails).not.toContain(GLOBEX.email);
  });

  it('does not leak another company’s row through a forged id', async () => {
    const client = await signIn(ACME.email);
    // A real, existing user id — from the other company. Guessing is not the
    // attack; holding a valid id from somewhere else is.
    const res = await client.patch(`/api/admin/users/${globexUserId}/role`, { role: 'USER' });

    // Not found, not forbidden: a 403 would already confirm the row exists.
    expect([404, 400]).toContain(res.status);

    // And the row is untouched.
    const target = await ownerDb().user.findUnique({ where: { id: globexUserId } });
    expect(target?.role).toBe('ADMIN');
  });

  it('gives each company its own view of the same query', async () => {
    const acme = await signIn(ACME.email);
    const globex = await signIn(GLOBEX.email);

    const [fromAcme, fromGlobex] = await Promise.all([
      acme.get('/api/admin/users'),
      globex.get('/api/admin/users'),
    ]);

    const emailsOf = (res: { body: { items: { email: string }[] } }) =>
      res.body.items.map((u) => u.email);
    expect(emailsOf(fromAcme)).toEqual([ACME.email]);
    expect(emailsOf(fromGlobex)).toEqual([GLOBEX.email]);
  });

  it('returns nothing at all when no scope was declared (fail-closed)', async () => {
    // Straight through the app's restricted connection, outside any request and
    // therefore outside any scope. This is the property the whole design rests
    // on: forgetting the scope yields emptiness, never another company's data.
    const prisma = app.get(PrismaService);
    expect(await prisma.user.count()).toBe(0);

    // Whereas inside a scope, the company sees itself and only itself.
    expect(await prisma.forTenant(acmeId, (tx) => tx.user.count())).toBe(1);
    expect(await prisma.forTenant(globexId, (tx) => tx.user.count())).toBe(1);
  });
});
