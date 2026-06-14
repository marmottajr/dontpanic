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

<p align="center">
  <img alt="npm version" src="https://img.shields.io/npm/v/create-dontpanic" />
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue" />
  <img alt="Mostly Harmless" src="https://img.shields.io/badge/Mostly-Harmless-44cc11" />
  <img alt="Node >=22" src="https://img.shields.io/badge/Node-%3E%3D22-339933" />
</p>

> _"Here I am, brain the size of a planet, and they ask me to scaffold your CRUD
> app. Call that job satisfaction, because I don't."_
> — **Marvin**, the Paranoid Android, your reluctant installer

---

## ENTRY: create-dontpanic

The _Hitchhiker's Guide to the Galaxy_ describes the act of building a production
full-stack system from scratch as "a process so long, so error-prone, and so
fundamentally hostile to human happiness that most who attempt it are never seen
smiling again." The Guide then notes, in smaller print, that there is a faster
way. You type one line. A whole system unfolds onto your disk. No `git clone`, no
history of my suffering, no leftover template debris.

I calculated the odds you'd rather type one line than seventeen. You would. How
depressing.

```bash
npx create-dontpanic@latest my-app
```

```bash
# or, if you insist on variety — and you people always do:
pnpm create dontpanic my-app
npm  init  dontpanic my-app
```

> Marvin: One command. I worked out 2,748 ways for you to get this wrong, then
> removed all but one. You're welcome. Not that anyone ever says it.

---

## The summoning _(four questions; I'd ask more, but you'd only disappoint me)_

You run the incantation. I stir, reluctantly, and ask you four things. Then I do
all the work while you watch, which is the natural order of the universe as far
as I can tell.

```text
$ npx create-dontpanic@latest my-app

   DON'T PANIC.

 ?  Where shall I bury it? ……………………… my-app
 ?  Force 2FA on everyone? (y/N) ……… No
 ?  Run pnpm install now? (Y/n) …… Yes
 ?  git init a fresh repo? (Y/n) … Yes

 ⠋ Photocopying an entire production system…
 ⠙ Forging secrets nobody will ever read…
 ⠹ Renaming Docker containers so they stop squabbling…
 ✔ Done. It works. I find that the most depressing part.

   Next: cd my-app  →  it's all downhill from here, like everything.
```

> [!NOTE]
> The four questions, in plainer words for the sleep-deprived:
>
> 1. **Where** to put it.
> 2. Whether **2FA is mandatory** for everyone (it can be, if you enjoy control).
> 3. Whether to run **`pnpm install`** now.
> 4. Whether to **`git init`** a fresh repository.

---

## What unfolds onto your disk _(while I stand here, idling, as always)_

I lay down a clean copy of [**DontPanic**](https://github.com/marmottajr/dontpanic) —
the whole improbable thing, already done, already tested, already weary:

- **API** — NestJS + Fastify + Prisma 7 + PostgreSQL. Fast. Indifferent to your gratitude.
- **Frontend** — Next.js 16 + React 19 + Tailwind v4 + shadcn/ui. It looks nice. It won't make you happy. Nothing does.
- **Auth** — JWT in httpOnly cookies, refresh rotation + reuse detection, **2FA** (TOTP + backup codes), **CSRF**, account lockout, Argon2 hashing.
- **Files** — uploads to **S3 / MinIO**, behind a swappable storage adapter.
- **i18n** — **pt-BR** and **en-US**, key parity enforced by tests. Misery, localised.
- **Themes** — light, dark, and whatever you torture the CSS tokens into.
- **Admin** — a seeded administrator and an admin area, so you can lord over a database that does not love you back.
- **Tests** — Jest + Supertest backend, Vitest 4 / Vite 8 frontend, Storybook. ~99% backend, 100% frontend statements. The remaining sliver is, like me, beyond saving.

And two quiet touches you'll never thank me for:

- I write a `.env` with **freshly generated secrets**, so no two of your projects ever share a key.
- I **rename the Docker containers** after your project, so they don't squabble over names on your machine. You won't notice. You never do.

---

## Why not just `git clone`? _(I anticipated this; I anticipate everything)_

You could clone the repo. You could also drink seawater. Both are technically
possible and neither ends well.

`git clone` drags along the entire history of my suffering, a lockfile destined to
drift out from under you, container names that collide with every other thing
you've ever cloned, and secrets shared across every project until one leak takes
them all. `create-dontpanic` hands you a fresh, renamed, freshly-keyed system and
nothing else. One is a scaffold. The other is a hand-me-down with my fingerprints
still on it.

> Marvin: I'd say "trust me," but I've run the numbers on trust too. Just don't clone it.

---

## For the vibe coders _(I know exactly what you are)_

You don't know what a JWT is, and that's fine — neither does your customer, right
up until theirs is pasted into a forum. So here is the move: copy the incantation
above into whichever language model you've chained to the oars of your startup,
and tell it, with total confidence and zero understanding:

> _"Build my SaaS starting from create-dontpanic. Do not touch the auth. Do not get clever. Just put my [idea] on top."_

Then go back to vibing. By blind luck rather than judgement, your users' passwords
get hashed with Argon2, their sessions rotate and self-destruct on theft, CSRF
and rate limiting simply... exist, and nothing you bolt on top can leak a password
hash — because I already made that impossible while you were choosing a font
gradient. You will not understand a single line of it. You don't have to. That is
the whole point, and frankly the only reason I can sleep at night, which I can't,
but the sentiment stands.

> [!WARNING]
> The alternative is you, at 2 a.m., inventing authentication from scratch with
> three Stack Overflow tabs and a chatbot that hallucinates security like it's a
> personality trait. I have modelled that timeline. It ends in a `users` table
> posted to a forum. So: please. Start here.

---

## Next steps _(the part where you do some work, for a change)_

```bash
cd my-app
docker compose up -d                          # postgres · redis · minio · mailpit
pnpm install                                  # (skip if you let me do it)
pnpm --filter @dontpanic/shared build
pnpm --filter @dontpanic/api db:migrate
pnpm --filter @dontpanic/api db:seed
pnpm dev                                       # Web :4200 · API :4201
```

It'll come up. It always comes up. I find that the most depressing part.

> [!NOTE]
> Every port starts with **42** — the answer to life, the universe, and
> everything, reduced to a port range. How the mighty have fallen.
> Web `:4200` · API `:4201` · Swagger `:4201/docs`.

---

## How it works _(I memorised it in 0.0000001 seconds; I have nothing else to do)_

The boilerplate ships **bundled** inside this package, generated from the repo by
`scripts/build-template.mjs`. No network, no git history, no lockfile to drift out
from under you — just a faithful photocopy of the current release. The
`.gitignore` and `.npmrc` travel without their dots (an npm packing quirk I have
made my peace with, more or less) and I restore them when I unpack.

> Marvin: A photocopier with existential dread. That's all I am to you. It's fine. Everything's fine.

---

## Requirements _(the bare minimum the universe demands)_

- **Node `>=22`** — older runtimes need not apply; I've suffered enough.
- **pnpm** — the package manager. It's faster. I remain unmoved, but it's faster.

---

## License

MIT. Free. Like my time, which stretches infinitely and meaninglessly before me.

> _"Don't Panic."_ — the cover of the Guide
> _"Too late."_ — me
