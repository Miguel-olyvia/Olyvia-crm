-- Fix duplicate-quote audit attribution (quotes-duplicate)
-- 2026-10-12 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- supabase/functions/duplicate-quote/index.ts calls:
--   1. supabaseAdmin.rpc('set_audit_context', { p_user_id, p_source })
--   2. supabaseAdmin.from("quotes").insert(newQuote)
--   3. supabaseAdmin.from("quote_lines").insert(newLines)
--   4. supabaseAdmin.from("quote_fees").insert(newFees)
--
-- Each of these is an independent PostgREST HTTP request, and each PostgREST
-- request runs in its OWN Postgres transaction. set_audit_context() uses
-- set_config(..., true) — SET LOCAL — which is scoped to the transaction that
-- called it (20260625010000_entity_audit_log.sql, section 2). By the time the
-- separate INSERT requests start their own transactions, the GUCs set in step 1
-- are already gone. fn_generic_entity_audit() / fn_audit_quote_child() then read
-- app.audit_user_id / app.audit_source as NULL, and since duplicate-quote uses
-- the SERVICE_ROLE client (no auth.uid()), the trigger's own fallback chain
-- (current_business_user_id() / anew_users row matched on auth.uid()) also
-- resolves to NULL. Result: changed_by and source end up NULL on every
-- duplicated quote's audit rows.
--
-- Solution
-- --------
-- Add ONE SECURITY DEFINER RPC, rpc_duplicate_quote_insert, that performs
-- set_audit_context() followed by the quotes / quote_lines / quote_fees INSERTs
-- inside the SAME PL/pgSQL function body — i.e. a single PostgREST call, a
-- single transaction — so the SET LOCAL context is still active when
-- fn_generic_entity_audit() / fn_audit_quote_child() fire. This mirrors the
-- existing pattern already used by rpc_save_quote
-- (20260812010000_quotes_audit_bypass_and_rpcs.sql) and rpc_duplicate_deal
-- (20260824010000_deals_duplicate_and_stage_rpcs.sql).
--
-- Unlike rpc_save_quote, this RPC does NOT use app.audit_bypass +
-- fn_manual_audit_log(): the original design intent for duplicate-quote is
-- three separately-attributed trigger-sourced audit rows (one INSERT on
-- quotes, one on quote_lines, one on quote_fees) — exactly what would have
-- happened had the original set_audit_context + insert calls shared a
-- transaction. This migration only fixes the transaction-boundary bug, not the
-- number/shape of audit rows produced.
--
-- Also fixes the hardcoded p_source: 'system' (duplicate-quote/index.ts:145),
-- which never reached the trigger anyway because of the bug above. The new
-- source value is 'web_app', consistent with other user-triggered actions
-- (e.g. create-client-portal-access/index.ts calls set_audit_context with
-- p_source: 'web_app').
--
-- Business logic (field selection, quote-number generation, discount-override
-- math, org-scope authorization) stays exactly where it already lives today:
-- in duplicate-quote/index.ts. This RPC only owns the write + audit-context
-- atomicity, matching the "smaller code-only fix" option from the
-- investigation — no re-implementation of authorization logic in SQL, since
-- the Edge Function already resolves caller identity and validates org scope
-- (resolveCallerIdentity / validateOrgScope) before calling this RPC, and this
-- RPC is only ever invoked by that Edge Function's SERVICE_ROLE client.
--
-- Column lists for quote_lines / quote_fees mirror rpc_save_quote's INSERT
-- column lists exactly (every column on those two tables except id/created_at/
-- quote_id, which are excluded/injected the same way) — verified against the
-- quote_lines / quote_fees table definitions in
-- 20260615130000_baseline_new_database.sql.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql       — set_audit_context(), fn_generic_entity_audit()
--   20260627100000_quotes_audit_triggers.sql  — fn_audit_quote_child() (quote_lines/quote_fees)
--   20260812010000_quotes_audit_bypass_and_rpcs.sql — established RPC pattern reference

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
  v_new  public.quotes;
  v_line jsonb;
  v_fee  jsonb;
BEGIN
  -- Attribute every DML below to the acting user, for the lifetime of this
  -- single transaction — this is the fix: set_audit_context() and the INSERTs
  -- that follow now share one PostgREST call / one transaction, so SET LOCAL
  -- survives until the AFTER triggers fire.
  IF p_actor_id IS NOT NULL THEN
    PERFORM public.set_audit_context(p_actor_id, COALESCE(p_source, 'web_app'));
  END IF;

  INSERT INTO public.quotes (
    cliente_id, business_unit_id, obra_endereco, obra_notas, modelo_base,
    desconto_global_percent, moeda, estado, created_by, quote_number,
    validade_dias, site_address_id, deal_id, organization_id, entity_id,
    root_organization_id, title, template_id, client_notes, conditions,
    iva_rate, assigned_to, subtotal, total_fees, total
  )
  VALUES (
    nullif(p_quote ->> 'cliente_id', '')::uuid,
    nullif(p_quote ->> 'business_unit_id', '')::uuid,
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

-- Called exclusively by the duplicate-quote Edge Function's SERVICE_ROLE client.
REVOKE ALL ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  TO authenticated, service_role;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Duplicating a quote as an authenticated user now produces entity_audit_log
--    rows (table_name IN ('quotes','quote_lines','quote_fees')) with a non-NULL
--    changed_by equal to the acting anew_users.id and source = 'web_app':
--      SELECT table_name, operation, changed_by, source
--      FROM entity_audit_log
--      WHERE entity_id = '<new quote id>'
--        AND created_at > now() - interval '1 minute';
--
-- 2. If quote_lines or quote_fees INSERT fails (e.g. bad numeric cast), the
--    whole RPC rolls back — no orphaned quote row is left behind (previously
--    the Edge Function had to manually DELETE the new quote to roll back).
