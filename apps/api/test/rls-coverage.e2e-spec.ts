import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { closeOwnerDb, createE2EApp, ownerDb } from './e2e-app';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COBERTURA DE RLS — nenhuma tabela de tenant fica de fora
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O CLAUDE.md diz que "tabela nova com `tenantId` se protege sozinha": basta
 * terminar a migration com `SELECT app.apply_tenant_rls();`. O problema é que
 * "basta" depende de alguém lembrar. Nada no repositório verificava que a
 * chamada aconteceu — e é exatamente esse o pior defeito possível aqui, porque
 * **ele não dá erro nenhum**. Uma tabela que escapou da varredura continua
 * legível e gravável por qualquer empresa, as queries respondem 200, os testes
 * de negócio passam, e o vazamento só aparece quando um cliente vê o dado de
 * outro. RLS que falta não quebra: ele silencia.
 *
 * Por isso este arquivo não testa comportamento de rota nenhuma — ele
 * interroga o **catálogo do Postgres** e trata o schema como a superfície sob
 * teste. A pergunta é sempre a mesma: "existe alguma tabela ligada a um tenant
 * que não esteja trancada?". A resposta certa é uma lista vazia, e quando não
 * for, a mensagem nomeia a tabela e diz o que falta — porque quem vê o
 * vermelho daqui a seis meses não vai ser quem escreveu isto.
 *
 * ── As três exigências, e o que cada uma protege ──────────────────────────
 *
 * 1. `relrowsecurity` (ENABLE ROW LEVEL SECURITY) — sem isso a política até
 *    pode existir, mas o Postgres não a consulta. Tabela aberta.
 *
 * 2. `relforcerowsecurity` (FORCE ROW LEVEL SECURITY) — e esta é a que se
 *    esquece. Sem FORCE, o **dono da tabela** ignora a política. A aplicação
 *    roda sob a role restrita (`dontpanic_app`) e obedeceria de qualquer jeito;
 *    o `migrate`, o `seed` e qualquer script que use `DATABASE_ADMIN_URL`
 *    rodam como dono e não obedeceriam. Pior: o dia em que alguém apontar
 *    `DATABASE_URL` para o dono — o erro que o `PrismaService.assertNotSuperuser`
 *    existe para pegar —, sem FORCE o isolamento evapora sem uma linha de log.
 *    ENABLE sozinho é meia proteção, e meia proteção aqui lê-se como proteção
 *    nenhuma.
 *
 * 3. A política `tenant_isolation` existir. ENABLE + FORCE sem política nenhuma
 *    é "nega tudo": seguro, mas a aplicação para de funcionar. Exigir as três
 *    coisas distingue "trancado" de "trancado e sem chave".
 *
 * ── O que este teste NÃO promete ──────────────────────────────────────────
 *
 * Ele verifica que a política **existe** com o nome certo; não reexecuta o
 * predicado dela para provar que o `USING` está correto. Isso é trabalho do
 * `tenant-isolation.e2e-spec.ts`, que exercita o isolamento de verdade por
 * HTTP, sob a role restrita, com duas empresas. Os dois se completam: aquele
 * prova que a proteção **funciona** numa tabela; este prova que ela **está
 * presente em todas**. Nenhum dos dois sozinho fecha o buraco.
 *
 * ── Determinismo (contrato no topo de `e2e-app.ts`) ───────────────────────
 *
 * Esta suíte é read-only sobre o catálogo: não semeia linha nenhuma, não apaga
 * nenhuma, e portanto não tem prefixo próprio para reivindicar nem cleanup a
 * fazer. Ainda assim ela sobe a app por `createE2EApp()`, e não é cerimônia:
 * é lá que mora o `assertCleanStart()`, que denuncia, com nome, o que a suíte
 * anterior deixou para trás. Uma suíte que pula esse portão transforma-se no
 * lugar onde o lixo alheio passa despercebido.
 */
