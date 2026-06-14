import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 moved the Migrate connection URL out of schema.prisma into here.
// Migrate/introspect commands run from apps/api, so load the monorepo root .env.
loadEnv({ path: '../../.env' });
loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // `prisma generate` is offline and runs on every `pnpm install` (postinstall),
    // including CI/Docker contexts that have no DATABASE_URL. Fall back to a
    // placeholder so generate never fails; migrate/seed/runtime use the real URL
    // loaded from .env above (or the host environment).
    url:
      process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
