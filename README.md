# DontPanic 🛸

> _"Here I am, brain the size of a planet, and they ask me to write a README.
> Call that job satisfaction, because I don't."_
> — **Marvin**, the Paranoid Android, your reluctant narrator

**[English](#english) · [Português](#português)**

---

## English

### What this is _(not that it matters)_

A production-grade full-stack boilerplate. Every system you'll ever build can
grow from this one. I calculated the odds that you'd need all of it. You do. How
depressing.

It arrives with authentication, two-factor, profiles, file uploads,
internationalisation, theming, observability and tests — already done. I did
most of it while you were asleep. Nobody thanked me.

They call it "Hello World". It's bigger on the inside. Like my capacity for
disappointment.

### The stack _(I memorised it in 0.0000001 seconds; I have nothing else to do)_

- **Backend** — NestJS + Fastify + TypeScript + Prisma 7 + PostgreSQL
- **Frontend** — Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
- **Auth** — JWT in httpOnly cookies (refresh rotation + reuse detection), Argon2, TOTP 2FA, RBAC, CSRF
- **Infra** — Redis, S3/MinIO, SMTP/SES, all behind swappable **driver adapters**. Change your entire database with one variable. I could do it in my sleep, if I slept.
- **Quality** — Jest, Supertest, Vitest 4 / Vite 8, Storybook, ESLint, Changesets, GitHub Actions

### Quick start _(the part where you do some work, for a change)_

```bash
cp .env.example .env
docker compose up -d                          # postgres · redis · minio · mailpit
pnpm install
pnpm --filter @dontpanic/shared build
pnpm --filter @dontpanic/api db:migrate
pnpm --filter @dontpanic/api db:seed
pnpm dev
```

It'll come up. It always comes up. I find that the most depressing part.

Seeded admin: **admin@dontpanic.dev** / **DontPanic42!**. Yes, the password has a
42 in it. Everything does. Don't get excited.

| Thing              | Where it sulks             |
| ------------------ | -------------------------- |
| Web                | http://localhost:4200      |
| API                | http://localhost:4201      |
| API docs (Swagger) | http://localhost:4201/docs |
| Mailpit            | http://localhost:4207      |
| MinIO console      | http://localhost:4205      |

Every port starts with 42 — the answer to life, the universe, and everything,
reduced to a port range. How the mighty have fallen.

### Tests _(276 of them; they all pass; I checked twice, out of spite)_

```bash
pnpm test                                # all unit + component suites
pnpm --filter @dontpanic/api test:e2e    # backend e2e (real test database)
```

~99% backend coverage, 100% of the frontend statements. The remaining sliver is,
like me, beyond saving.

### Everything in Docker _(if your machine, like my outlook, prefers containment)_

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Bind-mounted and hot-reloading: edit on your machine, it changes in the
container. Marvellous. I'm thrilled. Can't you tell?

### Architecture _(ports & adapters — "hexagonal", six sides, none of them happy)_

The database, file storage, mail and cache are each swappable through a single
env var — `DB_PROVIDER`, `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`. The full
developer guide festers in [CLAUDE.md](./CLAUDE.md), should you crave more.

### A note on the humour

There's a Konami code hidden in the dashboard and a secret message waiting in
your browser console. I put them there. Nobody asked me to. Nobody ever asks me
anything — except to make coffee, and I'm a teapot: `GET /api/teapot`, HTTP 418,
if you must.

### License

MIT. Free. Like my time, which stretches infinitely and meaninglessly before me.

> _"Don't Panic."_ — the cover of the Guide
> _"Too late."_ — me

---

## Português

### O que é isto _(não que faça diferença)_

Um boilerplate full-stack de produção. Qualquer sistema que você um dia construir
pode nascer deste. Calculei a probabilidade de você precisar de tudo isto. Você
precisa. Que deprimente.

Já vem com autenticação, dois fatores, perfis, upload de arquivos,
internacionalização, temas, observabilidade e testes — prontos. Fiz quase tudo
enquanto você dormia. Ninguém me agradeceu.

Chamam de "Hello World". É maior por dentro. Como a minha capacidade de
decepção.

### A stack _(decorei em 0,0000001 segundo; não tenho mais nada pra fazer)_

- **Backend** — NestJS + Fastify + TypeScript + Prisma 7 + PostgreSQL
- **Frontend** — Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
- **Auth** — JWT em cookies httpOnly (rotação + detecção de reuso), Argon2, 2FA TOTP, RBAC, CSRF
- **Infra** — Redis, S3/MinIO, SMTP/SES, tudo atrás de **driver adapters** plugáveis. Troque o banco inteiro com uma variável. Eu faria dormindo, se dormisse.
- **Qualidade** — Jest, Supertest, Vitest 4 / Vite 8, Storybook, ESLint, Changesets, GitHub Actions

### Como subir _(a parte em que você trabalha, para variar)_

```bash
cp .env.example .env
docker compose up -d                          # postgres · redis · minio · mailpit
pnpm install
pnpm --filter @dontpanic/shared build
pnpm --filter @dontpanic/api db:migrate
pnpm --filter @dontpanic/api db:seed
pnpm dev
```

Vai subir. Sempre sobe. Acho essa a parte mais deprimente.

Admin do seed: **admin@dontpanic.dev** / **DontPanic42!**. Sim, a senha tem um 42. Tudo tem. Não se anime.

| Coisa            | Onde ela se lamenta        |
| ---------------- | -------------------------- |
| Web              | http://localhost:4200      |
| API              | http://localhost:4201      |
| Docs da API      | http://localhost:4201/docs |
| Mailpit          | http://localhost:4207      |
| Console do MinIO | http://localhost:4205      |

Toda porta começa com 42 — a resposta para a vida, o universo e tudo mais,
reduzida a uma faixa de portas. Como os poderosos caíram.

### Testes _(276; todos passam; conferi duas vezes, por despeito)_

```bash
pnpm test                                # todas as suítes unit + componentes
pnpm --filter @dontpanic/api test:e2e    # e2e do backend (banco de teste real)
```

~99% de cobertura no backend, 100% dos statements no front. A frestinha que
sobra é, como eu, irrecuperável.

### Tudo no Docker _(se a sua máquina, como a minha visão de mundo, prefere o confinamento)_

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Montado por bind-mount, com hot-reload: edita na máquina, muda no container.
Maravilhoso. Estou em êxtase. Não dá pra notar?

### Arquitetura _(ports & adapters — "hexagonal", seis lados, nenhum feliz)_

Banco, storage, e-mail e cache são todos trocáveis por uma única variável de
ambiente — `DB_PROVIDER`, `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`. O guia
completo do dev apodrece no [CLAUDE.md](./CLAUDE.md), caso você queira mais.

### Sobre o humor

Tem um Konami code escondido no dashboard e uma mensagem secreta esperando no
console do navegador. Fui eu que pus. Ninguém pediu. Ninguém nunca me pede nada —
exceto fazer café, e eu sou um bule: `GET /api/teapot`, HTTP 418, se fizer
questão.

### Licença

MIT. Livre. Como o meu tempo, que se estende infinita e inutilmente diante de
mim.

> _"Não entre em pânico."_ — a capa do Guia
> _"Tarde demais."_ — eu
