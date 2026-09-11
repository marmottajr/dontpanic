import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { SYSTEM_PROFILES, permissionsForProfile } from '@dontpanic/shared';

// Seeding writes across tenants and creates the platform operator, so it needs
// the database owner — the restricted runtime role is blocked by RLS, which is
// exactly what that role is for. Same fallback order as prisma.config.ts.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'DontPanic42!';
const SUPERADMIN_EMAIL = 'superadmin@dontpanic.dev';
const ADMIN_EMAIL = 'admin@dontpanic.dev';

async function main(): Promise<void> {
  const passwordHash = await hash(PASSWORD);

  // A starter plan. `isDefault` is what a public signup lands on.
  const plan = await prisma.plan.upsert({
    where: { code: 'free' },
    update: {},
    create: {
      code: 'free',
      name: 'Free',
      description: 'Starter plan — change or replace it for your product.',
      priceCents: 0,
      trialDays: 14,
      maxUsers: 5,
      isDefault: true,
    },
  });

  // The platform operator. Belongs to no company: it is the only role that
  // reaches /api/platform/*, and it must never hold data of any single tenant.
  // (The web /admin screen is a different thing — company user management,
  // gated on the company ADMIN role.)
  await prisma.user.upsert({
    where: { email: SUPERADMIN_EMAIL },
    update: {},
    create: {
      email: SUPERADMIN_EMAIL,
      name: 'Deep Thought',
      passwordHash,
      role: 'SUPERADMIN',
      emailVerified: true,
    },
  });

  // One demo company, so a fresh clone has something to log into.
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dontpanic' },
    update: {},
    create: {
      slug: 'dontpanic',
      name: 'Heart of Gold',
      email: ADMIN_EMAIL,
      status: 'ACTIVE',
      planId: plan.id,
    },
  });

  // System profiles and their permission rows, from the shared matrix — the
  // same code path the signup flow uses, so seed and signup cannot drift.
  for (const { code, name } of SYSTEM_PROFILES) {
    const profile = await prisma.profile.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: {},
      create: { tenantId: tenant.id, code, name, system: true },
    });
    const permissions = permissionsForProfile(code);
    if (permissions.length > 0) {
      await prisma.permission.createMany({
        data: permissions.map((p) => ({ profileId: profile.id, ...p })),
        skipDuplicates: true,
      });
    }
  }

  const adminProfile = await prisma.profile.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ADMIN' } },
  });

  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      email: ADMIN_EMAIL,
      name: 'Zaphod Beeblebrox',
      passwordHash,
      role: 'ADMIN',
      emailVerified: true,
      tenantId: tenant.id,
      profileId: adminProfile?.id ?? null,
    },
  });

  /* eslint-disable no-console */
  console.log(`🌱 Seeded platform operator → ${SUPERADMIN_EMAIL} / ${PASSWORD}`);
  console.log(`🌱 Seeded company admin     → ${ADMIN_EMAIL} / ${PASSWORD}   (Don't Panic.)`);
  /* eslint-enable no-console */
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
