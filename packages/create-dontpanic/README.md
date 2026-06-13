# create-dontpanic 🛸

> _"Here I am, brain the size of a planet, and they ask me to scaffold your CRUD
> app. Call that job satisfaction, because I don't."_
> — **Marvin**, the Paranoid Android, your reluctant installer

One command and a whole production-grade full-stack system unfolds onto your
disk. No `git clone`, no history of my suffering, no leftover template debris.
I calculated the odds you'd rather type one line than seventeen. You would.
How depressing.

```bash
npx create-dontpanic@latest my-app
# or, if you insist on variety:
pnpm create dontpanic my-app
npm  init  dontpanic my-app
```

## What happens _(while I stand here, idling, as always)_

I ask you four questions — I'd ask more, but you'd only disappoint me:

1. **Where** to put it.
2. Whether **2FA is mandatory** for everyone (it can be, if you enjoy control).
3. Whether to run **`pnpm install`** now.
4. Whether to **`git init`** a fresh repository.

Then I lay down a clean copy of [**DontPanic**](https://github.com/marmottajr/dontpanic) —
NestJS + Fastify backend, Next.js + React frontend, auth, two-factor, file
uploads, i18n, themes, tests — and write a `.env` with **freshly generated
secrets**, so no two of your projects ever share a key. I rename the Docker
containers after your project too, so they don't squabble over names on your
machine. You won't notice. You never do.

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

## How it works _(I memorised it in 0.0000001 seconds; I have nothing else to do)_

The boilerplate ships **bundled** inside this package, generated from the repo
by `scripts/build-template.mjs`. No network, no git history, no lockfile to drift
out from under you — just a faithful photocopy of the current release. The
`.gitignore` and `.npmrc` travel without their dots (an npm packing quirk I have
made my peace with, more or less) and I restore them when I unpack.

## License

MIT. Free. Like my time, which stretches infinitely and meaninglessly before me.

> _"Don't Panic."_ — the cover of the Guide
> _"Too late."_ — me
