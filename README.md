```text
██████╗  ██████╗ ███╗   ██╗██╗████████╗     ██████╗  █████╗ ███╗   ██╗██╗ ██████╗██╗
██╔══██╗██╔═══██╗████╗  ██║╚█║╚══██╔══╝     ██╔══██╗██╔══██╗████╗  ██║██║██╔════╝██║
██║  ██║██║   ██║██╔██╗ ██║ ╚╝   ██║        ██████╔╝███████║██╔██╗ ██║██║██║     ██║
██║  ██║██║   ██║██║╚██╗██║      ██║        ██╔═══╝ ██╔══██║██║╚██╗██║██║██║     ╚═╝
██████╔╝╚██████╔╝██║ ╚████║      ██║        ██║     ██║  ██║██║ ╚████║██║╚██████╗██╗
╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═╝        ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚═╝
```

<div align="center">

**Boilerplate full-stack multi-tenant — RLS no Postgres, auth, 2FA, planos, RBAC, i18n e testes.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D24.9-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Built with](https://img.shields.io/badge/Built%20with-NestJS%2012%20%C2%B7%20Next%2016-E0234E?logo=nestjs&logoColor=white)](#a-stack)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Don't Panic](https://img.shields.io/badge/Don't%20Panic-42-brightgreen.svg)](#licença)

**[Português](#português) · [English](#english)**

</div>

```bash
npx create-dontpanic@latest meu-app
```

Uma linha e uma cópia nova se desdobra no disco — renomeada, com segredos próprios
recém-gerados. O gerador vive em [`packages/create-dontpanic`](./packages/create-dontpanic);
tudo abaixo é para quando você já está _dentro_ de um projeto.

---

## Português

[O que é isto](#o-que-é-isto) ·
[A stack](#a-stack) ·
[O que já vem pronto](#o-que-já-vem-pronto) ·
[Como subir](#como-subir) ·
[Multi-tenancy](#multi-tenancy-com-rls-do-postgres) ·
[Autenticação](#autenticação-e-controle-de-acesso) ·
[Ports e adapters](#ports-e-adapters) ·
[Arquitetura](#arquitetura-e-portas) ·
[Testes](#testes) ·
[Docker](#docker-no-dev-e-na-produção) ·
[Licença](#licença)

### O que é isto

**DontPanic** é um sistema-base full-stack de produção: uma API NestJS + Fastify e um front
Next.js compartilhando um único contrato Zod, num monorepo Turborepo/pnpm.

Ele é **multi-tenant desde a primeira migration**. Não é um boilerplate de login onde você
depois "adiciona empresas": o isolamento entre clientes é imposto pelo **Row Level Security do
Postgres**, cadastro público de empresa, perfis de acesso, planos com limite e um back-office de
operador já vêm de fábrica — junto com auth, 2FA, perfis, upload de arquivos, i18n, temas,
observabilidade e testes.

### A stack

- **Backend** — NestJS 12 + Fastify + TypeScript estrito + Prisma 7 (schema em pasta dividida) + PostgreSQL
- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + next-intl
- **Runtime** — Node >= 24.9 (é o que permite ESM nativo no Jest, sem transformer para CJS)
- **Qualidade** — Jest + Supertest (api), Vitest + Testing Library (web), Playwright, Storybook, ESLint, Changesets, GitHub Actions
- **Observabilidade** — Sentry + Pino + correlation id em toda requisição; Swagger em `/docs`; health check em `/api/health`
- **Monorepo** — Turborepo + pnpm: `packages/shared` (contratos Zod), `packages/config`, `packages/create-dontpanic`, `apps/api`, `apps/web`
- **Governança** — MIT, [CONTRIBUTING](./CONTRIBUTING.md) / [SECURITY](./SECURITY.md) / [Código de Conduta](./CODE_OF_CONDUCT.md), Dependabot, CodeQL, Trivy

### O que já vem pronto

- **Empresas** — cadastro self-service em `POST /auth/signup`: cria o tenant, os perfis de sistema e o primeiro admin numa única transação, com o aceite dos termos gravado como evidência (documento, versão, data/hora, IP e user agent). **Desligável** com `PUBLIC_SIGNUP_ENABLED`, para deploy interno ou produto vendido por time comercial.
- **Convites** — a única porta para uma empresa que já existe. O ADMIN convida, o convidado escolhe a própria senha, e o clique no link mailado é o que prova o endereço — ninguém digita a senha de outra pessoa.
- **Login social** — Google, Apple e GitHub, opcionais e desligados por padrão, um por um. `passwordHash` é nullable: conta social não tem senha.
- **Contas** — verificação de e-mail por código, reset de senha, troca de e-mail por código, exportação dos próprios dados e exclusão da conta.
- **Sessões** — gerenciamento de sessões ativas: veja seus dispositivos e revogue qualquer um.
- **Controle de acesso** — perfis por empresa com matriz de permissões, painel `/admin` para o ADMIN da empresa e audit log imutável de quem fez o quê.
- **Planos** — plano padrão com trial, `maxUsers` e contadores nomeados, impostos de verdade na hora de criar.
- **Back-office do operador** — painel em `/platform` sobre `/api/platform/*`: estatísticas da base, **criar empresa** (que convida o primeiro admin em vez de definir senha para ele), suspender/reativar empresa, estender trial, trocar plano e CRUD de planos.
- **Perfis e arquivos** — perfis editáveis e uploads atrás de um driver de storage trocável.
- **i18n** — pt-BR + en-US com seletor de bandeira SVG; chaves mantidas em paridade por testes.
- **Temas** — claro/escuro guiados inteiramente por tokens CSS, não por edição de telas.
- **O BFF** — o browser nunca toca a API direto; um proxy repassa os cookies por ele.
- **Locale BR opcional** — validadores de CPF/CNPJ em `@dontpanic/shared/locale/br`, importados por subpath para o boilerplate continuar neutro de país.

### Como subir

```bash
cp .env.example .env          # defaults de dev já funcionam
docker compose up -d          # postgres, redis, minio, mailpit
pnpm install
pnpm --filter @dontpanic/shared build      # contratos compartilhados
pnpm --filter @dontpanic/api db:migrate     # cria o schema
pnpm --filter @dontpanic/api db:seed        # cria o admin inicial
pnpm dev                       # API :4201 · Web :4200  (Don't Panic.)
```

A ordem importa: a **role restrita do banco é criada por uma migration**
(`*_app_role`), que roda pela conexão de dono (`DATABASE_ADMIN_URL`). Num banco novo,
`db:migrate` tem que vir antes de `db:seed` — sem a role, a `DATABASE_URL` do `.env.example`
não existe ainda.

Usuários do seed, ambos com a senha **`DontPanic42!`**:

| E-mail                     | Quem é                              |
| -------------------------- | ----------------------------------- |
| `admin@dontpanic.dev`      | ADMIN da empresa de exemplo         |
| `superadmin@dontpanic.dev` | operador da plataforma, sem empresa |

> [!WARNING]
> São credenciais de desenvolvimento, publicadas neste README. **Troque as duas antes de
> qualquer ambiente exposto**, junto com os segredos de JWT e CSRF do `.env`.

Comandos do dia a dia:

| Ação           | Comando                                   |
| -------------- | ----------------------------------------- |
| Dev (tudo)     | `pnpm dev`                                |
| Build          | `pnpm build`                              |
| Lint           | `pnpm lint`                               |
| Typecheck      | `pnpm typecheck`                          |
| Testes (unit)  | `pnpm test`                               |
| Testes e2e     | `pnpm test:e2e`                           |
| Formatar       | `pnpm format`                             |
| Migration      | `pnpm --filter @dontpanic/api db:migrate` |
| Seed           | `pnpm --filter @dontpanic/api db:seed`    |
| Prisma Studio  | `pnpm --filter @dontpanic/api db:studio`  |
| Storybook      | `pnpm --filter @dontpanic/web storybook`  |
| Auditoria deps | `pnpm audit`                              |

### Multi-tenancy com RLS do Postgres

O filtro por `tenantId` na aplicação é conveniência. A garantia dura é o **Row Level Security**:
cada request declara seu escopo ao Postgres com `SET LOCAL`, dentro da própria transação.

| Escopo     | Quem                               | O que vê                          |
| ---------- | ---------------------------------- | --------------------------------- |
| `tenant`   | usuário autenticado de uma empresa | só as linhas do `tenantId` do JWT |
| `platform` | `SUPERADMIN`, no back-office       | atravessa empresas                |
| `system`   | caminho de autenticação e signup   | ignora o isolamento               |

**Sem escopo nenhum, nada é visível.** Esquecer o escopo devolve resultado vazio — nunca dados da
empresa errada. Falha fechada por construção.

Quatro consequências práticas:

- **O `tenantId` nunca vem do cliente.** Vem do claim `tid` do JWT assinado. Header, query e body
  são entrada de atacante; um claim assinado não é.
- **Duas conexões, e a diferença é o ponto todo.** `DATABASE_URL` aponta para a role restrita
  (`dontpanic_app`, sem `BYPASSRLS`) e é a única usada em runtime; `DATABASE_ADMIN_URL` é o dono do
  banco e serve só a `migrate`/`seed`. Um SUPERUSER ignora RLS mesmo com `FORCE ROW LEVEL SECURITY`,
  então a API **recusa subir em produção** se detectar um.
- **Tabela nova com `tenantId` se protege sozinha** — basta terminar a migration com
  `SELECT app.apply_tenant_rls();`.
- **`@SystemScope()` é exceção, não ferramenta.** Existe porque autenticar alguém exige achá-lo pelo
  e-mail antes de saber a empresa. Hoje vive só nas rotas de `auth`, e um teste falha se a lista
  crescer sem alguém pensar.

**Permissões.** `@RequirePermission(module, action?)` deduz a ação do verbo HTTP quando ela é
omitida, então dá para marcar um controller inteiro numa linha sem que um GET passe a exigir
escrita. O **ADMIN da empresa passa sempre** (é quem atribui perfil aos outros); o **SUPERADMIN
nunca entra** em rota de negócio, porque o pedido dele corre em escopo de plataforma; sem perfil,
nada. A lista de módulos (`permissionModules` em `@dontpanic/shared`) é a constante que você edita
por produto — vem com `settings`, `users` e `audit`.

**Planos.** `PlanLimitsService` impõe `maxUsers` e os contadores nomeados do plano. A corrida de
"dois pedidos criam o último assento" se resolve com `pg_advisory_xact_lock` por empresa **e por
recurso**, dentro da transação: contar antes de gravar não basta, porque contar não tranca nada.

**Back-office.** `/platform` (web) sobre `/api/platform/*` é do operador da plataforma — distinto de
`/admin`, que é a tela de usuários da própria empresa. Responde **404, não 403**, para
qualquer outro — a existência do painel não é informação que se dê a quem não o opera.

A seção completa, com as armadilhas de guard e transação, está no [CLAUDE.md](./CLAUDE.md).

### Autenticação e controle de acesso

- Senha com **Argon2**. Sessão com **JWT access (curto) + refresh (longo)** em **cookies httpOnly**.
- Refresh com **rotação** e **detecção de reuso** — token roubado revoga a família inteira.
- **CSRF** double-submit em toda mutação. **2FA TOTP** + códigos de backup. **Lockout** de conta.
- O frontend nunca fala com a API direto — vai por um **BFF proxy** que repassa os cookies.

> [!WARNING]
> A camada de serialização nunca retorna `passwordHash` nem `twoFactorSecret`. O interceptor e o
> `UserDto` garantem isso por construção.

**Quem entra, e por onde.** Três portas, e duas delas são decisão de deploy:

| Porta          | Liga/desliga com                         | Cria empresa?            |
| -------------- | ---------------------------------------- | ------------------------ |
| Signup público | `PUBLIC_SIGNUP_ENABLED` (default `true`) | sim                      |
| Convite        | sempre disponível                        | não                      |
| Login social   | `OAUTH_PROVIDERS` (vazio = desligado)    | só via convite ou signup |

**Convites** são a única entrada para uma empresa que já existe. O convidado escolhe a própria
senha; o inviter nunca a conhece, e o clique no link é o que prova o endereço — antes, o ADMIN
digitava a senha do colega e a conta nascia verificada na palavra dele. O token cru vive só no
e-mail (o banco guarda o SHA-256), o e-mail sai **depois** do commit, e o limite de plano é cobrado
no **aceite**, que é onde o assento é consumido.

**Login social** com Google, Apple e GitHub, opcional por provider. A chave da identidade é o
`providerAccountId` imutável, nunca o e-mail; endereço não verificado pelo provedor não vincula
nada; e login com senha numa conta social devolve o mesmo erro genérico, pagando o mesmo custo de
Argon2, para não virar oráculo de enumeração. Uma identidade desconhecida não vira empresa sozinha:
passa por uma tela que pede nome e slug, porque provedor nenhum tem como saber isso.

> [!WARNING]
> As duas metades precisam concordar. `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` em
> desacordo renderizam um formulário cujo submit sempre dá 403; `OAUTH_PROVIDERS` /
> `NEXT_PUBLIC_OAUTH_PROVIDERS` em desacordo rendem um botão que sempre dá 404. E
> `OAUTH_CALLBACK_BASE_URL` precisa bater **caractere a caractere** com o redirect URI registrado em
> cada provider. A API recusa subir se um provider listado estiver sem credencial.

**Captcha.** Port `CaptchaProvider` com guard global; as rotas marcadas com `@RequireCaptcha()` são
signup, resend-verification, login, forgot-password e reset-password.

| `CAPTCHA_DRIVER` | Widget             | Verificação                                    |
| ---------------- | ------------------ | ---------------------------------------------- |
| `none`           | nenhum             | desligado (default de um clone novo)           |
| `turnstile`      | Cloudflare         | passa / não passa                              |
| `recaptcha-v2`   | checkbox do Google | passa / não passa                              |
| `recaptcha-v3`   | invisível          | score ≥ `CAPTCHA_MIN_SCORE` **e** action igual |

Vem em `none` para um clone novo subir sem chave de terceiro — **é uma decisão de deploy, não um
default aceitável em produção**. `CAPTCHA_DRIVER` e `NEXT_PUBLIC_CAPTCHA_DRIVER` precisam combinar,
e a falha é fechada: provedor fora do ar devolve 503, não "passa todo mundo".

**Rate limit.** Duas camadas complementares, com contadores no Redis para o limite valer entre
instâncias: um orçamento largo (`RATE_LIMIT_MAX`) por rota e por IP, e um apertado
(`AUTH_RATE_LIMIT_MAX`) para a superfície de auth não autenticada, marcada com
`@SensitiveThrottle()`. Em cima disso, lockout por conta (`LOGIN_MAX_ATTEMPTS`).

> [!CAUTION]
> Tudo isso depende de acertar o IP do cliente, e **não existe default correto** — depende de onde o
> sistema roda. `TRUST_PROXY=true` mata o rate limit: qualquer um forja `X-Forwarded-For` e ganha um
> balde novo por request. A tabela por hospedagem (nginx, ALB, Cloudflare, Vercel, Fly) está no
> [CLAUDE.md](./CLAUDE.md) e no [`.env.example`](./.env.example).

### Ports e adapters

O domínio depende de **ports** (interfaces); o que é externo é um **adapter** plugável escolhido por
env. Trocar de provider = trocar uma variável, sem tocar na lógica. Ports vivem em
`apps/api/src/core/**`, adapters em `apps/api/src/infra/**`.

| Recurso | Port              | Adapters                               | Env              |
| ------- | ----------------- | -------------------------------------- | ---------------- |
| Storage | `StorageProvider` | `s3` (AWS/MinIO/R2), `local`           | `STORAGE_DRIVER` |
| E-mail  | `MailProvider`    | `smtp`, `ses`, `console`               | `MAIL_DRIVER`    |
| Cache   | `CacheProvider`   | `redis`, `memory`                      | `CACHE_DRIVER`   |
| Captcha | `CaptchaProvider` | `turnstile`, `recaptcha-v2/v3`, `none` | `CAPTCHA_DRIVER` |

Em teste, `memory` / `console` / `local` rodam sem Docker.

### Arquitetura e portas

```
apps/
  api/   NestJS + Fastify + Prisma   (backend)
  web/   Next.js App Router          (frontend + BFF proxy)
packages/
  shared/            contratos Zod + tipos, importados por api e web
  config/            ESLint / Prettier / TS compartilhados
  create-dontpanic/  o gerador `npx create-dontpanic`
```

`@dontpanic/shared` é a **fronteira de contrato**: todo schema de request/response vive lá em Zod,
então api e web nunca divergem. Mudou o contrato? Edite em `packages/shared` e rebuilde.

| Serviço                   | Onde roda                  | Porta           |
| ------------------------- | -------------------------- | --------------- |
| Web                       | http://localhost:4200      | `4200`          |
| API                       | http://localhost:4201      | `4201`          |
| Docs da API (Swagger)     | http://localhost:4201/docs | `4201`          |
| Postgres                  | localhost                  | `4202`          |
| Redis                     | localhost                  | `4203`          |
| MinIO / console           | http://localhost:4205      | `4204` / `4205` |
| Mailpit SMTP / UI         | http://localhost:4207      | `4206` / `4207` |
| Storybook _(sob demanda)_ | http://localhost:4208      | `4208`          |

Web e API sobem com `pnpm dev`; Postgres/Redis/MinIO/Mailpit com `docker compose up -d`. O
**Storybook não sobe por nenhum dos dois** — rode `pnpm --filter @dontpanic/web storybook`.

Toda porta começa com 42. Foi de propósito.

### Testes

```bash
pnpm test                                # todas as suítes unit + componentes
pnpm --filter @dontpanic/api test:e2e    # e2e do backend (banco de teste real)
```

- **Backend** — unit com Jest mocando Prisma/cache/mail/storage (~99% stmts, 95% branches); e2e
  sobe o Nest contra um Postgres `dontpanic_e2e`, cobrindo signup → verify → login → refresh →
  logout, 2FA, lockout, CSRF e **isolamento entre empresas**.
- A suíte e2e roda sob a **role restrita**, igual à produção — é isso que faz o teste de isolamento
  provar alguma coisa em vez de decorar o relatório.
- **Frontend** — Vitest + Testing Library: kit de UI, cliente BFF com CSRF/refresh, paridade de
  chaves i18n, tela de login. 100% dos statements.
- Thresholds de cobertura são aplicados no CI.

### Docker no dev e na produção

1. **Infra no Docker, apps no host (padrão, mais rápido):** `docker compose up -d` sobe
   Postgres/Redis/MinIO/Mailpit; os apps rodam no host com `pnpm dev`.
2. **Tudo no Docker, hot-reload por bind-mount:**

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

   API e Web em containers com o repo montado (`Dockerfile.dev`, sem copiar código): edita na
   máquina, muda no container.

3. **Produção:** `Dockerfile.api` / `Dockerfile.web`, multi-stage e com `COPY` — imagens imutáveis.

### Licença

MIT — veja o [LICENSE](./LICENSE). O guia completo do dev está no [CLAUDE.md](./CLAUDE.md); o
repositório vive em
**[github.com/marmottajr/dontpanic](https://github.com/marmottajr/dontpanic)**.

Tem um Konami code escondido no dashboard, uma mensagem no console do navegador e um
`GET /api/teapot` que devolve 418. Regra de ouro: humor nunca vaza dado sensível e nunca aparece
num erro de segurança real.

> _"Não entre em pânico."_ — a capa do Guia

---

## English

[What this is](#what-this-is) ·
[The stack](#the-stack) ·
[What comes built in](#what-comes-built-in) ·
[Quick start](#quick-start) ·
[Multi-tenancy](#multi-tenancy-with-postgres-rls) ·
[Authentication](#authentication-and-access-control) ·
[Ports and adapters](#ports-and-adapters) ·
[Architecture](#architecture-and-ports) ·
[Testing](#testing) ·
[Docker](#docker-in-dev-and-production) ·
[License](#license)

### What this is

**DontPanic** is a production-grade full-stack base system: a NestJS + Fastify API and a Next.js
front end sharing a single Zod contract, in a Turborepo/pnpm monorepo.

It is **multi-tenant from the first migration**. This is not a login boilerplate you later "add
companies" to: isolation between customers is enforced by **PostgreSQL Row Level Security**, and
self-serve company signup, access profiles, plans with real limits and an operator back-office ship
with it — alongside auth, 2FA, profiles, file uploads, i18n, theming, observability and tests.

### The stack

- **Backend** — NestJS 12 + Fastify + strict TypeScript + Prisma 7 (split schema folder) + PostgreSQL
- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + next-intl
- **Runtime** — Node >= 24.9, which is what lets Jest load native ESM with no CJS transformer
- **Quality** — Jest + Supertest (api), Vitest + Testing Library (web), Playwright, Storybook, ESLint, Changesets, GitHub Actions
- **Observability** — Sentry + Pino + a correlation id on every request; Swagger at `/docs`; health check at `/api/health`
- **Monorepo** — Turborepo + pnpm: `packages/shared` (Zod contracts), `packages/config`, `packages/create-dontpanic`, `apps/api`, `apps/web`
- **Governance** — MIT, [CONTRIBUTING](./CONTRIBUTING.md) / [SECURITY](./SECURITY.md) / [Code of Conduct](./CODE_OF_CONDUCT.md), Dependabot, CodeQL, Trivy

### What comes built in

- **Companies** — self-serve signup at `POST /auth/signup`: it creates the tenant, its system profiles and the first admin in a single transaction, recording the legal acceptance as evidence (document, version, timestamp, IP and user agent). It can be **turned off** with `PUBLIC_SIGNUP_ENABLED`, for an internal deployment or a sales-led product.
- **Invitations** — the only door into a company that already exists. The admin invites, the invitee chooses their own password, and clicking the mailed link is what proves the address — nobody types somebody else's password.
- **Social sign-in** — Google, Apple and GitHub, optional and off by default, one by one. `passwordHash` is nullable: a social account has no password.
- **Accounts** — email verification by code, password reset, email change by code, self-service data export and account deletion.
- **Sessions** — active-session management: see your devices and revoke any of them.
- **Access control** — per-company profiles with a permission matrix, an `/admin` panel for the company ADMIN, and an immutable audit log of who did what.
- **Plans** — a default plan with a trial, `maxUsers` and named counters, actually enforced at creation time.
- **Operator back-office** — a `/platform` panel over `/api/platform/*`: customer-base stats, **creating a company** (which invites its first admin rather than setting a password for them), suspending and reactivating a company, extending a trial, changing its plan, and plan CRUD.
- **Profiles & files** — editable profiles and uploads behind a swappable storage driver.
- **i18n** — pt-BR + en-US with an SVG flag switcher; keys kept in parity by tests.
- **Theming** — dark/light driven entirely by CSS tokens, not screen edits.
- **The BFF** — the browser never touches the API directly; a proxy relays cookies for it.
- **Optional BR locale** — CPF/CNPJ validators in `@dontpanic/shared/locale/br`, imported by subpath so the boilerplate stays country-neutral.

### Quick start

```bash
cp .env.example .env          # dev defaults just work
docker compose up -d          # postgres, redis, minio, mailpit
pnpm install
pnpm --filter @dontpanic/shared build      # shared contracts
pnpm --filter @dontpanic/api db:migrate     # creates the schema
pnpm --filter @dontpanic/api db:seed        # creates the initial admin
pnpm dev                       # API :4201 · Web :4200  (Don't Panic.)
```

The order matters: the **restricted database role is created by a migration** (`*_app_role`) that
runs over the owner connection (`DATABASE_ADMIN_URL`). On a fresh database `db:migrate` must come
before `db:seed` — until it has run, the `DATABASE_URL` role in `.env.example` does not exist yet.

Seeded users, both with the password **`DontPanic42!`**:

| Email                      | Who it is                          |
| -------------------------- | ---------------------------------- |
| `admin@dontpanic.dev`      | ADMIN of the sample company        |
| `superadmin@dontpanic.dev` | platform operator, owns no company |

> [!WARNING]
> These are development credentials, published in this README. **Change both before any exposed
> environment**, along with the JWT and CSRF secrets in `.env`.

Everyday commands:

| Action           | Command                                   |
| ---------------- | ----------------------------------------- |
| Dev (everything) | `pnpm dev`                                |
| Build            | `pnpm build`                              |
| Lint             | `pnpm lint`                               |
| Typecheck        | `pnpm typecheck`                          |
| Unit tests       | `pnpm test`                               |
| e2e tests        | `pnpm test:e2e`                           |
| Format           | `pnpm format`                             |
| Migration        | `pnpm --filter @dontpanic/api db:migrate` |
| Seed             | `pnpm --filter @dontpanic/api db:seed`    |
| Prisma Studio    | `pnpm --filter @dontpanic/api db:studio`  |
| Storybook        | `pnpm --filter @dontpanic/web storybook`  |
| Dependency audit | `pnpm audit`                              |

### Multi-tenancy with Postgres RLS

Filtering by `tenantId` in application code is a convenience. The hard guarantee is **Row Level
Security**: every request declares its scope to Postgres with `SET LOCAL`, inside the request's own
transaction.

| Scope      | Who                                | What it sees                      |
| ---------- | ---------------------------------- | --------------------------------- |
| `tenant`   | an authenticated company user      | only rows of the JWT's `tenantId` |
| `platform` | `SUPERADMIN`, in the back-office   | across companies                  |
| `system`   | the authentication and signup path | bypasses isolation                |

**With no scope at all, nothing is visible.** Forgetting the scope yields an empty result — never
another company's data. Fail-closed by construction.

Four practical consequences:

- **`tenantId` never comes from the client.** It comes from the signed JWT's `tid` claim. Headers,
  query strings and bodies are attacker input; a signed claim is not.
- **Two connections, and the difference is the whole point.** `DATABASE_URL` points at the
  restricted role (`dontpanic_app`, no `BYPASSRLS`) and is the only one used at runtime;
  `DATABASE_ADMIN_URL` is the database owner and serves `migrate`/`seed` only. A SUPERUSER ignores
  RLS even with `FORCE ROW LEVEL SECURITY`, so the API **refuses to boot in production** if it
  detects one.
- **A new table with a `tenantId` protects itself** — end the migration with
  `SELECT app.apply_tenant_rls();`.
- **`@SystemScope()` is an exception, not a tool.** It exists because authenticating someone means
  finding them by email before their company is known. Today it lives only on the `auth` routes, and
  a test fails if that list grows without someone thinking about it.

**Permissions.** `@RequirePermission(module, action?)` infers the action from the HTTP verb when it
is omitted, so a whole controller can be marked in one line without a GET suddenly demanding write
access. The **company ADMIN always passes** (it is who assigns everyone else's profile); the
**SUPERADMIN never enters** a business route, because its request runs in platform scope; with no
profile, nothing. The module list (`permissionModules` in `@dontpanic/shared`) is the constant you
edit per product — it ships with `settings`, `users` and `audit`.

**Plans.** `PlanLimitsService` enforces `maxUsers` and the plan's named counters. The "two requests
both take the last seat" race is settled with a `pg_advisory_xact_lock` per company **and per
resource**, inside the transaction: counting before writing is not enough, because counting locks
nothing.

**Back-office.** `/platform` (web) over `/api/platform/*` belongs to the platform operator — distinct
from `/admin`, the company's own user-management screen. It answers **404, not 403**, to
anyone else — the existence of that panel is not information to hand to someone who does not run it.

The full section, with the guard and transaction pitfalls, is in [CLAUDE.md](./CLAUDE.md).

### Authentication and access control

- Passwords with **Argon2**. Sessions with **JWT access (short) + refresh (long)** in **httpOnly cookies**.
- Refresh with **rotation** and **reuse detection** — a stolen token revokes the entire family.
- **CSRF** double-submit on every mutation. **TOTP 2FA** + backup codes. **Account lockout**.
- The frontend never speaks to the API directly — it goes through a **BFF proxy** that relays cookies.

> [!WARNING]
> The serialisation layer never returns a `passwordHash` or a `twoFactorSecret`. The interceptor and
> `UserDto` enforce that by construction.

**Who gets in, and through which door.** Three doors, two of them a deployment decision:

| Door           | Toggled by                               | Creates a company?            |
| -------------- | ---------------------------------------- | ----------------------------- |
| Public signup  | `PUBLIC_SIGNUP_ENABLED` (default `true`) | yes                           |
| Invitation     | always available                         | no                            |
| Social sign-in | `OAUTH_PROVIDERS` (empty = off)          | only via invitation or signup |

**Invitations** are the only way into a company that already exists. The invitee picks their own
password, the inviter never learns it, and clicking the link is what proves the address — the old
flow had the admin typing a colleague's password and the account being born verified on the admin's
word. The raw token lives only in the email (the database holds its SHA-256), the mail goes out
**after** the commit, and the plan limit is charged at **acceptance**, which is where the seat is
consumed.

**Social sign-in** with Google, Apple and GitHub, optional per provider. The identity key is the
immutable `providerAccountId`, never the email; an address the provider has not verified links
nothing; and a password login against a social account returns the same generic error, paying the
same Argon2 cost, so it never becomes an enumeration oracle. An unknown identity does not turn into
a company on its own: it goes through a screen asking for a name and a slug, because no provider has
any way of knowing those.

> [!WARNING]
> Both halves must agree. `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` out of sync render
> a form whose every submit answers 403; `OAUTH_PROVIDERS` / `NEXT_PUBLIC_OAUTH_PROVIDERS` out of
> sync render a button that always 404s. And `OAUTH_CALLBACK_BASE_URL` must match the redirect URI
> registered with each provider **character for character**. The API refuses to boot if a listed
> provider is missing its credentials.

**Captcha.** A `CaptchaProvider` port with a global guard; the routes tagged `@RequireCaptcha()` are
signup, resend-verification, login, forgot-password and reset-password.

| `CAPTCHA_DRIVER` | Widget          | Verification                                         |
| ---------------- | --------------- | ---------------------------------------------------- |
| `none`           | none            | disabled (a fresh clone's default)                   |
| `turnstile`      | Cloudflare      | pass / fail                                          |
| `recaptcha-v2`   | Google checkbox | pass / fail                                          |
| `recaptcha-v3`   | invisible       | score >= `CAPTCHA_MIN_SCORE` **and** matching action |

It ships as `none` so a fresh clone boots without third-party keys — **that is a deployment
decision, not an acceptable production default**. `CAPTCHA_DRIVER` and `NEXT_PUBLIC_CAPTCHA_DRIVER`
must agree, and failure is closed: a provider outage returns 503, not "everyone gets in".

**Rate limiting.** Two complementary layers, with counters in Redis so the limit holds across
instances: a roomy budget (`RATE_LIMIT_MAX`) per route and per IP, and a tight one
(`AUTH_RATE_LIMIT_MAX`) for the unauthenticated auth surface, tagged `@SensitiveThrottle()`. On top
of that, per-account lockout (`LOGIN_MAX_ATTEMPTS`).

> [!CAUTION]
> All of it depends on getting the client IP right, and **there is no correct default** — it depends
> on where the system runs. `TRUST_PROXY=true` kills the rate limit: anyone can forge
> `X-Forwarded-For` and earn a fresh bucket per request. The per-hosting table (nginx, ALB,
> Cloudflare, Vercel, Fly) is in [CLAUDE.md](./CLAUDE.md) and [`.env.example`](./.env.example).

### Ports and adapters

The domain depends on **ports** (interfaces); anything external is a pluggable **adapter** chosen by
an env var. Swap a provider by swapping one variable — no logic touched. Ports live in
`apps/api/src/core/**`, adapters in `apps/api/src/infra/**`.

| Resource | Port              | Adapters                               | Env var          |
| -------- | ----------------- | -------------------------------------- | ---------------- |
| Storage  | `StorageProvider` | `s3` (AWS/MinIO/R2), `local`           | `STORAGE_DRIVER` |
| Mail     | `MailProvider`    | `smtp`, `ses`, `console`               | `MAIL_DRIVER`    |
| Cache    | `CacheProvider`   | `redis`, `memory`                      | `CACHE_DRIVER`   |
| Captcha  | `CaptchaProvider` | `turnstile`, `recaptcha-v2/v3`, `none` | `CAPTCHA_DRIVER` |

In tests, `memory` / `console` / `local` run without Docker.

### Architecture and ports

```
apps/
  api/   NestJS + Fastify + Prisma   (backend)
  web/   Next.js App Router          (frontend + BFF proxy)
packages/
  shared/            Zod contracts + types, imported by api and web
  config/            shared ESLint / Prettier / TS
  create-dontpanic/  the `npx create-dontpanic` generator
```

`@dontpanic/shared` is the **contract boundary**: every request/response schema lives there in Zod,
so api and web can never silently drift. Changed the contract? Edit `packages/shared` and rebuild.

| Service                 | Where it runs              | Port            |
| ----------------------- | -------------------------- | --------------- |
| Web                     | http://localhost:4200      | `4200`          |
| API                     | http://localhost:4201      | `4201`          |
| API docs (Swagger)      | http://localhost:4201/docs | `4201`          |
| Postgres                | localhost                  | `4202`          |
| Redis                   | localhost                  | `4203`          |
| MinIO / console         | http://localhost:4205      | `4204` / `4205` |
| Mailpit SMTP / UI       | http://localhost:4207      | `4206` / `4207` |
| Storybook _(on demand)_ | http://localhost:4208      | `4208`          |

Web and API come up with `pnpm dev`; Postgres/Redis/MinIO/Mailpit with `docker compose up -d`.
**Storybook is started by neither** — run `pnpm --filter @dontpanic/web storybook`.

Every port starts with 42. That was deliberate.

### Testing

```bash
pnpm test                                # all unit + component suites
pnpm --filter @dontpanic/api test:e2e    # backend e2e (real test database)
```

- **Backend** — unit tests with Jest mocking Prisma/cache/mail/storage (~99% stmts, 95% branches);
  e2e boots Nest against a `dontpanic_e2e` Postgres, covering signup → verify → login → refresh →
  logout, 2FA, lockout, CSRF and **cross-company isolation**.
- The e2e suite runs under the **restricted role**, exactly as production does — that is what makes
  the isolation test prove something rather than decorate the report.
- **Frontend** — Vitest + Testing Library: the UI kit, the BFF client with CSRF/refresh, i18n key
  parity, the login screen. 100% of statements.
- Coverage thresholds are enforced in CI.

### Docker in dev and production

1. **Infra in Docker, apps on the host (default, fastest):** `docker compose up -d` brings up
   Postgres/Redis/MinIO/Mailpit; the apps run on the host with `pnpm dev`.
2. **Everything in Docker, hot-reload by bind-mount:**

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

   API and Web run in containers with the repo bind-mounted (`Dockerfile.dev`, no code copied): edit
   on your machine, it changes in the container.

3. **Production:** `Dockerfile.api` / `Dockerfile.web`, multi-stage and `COPY`-based — immutable images.

### License

MIT — see [LICENSE](./LICENSE). The full developer guide lives in [CLAUDE.md](./CLAUDE.md); the
repository is at **[github.com/marmottajr/dontpanic](https://github.com/marmottajr/dontpanic)**.

There is a Konami code hidden in the dashboard, a message in the browser console, and a
`GET /api/teapot` that answers 418. The golden rule: humour never leaks sensitive data and never
shows up in a real security error.

> _"Don't Panic."_ — the cover of the Guide
