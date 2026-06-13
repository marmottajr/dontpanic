# DontPanic 🛸

> The answer to building any system. A production-grade full-stack boilerplate —
> auth, 2FA, profile, file uploads, i18n, theming, observability and tests, batteries included.
>
> _Don't Panic._

A **Hello World** that's bigger on the inside: every new system grows from this seed.

## Stack

- **Backend** — NestJS + Fastify + TypeScript + Prisma 7 + PostgreSQL
- **Frontend** — Next.js (App Router) + React + Tailwind + shadcn/ui
- **Auth** — JWT (httpOnly cookies, refresh rotation + reuse detection), Argon2, TOTP 2FA, RBAC, CSRF
- **Infra** — Redis, S3/MinIO, SMTP/SES, all behind swappable **driver adapters**
- **Quality** — Jest, Supertest, Playwright, Storybook, ESLint, Changesets, GitHub Actions

## Quick start

```bash
cp .env.example .env
docker compose up -d                          # postgres · redis · minio · mailpit
pnpm install
pnpm --filter @dontpanic/shared build
pnpm --filter @dontpanic/api db:migrate
pnpm --filter @dontpanic/api db:seed
pnpm dev
```

| Service                  | URL                        |
| ------------------------ | -------------------------- |
| Web                      | http://localhost:4200      |
| API                      | http://localhost:4201      |
| API docs (Swagger)       | http://localhost:4201/docs |
| Mailpit (e-mails de dev) | http://localhost:4207      |
| MinIO console            | http://localhost:4205      |

Seeded admin login: **admin@dontpanic.dev** / **DontPanic42!**

## Test

```bash
pnpm test                                # all unit + component suites (turbo)
pnpm --filter @dontpanic/api test:e2e    # backend e2e (real test database)
```

276 tests — ~99% backend statements, 100% web statements. CI runs lint →
typecheck → migrate → test → audit → build on every push.

## Run everything in Docker (hot-reload via bind-mount)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

The default `docker compose up -d` runs only the infra (Postgres/Redis/MinIO/
Mailpit) with the apps on your host. The override above also runs the API + Web
in containers with the repo bind-mounted, so edits hot-reload inside Docker.

## Architecture

Ports & Adapters (hexagonal): the database, file storage, mail and cache are all swappable via a
single env var — `DB_PROVIDER`, `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`. See
[`CLAUDE.md`](./CLAUDE.md) for the full developer guide.

## License

MIT.
