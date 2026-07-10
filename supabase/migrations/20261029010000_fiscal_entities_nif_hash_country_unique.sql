-- NIF Encryption — Phase 2: unique (nif_hash, country_code) + resolve_fiscal_entity RPC
-- Forward-only migration. Do not fold into the baseline.
--
-- Prerequisite for the fiscal-entity-resolve Edge Function (see contract in
-- vault): without a unique constraint to arbitrate, `INSERT ... ON CONFLICT`
-- has nothing to conflict against and two concurrent requests for the same
-- new NIF would create two `fiscal_entities` rows.
--
-- Sections:
--   1. Dedupe pre-existing duplicate (nif_hash, country_code) rows, if any
--      (defensive — expected to be a no-op on databases where nif-backfill
--      has not produced duplicates, but required before a UNIQUE index can
--      be created safely).
--   2. Drop the now-redundant single-column idx_fiscal_entities_nif_hash
--      (the composite unique index below covers the same (nif_hash) prefix).
--   3. Create the partial UNIQUE index on (nif_hash, country_code).
--   4. Create resolve_fiscal_entity(...): the single atomic "find-or-create"
--      RPC used by the fiscal-entity-resolve Edge Function. Restricted to
--      service_role only — this function bypasses the per-org RLS boundary
--      by design (fiscal_entities is a shared, cross-org reference table;
--      see the function contract), so it must never be callable directly by
--      `authenticated`/`anon`.
--
-- Note on CREATE INDEX CONCURRENTLY: not usable inside a transaction block;
-- a plain CREATE UNIQUE INDEX is used here instead, following the same
-- precedent as 20260704000000_bundles_security_fixes.sql (migrations run
-- inside a transaction under Supabase tooling).

-- ============================================================
-- 1. Dedupe pre-existing duplicate (nif_hash, country_code) rows
-- ============================================================
-- Keeps the oldest row (by created_at, then id) per (nif_hash, country_code)
-- group as the survivor. Re-points anew_entity_fiscal_entities links from
-- the duplicate rows to the survivor before deleting the duplicates.
-- fiscal_entity_nif_tokens rows for the duplicates are removed automatically
-- via ON DELETE CASCADE.

CREATE TEMP TABLE _fiscal_entities_dedupe_losers ON COMMIT DROP AS
SELECT r.id AS loser_id, s.id AS survivor_id
FROM (
  SELECT id, nif_hash, country_code,
         row_number() OVER (
           PARTITION BY nif_hash, country_code
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
  FROM public.fiscal_entities
  WHERE nif_hash IS NOT NULL
) r
JOIN (
  SELECT id, nif_hash, country_code
  FROM (
    SELECT id, nif_hash, country_code,
           row_number() OVER (
             PARTITION BY nif_hash, country_code
             ORDER BY created_at ASC NULLS LAST, id ASC
           ) AS rn
    FROM public.fiscal_entities
    WHERE nif_hash IS NOT NULL
  ) ranked
  WHERE rn = 1
) s ON s.nif_hash = r.nif_hash AND s.country_code = r.country_code
WHERE r.rn > 1;

UPDATE public.anew_entity_fiscal_entities aef
SET fiscal_entity_id = l.survivor_id
FROM _fiscal_entities_dedupe_losers l
WHERE aef.fiscal_entity_id = l.loser_id;

DELETE FROM public.fiscal_entities fe
USING _fiscal_entities_dedupe_losers l
WHERE fe.id = l.loser_id;

-- ============================================================
-- 2. Drop the redundant single-column hash index
-- ============================================================
-- The composite unique index created below indexes (nif_hash, country_code),
-- so it already serves any query that filters on nif_hash alone (leftmost
-- column of the composite index).

DROP INDEX IF EXISTS public.idx_fiscal_entities_nif_hash;

-- ============================================================
-- 3. Composite unique index — lookup index AND ON CONFLICT arbiter
-- ============================================================
-- Partial (WHERE nif_hash IS NOT NULL) to tolerate legacy rows that have not
-- been backfilled yet. Every row written by resolve_fiscal_entity() below
-- always sets nif_hash, so this index always arbitrates its ON CONFLICT.

CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_entities_nif_hash_country
  ON public.fiscal_entities (nif_hash, country_code)
  WHERE nif_hash IS NOT NULL;

COMMENT ON INDEX public.uq_fiscal_entities_nif_hash_country IS
  'Enforces one fiscal_entities row per (nif_hash, country_code) and arbitrates the ON CONFLICT clause in resolve_fiscal_entity(). Partial (nif_hash IS NOT NULL) to tolerate not-yet-backfilled legacy rows.';

-- ============================================================
-- 4. resolve_fiscal_entity — atomic find-or-create by (nif_hash, country_code)
-- ============================================================
-- Used exclusively by the fiscal-entity-resolve Edge Function. Global scope
-- by design (fiscal_entities has no organization_id; per-org boundaries are
-- applied one layer up, in anew_entity_fiscal_entities / org-links — see the
-- function contract). Does NOT create any entity/org link; callers do that
-- afterwards with the returned id.
--
-- `xmax = 0` distinguishes a fresh INSERT (existed = false) from a row that
-- already existed and was matched by ON CONFLICT (existed = true), decided
-- atomically by Postgres — no separate SELECT-then-INSERT race window.

CREATE OR REPLACE FUNCTION public.resolve_fiscal_entity(
  p_nif             text,
  p_nif_hash        text,
  p_nif_encrypted   text,
  p_country_code    text,
  p_commercial_name text DEFAULT NULL,
  p_entity_type     text DEFAULT NULL,
  p_created_by      uuid DEFAULT NULL
)
RETURNS TABLE(fiscal_entity_id uuid, existed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_nif_hash IS NULL OR btrim(p_nif_hash) = '' THEN
    RAISE EXCEPTION 'resolve_fiscal_entity: p_nif_hash is required' USING ERRCODE = 'not_null_violation';
  END IF;
  IF p_nif_encrypted IS NULL OR btrim(p_nif_encrypted) = '' THEN
    RAISE EXCEPTION 'resolve_fiscal_entity: p_nif_encrypted is required' USING ERRCODE = 'not_null_violation';
  END IF;
  IF p_country_code IS NULL OR btrim(p_country_code) = '' THEN
    RAISE EXCEPTION 'resolve_fiscal_entity: p_country_code is required' USING ERRCODE = 'not_null_violation';
  END IF;

  RETURN QUERY
  INSERT INTO public.fiscal_entities (
    nif, country_code, commercial_name, nif_encrypted, nif_hash, created_by, metadata
  )
  VALUES (
    p_nif,
    p_country_code,
    p_commercial_name,
    p_nif_encrypted,
    p_nif_hash,
    p_created_by,
    CASE
      WHEN p_entity_type IS NOT NULL THEN jsonb_build_object('entity_type', p_entity_type)
      ELSE '{}'::jsonb
    END
  )
  ON CONFLICT (nif_hash, country_code) DO UPDATE
    SET commercial_name = COALESCE(EXCLUDED.commercial_name, public.fiscal_entities.commercial_name),
        updated_at = now()
  RETURNING public.fiscal_entities.id, (xmax <> 0);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_fiscal_entity(
  text, text, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_fiscal_entity(
  text, text, text, text, text, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.resolve_fiscal_entity(
  text, text, text, text, text, text, uuid
) IS
  'Atomic find-or-create for fiscal_entities by (nif_hash, country_code), global (not org-scoped). Used only by the fiscal-entity-resolve Edge Function via service_role. Never grant to authenticated/anon: it bypasses per-org RLS by design.';
