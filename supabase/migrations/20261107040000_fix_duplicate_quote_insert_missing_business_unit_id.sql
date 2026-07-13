-- Fix rpc_duplicate_quote_insert: drop dead reference to quotes.business_unit_id
-- 2026-11-07 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Background
-- ----------
-- public.rpc_duplicate_quote_insert() (most recently redefined in
-- 20261107030000_authorize_rpc_duplicate_quote_insert.sql, originally in
-- 20261012010000_fix_duplicate_quote_audit_attribution.sql) INSERTs into
-- public.quotes listing "business_unit_id" as a target column and reading
-- nullif(p_quote ->> 'business_unit_id', '')::uuid as its value.
--
-- public.quotes has never had a business_unit_id column in this database's
-- actual schema history — it only ever used organization_id / entity_id /
-- root_organization_id as its tenant-scoping model. "business_unit_id" was
-- carried over unchanged from an older naming convention into this function
-- (the exact same drift pattern already fixed for duplicate_proposal()'s
-- "company_id" reference in
-- 20261011010000_fix_duplicate_proposal_company_id_column.sql).
--
-- Effect in production: every call to rpc_duplicate_quote_insert() —
-- i.e. the "Duplicar Orçamento" button in the Quotes UI, and the AI
-- assistant's duplicate_quote tool, both via the duplicate-quote Edge
-- Function — fails with:
--   ERROR: column "business_unit_id" of relation "quotes" does not exist
--
-- Fix: drop business_unit_id from the INSERT column list and its
-- corresponding VALUES expression. Everything else (signature, SECURITY
-- DEFINER, org/actor authorization added in 20261107030000, audit context,
-- line/fee duplication, grants) is preserved unchanged.
--
-- Note: a broader audit for the same drift found two other quote-related
-- functions with the identical problem — archive_quote(uuid) and the legacy
-- duplicate_quote(uuid) (both still reference quotes.company_id and
-- quotes.business_unit_id; archive_quote also targets a
-- public.quotes_archive table that does not exist at all). Neither is
-- referenced anywhere in the application (UI, Edge Functions, or the AI
-- assistant tool set) — both are unused legacy code left untouched here and
-- flagged separately for a follow-up cleanup/review.
--
-- Prerequisites:
--   20261107030000_authorize_rpc_duplicate_quote_insert.sql — function being amended

