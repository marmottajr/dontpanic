# Contributing to DontPanic

> _"I'd give you advice, but you wouldn't listen. No one ever does."_ — Marvin

Thanks for considering a contribution. Don't Panic — here's how to do it without
upsetting the CI (or the android).

## Getting set up

```bash
cp .env.example .env
docker compose up -d                          # postgres · redis · minio · mailpit
pnpm install
pnpm --filter @dontpanic/shared build
pnpm --filter @dontpanic/api db:migrate
pnpm --filter @dontpanic/api db:seed
pnpm dev                                       # Web :4200 · API :4201
```

## Ground rules

- **TypeScript strict** everywhere. Validate every input with a Zod schema from
  `@dontpanic/shared` — never let `api` and `web` drift apart.
- **Never** return `passwordHash` / `twoFactorSecret`, and never log secrets.
- New route → Zod schema in `shared`, DTO/validation in the controller, plus unit
  **and** e2e tests. Coverage thresholds are enforced in CI.
- Use the UI kit in `apps/web/src/components/ui` (shadcn). No browser
  `alert`/`confirm`/`prompt` — use `ConfirmDialog`/`Dialog` (ESLint enforces this).
- Talk to the API only through the BFF proxy, never from the browser directly.

## Before you push

Run the same checks CI does — green or it won't merge:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Commits & releases

- **Conventional Commits** (commitlint validates: `feat:`, `fix:`, `docs:`, …).
  Subjects start lowercase and body lines stay ≤ 100 chars.
- Changes that affect a published package need a **changeset**: `pnpm changeset`.

## Pull requests

Keep them focused, describe the _why_, and make sure the PR checklist is honest.
The maintainer (and Marvin) will review. Be patient; the universe is large and
mostly empty.
