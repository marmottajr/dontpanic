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

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| API docs (Swagger) | http://localhost:3001/docs |
| Mailpit (e-mails de dev) | http://localhost:8025 |
| MinIO console | http://localhost:9001 |

## Architecture

Ports & Adapters (hexagonal): the database, file storage, mail and cache are all swappable via a
single env var — `DB_PROVIDER`, `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`. See
[`CLAUDE.md`](./CLAUDE.md) for the full developer guide.

## License

MIT.
