-- Add real authorization to rpc_duplicate_quote_insert, then re-grant to authenticated
-- 2026-11-07 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Background
-- ----------
-- 20261012010000_fix_duplicate_quote_audit_attribution.sql defined
-- public.rpc_duplicate_quote_insert(p_actor_id, p_source, p_quote, p_lines, p_fees)
-- as SECURITY DEFINER with no authorization of its own — org-scope and actor
-- identity were validated only in supabase/functions/duplicate-quote/index.ts
-- BEFORE calling the RPC via a SERVICE_ROLE client.
-- 20261013010000_revoke_authenticated_rpc_duplicate_quote_insert.sql then
-- revoked EXECUTE from `authenticated`, because granting it let any
-- authenticated user call the RPC directly (bypassing the Edge Function) to
-- forge cross-tenant quotes/quote_lines/quote_fees and forge audit
-- attribution via an arbitrary p_actor_id.
--
-- This migration adds the missing authorization directly inside the function
-- body, so it is safe to call as `authenticated` (needed so duplicate-quote
-- can be scoped to the caller's own JWT instead of service_role, matching the
-- pattern already applied to generate-proposal-ai / import-contract-pdf /
-- quote-ai-assistant / suggest-schedule-assignee):
--
--   1. organization_id — the calling user must have the source quote's
--      organization_id (p_quote->>'organization_id', already resolved
--      server-side in duplicate-quote/index.ts from the DB row, never
--      client input) in get_user_visible_org_ids(auth.uid()) — the same
--      canonical org-scope check used everywhere else in this project
--      (public._shared/auth.ts validateOrgScope on the Edge Function side;
--      this is the DB-side mirror of that check).
--   2. p_actor_id — must equal the calling anew_users.id (resolved via
--      anew_users.auth_user_id = auth.uid(), the standard identity-space
--      bridge used across this project), or NULL. A caller can never forge
--      audit attribution to another user's anew_users.id.
--
-- Both checks are skipped when auth.uid() IS NULL, i.e. when the caller has
-- no JWT at all (a genuine service_role/internal call, which carries no
-- auth.uid() claim) — this keeps the function usable for any future
-- system/cron path while closing the gap for the `authenticated` role, which
-- always has a non-null auth.uid().
--
-- Prerequisites:
--   20261012010000_fix_duplicate_quote_audit_attribution.sql — original function
--   20261013010000_revoke_authenticated_rpc_duplicate_quote_insert.sql — revoke being reversed here

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

-- Re-grant to authenticated now that the function enforces its own
-- authorization; service_role keeps EXECUTE unchanged (auth.uid() IS NULL
-- for that role, so the checks above are skipped for it).
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_duplicate_quote_insert(uuid, text, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. As an authenticated user NOT scoped to the source quote's organization,
--    calling rpc_duplicate_quote_insert directly with that org's
--    organization_id in p_quote now fails with "Not authorized for this
--    organization" (ERRCODE 42501) instead of silently inserting.
-- 2. As an authenticated user scoped to the org, passing p_actor_id equal to
--    another user's anew_users.id now fails with "Actor mismatch"
--    (ERRCODE 42501).
-- 3. As an authenticated user scoped to the org, passing p_actor_id = own
--    anew_users.id (or NULL) succeeds exactly as before.
-- 4. service_role calls (auth.uid() IS NULL) are unaffected — the
--    duplicate-quote Edge Function itself is being migrated to call this RPC
--    via the caller's own scoped (anon-key + Authorization header) client in
--    the same change set, so it will now go through path (3) above, not this
--    service_role bypass.
