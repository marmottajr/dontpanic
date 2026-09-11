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
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['permissions'] LOOP
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
  END LOOP;
END $$;

-- Note: user e-mail is unique globally (see User.email in the schema), so no
-- extra partial index is needed for the SUPERADMIN, who belongs to no tenant.
