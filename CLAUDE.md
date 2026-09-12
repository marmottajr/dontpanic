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

| Recurso | Port              | Adapters                               | Env              |
| ------- | ----------------- | -------------------------------------- | ---------------- |
| Storage | `StorageProvider` | `s3` (AWS/MinIO/R2), `local`           | `STORAGE_DRIVER` |
| E-mail  | `MailProvider`    | `smtp`, `ses`, `console`               | `MAIL_DRIVER`    |
| Cache   | `CacheProvider`   | `redis`, `memory`                      | `CACHE_DRIVER`   |
| Captcha | `CaptchaProvider` | `turnstile`, `recaptcha-v2/v3`, `none` | `CAPTCHA_DRIVER` |
| Jobs    | `QueueProvider`   | `bullmq`, `memory`                     | `QUEUE_DRIVER`   |

- Adapters ficam em `apps/api/src/infra/**`; ports em `apps/api/src/core/**`.
- **O banco não está nessa tabela, e isso é deliberado: é Postgres, sempre.** O isolamento
  entre empresas é Row Level Security escrito em PL/pgSQL (`set_config`, `current_setting`,
  `pg_roles`, `FORCE ROW LEVEL SECURITY`) e o cliente é `@prisma/adapter-pg` via Prisma 7
  driver adapters. Havia um `DB_PROVIDER` oferecendo `mysql` e `sqlite`; ele era declarado e
  **nunca lido**, então escolher outro banco não trocava nada — subia a aplicação com o
  isolamento ausente e sem erro nenhum. O pior tipo de opção é a que parece funcionar.
- Em teste, use `memory` / `console` / `local` para rodar sem Docker.

---

## Autenticação (resumo)

- Senha com **Argon2**. Sessão com **JWT access (curto) + refresh (longo)** em **cookies httpOnly**.
- Refresh com **rotação** e **detecção de reuso** (token roubado → revoga a família inteira).
- **CSRF** double-submit nas mutações. **2FA TOTP** + códigos de backup. **Lockout** por tentativas.
- O front nunca fala direto com a API: usa um **BFF proxy** (route handlers) que repassa cookies.
- Quem entra e por onde: **signup público** (opcional, `PUBLIC_SIGNUP_ENABLED`), **convite** — a
  única porta para empresa que já existe — e **login social** (opcional, por provider). Cada um tem
  seção própria abaixo; `passwordHash` é nullable por causa do social.

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

## Convites — a única porta para uma empresa que já existe

> **Para agentes de IA:** `InvitationsService.issue()` grava dentro da transação **do chamador**,
> mas o e-mail sai **depois do commit**. Se você mover o disparo para dentro da transação porque
> "fica mais simples", um rollback entrega um link válido apontando para uma empresa que não
> existe — e ninguém consegue fechar esse chamado. Antes de mexer em `issue()`, em quem o chama, ou
> em qualquer coisa que crie usuário, leia esta seção inteira.

`POST /auth/signup` cria **empresa + primeiro admin**, e só isso. Para uma empresa que já existe,
convite é a única entrada: um ADMIN chamando um colega, ou o operador da plataforma entregando uma
empresa que acabou de criar. Os dois produzem a mesma linha, porque quem clica no link não tem como
distinguir — e não deveria precisar.

**Registro público virou opcional.** `PUBLIC_SIGNUP_ENABLED` (default `true`) decide se um
desconhecido consegue criar empresa pelo formulário. Desligado, sobram o convite e o seed — que é o
que um deploy interno ou um produto vendido por time comercial quer. O default `true` preserva o
comportamento que o boilerplate sempre teve e mantém um clone novo utilizável sem rodar o seed;
**não é um default seguro, é uma decisão de deploy**, e está no checklist de produção por isso.
`NEXT_PUBLIC_SIGNUP_ENABLED` no web precisa concordar: se discordarem, o formulário renderiza e todo
submit responde 403 — a mesma armadilha que o captcha já tem, pela mesma razão.

### O que o fluxo antigo fazia de errado

Antes, o ADMIN cadastrava o colega **digitando a senha dele**, e a conta nascia `emailVerified: true`
na palavra do admin. Errado duas vezes: **duas pessoas passavam a conhecer a credencial** (e a única
que respondia por ela era a que não a escolheu), e **o endereço nunca foi provado** — era o que o
admin digitou, incluindo o dígito trocado. Agora o convidado escolhe a própria senha, e o clique no
link mailado é o que prova o endereço. O inviter nunca aprende a credencial e nunca precisou.

### O desenho

- **O token cru existe no e-mail e em lugar nenhum mais.** O banco guarda só o **SHA-256**
  (`tokenHash`), mesma disciplina do reset de senha: banco vazado não rende link utilizável.
  SHA-256 e não Argon2 porque o token já são 256 bits de aleatoriedade — não há o que esticar, e a
  busca precisa ser rápida.
