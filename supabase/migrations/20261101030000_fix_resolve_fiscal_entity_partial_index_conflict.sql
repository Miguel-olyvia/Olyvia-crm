-- NIF Encryption — Fix: resolve_fiscal_entity ON CONFLICT target didn't match
-- the partial unique index, causing 42P10 at runtime for every call
-- ("there is no unique or exclusion constraint matching the ON CONFLICT
-- specification").
--
-- Root cause: uq_fiscal_entities_nif_hash_country (from
-- 20261029010000_fiscal_entities_nif_hash_country_unique.sql) is a PARTIAL
-- unique index (WHERE nif_hash IS NOT NULL). Postgres only lets a partial
-- unique index arbitrate an INSERT ... ON CONFLICT when the ON CONFLICT
-- target repeats the exact same predicate. The original migration's own
-- comment anticipated this ("every row written by resolve_fiscal_entity()
-- always sets nif_hash, so this index always arbitrates its ON CONFLICT")
-- but the function body never added the matching WHERE clause, so Postgres
-- could not find a matching arbiter at all and every call failed.
--
-- Fix (forward-only; 20261029010000 is not edited): add the predicate to the
-- ON CONFLICT target. No other logic in the function changes.

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
  ON CONFLICT (nif_hash, country_code) WHERE nif_hash IS NOT NULL DO UPDATE
    SET commercial_name = COALESCE(EXCLUDED.commercial_name, public.fiscal_entities.commercial_name),
        updated_at = now()
  RETURNING public.fiscal_entities.id, (xmax <> 0);
END;
$$;

COMMENT ON FUNCTION public.resolve_fiscal_entity(
  text, text, text, text, text, text, uuid
) IS
  'Atomic find-or-create for fiscal_entities by (nif_hash, country_code), global (not org-scoped). Used only by the fiscal-entity-resolve Edge Function via service_role. Never grant to authenticated/anon: it bypasses per-org RLS by design. ON CONFLICT target repeats the partial index predicate (WHERE nif_hash IS NOT NULL) - required for Postgres to use uq_fiscal_entities_nif_hash_country as the arbiter (fixed 20261101030000, was 42P10 before).';
