-- AD360 Enterprise licensing/customization (2026-07)
--
-- Adds the schema for a new catalog product, "AD360 Enterprise" (a user-based
-- licensed bundle SKU, code AD360_ENTERPRISE, seeded into product_catalog by
-- seed.ts). Per-deal licensing context is captured alongside it:
--   - enterprise_deals.ad360_seat_count / ad360_feature_notes — informational
--     only, deliberately NOT wired into product/services revenue or TCV math.
--   - ad360_features — a predefined platform-customization pick-list.
--   - deal_ad360_features — the per-deal selected-features membership set,
--     mirroring the shape of deal_product_interests.
-- Mirrors the Drizzle schema in lib/db/src/schema/lookups.ts (ad360Features)
-- and lib/db/src/schema/deals.ts (ad360SeatCount, ad360FeatureNotes,
-- dealAd360Features).
--
-- Safe to re-run (idempotent): CREATE TABLE / ADD COLUMN all use IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-ad360-enterprise.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.ad360_features (
  id serial PRIMARY KEY,
  code varchar(50) NOT NULL UNIQUE,
  label varchar(120) NOT NULL,
  description text,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.enterprise_deals
  ADD COLUMN IF NOT EXISTS ad360_seat_count integer;
ALTER TABLE public.enterprise_deals
  ADD COLUMN IF NOT EXISTS ad360_feature_notes text;

CREATE TABLE IF NOT EXISTS public.deal_ad360_features (
  deal_id uuid NOT NULL REFERENCES public.enterprise_deals(id) ON DELETE CASCADE,
  feature_id integer NOT NULL REFERENCES public.ad360_features(id),
  PRIMARY KEY (deal_id, feature_id)
);

COMMIT;