- **No máximo 1 convite `PENDING` por (tenant, e-mail)**, garantido por um índice único **parcial**
  (`WHERE status = 'PENDING'`). Parcial porque a restrição só vale enquanto o convite está vivo:
  depois de aceito ou revogado, a mesma pessoa pode legitimamente ser convidada de novo, e um
  `UNIQUE(tenantId, email)` simples recusaria isso para sempre. O índice também fecha a corrida que
  o pré-check do service não fecha — dois admins convidando o mesmo colega no mesmo instante veem
  ambos "não há convite pendente" e ambos inserem; o Postgres recusa o segundo e o service traduz o
  `P2002` em 409. Prisma não sabe expressar índice parcial: ele vive na migration e está documentado
  no model.
- **`EXPIRED` não é estado gravado.** Expirar é um fato sobre `expiresAt` e o relógio, não uma
  transição. O status é derivado na leitura, então nenhuma linha fica na tabela se dizendo viva
  depois do prazo só porque nenhum job passou por ali.
- **Grava na transação, manda o e-mail depois do commit.** `issue()` recebe o `tx` do chamador — a
  linha do convite tem que morrer junto com a empresa se o resto falhar. O e-mail, não: por isso
  `dispatchInvitationEmail()` é chamado **fora**, depois que a transação fechou.
- **O limite de plano vale no ACEITE.** É o aceite que consome o assento, e é lá que o
  `assertCanAddUser` roda **dentro da mesma transação** que cria o usuário — o que mantém o
  `pg_advisory_xact_lock` e a contagem em volta da escrita. O `assertCanAddUser` na emissão é
  cortesia, **não** a garantia: entre o convite e o clique alguém pode entrar, sair ou o plano pode
  mudar; ele só evita que um ADMIN mande convite para um plano que já está cheio. Emitir dez
  convites com três assentos livres é permitido — o quarto aceite é que falha.
- **O aceite corre em escopo `system`** (não há tenant antes de resolver o token), então o tenant
  resolvido é passado à mão para o `PlanLimitsService` via `TenantContext.run`. Não é detalhe de
  estilo: sem isso o serviço leria o tenant do contexto do request, que ali está vazio.
- **`role` é limitado a `ADMIN`/`USER` no schema Zod**, não num guard. Um ADMIN de empresa
  convidando um SUPERADMIN seria escalada para fora do tenant; recusar no contrato não depende de
  alguém lembrar de checar.
- **O aceite pede `acceptTerms` de novo.** A empresa ter aceitado os termos antes é ato da empresa,
  não da pessoa.

### Rotas e envs

| Rota                                 | Quem                | O que faz                                      |
| ------------------------------------ | ------------------- | ---------------------------------------------- |
| `POST /admin/invitations`            | ADMIN da empresa    | emite e manda o e-mail                         |
| `GET /admin/invitations`             | ADMIN da empresa    | lista, com o status derivado                   |
| `POST /admin/invitations/:id/resend` | ADMIN da empresa    | reenvia, até `INVITATION_MAX_RESENDS`          |
| `DELETE /admin/invitations/:id`      | ADMIN da empresa    | revoga (`REVOKED`, o token deixa de valer)     |
| `GET /auth/invitations/:token`       | público, sem sessão | preview: "esse link ainda vale? o que é isto?" |
| `POST /auth/invitations/accept`      | público, sem sessão | cria a conta e consome o convite               |

`INVITATION_TTL_HOURS` (default `168`, uma semana) e `INVITATION_MAX_RESENDS` (default `5`). O TTL é
longo o bastante para atravessar um feriado e curto o bastante para uma caixa encaminhada não virar
chave permanente da empresa; o teto de reenvios impede que "reenviar" vire um jeito de martelar um
endereço usando a nossa reputação de envio.

O preview público responde **uma** pergunta e nada mais: e-mail do convidado, nome sugerido, nome da
empresa, validade. Sem e-mail de quem convidou, sem contagem de usuários, sem id da empresa — o
token viaja numa URL por clientes de e-mail e proxies, então tudo que ele destranca é semi-público.

### Criar empresa pelo painel da plataforma

`POST /platform/tenants` (SUPERADMIN) faz o mesmo caminho: cria a empresa, os perfis de sistema
(via `provisionTenant`, o mesmo que o signup e o seed usam — foi extraído justamente para as três
portas não divergirem) e **convida** o primeiro admin, tudo numa transação. **Não cria usuário**:
ninguém do lado do fornecedor deve conhecer a credencial de um cliente, e um endereço digitado por
um operador é boato até alguém prová-lo aceitando. `sendInvitation: false` cria a empresa com o
convite pendente e **sem mandar e-mail** — para importação e para cliente que vai ser configurado
antes da reunião de kickoff; o convite sai depois, pela tela de detalhe.

