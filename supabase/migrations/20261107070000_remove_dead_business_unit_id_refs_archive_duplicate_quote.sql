-- Remove dead quotes.business_unit_id references from archive_quote() and
-- the legacy duplicate_quote(uuid)
-- 2026-11-07 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Background
-- ----------
-- Follow-up to 20261107040000_fix_duplicate_quote_insert_missing_business_unit_id.sql.
-- A schema-wide audit for the same drift (quotes.business_unit_id was
-- referenced by functions but never exists as a real column on public.quotes)
-- found two more affected functions:
--
--   1. public.archive_quote(uuid) — INSERT INTO public.quotes_archive (...,
--      company_id, business_unit_id, ...) SELECT ... FROM public.quotes.
--      Neither company_id nor business_unit_id exist on public.quotes, and
--      public.quotes_archive does not exist as a table at all. This function
--      is unused dead code (no reference anywhere in the frontend, Edge
--      Functions, or the AI assistant tool set) — confirmed via full source
--      search.
--   2. public.duplicate_quote(uuid) — an older, pre-Edge-Function duplicate
--      path (superseded by public.rpc_duplicate_quote_insert(), which the
--      duplicate-quote Edge Function actually calls). Also references
--      quotes.company_id and quotes.business_unit_id, and additionally
--      inserts into quote_lines/quote_fees using column names
--      (produto_id, preco_unitario_original, preco_unitario_final,
--      desconto_percent, name, description, calculation_type, percentage,
--      fixed_amount, calculated_amount, is_included_in_total, sort_order)
--      that no longer match the current quote_lines/quote_fees schema
--      either. This function is unused dead code — no reference anywhere in
--      the frontend, Edge Functions, or the AI assistant tool set — but it is
--      still granted to `anon` (see 20260615130000 baseline), which is a
--      separate, pre-existing concern from this migration's scope.
--
-- This migration only removes the dead business_unit_id column reference
-- from both functions' INSERT/SELECT lists, per explicit instruction: do not
-- attempt to reintroduce the column or otherwise repair these functions.
-- The remaining problems in both functions (archive_quote's non-existent
-- company_id column and non-existent quotes_archive table; duplicate_quote's
-- non-existent company_id column and its quote_lines/quote_fees column
-- mismatches) are unrelated schema drift, out of scope here, and are left
-- untouched — both functions remain effectively broken/dead and should be
-- reviewed separately for repair or removal.
-- ---------------------------------------------------------------------------

-- 1. archive_quote(uuid) — drop business_unit_id from the archive INSERT/SELECT.
CREATE OR REPLACE FUNCTION "public"."archive_quote"("_quote_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- ── Authorization guard ──────────────────────────────────────────────────
  -- Must be an authenticated user with quotes.manage permission.
  -- Evaluated once here; SECURITY DEFINER means the rest of the body runs as
  -- the function owner, so this check is the only RLS gate.
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'archive_quote: unauthenticated call rejected'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission((SELECT auth.uid()), 'quotes.manage') THEN
    RAISE EXCEPTION 'archive_quote: caller lacks quotes.manage permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- ────────────────────────────────────────────────────────────────────────

  INSERT INTO public.quotes_archive (
    id, modelo_base, cliente_id, obra_endereco, obra_notas, estado, moeda,
    desconto_global_percent, company_id, created_by,
    created_at, updated_at, archived_at, archived_by,
    organization_id, entity_id, root_organization_id, title, template_id,
    deal_id, quote_number, validade_dias, subtotal, total_fees, total,
    site_address_id, proposal_id, request_date, delivered_at, delivery_time_hours
  )
  SELECT
    id, modelo_base, cliente_id, obra_endereco, obra_notas, estado, moeda,
    desconto_global_percent, company_id, created_by,
    created_at, updated_at, now(), auth.uid(),
    organization_id, entity_id, root_organization_id, title, template_id,
    deal_id, quote_number, validade_dias, subtotal, total_fees, total,
    site_address_id, proposal_id, request_date, delivered_at, delivery_time_hours
  FROM public.quotes
  WHERE id = _quote_id;

  DELETE FROM public.quotes WHERE id = _quote_id;

  RETURN true;
EXCEPTION
  -- Re-raise our own authorization errors so callers see a clear message.
  WHEN insufficient_privilege THEN
    RAISE;
  -- All other errors return false (preserving original behaviour).
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

ALTER FUNCTION "public"."archive_quote"("_quote_id" "uuid") OWNER TO "postgres";

-- 2. duplicate_quote(uuid) — drop business_unit_id from the new-quote INSERT.
CREATE OR REPLACE FUNCTION "public"."duplicate_quote"("source_quote_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  new_quote_id UUID;
  source_quote quotes%ROWTYPE;
  new_quote_number TEXT;
BEGIN
  -- Buscar orçamento original
  SELECT * INTO source_quote FROM quotes WHERE id = source_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Gerar novo número de orçamento
  SELECT 'ORC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD((COALESCE(MAX(SUBSTRING(quote_number FROM '[0-9]+$')::INT), 0) + 1)::TEXT, 4, '0')
  INTO new_quote_number
  FROM quotes
  WHERE company_id = source_quote.company_id
    AND quote_number LIKE 'ORC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '%';

  -- Criar novo orçamento
  INSERT INTO quotes (
    cliente_id, company_id, obra_endereco, obra_notas,
    modelo_base, desconto_global_percent, moeda, estado, created_by,
    quote_number, validade_dias, proposal_id, request_date
  )
  VALUES (
    source_quote.cliente_id,
    source_quote.company_id,
    source_quote.obra_endereco,
    source_quote.obra_notas,
    source_quote.modelo_base,
    source_quote.desconto_global_percent,
    source_quote.moeda,
    'rascunho',
    auth.uid(),
    new_quote_number,
    source_quote.validade_dias,
    source_quote.proposal_id,
    NULL -- Nova data de pedido
  )
  RETURNING id INTO new_quote_id;

  -- Copiar linhas do orçamento
  INSERT INTO quote_lines (
    quote_id, produto_id, service_id, descricao_snapshot, qty,
    preco_unitario_original, preco_unitario_final, desconto_percent,
    iva_percent, total_sem_iva, total_com_iva, ordem, unit_of_measure,
    product_attributes
  )
  SELECT
    new_quote_id, produto_id, service_id, descricao_snapshot, qty,
    preco_unitario_original, preco_unitario_final, desconto_percent,
    iva_percent, total_sem_iva, total_com_iva, ordem, unit_of_measure,
    product_attributes
  FROM quote_lines
  WHERE quote_id = source_quote_id;

  -- Copiar taxas do orçamento
  INSERT INTO quote_fees (
    quote_id, fee_type_id, name, description, calculation_type,
    percentage, fixed_amount, calculated_amount, is_included_in_total,
    sort_order
  )
  SELECT
    new_quote_id, fee_type_id, name, description, calculation_type,
    percentage, fixed_amount, calculated_amount, is_included_in_total,
    sort_order
  FROM quote_fees
  WHERE quote_id = source_quote_id;

  -- Registar no log de alterações
  INSERT INTO entity_change_log (entity_type, entity_id, company_id, action, changed_by, metadata)
  VALUES ('quote', new_quote_id, source_quote.company_id, 'duplicate', auth.uid(),
    jsonb_build_object('source_id', source_quote_id));

  RETURN new_quote_id;
END;
$_$;

ALTER FUNCTION "public"."duplicate_quote"("source_quote_id" "uuid") OWNER TO "postgres";
