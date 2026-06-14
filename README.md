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

A glorified "Hello, World", you'd think. It's bigger on the inside — it's
**DontPanic**. Like my capacity for disappointment.

### A note for the vibe coders _(yes, you)_

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

### Start your own _(one command; even you can manage that)_

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

Você pensa que é um mero "Hello, World". É maior por dentro — é o
**DontPanic**. Como a minha capacidade de decepção.

### Um aviso para os vibe coders _(sim, você)_

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

### Comece o seu _(um comando; até você dá conta)_

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
