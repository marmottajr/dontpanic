<!-- Don't Panic. Fill this in and the review goes faster. -->

## What & why

<!-- What does this change and why? Link any related issue (Closes #123). -->

## How to test

<!-- Steps to verify locally. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass
- [ ] Added/updated unit and (if applicable) e2e tests
- [ ] Contracts changed only in `@dontpanic/shared` (no api/web drift)
- [ ] No secrets logged; no `passwordHash`/`twoFactorSecret` ever returned
- [ ] Conventional Commit title; added a changeset if a package version is affected
