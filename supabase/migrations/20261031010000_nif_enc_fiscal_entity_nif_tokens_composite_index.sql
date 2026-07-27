-- NIF Encryption — Phase 3, Piece 2: composite index for trigram-token search
-- Forward-only migration. Do not fold into the baseline.
--
-- search-entities (supabase/functions/search-entities) queries
-- public.fiscal_entity_nif_tokens as:
--   SELECT fiscal_entity_id, token_hash
--   FROM public.fiscal_entity_nif_tokens
--   WHERE token_hash = ANY($1)
-- then groups the rows by fiscal_entity_id and keeps only the ids whose
-- distinct matched token_hash count equals the number of query tokens
-- (candidate filter, later rechecked against a real substring match — see
-- handler.ts for the full contract).
--
-- The existing idx_fiscal_entity_nif_tokens_token_hash (token_hash) index
-- locates the matching rows but still requires a heap fetch to read
-- fiscal_entity_id for each one. A composite (token_hash, fiscal_entity_id)
-- index lets Postgres answer the whole query as an index-only scan and makes
-- the per-entity aggregation cheap at scale.
--
-- The single-column index becomes redundant once the composite exists
-- (any query plannable against (token_hash) is also plannable against
-- (token_hash, fiscal_entity_id), since the latter is a prefix superset), so
-- it is dropped here. The primary key (fiscal_entity_id, token_hash) is left
-- untouched — it still serves idempotent inserts and ON DELETE CASCADE.

CREATE INDEX IF NOT EXISTS idx_fiscal_entity_nif_tokens_token_hash_fiscal_entity_id
  ON public.fiscal_entity_nif_tokens (token_hash, fiscal_entity_id);

DROP INDEX IF EXISTS public.idx_fiscal_entity_nif_tokens_token_hash;

COMMENT ON INDEX public.idx_fiscal_entity_nif_tokens_token_hash_fiscal_entity_id IS
  'Composite index supporting search-entities: WHERE token_hash = ANY(...) grouped by fiscal_entity_id, as an index-only scan. Supersedes the dropped single-column idx_fiscal_entity_nif_tokens_token_hash.';