CREATE OR REPLACE FUNCTION public.rpc_duplicate_quote_insert(
  p_actor_id uuid,     -- anew_users.id to attribute the audit rows to; NULL => trigger fallback
  p_source   text,     -- audit source, e.g. 'web_app'
  p_quote    jsonb,    -- new quotes row payload (same shape as duplicate-quote's newQuote object)
  p_lines    jsonb,    -- array of quote_lines rows, WITHOUT quote_id (this RPC injects it)
  p_fees     jsonb     -- array of quote_fees rows, WITHOUT quote_id (this RPC injects it)
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new             public.quotes;
  v_line            jsonb;
  v_fee             jsonb;
  v_org_id          uuid;
  v_caller_anew_id  uuid;
BEGIN
  -- ── Authorization (skipped only for genuine service_role/no-JWT callers) ──
  IF auth.uid() IS NOT NULL THEN
    v_org_id := nullif(p_quote ->> 'organization_id', '')::uuid;

    IF v_org_id IS NULL
       OR v_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    THEN
      RAISE EXCEPTION 'Not authorized for this organization'
        USING ERRCODE = '42501';
    END IF;

    SELECT au.id INTO v_caller_anew_id
    FROM public.anew_users au
    WHERE au.auth_user_id = auth.uid();

    IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_caller_anew_id THEN
      RAISE EXCEPTION 'Actor mismatch'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Attribute every DML below to the acting user, for the lifetime of this
  -- single transaction — this is the fix: set_audit_context() and the INSERTs
  -- that follow now share one PostgREST call / one transaction, so SET LOCAL
  -- survives until the AFTER triggers fire.
  IF p_actor_id IS NOT NULL THEN
    PERFORM public.set_audit_context(p_actor_id, COALESCE(p_source, 'web_app'));
  END IF;

  INSERT INTO public.quotes (
    cliente_id, obra_endereco, obra_notas, modelo_base,
    desconto_global_percent, moeda, estado, created_by, quote_number,
    validade_dias, site_address_id, deal_id, organization_id, entity_id,
    root_organization_id, title, template_id, client_notes, conditions,
    iva_rate, assigned_to, subtotal, total_fees, total
  )
  VALUES (
    nullif(p_quote ->> 'cliente_id', '')::uuid,
    p_quote ->> 'obra_endereco',
    p_quote ->> 'obra_notas',
    p_quote ->> 'modelo_base',
    (p_quote ->> 'desconto_global_percent')::numeric,
    p_quote ->> 'moeda',
    COALESCE(nullif(p_quote ->> 'estado', ''), 'rascunho'),
    nullif(p_quote ->> 'created_by', '')::uuid,
    nullif(p_quote ->> 'quote_number', ''),
    (p_quote ->> 'validade_dias')::integer,
    nullif(p_quote ->> 'site_address_id', '')::uuid,
    nullif(p_quote ->> 'deal_id', '')::uuid,
    nullif(p_quote ->> 'organization_id', '')::uuid,
    nullif(p_quote ->> 'entity_id', '')::uuid,
    nullif(p_quote ->> 'root_organization_id', '')::uuid,
    p_quote ->> 'title',
    nullif(p_quote ->> 'template_id', '')::uuid,
    p_quote ->> 'client_notes',
    p_quote ->> 'conditions',
    (p_quote ->> 'iva_rate')::numeric,
    nullif(p_quote ->> 'assigned_to', '')::uuid,
    (p_quote ->> 'subtotal')::numeric,
    (p_quote ->> 'total_fees')::numeric,
    (p_quote ->> 'total')::numeric
  )
  RETURNING * INTO v_new;

  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price
      )
      VALUES (
        v_new.id,
        nullif(v_line ->> 'catalog_item_id', '')::uuid,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'service_id', '')::uuid,
        nullif(v_line ->> 'bundle_id', '')::uuid,
        COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
        v_line ->> 'categoria',
        v_line ->> 'descricao_snapshot',
        (v_line ->> 'qt')::numeric,
        (v_line ->> 'custo_material_unit')::numeric,
        (v_line ->> 'custo_mao_obra_unit')::numeric,
        (v_line ->> 'margem_percent')::numeric,
        (v_line ->> 'iva_percent')::numeric,
        (v_line ->> 'int_percent')::numeric,
        (v_line ->> 'discount_percent')::numeric,
        (v_line ->> 'total_sem_iva')::numeric,
        (v_line ->> 'total_com_iva')::numeric,
        (v_line ->> 'total_com_desconto')::numeric,
        (v_line ->> 'ordem')::integer,
        COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
        nullif(v_line ->> 'unidade', ''),
        nullif(v_line ->> 'item_description', ''),
        COALESCE((v_line ->> 'cost_price')::numeric, 0)
      );
    END LOOP;
  END IF;

  IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
    LOOP
      INSERT INTO public.quote_fees (
        quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
      )
      VALUES (
        v_new.id,
        nullif(v_fee ->> 'fee_type_id', '')::uuid,
        (v_fee ->> 'base_amount')::numeric,
        (v_fee ->> 'calculated_value')::numeric,
        (v_fee ->> 'vat_rate')::numeric,
        (v_fee ->> 'vat_amount')::numeric
      );
    END LOOP;
  END IF;

  RETURN v_new;
END;
$$;

-- Grants unchanged from 20261107030000_authorize_rpc_duplicate_quote_insert.sql:
-- authenticated + service_role only, no PUBLIC/anon.
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
