-- ═══════════════════════════════════════════════════════════════════════════
-- An application role with no special privileges.
--
-- Why: a SUPERUSER (and any role with BYPASSRLS) ignores Row Level Security —
-- including with FORCE ROW LEVEL SECURITY. The database owner IS a superuser,
-- so the application must NOT connect as that user: every policy would be
-- decoration.
--
-- From here on there are two distinct connections:
--   DATABASE_URL        -> restricted role, used by the API at runtime (RLS applies)
--   DATABASE_ADMIN_URL  -> database owner, used only by migrate/seed (DDL)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dontpanic_app') THEN
    -- NOSUPERUSER + NOBYPASSRLS are the entire point of this file.
    CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE dontpanic_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dontpanic_app;
GRANT USAGE ON SCHEMA app TO dontpanic_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dontpanic_app;

-- Data: yes. Structure and policies: no.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dontpanic_app;

-- Tables created by future migrations inherit the same privileges, so adding a
-- module never means coming back here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO dontpanic_app;

-- The application role cannot read the migration history.
-- Conditional: in the shadow database `migrate dev` builds to detect drift,
-- this table does not exist yet when the migration runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM dontpanic_app;
  END IF;
END $$;