---

## Login social — decisão de deploy opcional

> **Para agentes de IA:** duas coisas aqui não são preferência, são segurança. **A chave da
> identidade é o `providerAccountId` imutável, nunca o e-mail** — endereço é reciclado, e casar por
> e-mail é como uma pessoa herda a conta de outra. E **e-mail não verificado pelo provedor nunca
> vincula conta**. Se você for "melhorar" o matching, ou aceitar um `email_verified: false` porque
> "o provedor é confiável", pare e **pergunte ao Marcio**.

Vem tudo desligado: `OAUTH_PROVIDERS` vazio significa nenhum botão na tela de login e `404` em toda
rota `/auth/oauth/*`. Ligar é por provider.

### O fluxo

```
GET  /auth/oauth/:provider/start      → 302 para o provedor
←    /auth/oauth/:provider/callback   → 302 de volta para o web app
POST /auth/oauth/complete-signup      → só quando o callback não pôde terminar sozinho
```

O callback termina sozinho nos dois casos comuns: a conta social **já está vinculada**, ou o e-mail
**verificado** bate com um usuário existente (e aí vincula). O terceiro caso — identidade que
ninguém tem — **não** cria empresa direto, mesmo com `PUBLIC_SIGNUP_ENABLED=true`: criar empresa
exige nome e slug, e provedor nenhum tem como saber isso. Derivar do e-mail produziria empresas
chamadas `joao-silva-gmail-com`. Então a identidade verificada é guardada num **ticket de uso único
e vida curta** e o browser vai para uma tela "complete seu cadastro". Nessa tela o e-mail é
**read-only**: ele veio de um claim verificado, e deixar o formulário editá-lo transformaria
identidade provada em identidade autodeclarada.

### Por provider

| Provider   | O que configurar                                                                                              | A pegadinha                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google** | `OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` — Google Cloud Console › Credentials                                     | OIDC direto, o menos surpreendente dos três: `id_token` traz `sub` e `email_verified`.                                                                                                                                                                                                                                                         |
| **Apple**  | `OAUTH_APPLE_CLIENT_ID` (**Services ID**, não o App ID), `_TEAM_ID`, `_KEY_ID`, `_PRIVATE_KEY` (PEM do `.p8`) | O client secret **não é string fixa**: é um JWT **ES256** que a API assina com a `.p8` e **rotaciona** sozinha. O callback chega por **POST** (`response_mode=form_post`), então rota de callback que só aceita GET quebra só na Apple. E o **nome do usuário vem só na primeira autorização** — perdeu ali, nenhum login futuro traz de novo. |
| **GitHub** | `OAUTH_GITHUB_CLIENT_ID` / `_SECRET` — Developer settings › OAuth Apps                                        | **Não tem OIDC**: não existe `id_token` de onde ler o e-mail. Exige uma chamada extra a `/user/emails`, e a API do GitHub **recusa request sem header `User-Agent`**. Só endereço `primary` **e** `verified` é aceito.                                                                                                                         |

`OAUTH_CALLBACK_BASE_URL` precisa bater **caractere a caractere** com o redirect URI registrado em
cada provider — esquema, host, porta, caminho, barra final. O provedor compara a string, não a URL,
e a divergência é rejeitada lá, numa página de erro que a aplicação nunca vê.

`validateEnv` **falha o boot** se um provider listado estiver sem credencial, se a lista não estiver
vazia e `OAUTH_CALLBACK_BASE_URL` faltar, ou se houver nome desconhecido na lista. Não é rigor
gratuito: meio-ligado renderiza um botão que não leva a lugar nenhum, e um typo desliga em silêncio
exatamente o provider que o operador achava ter ligado. Falhar no boot é a única versão disso que o
operador descobre antes do usuário. `NEXT_PUBLIC_OAUTH_PROVIDERS` no web tem que listar os mesmos
nomes; listando a mais, o botão extra dá 404.

### As decisões que não são negociáveis

- **A chave é o `providerAccountId`** (`sub` no Google e na Apple, o id numérico no GitHub), com
  `@@unique([provider, providerAccountId])`. Nunca o e-mail: as pessoas trocam de endereço, e casar
  por e-mail reciclado é como o novo dono de um endereço antigo herda a conta de outra pessoa. O
  `email` na `oauth_accounts` é para **exibição** e pode estar velho.
- **E-mail não verificado não vincula nada.** O callback devolve `unverified_email`. Aceitar
  deixaria qualquer um que consiga criar conta no provedor reivindicar o usuário DontPanic daquele
  endereço.
- **Uma identidade social vale para uma pessoa só.** O unique é global, não por tenant: uma conta
  Google entrando em duas empresas tornaria "entrar com o Google" ambíguo, sem jeito de o usuário
  resolver. E `@@unique([userId, provider])` impede uma segunda conta Google no mesmo usuário, que
  faria uma das duas virar peso morto.
