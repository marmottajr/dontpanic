import { Client } from 'pg';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Jest `globalSetup`: runs ONCE before the whole e2e suite, in its own process.
 *
 * 1. Connects to the default `dontpanic` database and `CREATE DATABASE
 *    dontpanic_e2e` if it doesn't exist yet (psql/createdb aren't installed, so
 *    we do it over a `pg` connection).
 * 2. Runs `prisma migrate deploy` against the e2e database to build the schema.
 *
 * Because this is a separate process from the test workers, the DATABASE_URL we
 * set here does NOT leak into them — `e2e-setup.ts` (setupFiles) re-sets it per
 * worker. We hard-code the URLs here to stay self-contained.
 */
const ADMIN_URL = 'postgresql://dontpanic:dontpanic@localhost:4202/dontpanic';
const E2E_DB = 'dontpanic_e2e';
const E2E_URL = `postgresql://dontpanic:dontpanic@localhost:4202/${E2E_DB}?schema=public`;

export default async function globalSetup(): Promise<void> {
  // --- 1. ensure the test database exists -------------------------------
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [E2E_DB]);
    if (rowCount === 0) {
      // CREATE DATABASE can't run inside a transaction or be parameterized;
      // the name is a constant literal, so this is safe.
      await admin.query(`CREATE DATABASE ${E2E_DB}`);
    }
  } finally {
    await admin.end();
  }

  // --- 2. migrate the test database -------------------------------------
  // `prisma migrate deploy` is idempotent: it applies only pending migrations.
  // We pass DATABASE_URL explicitly; prisma.config.ts loads ../../.env via
  // dotenv (which does NOT override an already-set env var), so this wins.
  const apiDir = resolve(__dirname, '..');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E_URL },
    stdio: 'inherit',
  });
}
