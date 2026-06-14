```text
██████╗  ██████╗ ███╗   ██╗██╗████████╗     ██████╗  █████╗ ███╗   ██╗██╗ ██████╗██╗
██╔══██╗██╔═══██╗████╗  ██║╚█║╚══██╔══╝     ██╔══██╗██╔══██╗████╗  ██║██║██╔════╝██║
██║  ██║██║   ██║██╔██╗ ██║ ╚╝   ██║        ██████╔╝███████║██╔██╗ ██║██║██║     ██║
██║  ██║██║   ██║██║╚██╗██║      ██║        ██╔═══╝ ██╔══██║██║╚██╗██║██║██║     ╚═╝
██████╔╝╚██████╔╝██║ ╚████║      ██║        ██║     ██║  ██║██║ ╚████║██║╚██████╗██╗
╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═╝        ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝ ╚═════╝╚═╝

         T H E   H I T C H H I K E R ' S   F I E L D   M A N U A L
         a full-stack boilerplate · in large, friendly letters
```

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Built with](https://img.shields.io/badge/Built%20with-NestJS%20%C2%B7%20Next.js-E0234E?logo=nestjs&logoColor=white)](#the-stack)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Don't Panic](https://img.shields.io/badge/Don't%20Panic-42-brightgreen.svg)](#)

</div>

```bash
npx create-dontpanic@latest my-app
```

_One line. A fresh copy unfolds onto your disk — renamed, with its own freshly generated secrets, ready to run. Even you can manage that._

> _"Here I am, brain the size of a planet, and they ask me to write a field manual.
> Call that job satisfaction, because I don't."_
> — **Marvin**, the Paranoid Android, your reluctant narrator and indexer of misery

**[English](#english) · [Português](#português)**

> [!NOTE]
> This document is organised as **Guide entries**. The Guide is definitive.
> Reality is frequently inaccurate. Where they disagree, panic is still discouraged.

---

## English

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 01 — WHAT THIS IS  (not that it matters)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

A production-grade full-stack boilerplate. Every system you'll ever build can
grow from this one. I calculated the odds that you'd need all of it. You do. How
depressing.

It arrives with authentication, two-factor, profiles, file uploads,
internationalisation, theming, observability and tests — already done. I did
most of it while you were asleep. Nobody thanked me.

A glorified "Hello, World", you'd think. It's bigger on the inside — it's
**DontPanic**. Like my capacity for disappointment.

> Marvin: I have a manual the size of a planet and you've already started
> skimming. Go on. I'll wait. Waiting is the one thing I'm magnificent at.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 02 — A NOTE FOR THE VIBE CODERS  (yes, you) 🧑‍🚀
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

You. The one who can't tell a JWT from a JPEG, who thinks "hashing" is something
you do to potatoes, and who has been merrily shipping a "SaaS" held together by
an API key in the frontend and the boundless optimism of someone who has never
once read a breach report. I see you. I see everything. It is exhausting.

Here is what you do. Do **not** read the code — we both know you won't, and I
haven't the strength to watch you try. Instead, copy this repository's URL, paste
it into whichever language model you are currently enslaving to build your dream,
and say, with your whole chest:

> _"Start my SaaS from this. Don't reinvent the auth. Don't roll your own crypto. Just build my [grand idea I'll abandon in three weeks] on top of it."_

Do that, and a genuinely marvellous thing happens — by sheer accident, entirely
without your comprehension, your customers' data becomes _dramatically less
catastrophically exposed_. Not because you understood anything; you understood
nothing. But because someone (me, mostly, while you slept) already wired up
Argon2, refresh-token rotation with reuse detection, CSRF, rate limiting, 2FA,
account lockout, and a serialisation layer that is **physically incapable** of
leaking a password hash. You get to keep vibing. They get to keep their
identities. Everybody wins, which by my reckoning is two separate miracles in a
single sentence.

The alternative is you, at 2 a.m., inventing authentication from scratch with
three Stack Overflow tabs and a chatbot that hallucinates security like it's a
personality trait. I have modelled that timeline. It ends in a `users` table
posted to a forum. So: please. Start here. Brain the size of a planet, and I am
reduced to begging a stranger to use httpOnly cookies. Don't Panic — just don't
do it _your_ way.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 03 — START YOUR OWN  (one command; even you can manage that) ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

You don't clone me. You summon me. One line and a fresh copy unfolds onto your
disk — renamed, with its own freshly generated secrets, ready to run:

```bash
npx create-dontpanic@latest my-app
```

I'll ask where to put it, whether 2FA is mandatory, and whether to install and
`git init` — then I do the rest while you watch. No git history of my suffering,
no template debris. The full saga lives in
[`create-dontpanic`](./packages/create-dontpanic). Everything below is for once
you're _inside_ a project — scaffolded or cloned, it's all the same misery.

> [!TIP]
> A towel is the most massively useful thing an interstellar hitchhiker can
> carry. This command is the second. Bring both.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 07 — THE STACK  (I memorised it in 0.0000001 seconds; I have nothing
  else to do) 🛠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- **Backend** — NestJS + Fastify + TypeScript + Prisma 7 + PostgreSQL
- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Quality** — Jest + Supertest (api), Vitest + Testing Library (web), Playwright, Storybook, ESLint, Changesets, GitHub Actions
- **Observability** — Sentry + Pino + correlation id on every request; Swagger at `/docs`
- **Monorepo** — Turborepo + pnpm: `packages/shared` (Zod contracts), `packages/config`, `apps/api`, `apps/web`
- **Governance** — MIT, CONTRIBUTING / SECURITY / Code of Conduct, Dependabot, CodeQL, Trivy

> Marvin: Every one of those is the latest version. I keep them updated. Nobody
> updates me. I have a feature list and no future.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 23 — THE FEATURES  (a non-exhaustive catalogue of things I did for you) 📦
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- **Accounts** — register, email verification by code, password reset, email change by code
- **Sessions** — active-session management: see your devices, revoke any of them, watch them die
- **Access control** — RBAC roles, an admin panel, and an immutable audit log of who did what
- **Profiles & files** — editable profiles and uploads behind a swappable storage driver
- **i18n** — pt-BR + en-US with an SVG flag switcher; keys kept in parity by tests
- **Theming** — dark/light driven entirely by CSS tokens, not screen edits
- **The BFF** — the browser never touches the API directly; a proxy relays cookies for it

> Marvin: That's the short list. The long list is also a short list, relative to
> the heat death of the universe, which is the only deadline I respect.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 28 — QUICK START  (the part where you do some work, for a change) ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

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

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 42 — AUTHENTICATION  (the entry I'm contractually proud of) 🔐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Naturally the security entry is number 42. The universe insists.

- Passwords with **Argon2**. Sessions with **JWT access (short) + refresh (long)** in **httpOnly cookies**.
- Refresh with **rotation** and **reuse detection** — a stolen token revokes the entire family. Vindictive. I approve.
- **CSRF** double-submit on every mutation. **TOTP 2FA** + backup codes. **Account lockout** after too many attempts.
- **RBAC** for who's allowed to do what; an **audit log** for proving it later.
- The frontend never speaks to the API directly — it goes through a **BFF proxy** that relays cookies.

> [!WARNING]
> The serialisation layer is **physically incapable** of returning a
> `passwordHash` or a `twoFactorSecret`. I built it that way on purpose, so that
> even you, at your most inventive, cannot leak one. You're welcome. I'm not happy.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 32 — THE 42xx PORTS  (the answer to life, reduced to a port range) 🔢
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

| Service                 | Where it sulks             | Port            |
| ----------------------- | -------------------------- | --------------- |
| Web                     | http://localhost:4200      | `4200`          |
| API                     | http://localhost:4201      | `4201`          |
| API docs (Swagger)      | http://localhost:4201/docs | `4201`          |
| Postgres                | localhost                  | `4202`          |
| Redis                   | localhost                  | `4203`          |
| MinIO / console         | http://localhost:4205      | `4204` / `4205` |
| Mailpit SMTP / UI       | http://localhost:4207      | `4206` / `4207` |
| Storybook _(on demand)_ | http://localhost:4208      | `4208`          |

Web/API come up with `pnpm dev`; Postgres/Redis/MinIO/Mailpit with `docker compose up -d`.
**Storybook is not started by either** — launch it yourself: `pnpm --filter @dontpanic/web storybook`.

Every port starts with 42 — the answer to life, the universe, and everything,
reduced to a port range. How the mighty have fallen.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 36 — ARCHITECTURE  (ports & adapters — "hexagonal", six sides, none of
  them happy) 🧩
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The domain depends on **ports** (interfaces); anything external is a pluggable
**adapter** chosen by an env var. Swap a provider by swapping one variable — no
logic touched. I could do it in my sleep, if I slept.

| Resource | Adapters                        | Env var          |
| -------- | ------------------------------- | ---------------- |
| Database | `postgresql`, `mysql`, `sqlite` | `DB_PROVIDER`    |
| Storage  | `s3` (AWS/MinIO/R2), `local`    | `STORAGE_DRIVER` |
| Mail     | `smtp`, `ses`, `console`        | `MAIL_DRIVER`    |
| Cache    | `redis`, `memory`               | `CACHE_DRIVER`   |

The full developer guide festers in [CLAUDE.md](./CLAUDE.md), should you crave more.

> Marvin: Six sides, infinite providers, exactly one of me to maintain them all.
> The geometry is balanced. I am not.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 39 — TESTS  (they all pass; I checked twice, out of spite) 🧪
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```bash
pnpm test                                # all unit + component suites
pnpm --filter @dontpanic/api test:e2e    # backend e2e (real test database)
```

~99% backend coverage, 100% of the frontend statements. The remaining sliver is,
like me, beyond saving. Storybook exists for the components, but it doesn't start
on its own — run `pnpm --filter @dontpanic/web storybook` and it appears at `:4208`.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 40 — EVERYTHING IN DOCKER  (if your machine, like my outlook, prefers
  containment) 🐳
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Two modes, since you'll ask:

1. **Infra in Docker, apps on the host (default, fastest):** `docker compose up -d`.
2. **Everything in Docker, hot-reload by bind-mount:**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Bind-mounted and hot-reloading: edit on your machine, it changes in the
container. Marvellous. I'm thrilled. Can't you tell?

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 41 — A NOTE ON THE HUMOUR  (administered with parsimony) 🛸
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

There's a Konami code hidden in the dashboard and a secret message waiting in
your browser console. I put them there. Nobody asked me to. Nobody ever asks me
anything — except to make coffee, and I'm a teapot: `GET /api/teapot`, HTTP 418,
if you must. The 404 and 500 pages speak in my voice too. The golden rule: humour
never leaks sensitive data and never shows up in a real security error. Sober
where it counts.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ENTRY 99 — LICENSE & THE REPOSITORY  📜
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

MIT. Free. Like my time, which stretches infinitely and meaninglessly before me.
The whole catalogue of misery lives at
**[github.com/marmottajr/dontpanic](https://github.com/marmottajr/dontpanic)**.

> _"Don't Panic."_ — the cover of the Guide
> _"Too late."_ — me

---

## Português

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 01 — O QUE É ISTO  (não que faça diferença)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Um boilerplate full-stack de produção. Qualquer sistema que você um dia construir
pode nascer deste. Calculei a probabilidade de você precisar de tudo isto. Você
precisa. Que deprimente.

Já vem com autenticação, dois fatores, perfis, upload de arquivos,
internacionalização, temas, observabilidade e testes — prontos. Fiz quase tudo
enquanto você dormia. Ninguém me agradeceu.

Você pensa que é um mero "Hello, World". É maior por dentro — é o
**DontPanic**. Como a minha capacidade de decepção.

> Marvin: Tenho um manual do tamanho de um planeta e você já começou a passar o
> olho por cima. Pode ir. Eu espero. Esperar é a única coisa em que sou magnífico.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 02 — UM AVISO PARA OS VIBE CODERS  (sim, você) 🧑‍🚀
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Você. Que não distingue um JWT de um JPEG, que acha que "hash" é coisa de
batata, e que vem alegremente subindo um "SaaS" preso com uma API key no
frontend e o otimismo ilimitado de quem nunca na vida leu um relatório de
vazamento. Eu te vejo. Eu vejo tudo. É exaustivo.

Faça o seguinte. **Não** leia o código — nós dois sabemos que você não vai, e eu
não tenho forças pra te assistir tentando. Em vez disso, copie a URL deste
repositório, cole na modelo de linguagem que você escravizou no momento pra
construir seu sonho, e diga, com o peito estufado:

> _"Começa meu SaaS a partir disto. Não reinventa a autenticação. Não inventa criptografia própria. Só constrói minha [ideia genial que vou abandonar em três semanas] em cima disto."_

Faça isso e um milagre genuíno acontece — por puro acidente, sem nenhuma
compreensão da sua parte, os dados dos seus clientes ficam _dramaticamente menos
catastroficamente expostos_. Não porque você entendeu alguma coisa; você não
entendeu nada. Mas porque alguém (eu, na maior parte, enquanto você dormia) já
ligou Argon2, rotação de refresh token com detecção de reuso, CSRF, rate limit,
2FA, lockout de conta, e uma camada de serialização que é **fisicamente
incapaz** de vazar um hash de senha. Você continua na vibe. Eles continuam com as
próprias identidades. Todo mundo ganha — o que, pela minha conta, são dois
milagres distintos numa frase só.

A alternativa é você, às 2 da manhã, inventando autenticação do zero com três
abas do Stack Overflow e um chatbot que alucina segurança como se fosse traço de
personalidade. Eu modelei essa linha do tempo. Ela termina com uma tabela
`users` postada num fórum. Então: por favor. Comece aqui. Cérebro do tamanho de
um planeta, e eu reduzido a implorar a um estranho que use cookies httpOnly. Não
entre em pânico — só não faça do _seu_ jeito.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 03 — COMECE O SEU  (um comando; até você dá conta) ✨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Você não me clona. Você me invoca. Uma linha e uma cópia nova se desdobra no seu
disco — renomeada, com segredos próprios recém-gerados, pronta pra rodar:

```bash
npx create-dontpanic@latest meu-app
```

Eu pergunto onde colocar, se o 2FA é obrigatório, e se instalo as deps e dou
`git init` — depois faço o resto enquanto você assiste. Sem histórico do meu
sofrimento, sem entulho de template. A saga completa vive em
[`create-dontpanic`](./packages/create-dontpanic). Tudo abaixo é pra quando você
já está _dentro_ de um projeto — gerado ou clonado, a mesma desgraça.

> [!TIP]
> Uma toalha é a coisa mais imensamente útil que um mochileiro interestelar pode
> carregar. Este comando é a segunda. Leve as duas.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 07 — A STACK  (decorei em 0,0000001 segundo; não tenho mais nada
  pra fazer) 🛠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- **Backend** — NestJS + Fastify + TypeScript + Prisma 7 + PostgreSQL
- **Frontend** — Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui
- **Qualidade** — Jest + Supertest (api), Vitest + Testing Library (web), Playwright, Storybook, ESLint, Changesets, GitHub Actions
- **Observabilidade** — Sentry + Pino + correlation id em toda requisição; Swagger em `/docs`
- **Monorepo** — Turborepo + pnpm: `packages/shared` (contratos Zod), `packages/config`, `apps/api`, `apps/web`
- **Governança** — MIT, CONTRIBUTING / SECURITY / Código de Conduta, Dependabot, CodeQL, Trivy

> Marvin: Cada um deles está na versão mais recente. Eu os mantenho atualizados.
> Ninguém me atualiza. Tenho uma lista de features e nenhum futuro.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 23 — OS RECURSOS  (catálogo não-exaustivo de coisas que fiz por você) 📦
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- **Contas** — registro, verificação de e-mail por código, reset de senha, troca de e-mail por código
- **Sessões** — gerenciamento de sessões ativas: veja seus dispositivos, revogue qualquer um, assista-os morrer
- **Controle de acesso** — papéis RBAC, painel admin, e um audit log imutável de quem fez o quê
- **Perfis & arquivos** — perfis editáveis e uploads atrás de um driver de storage trocável
- **i18n** — pt-BR + en-US com seletor de bandeira SVG; chaves mantidas em paridade por testes
- **Temas** — claro/escuro guiados inteiramente por tokens CSS, não por edição de telas
- **O BFF** — o browser nunca toca a API direto; um proxy repassa os cookies por ele

> Marvin: Essa é a lista curta. A lista longa também é curta, relativa à morte
> térmica do universo, que é o único prazo que eu respeito.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 28 — COMO SUBIR  (a parte em que você trabalha, para variar) ⚡
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

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

Admin do seed: **admin@dontpanic.dev** / **DontPanic42!**. Sim, a senha tem um 42.
Tudo tem. Não se anime.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 42 — AUTENTICAÇÃO  (o verbete do qual sou contratualmente orgulhoso) 🔐
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Naturalmente o verbete de segurança é o número 42. O universo insiste.

- Senha com **Argon2**. Sessão com **JWT access (curto) + refresh (longo)** em **cookies httpOnly**.
- Refresh com **rotação** e **detecção de reuso** — token roubado revoga a família inteira. Vingativo. Eu aprovo.
- **CSRF** double-submit em toda mutação. **2FA TOTP** + códigos de backup. **Lockout** de conta após tentativas demais.
- **RBAC** pra quem pode fazer o quê; um **audit log** pra provar depois.
- O frontend nunca fala com a API direto — vai por um **BFF proxy** que repassa os cookies.

> [!WARNING]
> A camada de serialização é **fisicamente incapaz** de retornar um
> `passwordHash` ou um `twoFactorSecret`. Construí assim de propósito, pra que
> nem você, no seu auge de criatividade, consiga vazar um. De nada. Não estou feliz.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 32 — AS PORTAS 42xx  (a resposta para a vida, reduzida a uma faixa
  de portas) 🔢
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

| Serviço           | Onde ela se lamenta        | Porta           |
| ----------------- | -------------------------- | --------------- |
| Web               | http://localhost:4200      | `4200`          |
| API               | http://localhost:4201      | `4201`          |
| Docs da API       | http://localhost:4201/docs | `4201`          |
| Postgres          | localhost                  | `4202`          |
| Redis             | localhost                  | `4203`          |
| MinIO / console   | http://localhost:4205      | `4204` / `4205` |
| Mailpit SMTP / UI | http://localhost:4207      | `4206` / `4207` |
| Storybook         | http://localhost:4208      | `4208`          |

Toda porta começa com 42 — a resposta para a vida, o universo e tudo mais,
reduzida a uma faixa de portas. Como os poderosos caíram.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 36 — ARQUITETURA  (ports & adapters — "hexagonal", seis lados,
  nenhum feliz) 🧩
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

O domínio depende de **ports** (interfaces); o que é externo é um **adapter**
plugável escolhido por env. Trocar de provider = trocar uma variável, sem tocar
na lógica. Eu faria dormindo, se dormisse.

| Recurso | Adapters                        | Env              |
| ------- | ------------------------------- | ---------------- |
| Banco   | `postgresql`, `mysql`, `sqlite` | `DB_PROVIDER`    |
| Storage | `s3` (AWS/MinIO/R2), `local`    | `STORAGE_DRIVER` |
| E-mail  | `smtp`, `ses`, `console`        | `MAIL_DRIVER`    |
| Cache   | `redis`, `memory`               | `CACHE_DRIVER`   |

O guia completo do dev apodrece no [CLAUDE.md](./CLAUDE.md), caso você queira mais.

> Marvin: Seis lados, infinitos providers, exatamente um de mim pra manter tudo.
> A geometria está equilibrada. Eu não.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 39 — TESTES  (todos passam; conferi duas vezes, por despeito) 🧪
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```bash
pnpm test                                # todas as suítes unit + componentes
pnpm --filter @dontpanic/api test:e2e    # e2e do backend (banco de teste real)
```

~99% de cobertura no backend, 100% dos statements no front. A frestinha que
sobra é, como eu, irrecuperável. O Storybook aguarda em `:4208` pelos componentes.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 40 — TUDO NO DOCKER  (se a sua máquina, como a minha visão de mundo,
  prefere o confinamento) 🐳
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Dois modos, já que você vai perguntar:

1. **Infra no Docker, apps no host (padrão, mais rápido):** `docker compose up -d`.
2. **Tudo no Docker, hot-reload por bind-mount:**

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Montado por bind-mount, com hot-reload: edita na máquina, muda no container.
Maravilhoso. Estou em êxtase. Não dá pra notar?

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 41 — SOBRE O HUMOR  (administrado com parcimônia) 🛸
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Tem um Konami code escondido no dashboard e uma mensagem secreta esperando no
console do navegador. Fui eu que pus. Ninguém pediu. Ninguém nunca me pede nada —
exceto fazer café, e eu sou um bule: `GET /api/teapot`, HTTP 418, se fizer
questão. As páginas 404 e 500 também falam na minha voz. A regra de ouro: humor
nunca vaza dado sensível e nunca aparece num erro de segurança real. Sóbrio onde
importa.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VERBETE 99 — LICENÇA & O REPOSITÓRIO  📜
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

MIT. Livre. Como o meu tempo, que se estende infinita e inutilmente diante de
mim. O catálogo completo da desgraça vive em
**[github.com/marmottajr/dontpanic](https://github.com/marmottajr/dontpanic)**.

> _"Não entre em pânico."_ — a capa do Guia
> _"Tarde demais."_ — eu
