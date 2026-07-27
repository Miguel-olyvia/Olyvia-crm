-- Fix: ensure_organization_entity_identity() trigger matched fiscal_entities
-- by plaintext NIF instead of nif_hash
--
-- Context
-- -------
-- public.ensure_organization_entity_identity() (BEFORE INSERT trigger on
-- anew_organizations, trg_ensure_organization_entity_identity, defined in
-- 20260615130000_baseline_new_database.sql:2224-2267) resolves an existing
-- anew_entity to reuse for a newly-inserted organization by looking up
-- fiscal_entities via:
--
--   v_vat := NULLIF(BTRIM(COALESCE(NEW.metadata->>'vat', NEW.metadata->>'nif')), '');
--   ...
--   SELECT fe.id FROM public.fiscal_entities fe
--   WHERE fe.nif = v_vat AND fe.country_code = v_country;
--
-- That branch only runs when NEW.entity_id IS NULL. Every current
-- anew_organizations insert path (register-company Edge Function, the
-- baseline raw insert, and every org-creation RPC) pre-resolves and sets
-- entity_id explicitly, so this plaintext-NIF branch is dead code today.
-- It is still a latent defect: if entity_id is ever left NULL (a future
-- call site, a manual insert, a bugfix that drops the explicit set), the
-- trigger would compare a cleartext VAT/NIF value straight out of
-- NEW.metadata against fiscal_entities.nif, the very cleartext column the
-- rest of this codebase (resolve_fiscal_entity, search-entities,
-- nif-reveal, every nif_enc_* RPC) has been migrated away from.
--
-- Fix
-- ---
-- Redefine the trigger to resolve by fe.nif_hash instead, reading the hash
-- from NEW.metadata->>'nif_hash' (a new key). It never falls back to
-- comparing NEW.metadata->>'vat'/'nif' against the plaintext nif column:
-- if no hash is present, no fiscal-entity match is attempted at all and a
-- brand new anew_entity is created, exactly like the "no VAT provided"
-- case already handled today. Missing data means "no match", never
-- "compare in the clear" — the same safe-degradation principle already
-- used by resolve_fiscal_entity/search-entities/nif-reveal.
--
-- The only current writer of anew_organizations.metadata with a vat/nif
-- key is supabase/functions/register-company/index.ts (company org insert,
-- metadata: { vat, country }). That function already derives the HMAC key
-- and computes nif_hash via resolveOrCreateCompanyFiscalEntity() for its
-- own resolve_fiscal_entity RPC call; this migration is paired with an
-- edit to that function so it also includes metadata.nif_hash on the
-- anew_organizations insert, using the exact same computed hash.

CREATE OR REPLACE FUNCTION "public"."ensure_organization_entity_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_nif_hash text;
  v_country text;
  v_fiscal_entity_id uuid;
  v_entity_id uuid;
BEGIN
  IF NEW.entity_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only ever match by the pre-computed HMAC hash. Never read/compare
  -- NEW.metadata->>'vat' or ->>'nif' (plaintext) here.
  v_nif_hash := NULLIF(BTRIM(NEW.metadata->>'nif_hash'), '');
  v_country := COALESCE(NULLIF(BTRIM(NEW.metadata->>'country'), ''), 'PT');

  IF v_nif_hash IS NOT NULL THEN
    SELECT fe.id
    INTO v_fiscal_entity_id
    FROM public.fiscal_entities fe
    WHERE fe.nif_hash = v_nif_hash
      AND fe.country_code = v_country
    LIMIT 1;

    IF v_fiscal_entity_id IS NOT NULL THEN
      SELECT ef.entity_id
      INTO v_entity_id
      FROM public.anew_entity_fiscal_entities ef
      WHERE ef.fiscal_entity_id = v_fiscal_entity_id
      LIMIT 1;
    END IF;
  END IF;

  IF v_entity_id IS NULL THEN
    INSERT INTO public.anew_entities (display_name, type, status, created_by)
    VALUES (NEW.name, 'organization', COALESCE(NEW.status, 'active'), NEW.created_by)
    RETURNING id INTO v_entity_id;
  END IF;

  NEW.entity_id := v_entity_id;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."ensure_organization_entity_identity"() IS
  'BEFORE INSERT trigger on anew_organizations. When entity_id is not already set, resolves an existing anew_entity to reuse by matching fiscal_entities.nif_hash (HMAC-SHA256, from NEW.metadata->>''nif_hash'') + country_code, never the plaintext nif column. Missing/absent nif_hash means no match is attempted (a fresh anew_entity is created) — it must never fall back to comparing NEW.metadata->>''vat''/''nif'' in the clear.';
