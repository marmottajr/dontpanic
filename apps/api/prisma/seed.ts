import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';

// Prisma 7 driver adapter — same connection style as PrismaService.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const email = 'admin@dontpanic.dev';
  const password = 'DontPanic42!';
  const passwordHash = await hash(password);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Zaphod Beeblebrox',
      passwordHash,
      role: 'ADMIN',
      emailVerified: true,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`🌱 Seeded admin → ${email} / ${password}   (Don't Panic.)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
