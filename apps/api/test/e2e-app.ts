import { NestFactory } from '@nestjs/core';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import type { preHandlerHookHandler } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppModule } from '../src/app.module';
import { E2E_ADMIN_DATABASE_URL } from './e2e-setup';

/* ===========================================================================
 * E2E SUITE ISOLATION CONTRACT — read this before changing anything in this
 * file or in a suite's cleanup hooks.
 * ===========================================================================
 *
 * The e2e suites share ONE database (`dontpanic_e2e`) and run serially
 * (`--runInBand`). The single rule, applied to all of them without exception:
 *
 *   **Every suite hands the database back the way it found it.**
 *
 * Four consequences follow, and all four have to be respected:
 *
 * 1. **The database is wiped from the root in exactly one place:
 *    `test/global-setup.ts`**, once, before the first suite starts. That is
 *    also where global data would be seeded — DontPanic has none, so the
 *    boundary between two suites is an *empty* database.
 *
 * 2. **A suite that truncates does so knowing why it is allowed to.**
 *    `resetDb()` below issues a real TRUNCATE, which takes ACCESS EXCLUSIVE on
 *    every table it names and therefore contends with any live application
 *    connection writing at that moment. It is safe here *today* only because
 *    this API awaits every write inside its request — there is no fire-and-
 *    forget audit or mail-log write racing the reset. The day something starts
 *    writing out of band, this has to become a `deleteMany` scoped to what the
 *    suite seeded: out of that contention come deadlocks, requests answering
 *    500, and cleanups that land late and delete rows seeded *after* them,
 *    which is what makes failures vary from run to run.
 *
 * 3. **No suite leaves rows behind for the next one.** `assertCleanStart()`
 *    enforces this at every boot, so a leak is reported by name instead of
 *    turning into someone else's wrong count ten tests later.
 *
 * 4. **Because of (1)+(2)+(3), a suite can assert absolute totals** — the only
 *    live rows are its own.
 *
 * File order is fixed by `test/e2e-sequencer.js` (alphabetical). Jest's default
 * sequencer reorders by what failed and how long it took last run; with it, two
 * runs did not go through the files in the same order and the same defect
 * surfaced with different counts.
 *
 * Finally, not everything that looked like contamination was contamination:
 * `createE2EApp` puts the server on a listening socket once per suite instead
 * of letting supertest open and close one per request. The why is in the
 * comment further down, but the symptom is worth remembering: responses that
 * did not match the request sent (a 404 to a `POST /auth/register`, an empty
 * body on a `GET`), rare and indifferent to the data.
 */

/**
 * Boots the real AppModule on a Fastify adapter, wired the SAME way main.ts does
 * for the parts that matter to HTTP behaviour: `api` global prefix, the
 * ZodValidationPipe, the cookie plugin and the double-submit CSRF guard on
 * unsafe methods. We deliberately skip helmet/multipart/swagger/cors — none
 * affect the auth flows under test and they only slow boot.
 *
 * The CSRF guard IS registered (not skipped) so the tests exercise the real
 * path: fetch a token from GET /api/auth/csrf and echo it in `x-csrf-token`.
 *
 * `overrides` swaps providers before the module compiles. Env vars cannot do
 * this job: ConfigModule.forRoot() reads and validates the environment when
 * app.module.ts is first imported, which is long before any test body runs, so
 * a later `process.env.X = ...` is simply ignored.
 */