describe('Cobertura de RLS (e2e)', () => {
  /**
   * Uma tabela do schema `public`, com tudo que precisamos saber sobre ela:
   * como ela se liga a um tenant e em que estado está a proteção.
   */
  type CatalogRow = {
    table: string;
    hasTenantId: boolean;
    hasProfileId: boolean;
    hasUserId: boolean;
    rlsEnabled: boolean;
    rlsForced: boolean;
    hasIsolationPolicy: boolean;
  };

  /**
   * Tabelas que legitimamente não se ligam a empresa nenhuma.
   *
   * A lista é curta de propósito e serve como **portão de revisão**: qualquer
   * tabela nova sem `tenantId`, sem `userId` e sem `profileId` cai aqui e faz a
   * suíte falhar até alguém decidir conscientemente de que lado ela está. O
   * custo de um falso positivo é uma linha nesta lista; o custo de um falso
   * negativo é uma tabela de dados de cliente sem RLS. A assimetria justifica
   * o incômodo.
   */
  const GLOBAL_BY_DESIGN: Record<string, string> = {
    // Catálogo do próprio Prisma. Não é dado de produto e a app nem o lê.
    _prisma_migrations: 'catálogo de migrations do Prisma',
    // Catálogo de planos: é da plataforma, igual para todas as empresas, e é
    // o `Tenant.planId` que diz qual delas usa qual. Não há o que isolar.
    plans: 'catálogo de planos, compartilhado por todas as empresas',
  };

  /**
   * `Object.hasOwn` e não o operador `in`: `'constructor' in objeto` responde
   * `true` por herança de protótipo, e uma tabela com um nome desses passaria a
   * ser considerada global sem nunca ter sido declarada.
   */
  const isGlobalByDesign = (table: string): boolean => Object.hasOwn(GLOBAL_BY_DESIGN, table);

  let app: NestFastifyApplication;
  let catalog: CatalogRow[];

  beforeAll(async () => {
    app = await createE2EApp();

    // Pela conexão de dono (`ownerDb()`): a role restrita da app enxerga o
    // catálogo, mas o bookkeeping de teste que atravessa escopo é por aqui por
    // contrato, e é o dono quem tem visão garantida de tudo que foi criado
    // pelas migrations.
    //
    // `relkind = 'r'` deixa de fora view, índice e sequence — RLS é predicado
    // de tabela. Um `LEFT JOIN LATERAL` não é preciso: `EXISTS` sobre
    // `pg_attribute` já responde "tem a coluna?", e `NOT attisdropped` importa
    // porque coluna removida continua na `pg_attribute` como fantasma e faria
    // uma tabela parecer ligada a tenant muito depois de ter deixado de ser.
    catalog = await ownerDb().$queryRaw<CatalogRow[]>`
      SELECT
        c.relname AS "table",
        EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'tenantId'
                  AND NOT a.attisdropped) AS "hasTenantId",
        EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'profileId'
                  AND NOT a.attisdropped) AS "hasProfileId",
        EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'userId'
                  AND NOT a.attisdropped) AS "hasUserId",
        c.relrowsecurity AS "rlsEnabled",
        c.relforcerowsecurity AS "rlsForced",
        EXISTS (SELECT 1 FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname
                  AND p.policyname = 'tenant_isolation') AS "hasIsolationPolicy"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
  });

  afterAll(async () => {
    await closeOwnerDb();
    await app.close();
  });

  /**
   * Diz, para uma tabela, tudo o que está faltando — no plural, porque saber
   * só do primeiro problema obriga a rodar a suíte três vezes para consertar
   * três coisas.
   */
  function missing(row: CatalogRow): string[] {
    const gaps: string[] = [];
    if (!row.rlsEnabled) gaps.push('ENABLE ROW LEVEL SECURITY');
    if (!row.rlsForced) gaps.push('FORCE ROW LEVEL SECURITY (o dono da tabela ignora a política)');
    if (!row.hasIsolationPolicy) gaps.push('a política tenant_isolation');
    return gaps;
  }

  /** `"users: falta ENABLE …, a política tenant_isolation"` — nomeia e explica. */
  function report(rows: CatalogRow[]): string[] {
    return rows
      .filter((row) => missing(row).length > 0)
      .map((row) => `${row.table}: falta ${missing(row).join(', ')}`);
  }

  /**
   * Guarda contra o pior desfecho possível deste arquivo: a consulta voltar
   * vazia (banco errado, schema não migrado, filtro que deixou de casar) e
   * TODAS as asserções abaixo passarem por vacuidade — verde permanente,
   * cobrindo nada. Um teste de cobertura que não encontrou nada para cobrir
   * está quebrado, não aprovado.
   */
  it('enxerga o schema migrado — senão as asserções abaixo seriam vácuo', () => {
    const names = catalog.map((row) => row.table);
    expect(names).toEqual(expect.arrayContaining(['tenants', 'users', 'profiles', 'permissions']));
    expect(catalog.filter((row) => row.hasTenantId).length).toBeGreaterThanOrEqual(5);
  });

  it('tranca toda tabela que tem tenantId', () => {
    // O caso central: é esta a varredura que `app.apply_tenant_rls()` faz, e é
    // esta a lista que fica desatualizada quando alguém esquece a chamada no
    // fim da migration. A consulta aqui é a mesma da função — de propósito:
    // qualquer tabela que ela protegeria e não protegeu aparece.
    const tenantTables = catalog.filter((row) => row.hasTenantId && !isGlobalByDesign(row.table));
    expect(report(tenantTables)).toEqual([]);
  });

  it('tranca a própria tabela tenants, que se isola pelo id', () => {
    // `tenants` não tem coluna `tenantId` — a chave primária dela É o tenant —,
    // então a varredura por coluna passa ao largo e ela é tratada à parte na
    // migration. Tratamento à parte é exatamente o tipo de coisa que se perde
    // numa refatoração, daí o teste próprio.
    const tenants = catalog.filter((row) => row.table === 'tenants');
    expect(tenants).toHaveLength(1);
    expect(report(tenants)).toEqual([]);
  });

  it('tranca as tabelas ligadas a um usuário (refresh tokens, códigos, etc.)', () => {
    // Tabelas de credencial: sem `tenantId`, isolam-se pelo dono via
    // `app.apply_user_owned_rls()`. Elas NÃO aparecem na varredura por coluna,
    // então dependem de uma lista escrita à mão dentro da migration — e lista à
    // mão é a definição de coisa que fica para trás. A generalização aqui é
    // "tem userId e não tem tenantId", que é precisamente o formato dessa
    // classe de tabela; uma tabela nova nesse formato cai neste teste mesmo que
    // ninguém se lembre de acrescentá-la à lista da migration.
    const userOwned = catalog.filter(
      (row) => row.hasUserId && !row.hasTenantId && !isGlobalByDesign(row.table),
    );
    expect(userOwned.length).toBeGreaterThan(0);
    expect(report(userOwned)).toEqual([]);
  });

  it('tranca as tabelas ligadas a um perfil (permissions)', () => {
    // Mesma história das de credencial, um nível adiante: `permissions` chega
    // ao tenant atravessando `profiles`. Hoje é a única, e é justamente o bloco
    // da migration que rodava sem guarda `IF EXISTS` — o que significa que ele
    // já foi, uma vez, o ponto frágil deste arquivo inteiro.
    const profileOwned = catalog.filter(
      (row) => row.hasProfileId && !row.hasTenantId && !isGlobalByDesign(row.table),
    );
    expect(profileOwned.length).toBeGreaterThan(0);
    expect(report(profileOwned)).toEqual([]);
  });

  it('não deixa passar tabela nova sem nenhum vínculo com empresa', () => {
    // O portão de revisão. Uma tabela sem `tenantId`, sem `userId` e sem
    // `profileId` ou é global de verdade (e entra em GLOBAL_BY_DESIGN, com o
    // motivo escrito) ou é um dado de cliente que ficou fora do isolamento sem
    // que ninguém percebesse. Este teste recusa-se a adivinhar qual das duas.
    const unlinked = catalog
      .filter(
        (row) =>
          !row.hasTenantId &&
          !row.hasUserId &&
          !row.hasProfileId &&
          row.table !== 'tenants' &&
          !isGlobalByDesign(row.table),
      )
      .map(
        (row) =>
          `${row.table}: não se liga a nenhuma empresa. Se for global de propósito, ` +
          'declare-a em GLOBAL_BY_DESIGN com o motivo; se não for, dê-lhe um "tenantId" ' +
          'e termine a migration com SELECT app.apply_tenant_rls().',
      );
    expect(unlinked).toEqual([]);
  });
});
