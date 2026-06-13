import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moved the Migrate connection URL out of schema.prisma into here.
// Migrate/introspect commands run from apps/api, so load the monorepo root .env.
loadEnv({ path: '../../.env' });
loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