export async function createE2EApp(
  overrides?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<NestFastifyApplication> {
  await assertCleanStart();

  // Silent by default (a Nest boot per suite floods the terminal); `E2E_LOG=1`
  // gives the logs back when you need to understand a 500.
  const logger = process.env.E2E_LOG ? undefined : (false as const);

  let app: NestFastifyApplication;
  if (overrides) {
    const moduleRef = await overrides(Test.createTestingModule({ imports: [AppModule] })).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger });
  } else {
    app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
      logger,
    });
  }

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());

  await app.register(fastifyCookie, {
    secret: config.getOrThrow<string>('CSRF_SECRET'),
  });
  await app.register(fastifyCsrf, {
    cookieKey: 'csrf_token',
    cookieOpts: { signed: false, sameSite: 'lax', httpOnly: false, path: '/', secure: false },
    getToken: (req) => (req.headers['x-csrf-token'] as string | undefined) ?? '',
  });

  const fastify = app.getHttpAdapter().getInstance();
  const csrfProtection = (fastify as unknown as { csrfProtection: preHandlerHookHandler })
    .csrfProtection;
  fastify.addHook('preHandler', (req, reply, done) => {
    const m = req.method.toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return done();
    return csrfProtection.call(fastify, req, reply, done);
  });

  await app.init();
  // Fastify needs the plugin tree fully booted before the server can accept reqs.
  await app.getHttpAdapter().getInstance().ready();

  // Put the server on a listening socket ONCE, for the whole suite.
  //
  // Without this, supertest gets a server that is not listening and does a
  // `listen(0)` before every request and a `close()` after it — thousands of
  // cycles per run, on ephemeral ports the OS recycles. Every so often a
  // request caught a server on its way down, or a port that had just been
  // recycled, and the response that came back was not the response to the
  // request sent: a `POST /auth/register` answering 404, a `GET` with an empty
  // body, the CSRF token coming back undefined. Rare failures, unrelated to the
  // data, and therefore hard to tell apart from cross-suite contamination. With
  // the server already listening, supertest just uses the address and never
  // touches the lifecycle.
  await app.listen(0, '127.0.0.1');
  return app;
}

/**
 * Enforces the contract described at the top: when a suite starts, the database
 * is empty.
 *
 * This is a guard, not a cleanup — on purpose. If a suite forgets to delete
 * what it seeded, the next one fails **here**, naming what was left behind,
 * instead of failing ten tests later on a wrong count that points at nobody.
 * Cleaning up silently would hide the defect and it would come back.
 *
 * Scoped to `users`, the root every other row hangs off. `audit_logs` are
 * deliberately excluded: `AuditLog.userId` is `onDelete: SetNull`, so audit
 * rows outlive the users that produced them by design, and no test asserts on
 * them.
 */
async function assertCleanStart(): Promise<void> {
  // Through the owner connection: the app's restricted role sees nothing
  // outside a tenant scope, so it would report a dirty database as clean.
  const leftovers = await ownerDb().user.findMany({ select: { email: true }, take: 20 });

  if (leftovers.length === 0) return;
  throw new Error(
    'The database is not clean at the start of this suite — the previous one did not delete ' +
      `what it seeded. Users: ${JSON.stringify(leftovers.map((u) => u.email))}. ` +
      'See the isolation contract at the top of test/e2e-app.ts.',
  );
}

/**
 * Truncate every domain table so each test starts from a clean slate.
 *
 * Per-test reset, and legal here only for the reason set out in point (2) of
 * the contract above. It is not a substitute for the root-level wipe in
 * `test/global-setup.ts`: that one has to survive a run that was killed.
 */
export async function resetDb(): Promise<void> {
  // Owner connection, for two reasons: the restricted role does not own these
  // tables (so TRUNCATE is denied), and under RLS it cannot see rows outside a
  // tenant scope anyway. CASCADE handles the FK graph; RESTART IDENTITY is
  // harmless (uuid PKs).
  await ownerDb().$executeRawUnsafe(
    'TRUNCATE TABLE "legal_acceptances", "permissions", "profiles", "audit_logs", "two_factor_backup_codes", "email_verification_tokens", "password_reset_tokens", "refresh_tokens", "users", "tenants", "plans" RESTART IDENTITY CASCADE',
  );
}

/**
 * A Prisma client on the OWNER connection, for test bookkeeping that has to see
 * across tenants: seeding fixtures, counting leftovers, truncating.
 *
 * Lazily created and shared across the suite (module state, so one per test
 * file). Close it in `afterAll` with `closeOwnerDb()` — an open pool keeps the
 * Jest worker alive and the run hangs after the last assertion.
 */
let owner: PrismaClient | null = null;

export function ownerDb(): PrismaClient {
  owner ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: E2E_ADMIN_DATABASE_URL }),
  });
  return owner;
}

export async function closeOwnerDb(): Promise<void> {
  if (!owner) return;
  await owner.$disconnect();
  owner = null;
}
