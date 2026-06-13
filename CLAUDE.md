# DontPanic — guia do sistema

> _"Don't Panic."_ — a capa do Guia, e a filosofia deste boilerplate.
> Sistema-base full-stack do qual qualquer sistema novo nasce pronto: auth, 2FA, perfil,
> arquivos, i18n, temas, observabilidade e testes já vêm de fábrica.

Este arquivo é a fonte de instruções para humanos **e** para o Claude Code. Leia antes de mexer.

---

## TL;DR — subir o projeto

```bash
cp .env.example .env          # defaults de dev já funcionam
docker compose up -d          # postgres, redis, minio, mailpit
pnpm install
pnpm --filter @dontpanic/shared build      # contratos compartilhados
pnpm --filter @dontpanic/api db:migrate     # cria o schema
pnpm --filter @dontpanic/api db:seed        # usuário admin inicial
pnpm dev                       # API :3001  ·  Web :3000
```

Serviços de dev (portas no range **42xx**): Web `:4200` · API `:4201` ·
Swagger `:4201/docs` · Postgres `:4202` · Redis `:4203` · MinIO `:4204` /
console `:4205` · Mailpit SMTP `:4206` / UI `:4207` · Storybook `:4208`.

---

## Estrutura (monorepo Turborepo + pnpm)

```
apps/
  api/   NestJS + Fastify + Prisma   (backend)
  web/   Next.js (App Router)        (frontend)
packages/
  shared/  contratos Zod + tipos (fonte da verdade da API; importado por api e web)
  config/  ESLint / Prettier / TS compartilhados
```

`@dontpanic/shared` é a **fronteira de contrato**: todo schema de request/response vive lá em
Zod, então api e web nunca divergem. Mudou o contrato? Edite em `packages/shared` e rebuilde.

---

## Arquitetura — Ports & Adapters (Hexagonal)

O domínio depende de **interfaces (ports)**; o que é externo é um **adapter** plugável por env.
Trocar de provider = trocar uma variável, sem tocar na lógica.

| Recurso  | Port                | Adapters                         | Env             |
|----------|---------------------|----------------------------------|-----------------|
| Storage  | `StorageProvider`   | `s3` (AWS/MinIO/R2), `local`     | `STORAGE_DRIVER`|
| E-mail   | `MailProvider`      | `smtp`, `ses`, `console`         | `MAIL_DRIVER`   |
| Cache    | `CacheProvider`     | `redis`, `memory`                | `CACHE_DRIVER`  |
| Banco    | repos + Prisma adapter | `postgresql`, `mysql`, `sqlite` | `DB_PROVIDER`   |

- Adapters ficam em `apps/api/src/infra/**`; ports em `apps/api/src/core/**`.
- Banco usa **Prisma 7 driver adapters** (`@prisma/adapter-pg` p/ Postgres). Trocar o banco =
  trocar o adapter + o `provider` em `prisma/schema.prisma`.
- Em teste, use `memory` / `console` / `local` para rodar sem Docker.

---

## Autenticação (resumo)

- Senha com **Argon2**. Sessão com **JWT access (curto) + refresh (longo)** em **cookies httpOnly**.
- Refresh com **rotação** e **detecção de reuso** (token roubado → revoga a família inteira).
- **CSRF** double-submit nas mutações. **2FA TOTP** + códigos de backup. **Lockout** por tentativas.
- O front nunca fala direto com a API: usa um **BFF proxy** (route handlers) que repassa cookies.

---

## Comandos

| Ação | Comando |
|---|---|
| Dev (tudo) | `pnpm dev` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Testes (unit) | `pnpm test` |
| Testes e2e | `pnpm test:e2e` |
| Migration | `pnpm --filter @dontpanic/api db:migrate` |
| Seed | `pnpm --filter @dontpanic/api db:seed` |
| Prisma Studio | `pnpm --filter @dontpanic/api db:studio` |
| Auditoria deps | `pnpm audit` |

---

## Convenções

- **TypeScript estrito** em todo lugar. Validação de entrada **sempre** via schema Zod de `@dontpanic/shared`.
- **Nunca** retornar `passwordHash` / `twoFactorSecret` — o interceptor de serialização e o `UserDto` barram isso.
- Toda rota nova: schema Zod no `shared`, DTO/validação no controller, teste unit + e2e.
- Commits: **Conventional Commits** (commitlint valida). Versionamento via **Changesets**.
- Use os componentes de `apps/web/src/components/ui` (shadcn). Layout muda por **tokens CSS**, não por edição das telas.

## Política de dependências
- Sempre a **versão mais recente**; cai para a anterior só se houver **CVE conhecida**.
- `pnpm audit` roda no CI. `minimumReleaseAge` no `pnpm-workspace.yaml` evita adotar releases recém-publicados (supply-chain).
- Build scripts nativos são aprovados explicitamente em `allowBuilds` / `onlyBuiltDependencies`.

---

## Humor (com parcimônia)

O sistema tem uma **pitada de humor nerd** — tema _Guia do Mochileiro_, voz do **Marvin** (androide
deprimido) nas bordas: páginas 404/500, `GET /teapot` (HTTP 418), mensagens de loading, easter egg
do Konami no dashboard, `console.log` secreto. Regra de ouro: **humor nunca vaza dado sensível**
nem aparece em erro de segurança real. Mantenha sóbrio onde importa.

---

## O que NÃO fazer
- Não logar segredos, tokens ou senhas. Não colocar humor em mensagens que exponham internals.
- Não acessar a API direto do browser — sempre pelo BFF proxy.
- Não duplicar contrato: schema vive só em `@dontpanic/shared`.
- Não commitar `.env` (só `.env.example`).
