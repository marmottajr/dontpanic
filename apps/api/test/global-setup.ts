import { Client } from 'pg';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Jest `globalSetup`: runs ONCE before the whole e2e suite, in its own process.
 * It leaves the database in a known state, and that is its whole reason to
 * exist — without it the failures look random, and they are not.
 *
 * **This is the only place in the project that wipes the database from the
 * root.** No suite truncates on its own behalf: each one clears only what it
 * seeded (see the isolation contract at the top of `test/e2e-app.ts`). Nothing
 * is running here, so the TRUNCATE contends with nobody for locks — which is
 * exactly what makes it safe here and dangerous anywhere else. `TRUNCATE` takes
 * ACCESS EXCLUSIVE on every table it names, so run against a live application
 * connection it fights with in-flight writes; that fight produces deadlocks,
 * requests answering 500, and — when Postgres kills the wrong side — a cleanup
 * that lands late and deletes rows seeded *after* it. That is where failures
 * that vary from run to run come from.
 *
 * The order matters:
 *  1. create the test database, if it does not exist yet;
 *  2. apply the migrations (schema);
 *  3. **wipe** whatever the previous run left behind;
 *  4. seed the global data the product needs in order to boot — see below.
 *
 * The DATABASE_URL set here does NOT reach the workers: `e2e-setup.ts`
 * (setupFiles) sets it again per worker. The URLs are hard-coded here to keep
 * this file self-contained.
 */
const ADMIN_URL = 'postgresql://dontpanic:dontpanic@localhost:4202/dontpanic';
const E2E_DB = 'dontpanic_e2e';
const E2E_URL = `postgresql://dontpanic:dontpanic@localhost:4202/${E2E_DB}?schema=public`;

export default async function globalSetup(): Promise<void> {
  // --- 1. ensure the test database exists -------------------------------
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      E2E_DB,
    ]);
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
  // BOTH URLs have to be overridden, not just DATABASE_URL: migrate does DDL,
  // so prisma.config.ts reads DATABASE_ADMIN_URL **first** and only falls back
  // to DATABASE_URL. The parent process is started by dotenvx, which injects
  // the root .env — so DATABASE_ADMIN_URL is already set, and already points at
  // the dev database. Override only DATABASE_URL and migrate deploy silently
  // migrates `dontpanic` instead of `dontpanic_e2e`, leaving the test database
  // on an older schema; every request then fails with a Prisma error about a
  // column that is not there. Set both.
  const apiDir = resolve(__dirname, '..');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: E2E_URL, DATABASE_ADMIN_URL: E2E_URL },
    stdio: 'inherit',
  });

  const db = new Client({ connectionString: E2E_URL });
  await db.connect();
  try {
    // --- 3. wipe what the previous run left behind ----------------------
    // `users.email` is unique **globally**: one surviving e-mail makes the next
    // run's register return 409 and the login after it 401. This root-level
    // wipe lives here — and only here — because it cannot depend on the
    // previous run having finished cleanly (`--forceExit` kills the Jest
    // process without giving the suites a chance to tidy up).
    // Dangling connections from that previous run hold locks and would deadlock
    // the TRUNCATE. Close them first: at this point in the boot no suite is
    // running, so nothing alive is interrupted.
    await db.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [E2E_DB],
    );

    const { rows } = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
      await db.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }

    // --- 4. seed the global data — deliberately empty -------------------
    // This is where rows that belong to no suite would go: data the product
    // needs before the first request, that no test owns and therefore no test
    // creates. DontPanic has none — every row an e2e test needs is created by
    // the test that needs it, and the boundary between two suites is an empty
    // database. Add seeding here (not in a suite) the day that stops holding.
  } finally {
    await db.end();
  }
}
