-- NIF Encryption — Phase 1 (additive only)
-- Forward-only migration. Do not fold into the baseline.
--
-- This phase does NOT change any existing behavior. `public.fiscal_entities.nif`
-- remains the single source of truth for the fiscal identifier for now.
-- It only creates the destination columns/table that a later phase will
-- populate (via the Edge Function crypto helpers in
-- supabase/functions/_shared/nifCrypto.ts) and eventually cut reads/writes
-- over to. No trigger, RPC, or application code path is changed here.
--
-- Target end-state (future phases, NOT done here):
--   - nif_encrypted: AES-256-GCM ciphertext of the NIF, for authorized decrypt.
--   - nif_hash: deterministic HMAC-SHA256 of the normalized NIF, for exact-match
--     lookups without decrypting.
--   - fiscal_entity_nif_tokens: HMAC-SHA256 hashes of NIF trigrams, one row per
--     (fiscal_entity_id, token_hash), replacing the plaintext trigram index
--     idx_fiscal_entities_nif_trgm for partial/fuzzy search without exposing
--     the plaintext NIF.
--
-- Sections:
--   1. fiscal_entities: add nif_encrypted / nif_hash columns (nullable)
--   2. fiscal_entity_nif_tokens table + indexes + RLS (service_role only)

-- ============================================================
-- 1. fiscal_entities — additive encryption-target columns
-- ============================================================
-- Adding nullable columns is a metadata-only change on modern Postgres
-- (no table rewrite, no long lock). `nif` keeps being NOT NULL and remains
-- authoritative; these two columns stay NULL until a later backfill phase.

ALTER TABLE public.fiscal_entities
  ADD COLUMN IF NOT EXISTS nif_encrypted text NULL,
  ADD COLUMN IF NOT EXISTS nif_hash text NULL;

COMMENT ON COLUMN public.fiscal_entities.nif IS
  'Plaintext NIF. Still the source of truth in this phase. Will be superseded by nif_encrypted/nif_hash once the encryption migration completes and backfills.';

COMMENT ON COLUMN public.fiscal_entities.nif_encrypted IS
  'AES-256-GCM ciphertext of the NIF (see supabase/functions/_shared/nifCrypto.ts). Populated by the nif-backfill Edge Function (Phase 1) for rows where nif is set and nif_hash was still NULL. No application read path uses this column yet.';

COMMENT ON COLUMN public.fiscal_entities.nif_hash IS
  'Deterministic HMAC-SHA256 of the normalized NIF, for exact-match lookups without decrypting nif_encrypted. Populated by the nif-backfill Edge Function (Phase 1) for rows where nif is set and this column was still NULL. No application read path uses this column yet.';

CREATE INDEX IF NOT EXISTS idx_fiscal_entities_nif_hash
  ON public.fiscal_entities (nif_hash);

-- ============================================================
-- 2. fiscal_entity_nif_tokens — trigram-token destination table
-- ============================================================
-- One row per (fiscal_entity_id, token_hash), where token_hash is the
-- HMAC-SHA256 of a trigram derived from the normalized NIF. This is the
-- eventual replacement for the plaintext trigram index
-- idx_fiscal_entities_nif_trgm, allowing partial-match search on tokenized
-- values instead of plaintext. Unused and unpopulated in this phase.

CREATE TABLE IF NOT EXISTS public.fiscal_entity_nif_tokens (
  fiscal_entity_id uuid NOT NULL REFERENCES public.fiscal_entities (id) ON DELETE CASCADE,
  token_hash        text NOT NULL,

  CONSTRAINT fiscal_entity_nif_tokens_pkey PRIMARY KEY (fiscal_entity_id, token_hash)
);

COMMENT ON TABLE public.fiscal_entity_nif_tokens IS
  'Destination table for the NIF encryption migration: HMAC-SHA256 hashes of NIF trigrams, one row per (fiscal_entity_id, token_hash). Replaces plaintext trigram search on fiscal_entities.nif once populated. Empty and unused in this phase. service_role only (Edge Functions) — no authenticated/anon access.';

CREATE INDEX IF NOT EXISTS idx_fiscal_entity_nif_tokens_token_hash
  ON public.fiscal_entity_nif_tokens (token_hash);

-- ============================================================
-- 2b. RLS — service_role only, deny authenticated/anon by default
-- ============================================================
-- No policies are defined for authenticated or anon: with RLS enabled and no
-- matching policy, both roles are denied all access by default. Only
-- service_role (used by Edge Functions, which bypasses RLS) can read/write
-- this table. This mirrors the "Service role full access" pattern used for
-- public.sms_otp_codes.

ALTER TABLE public.fiscal_entity_nif_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on fiscal_entity_nif_tokens" ON public.fiscal_entity_nif_tokens;
CREATE POLICY "Service role full access on fiscal_entity_nif_tokens"
  ON public.fiscal_entity_nif_tokens
  TO service_role
  USING (true)
  WITH CHECK (true);
