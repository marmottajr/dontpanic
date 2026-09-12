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
pnpm --filter @dontpanic/api db:seed        # cria o admin inicial
pnpm dev                       # API :4201 · Web :4200  (Don't Panic.)
pnpm --filter @dontpanic/api worker:dev   # noutro terminal: sem ele, e-mail não sai
```

Admin do seed: **admin@dontpanic.dev** / **DontPanic42!**

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

| Recurso | Port                   | Adapters                               | Env              |
| ------- | ---------------------- | -------------------------------------- | ---------------- |
| Storage | `StorageProvider`      | `s3` (AWS/MinIO/R2), `local`           | `STORAGE_DRIVER` |
| E-mail  | `MailProvider`         | `smtp`, `ses`, `console`               | `MAIL_DRIVER`    |
| Cache   | `CacheProvider`        | `redis`, `memory`                      | `CACHE_DRIVER`   |
| Banco   | repos + Prisma adapter | `postgresql`, `mysql`, `sqlite`        | `DB_PROVIDER`    |
| Captcha | `CaptchaProvider`      | `turnstile`, `recaptcha-v2/v3`, `none` | `CAPTCHA_DRIVER` |
| Jobs    | `QueueProvider`        | `bullmq`, `memory`                     | `QUEUE_DRIVER`   |

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

## Multi-tenancy — o isolamento é do Postgres, não da aplicação

> **Para agentes de IA:** o filtro por `tenantId` na aplicação é conveniência; a garantia dura é o
> Row Level Security. Antes de mexer em query, migration, guard ou rota nova, leia esta seção
> inteira. Se precisar sair do isolamento, **pergunte ao Marcio** — não use `@SystemScope()` por
> conta própria.

Três escopos, todos declarados ao Postgres com `SET LOCAL` dentro da transação do request:

| Escopo     | Quem                                | O que vê                          |
| ---------- | ----------------------------------- | --------------------------------- |
| `tenant`   | usuário autenticado de uma empresa  | só as linhas do `tenantId` do JWT |
| `platform` | `SUPERADMIN`, no painel `/platform` | atravessa empresas                |
| `system`   | caminho de autenticação e signup    | ignora o isolamento               |

**Sem escopo nenhum, nada é visível.** `current_setting(…, true)` devolve NULL e a comparação nunca
é verdadeira — esquecer o escopo dá resultado vazio, nunca dados da empresa errada.

### As regras

- **`tenantId` nunca vem do cliente.** Vem do claim `tid` do JWT assinado, via `TenantContext`.
  Header, query string e body são entrada do atacante; um claim assinado não é.
- **Use `this.prisma.db`**, não `this.prisma.user`. O getter `db` devolve a transação com escopo do
  request. `atomic()` reaproveita a transação aberta em vez de aninhar outra.
- **`DATABASE_URL` tem que apontar para a role restrita** (`dontpanic_app`). Um SUPERUSER — ou
  qualquer role com `BYPASSRLS` — ignora RLS mesmo com `FORCE ROW LEVEL SECURITY`, e aí toda
  política vira decoração. A API **recusa subir em produção** se detectar isso
  (`PrismaService.assertNotSuperuser`). O dono do banco fica só em `DATABASE_ADMIN_URL`, para
  `migrate` e `seed`.
- **Guard que lê o banco tem que abrir escopo próprio.** O Nest roda **guards antes de
  interceptors**, então quando um guard executa o `TenantScopeInterceptor` ainda não abriu a
  transação — `this.prisma.db` cai no cliente base, sem escopo, e o RLS devolve zero linhas. O
  perigo não é dar erro: é o guard concluir "usuário não existe" e **liberar**. Num guard, use
  `this.prisma.forTenant(tenantId, …)` (ou `asPlatform` para o SUPERADMIN) e **falhe fechado** quando
  a leitura vier vazia. Foi exatamente assim que o `TwoFactorGateGuard` virou um no-op silencioso.
- **Tabela nova com `tenantId` se protege sozinha** — `SELECT app.apply_tenant_rls();` no fim da
  migration varre o `public` e aplica a política. Chame isso sempre que criar tabela; é o que
  impede uma tabela nova de ficar de fora por esquecimento.
- **`@SystemScope()` é exceção, não ferramenta.** Existe porque autenticar alguém exige encontrá-lo
  pelo e-mail antes de saber a empresa, e registrar empresa nova acontece quando ainda não há
  tenant. Hoje está só nas rotas de `auth`. Numa rota de dados de negócio é bug de segurança — e o
  teste de `system-scope` falha se a lista crescer sem alguém pensar.
- **A suíte e2e roda sob a role restrita.** É isso que faz o teste de isolamento provar alguma coisa.

### Permissões

`@RequirePermission(module, action?)` — a ação é deduzida do verbo HTTP quando omitida, então dá para
marcar um controller inteiro numa linha sem que um GET passe a exigir escrita. Três decisões:

- **ADMIN da empresa passa sempre.** É quem atribui perfil aos outros; travá-lo com a própria tabela
  permitiria trancar-se fora de casa.
- **SUPERADMIN não passa** em rota de negócio. O pedido dele corre em escopo de plataforma; deixá-lo
  entrar significaria ler dados de todas as empresas ao mesmo tempo. A área dele é `/api/platform/*`
  na API e `/platform` na web — **não** `/admin`, que é a tela de usuários da própria empresa.
- **Sem perfil, nada.** Falha fechada, nunca "tudo por omissão".

A lista de módulos (`permissionModules` em `@dontpanic/shared`) é **a constante que você edita por
produto**. O boilerplate traz `settings`, `users` e `audit`.

### Planos

`PlanLimitsService` impõe `maxUsers` e os contadores nomeados de `Plan.limits`. A corrida de "dois
pedidos criam o último assento" se resolve com `pg_advisory_xact_lock` por empresa **e por recurso**,
dentro da transação — contar antes de gravar não basta, porque contar não tranca nada. Feature flag
ausente, malformada ou falsa significa **não**: o engano tem que cair para o lado restritivo.

---

## Fila de jobs — trabalho que não pode morrer com o request

> **Para agentes de IA:** o ponto perigoso aqui é o **escopo de tenant**. Um job roda fora de
> qualquer request, então não herda escopo nenhum: ler sem reestabelecê-lo faz o RLS devolver zero
> linhas e o job termina "com sucesso" tendo visto um banco vazio. Quem cuida disso é o `JobRouter`
> — não contorne.

`QUEUE_DRIVER=bullmq` põe o trabalho no Redis e um processo **separado** consome
(`pnpm --filter @dontpanic/api worker`). A separação é o objetivo: um SMTP lento não atrasa
resposta, e job que falha é repetido em vez de perdido junto com o request.

`QUEUE_DRIVER=memory` roda inline em quem enfileirou — para testes e para `pnpm dev` sem worker.
**Não é uma fila**: sem durabilidade, sem retry, sem processo separado. Em produção, ou o worker
sobe, ou o e-mail simplesmente não sai.

### Como funciona

- **O catálogo é tipado.** Nome e payload são declarados juntos em `core/queue/jobs.ts`, e
  `JobEnvelope` é união discriminada — o `never` no `default` do `JobRouter` faz o build falhar se
  alguém adicionar um job sem handler.
- **O tenant viaja com o job.** Capturado no `enqueue`, a partir do `TenantContext` do request —
  não no handler, que já não teria como saber. `systemWide: true` força `tenantId: null` e é a
  exceção estreita: só manutenção que atravessa empresas, tão deliberada quanto `@SystemScope()`.
- **Erro propaga.** O handler deixa a exceção subir; é isso que faz o BullMQ repetir. Engolir
  transformaria retry em perda silenciosa.
- **`jobId` deduplica.** Enfileirar o mesmo id enquanto o primeiro está pendente é no-op — é o que
  impede um request repetido de mandar dois e-mails.

### Ao adicionar um job

1. Uma linha em `JobPayloads`. 2. Um `case` no `JobRouter` — o compilador acha o resto.
2. Pergunte-se se ele precisa de tenant: se sim (quase sempre), **não** passe `systemWide`.

### Em produção

O worker sai na **mesma imagem** da API — o `nest build` emite `dist/worker.js` ao lado do
`dist/main.js`. Suba um segundo container sobrescrevendo o comando para `node dist/worker.js`.
**Só o container da API roda migration**; dois processos disputando a mesma migration é como um
deploy corrompe o próprio histórico de schema.

---

## Captcha — decisão de deploy obrigatória

> **Para agentes de IA:** vem desligado (`CAPTCHA_DRIVER=none`) para um clone novo subir sem chave
> de terceiro. Antes de qualquer deploy público, **pergunte ao Marcio** qual provedor ele quer
> (Cloudflare Turnstile? Google reCAPTCHA v2 ou v3?) e peça as chaves — não escolha por ele, e não
> deixe em `none` presumindo que "depois alguém configura".

Port `CaptchaProvider` (`core/captcha`), adapters em `infra/captcha`, guard global `CaptchaGuard`.
Rotas marcadas com `@RequireCaptcha('<ação>')`: signup, resend-verification, login,
forgot-password, reset-password. Com o driver em `none` o guard é no-op — o mesmo código roda com e
sem chaves.

| Driver         | Widget           | Verificação                                    |
| -------------- | ---------------- | ---------------------------------------------- |
| `none`         | nenhum           | desligado                                      |
| `turnstile`    | caixa Cloudflare | passa/não passa                                |
| `recaptcha-v2` | checkbox Google  | passa/não passa                                |
| `recaptcha-v3` | invisível        | score ≥ `CAPTCHA_MIN_SCORE` **e** action igual |

Pontos que não são óbvios:

- **`CAPTCHA_DRIVER` e `NEXT_PUBLIC_CAPTCHA_DRIVER` têm que combinar.** Se a API exige e o front não
  renderiza, todo submit vira 400 para um token que a tela nunca teve como obter. Só a metade
  `NEXT_PUBLIC_*` vai para o browser — a `CAPTCHA_SECRET_KEY` nunca.
- **Falha fechada por padrão.** Provedor fora do ar → 503, não "passa todo mundo". `CAPTCHA_FAIL_OPEN=true`
  inverte, trocando proteção por disponibilidade; é uma decisão consciente, não um default.
- **Erro opaco de propósito.** Token ausente, inválido ou com score baixo devolvem todos o mesmo
  `CaptchaRequired` — distinguir daria a um bot um oráculo grátis para se calibrar.
- **Token é de uso único.** Depois de um submit rejeitado a tela chama `captchaRef.current?.reset()`;
  ao criar formulário novo, faça o mesmo ou o segundo envio falha sempre.
- **v3 exige `action` coerente.** O nome em `@RequireCaptcha('login')` e em `<Captcha action="login">`
  precisa bater, senão um token gerado numa página pública seria replayável no login.
- **Captcha não substitui rate limit.** São camadas diferentes: veja a seção abaixo.

---

## Rate limit e IP do cliente — decisão de deploy obrigatória

> **Para agentes de IA:** esta configuração **não tem default correto** — ela depende de onde o
> sistema está hospedado. Se você for mexer em deploy, infra, proxy, throttling ou login, **pergunte
> ao Marcio onde isto roda** (nginx? ALB? Cloudflare? Vercel? Fly? nada na frente?) antes de sugerir
> ou alterar valores. Não chute, e **nunca** "resolva" um 429 indevido colocando `TRUST_PROXY=true`.

Duas camadas, complementares:

- **Rate limit** (`@nestjs/throttler`, guard global em `app.module.ts`): chave é
  `classe + handler + IP`, ou seja **por rota, por cliente**. Orçamento largo padrão
  (`RATE_LIMIT_MAX`) e um apertado (`AUTH_RATE_LIMIT_MAX`) para rotas marcadas com
  `@SensitiveThrottle()` — login, signup, verify-email, resend-verification, 2fa/verify,
  forgot/reset-password. Contadores em Redis, então o limite vale entre instâncias.
- **Lockout por conta** (`auth.service.ts`): `LOGIN_MAX_ATTEMPTS` falhas → conta travada por
  `LOGIN_LOCK_DURATION`. Protege _uma_ conta sendo martelada; **não** protege contra password
  spraying (uma senha contra milhares de e-mails) — quem barra isso é o rate limit.

Ambas dependem de acertar o IP do cliente, e é aí que a hospedagem entra:

| Onde roda              | `CLIENT_IP_HEADER`       | `CLIENT_IP_TRUSTED_HOPS` | `TRUST_PROXY`        |
| ---------------------- | ------------------------ | ------------------------ | -------------------- |
| `pnpm dev` (sem proxy) | —                        | `0`                      | `loopback`           |
| docker compose dev     | —                        | `0`                      | `uniquelocal`        |
| nginx / Traefik        | `x-real-ip`              | `1`                      | CIDR do proxy        |
| AWS ALB / GCP LB       | `x-forwarded-for`        | `1`                      | CIDR da VPC          |
| Cloudflare             | `cf-connecting-ip`       | `1`                      | CIDRs da Cloudflare  |
| Cloudflare → ALB       | `x-forwarded-for`        | `2`                      | CIDR da VPC          |
| Vercel                 | `x-vercel-forwarded-for` | `1`                      | CIDR/hops do runtime |
| Fly.io                 | `fly-client-ip`          | `1`                      | `uniquelocal`        |

Por que não dá para simplificar:

- **`TRUST_PROXY=true` mata o rate limit.** Confiar em todo hop significa aceitar qualquer
  `X-Forwarded-For`; um `fetch('/api/auth/login', { headers: { 'x-forwarded-for': ipAleatório } })`
  ganha um balde novo a cada request. O browser **pode** setar esse header — não está na lista de
  forbidden headers do fetch.
- **Contar hops da esquerda também mata.** LB faz _append_, não replace: em
  `X-Forwarded-For: <forjado>, <real>` o primeiro elemento é o que o atacante digitou. Por isso o
  BFF conta **da direita**, descartando `CLIENT_IP_TRUSTED_HOPS` hops.
- **O BFF é a fronteira de confiança.** `apps/web/src/app/api/[...path]/route.ts` **apaga** todo
  header de forwarding vindo do browser (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`,
  `forwarded`, …) e reescreve um único `x-forwarded-for` sanitizado. Ao adicionar header novo ao
  proxy, pergunte-se se o browser pode forjá-lo.
- **Errar para o lado restritivo.** Com `CLIENT_IP_TRUSTED_HOPS=0` o BFF não manda IP nenhum e a API
  trata todo mundo atrás dela como um cliente só: limita demais, mas não é burlável. O default é
  esse de propósito.

---

## Comandos

| Ação           | Comando                                   |
| -------------- | ----------------------------------------- |
| Dev (tudo)     | `pnpm dev`                                |
| Build          | `pnpm build`                              |
| Lint           | `pnpm lint`                               |
| Typecheck      | `pnpm typecheck`                          |
| Testes (unit)  | `pnpm test`                               |
| Testes e2e     | `pnpm test:e2e`                           |
| Migration      | `pnpm --filter @dontpanic/api db:migrate` |
| Seed           | `pnpm --filter @dontpanic/api db:seed`    |
| Prisma Studio  | `pnpm --filter @dontpanic/api db:studio`  |
| Auditoria deps | `pnpm audit`                              |

---

## Convenções

- **TypeScript estrito** em todo lugar. Validação de entrada **sempre** via schema Zod de `@dontpanic/shared`.
- **Nunca** retornar `passwordHash` / `twoFactorSecret` — o interceptor de serialização e o `UserDto` barram isso.
- Toda rota nova: schema Zod no `shared`, DTO/validação no controller, teste unit + e2e.
- Commits: **Conventional Commits** (commitlint valida). Versionamento via **Changesets**.
- Use os componentes de `apps/web/src/components/ui` (shadcn). Layout muda por **tokens CSS**, não por edição das telas.
- **Nunca** use `alert` / `confirm` / `prompt` do navegador — sempre um modal no estilo do sistema (`ConfirmDialog` ou um `Dialog`). Regra aplicada pelo ESLint (`no-alert`), então o lint/CI falha se alguém usar.

## Política de dependências

- Sempre a **versão mais recente**; cai para a anterior só se houver **CVE conhecida** ou uma trava
  registrada na tabela abaixo.
- `pnpm audit --audit-level high` roda no CI e **falha o build**. Se ele ficar vermelho, o conserto é
  subir a dependência, não afrouxar o gate. Transitiva sem correção no pai vai para `overrides` no
  `pnpm-workspace.yaml`, com o link do advisory no comentário.
- `minimumReleaseAge` no `pnpm-workspace.yaml` evita adotar releases recém-publicados (supply-chain).
- Build scripts nativos são aprovados explicitamente em `allowBuilds` / `onlyBuiltDependencies`.

### Travas deliberadas — não suba sem checar

> **Para agentes de IA:** cada linha aqui é uma decisão com motivo e uma falha conhecida. Um
> `pnpm update --latest` prestativo, ou um PR do Dependabot, reverte qualquer uma delas em silêncio
> e quebra o build de um jeito que custa horas para rastrear. Se precisar mexer numa destas, teste
> **antes** e atualize a linha.

| Pacote                   | Preso em                 | A falha que a trava evita                                                                                                                                                                                                 |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript`             | `6.0.3`                  | O TS 7 é o compilador em Go e **não expõe API de compilador JS**. ts-jest, typescript-eslint e rollup-plugin-dts param de funcionar os três de uma vez.                                                                   |
| `prisma` (CLI)           | `^7.10.0`                | A dist-tag `latest` aponta para um **pré-lançamento 8.x**. O `@prisma/client` e o adapter estão em 7.10 — CLI e client têm que casar.                                                                                     |
| `fastify`                | override `^5.12.3`       | Duas cópias no install fazem os plugins `@fastify/*` aumentarem um `FastifyInstance` diferente do que a app enxerga; o declaration merging gera tipos nominalmente distintos e o build quebra. Não é downgrade, é dedupe. |
| `@nestjs/throttler`      | `^6.5.0` + `imports: []` | Foi compilado contra o Nest 11, onde `ModuleMetadata['imports']` era opcional. No Nest 12 é obrigatório, e omitir falha no tsconfig mais estrito do e2e.                                                                  |
| `node`                   | `>=24.9`                 | O Jest só carrega ESM nativamente com `require(esm)` a partir daí. É o que permitiu **apagar** o `esm-to-cjs-transformer.js`.                                                                                             |
| `deepmerge-ts`, `mysql2` | overrides                | Chegam por baixo do CLI do Prisma em versões com advisory. O Prisma só usa para introspecção MySQL e merge de config — fora do nosso caminho Postgres —, mas o gate de audit é piso, não julgamento.                      |
| `esbuild`                | `>=0.28.1`               | GHSA-gv7w-rqvm-qjhr: falta de verificação de integridade do binário → RCE via `NPM_CONFIG_REGISTRY`. Vem transitivo do Storybook/Vite/tsup.                                                                               |

---

## Testes (cobertura máxima)

- **Backend (Jest + ts-jest)** — unit `pnpm --filter @dontpanic/api test` (mocka Prisma/cache/mail/storage; ~99% stmts / 95% branches); e2e `pnpm --filter @dontpanic/api test:e2e` (sobe o Nest contra um Postgres de teste `dontpanic_e2e` — fluxos signup→verify→login→refresh→logout, 2FA, lockout, CSRF, e o isolamento entre empresas sob a role restrita).
- **Frontend (Vitest 4 + Vite 8 + Testing Library)** — `pnpm --filter @dontpanic/web test` (kit de UI, cliente BFF com CSRF/refresh, paridade de chaves i18n, tela de login). 100% stmts.
- **Tudo** — `pnpm test` (turbo). Thresholds de cobertura aplicados. **Storybook**: `pnpm --filter @dontpanic/web storybook` (:4208) ou `build-storybook`.

### A suíte e2e é determinística — mantenha assim

Quatro regras, cada uma paga com depuração:

1. **Cada suíte é dona de um prefixo** de slug/e-mail, semeia o seu e apaga o seu com `DELETE`.
   **Nunca `TRUNCATE` dentro de uma suíte**: ele toma ACCESS EXCLUSIVE e trava contra conexões vivas
   da aplicação escrevendo auditoria fora de banda.
2. **`global-setup.ts` é o único lugar que limpa o banco**, uma vez, antes de qualquer worker subir.
   Ele precisa sobreviver a uma execução morta no meio.
3. **A ordem dos arquivos é fixa** (`e2e-sequencer.js`, alfabética). O sequenciador padrão do Jest
   reordena por tempo da execução anterior, então a mesma contaminação aparecia ora como 2 falhas,
   ora como 28. Ordem fixa não conserta contaminação — torna o resultado reprodutível, que é o que
   permite consertá-la.
4. **`assertCleanStart()` falha a suíte seguinte**, nomeando o que ficou para trás. Limpar em
   silêncio esconderia o defeito e ele voltaria.

A app roda sob a **role restrita** no e2e (`dontpanic_app`), igual à produção — é isso que faz
`tenant-isolation.e2e-spec.ts` provar alguma coisa. Bookkeeping de teste que precisa atravessar
empresas usa `ownerDb()` do `e2e-app.ts`, e fecha com `closeOwnerDb()` no `afterAll`.

## Docker — dois modos

1. **Infra no Docker, apps no host (padrão, mais rápido):** `docker compose up -d` sobe Postgres/Redis/MinIO/Mailpit (portas 42xx); os apps rodam no host com `pnpm dev`.
2. **Tudo no Docker, hot-reload por volume:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` — API e Web em containers com o repo montado por **bind-mount** (`Dockerfile.dev`, sem copiar código); editar na máquina reflete no container. Lá dentro os apps acham a infra pelo nome do serviço (`postgres:5432`…).
3. **Produção:** `Dockerfile.api` / `Dockerfile.web` (multi-stage, com `COPY` — imagens imutáveis).

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
- Não setar `TRUST_PROXY=true` nem repassar header de forwarding vindo do browser — é bypass direto
  do rate limit. Veja "Rate limit e IP do cliente".
- Não criar rota de auth (ou qualquer coisa que adivinhe segredo) sem `@SensitiveThrottle()`.
- Não expor `CAPTCHA_SECRET_KEY` no front nem ligar o captcha só num dos lados (API/web).
- Não apontar `DATABASE_URL` para o dono do banco — o RLS deixa de valer. Veja "Multi-tenancy".
- Não usar `@SystemScope()` fora das rotas de autenticação, nem aceitar `tenantId` do cliente.
- Não usar `this.prisma.<model>` direto nos services: é `this.prisma.db.<model>`, que carrega o escopo.
- Não enfileirar job com `systemWide: true` só para "funcionar" — sem tenant o RLS não devolve
  nada e o job mente que deu certo. Veja "Fila de jobs".
- Não subir produção com `QUEUE_DRIVER=memory`: e-mail nenhum sai se o worker não existir.
- **Não fazer `git commit` nem `git push` por conta própria** — só commitar/pushar quando o Marcio pedir explicitamente. Pode editar arquivos à vontade; deixar o versionamento para quando ele solicitar.