- **`User.passwordHash` é nullable.** Conta que só entra por social não tem senha, e gravar um hash
  aleatório seria uma mentira que o código não consegue distinguir de credencial de verdade.
- **Login com senha numa conta social devolve o erro genérico de sempre** — e paga o mesmo custo de
  Argon2. `verifyPassword(null, …)` verifica contra um hash de algo que ninguém conhece antes de
  responder `false`. Pular esse trabalho faria o tempo de resposta virar oráculo: dá para enumerar,
  cronometrando o formulário de login, quais endereços são social-only — precisamente o conjunto que
  vale a pena phishar. Nunca responda "esta conta usa login social".
- **Login social NÃO pula o 2FA.** Se o usuário tem TOTP ligado, o callback para antes de emitir
  sessão: cria o mesmo ticket que `POST /auth/login` criaria, entrega num cookie curto
  (`TWO_FACTOR_TICKET_COOKIE`, definido no `@dontpanic/shared` para os dois lados lerem o mesmo
  nome) e redireciona para `/login?twofactor=1`, onde a tela troca para o passo do código. O
  `TwoFactorGateGuard` **não** cobre isto — ele só verifica que o 2FA está _habilitado_, nunca que
  esta sessão passou por ele —, então sem esse desvio "entrar com o Google" seria estritamente mais
  fraco que digitar a senha, e o fator que o usuário deliberadamente ligou nunca seria pedido. O
  ticket vai em cookie e não na query string para ficar fora do histórico do navegador, do header
  `Referer` e dos logs de proxy no caminho; é legível por script porque a página precisa colocá-lo
  no corpo do verify, que é exatamente a exposição que o fluxo de senha já aceita (lá o ticket chega
  num JSON que a página lê). Quem limita o estrago é o ticket: cinco minutos, uso único, queimado no
  primeiro verify e inútil sem um código TOTP vivo.
- **Os códigos de erro do callback são grossos de propósito.** `failed` cobre cookie de state ruim,
  troca de code recusada e provedor fora do ar, tudo junto: dizer qual dos três aconteceu só ajuda a
  calibrar.
- **`oauth_accounts` tem `tenantId` denormalizado**, espelhando `User.tenantId` (nulo para
  SUPERADMIN). É o que faz `app.apply_tenant_rls()` proteger a tabela como qualquer outra — política
  de RLS é predicado por tabela, e tabela sem coluna de tenant teria que ficar de fora da varredura
  e ser protegida na mão, que é o tipo de exceção que se esquece.

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
- Não ligar OAuth só de um lado: `OAUTH_PROVIDERS` e `NEXT_PUBLIC_OAUTH_PROVIDERS` listam os mesmos
  nomes, ou o botão extra dá 404. Mesma regra para `PUBLIC_SIGNUP_ENABLED` /
  `NEXT_PUBLIC_SIGNUP_ENABLED` — em desacordo, o formulário aparece e todo submit dá 403.
- Não vincular conta social por e-mail que o provedor não verificou, e **nunca** usar o e-mail como
  chave de identidade: é o `providerAccountId` imutável. Endereço reciclado herdaria conta alheia.
- Não dizer "esta conta usa login social" num erro de login — é o erro genérico de credencial
  inválida, com o mesmo custo de Argon2, senão vira oráculo de enumeração.
- Não disparar o e-mail de convite dentro da transação: um rollback deixa link válido apontando para
  nada. `issue()` grava no `tx` do chamador; o envio é depois do commit.
- Não criar usuário de outra pessoa definindo a senha dela. Para empresa que já existe é convite —
  quem entra escolhe a própria senha e o clique no link é o que prova o endereço.
- Não apontar `DATABASE_URL` para o dono do banco — o RLS deixa de valer. Veja "Multi-tenancy".
- Não emitir sessão num callback de OAuth sem checar `twoFactorEnabled` — o `TwoFactorGateGuard`
  não cobre isso, e o login social viraria um jeito de pular o segundo fator.
- Não usar `@SystemScope()` fora das rotas de autenticação, nem aceitar `tenantId` do cliente.
- Não usar `this.prisma.<model>` direto nos services: é `this.prisma.db.<model>`, que carrega o escopo.
- Não enfileirar job com `systemWide: true` só para "funcionar" — sem tenant o RLS não devolve
  nada e o job mente que deu certo. Veja "Fila de jobs".
- Não subir produção com `QUEUE_DRIVER=memory`: e-mail nenhum sai se o worker não existir.
- **Não fazer `git commit` nem `git push` por conta própria** — só commitar/pushar quando o Marcio pedir explicitamente. Pode editar arquivos à vontade; deixar o versionamento para quando ele solicitar.
