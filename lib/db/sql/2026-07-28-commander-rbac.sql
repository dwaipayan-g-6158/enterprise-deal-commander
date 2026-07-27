-- RBAC delegation: role + active flag on commanders (2026-07-28)
--
-- Adds the two columns the authorization layer reads on EVERY authenticated
-- request (artifacts/api-server/src/lib/auth.ts -> requireAuth). Mirrors the
-- Drizzle schema in lib/db/src/schema/auth.ts (commanders).
--
-- FAIL-CLOSED BY DEFAULT: the column default is 'reader', so any row created
-- outside the users API — a manual INSERT, a future seed that forgets — is a
-- reader until an admin promotes it.
--
-- The one-time UPDATE below promotes rows that ALREADY EXISTED at migration
-- time, because every one of them had unrestricted write access before this
-- migration ran. An additive migration must not silently revoke access from
-- someone who already had it; the fail-closed default governs the future, not
-- the past.
--
-- Safe to re-run (idempotent):
--   * ADD COLUMN uses IF NOT EXISTS.
--   * The CHECK is added inside a catalog-guarded DO block — Postgres 16 has
--     no ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS.
--   * The promotion UPDATE is guarded by NOT EXISTS (... role = 'admin'), so a
--     second run after the owner demotes someone is a no-op. It can only ever
--     fire again when there are ZERO admins left — a state the users API
--     refuses to create (see assertAnotherActiveAdminRemains in routes/users.ts)
--     — which makes re-running this file the documented break-glass recovery.
--
-- NO INDEX is added, deliberately. `commanders` holds a handful of rows and
-- requireAuth's lookup is by primary key; a (role, is_active) index would
-- never be chosen by the planner and would just be noise to maintain.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-28-commander-rbac.sql

BEGIN;

ALTER TABLE public.commanders
  ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'reader';

ALTER TABLE public.commanders
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commanders'::regclass
      AND conname  = 'commanders_role_check'
  ) THEN
    ALTER TABLE public.commanders
      ADD CONSTRAINT commanders_role_check CHECK (role IN ('admin', 'reader'));
  END IF;
END
$$;

-- The subquery is evaluated against the statement-start snapshot, so this
-- statement's own updates are invisible to it and every pre-existing row is
-- promoted in a single pass.
UPDATE public.commanders
SET role = 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commanders WHERE role = 'admin'
);

COMMIT;

-- Verify — expect at least one active admin and no unexpected role values:
--   SELECT username, role, is_active FROM public.commanders ORDER BY created_at;
