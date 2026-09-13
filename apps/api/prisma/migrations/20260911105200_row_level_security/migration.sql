-- ═══════════════════════════════════════════════════════════════════════════
-- Multi-tenant isolation enforced by Postgres (Row Level Security).
--
-- The application filters by tenant too, but that filtering is convenience.
-- The hard guarantee is here: even if a service forgets its `where tenantId`,
-- or an id from another company is forged into a parameter, Postgres returns
-- zero rows and refuses the write.
--
-- Three contexts, all set with `SET LOCAL` inside a transaction:
--   app.current_tenant_id  -> the request's tenant (from the JWT, never the client)
--   app.platform_admin     -> 'on' only for SUPERADMIN, in the /admin panel
--   app.system             -> 'on' only on the authentication path, which has to
--                             resolve the user before it can know the tenant
--
-- With no context at all nothing is visible (fail-closed): `current_setting(…,
-- true)` returns NULL and the comparison is never true.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Nota de manutenção: por que este arquivo foi editado NO LUGAR ──────────
-- O bloco "Profile children" no fim do arquivo ganhou uma guarda `IF EXISTS`
-- depois de a migration já ter sido aplicada em bancos de desenvolvimento, o
-- que muda o checksum que o Prisma guarda em `_prisma_migrations`. As duas
-- saídas foram consideradas:
--
--   (a) uma migration nova que redefinisse o bloco com a guarda — preserva o
--       checksum, MAS não conserta nada: o defeito é a migration **falhar**, e
--       uma migration posterior nunca chega a rodar se a anterior aborta. Num
--       clone que não tenha a tabela `permissions`, o `migrate deploy` morre
--       aqui e o conserto ficaria eternamente atrás da porta que ele mesmo
--       tranca. Corrigir um erro de aplicação só é possível no arquivo que o
--       comete.
--
--   (b) editar no lugar — escolhido. O DontPanic é boilerplate: o caso que
--       importa é o clone novo, que aplica tudo do zero e nunca vê o arquivo
--       antigo. A publicação do instalador foi aposentada e não há instalação
--       em produção presa a este checksum. Para quem JÁ migrou, a edição é
--       semanticamente um no-op — onde `permissions` existia, a guarda passa e
--       o DDL executado é byte a byte o mesmo —, então o único efeito é o aviso
--       de checksum. Quem o encontrar resolve com
--       `prisma migrate resolve --applied 20260911105200_row_level_security`
--       (ou recriando o banco de teste, que é descartável).
--
-- Regra para o futuro: migration que já saiu para produção NÃO se edita. Esta
-- ainda não saiu, e a exceção termina aqui.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

-- ── Reading the context ────────────────────────────────────────────────────
-- NULLIF handles the empty string: ''::uuid would raise a syntax error.
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.platform_admin', true), '') = 'on';
  $$;

CREATE OR REPLACE FUNCTION app.is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.system', true), '') = 'on';
  $$;

-- The single predicate behind every tenant policy.
CREATE OR REPLACE FUNCTION app.tenant_visible(row_tenant_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.is_platform_admin()
        OR app.is_system()
        OR (row_tenant_id IS NOT NULL AND row_tenant_id = app.current_tenant_id());
  $$;

-- ── Applying the policies automatically ────────────────────────────────────
-- Scans the public schema and protects every table that has a tenantId column.
-- Idempotent: call it at the end of any migration that creates tables, which is
-- exactly what keeps a new table from being left out by forgetfulness. The
-- `tenants` table is handled separately (it isolates on its own `id`).
CREATE OR REPLACE FUNCTION app.apply_tenant_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOR t IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'tenantId'
        AND NOT a.attisdropped
        AND c.relname <> '_prisma_migrations'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- FORCE is what makes the table owner obey as well. Without it the
      -- application (which owns the schema) would bypass RLS silently.
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I
           USING (app.tenant_visible("tenantId"))
           WITH CHECK (app.tenant_visible("tenantId"))', t);
    END LOOP;

    -- `tenants` has no tenantId: its primary key IS the tenant.
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'tenants' AND c.relkind = 'r') THEN
      ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
      CREATE POLICY tenant_isolation ON public.tenants
        USING (app.tenant_visible(id))
        WITH CHECK (app.tenant_visible(id));
    END IF;
  END;
  $$;

SELECT app.apply_tenant_rls();

-- ── Credential tables ──────────────────────────────────────────────────────
-- They carry no tenantId (they belong to a user, who belongs to a tenant), so
-- they isolate through their owner with the same predicate.
CREATE OR REPLACE FUNCTION app.apply_user_owned_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'refresh_tokens', 'password_reset_tokens',
      'email_verification_tokens', 'two_factor_backup_codes'
    ] LOOP
      IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
          'CREATE POLICY tenant_isolation ON public.%I
             USING (EXISTS (SELECT 1 FROM public.users u
                            WHERE u.id = %I."userId" AND app.tenant_visible(u."tenantId")))
             WITH CHECK (EXISTS (SELECT 1 FROM public.users u
                            WHERE u.id = %I."userId" AND app.tenant_visible(u."tenantId")))',
          t, t, t);
      END IF;
    END LOOP;
  END;
  $$;

SELECT app.apply_user_owned_rls();

-- ── Profile children, linked by profileId ──────────────────────────────────
-- Mesma disciplina de `app.apply_user_owned_rls()` logo acima: cada entrada da
-- lista é verificada no catálogo ANTES do DDL.
--
-- PORQUÊ a guarda: sem ela, o `ALTER TABLE` corre de cara e a migration inteira
-- morre com `relation "public.permissions" does not exist` se a tabela não
-- estiver lá. O `DROP POLICY IF EXISTS` abaixo já era guardado — a incoerência
-- era só do `ALTER`. E "não estar lá" não é hipótese remota num boilerplate:
-- basta um clone remover o modelo `Permission` (ou renomear a tabela) para o
-- `migrate` explodir num arquivo que ele nunca leu. Pior, o estrago é no meio
-- do caminho: as políticas de tenant já aplicadas acima ficam, a deste bloco
-- não — banco meio protegido, migration marcada como falha.
--
-- A guarda é `IF EXISTS`, não um `CREATE TABLE IF NOT EXISTS`: se a tabela não
-- existe, não há nada a proteger, e pular é o comportamento correto. O que NÃO
-- se pode fazer é pular em silêncio uma tabela que existe — por isso a lista é
-- explícita e o teste `rls-coverage.e2e-spec.ts` cobra, do catálogo, que toda
-- tabela ligada a tenant (direta ou por `profileId`) esteja de fato protegida.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['permissions'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I
           USING (EXISTS (SELECT 1 FROM public.profiles p
                          WHERE p.id = %I."profileId" AND app.tenant_visible(p."tenantId")))
           WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                          WHERE p.id = %I."profileId" AND app.tenant_visible(p."tenantId")))',
        t, t, t);
    END IF;
  END LOOP;
END $$;

-- Note: user e-mail is unique globally (see User.email in the schema), so no
-- extra partial index is needed for the SUPERADMIN, who belongs to no tenant.
