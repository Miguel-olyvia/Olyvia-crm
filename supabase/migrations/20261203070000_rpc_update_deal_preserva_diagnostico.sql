-- rpc_update_deal — deixar de destruir a necessidade que tem diagnóstico.
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- O BUG (HIGH)
-- ------------
-- Na versão viva de rpc_update_deal(uuid, jsonb, uuid, jsonb), o ramo
-- `ELSIF v_existing_need IS NOT NULL` (sem itens no payload) apagava os
-- deal_need_items E a própria linha de deal_needs. Isso era inofensivo enquanto a
-- necessidade só guardava itens; deixou de o ser em 20261203010000, que lhe
-- acrescentou os campos diag_* e a tabela filha deal_need_diagnostic_materials
-- com ON DELETE CASCADE — o levantamento da visita técnica ia atrás.
--
-- Cenário real que se perdia:
--   1. O técnico cria a necessidade e preenche o diagnóstico (área, demolir,
--      proteger, materiais) ANTES de haver serviços escolhidos.
--   2. A necessidade fica sem deal_need_items, por isso o Deals.tsx não os hidrata
--      e a gravação do negócio chega aqui com p_items vazio.
--   3. Qualquer gravação banal no ecrã Deals (mudar de fase, corrigir o título)
--      caía neste ELSIF e levava a necessidade inteira — diagnóstico incluído.
--
-- A CORREÇÃO
-- ----------
-- Quando a necessidade tem levantamento — qualquer diag_* preenchido OU pelo menos
-- um material em deal_need_diagnostic_materials — apaga-se apenas os itens e
-- PRESERVA-SE a linha de deal_needs. O comportamento para necessidades sem
-- diagnóstico nenhum fica exatamente como estava (itens + necessidade apagados),
-- para não alterar o fluxo de quem nunca usa a Fase 1.
--
-- Partida: definição VIVA da função (pg_get_functiondef). Assinatura, parâmetros,
-- tipo de retorno, SECURITY DEFINER e search_path INALTERADOS. Única alteração:
-- o ramo ELSIF e a variável v_need_has_diag que o suporta.
--
-- Prerequisites:
--   20260730010000_deals_audit_bypass_and_rpcs.sql — rpc_update_deal,
--                                                    fn_deal_org_in_scope(),
--                                                    fn_apply_deal_need()
--   20261203010000_diagnostico_deal_needs_campos_e_materiais.sql — deal_needs.diag_*,
--                                                    deal_need_diagnostic_materials
--
-- Só acrescenta. Nenhum DROP. Nenhuma assinatura alterada.

CREATE OR REPLACE FUNCTION public.rpc_update_deal(p_deal_id uuid, p_deal_data jsonb, p_organization_id uuid, p_items jsonb)
 RETURNS deals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_before_deal public.deals;
  v_deal        public.deals;
  v_existing_need uuid;
  v_need_id     uuid;
  v_need_frag   jsonb;
  v_col         text;
  v_diff        jsonb := '{}'::jsonb;
  v_deal_diff   jsonb := '{}'::jsonb;
  -- NOVO (20261203070000): a necessidade existente tem levantamento de Fase 1?
  v_need_has_diag boolean := false;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Authorization parity with deals RLS: org must be visible to the caller.
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Load before-image, scoped to org (mirrors .eq id + .eq organization_id) ──
  SELECT * INTO v_before_deal
  FROM public.deals
  WHERE id = p_deal_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found or access denied.' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── 1. UPDATE the deal (columns identical to handleSubmit dealData) ───────
  UPDATE public.deals
  SET title               = p_deal_data ->> 'title',
      value               = COALESCE((p_deal_data ->> 'value')::numeric, 0),
      value_max           = nullif(p_deal_data ->> 'value_max', '')::numeric,
      stage_id            = (p_deal_data ->> 'stage_id')::uuid,
      root_organization_id = COALESCE(nullif(p_deal_data ->> 'root_organization_id', '')::uuid, root_organization_id),
      lead_id             = nullif(p_deal_data ->> 'lead_id', '')::uuid,
      client_id           = nullif(p_deal_data ->> 'client_id', '')::uuid,
      contact_id          = nullif(p_deal_data ->> 'contact_id', '')::uuid,
      entity_id           = nullif(p_deal_data ->> 'entity_id', '')::uuid,
      probability         = COALESCE((p_deal_data ->> 'probability')::integer, 50),
      description         = nullif(p_deal_data ->> 'description', ''),
      expected_close_date = nullif(p_deal_data ->> 'expected_close_date', '')::date,
      lost_reason         = nullif(p_deal_data ->> 'lost_reason', ''),
      updated_at          = now()
  WHERE id = p_deal_id AND organization_id = p_organization_id
  RETURNING * INTO v_deal;

  -- ── Build the deals diff (only changed cols) ──────────────────────────────
  FOR v_col IN SELECT unnest(ARRAY[
    'title','value','value_max','stage_id','probability','description',
    'expected_close_date','lost_reason','lead_id','client_id','contact_id','entity_id',
    'root_organization_id'
  ])
  LOOP
    IF to_jsonb(v_before_deal) -> v_col IS DISTINCT FROM to_jsonb(v_deal) -> v_col THEN
      v_deal_diff := v_deal_diff || jsonb_build_object(v_col,
        jsonb_build_object('old', to_jsonb(v_before_deal) -> v_col, 'new', to_jsonb(v_deal) -> v_col));
    END IF;
  END LOOP;

  -- ── 2. deal_needs / deal_need_items sync (mirrors the FE branching) ───────
  SELECT id INTO v_existing_need
  FROM public.deal_needs
  WHERE deal_id = p_deal_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    -- Reuse existing need (delete+reinsert items, leave deal_needs untouched — the FE
    -- never writes deal_needs on the edit path) OR create a fresh need when none
    -- exists (the payload title/status is then used for the new row).
    -- p_update_need_columns => false enforces the items-only behavior when the need
    -- already exists; it is a no-op when v_existing_need IS NULL (a new row is created).
    SELECT h.o_need_id, h.o_diff INTO v_need_id, v_need_frag
    FROM public.fn_apply_deal_need(
      p_deal_id,
      v_existing_need,
      jsonb_build_object('title', COALESCE(p_deal_data ->> 'title', 'Itens do pedido'),
                         'status', 'pending', 'sort_order', 0),
      p_items,
      v_actor,
      false
    ) AS h;
    v_diff := v_diff || v_need_frag;
  ELSIF v_existing_need IS NOT NULL THEN
    -- No line items but a need exists.
    --
    -- NOVO (20261203070000): antes de apagar, perguntar se esta necessidade
    -- carrega levantamento de Fase 1. Se carregar, a necessidade é o SÍTIO ONDE O
    -- DIAGNÓSTICO VIVE e não pode ser destruída por uma gravação do ecrã Deals que
    -- nem sequer conhece os campos diag_* — o Deals.tsx só hidrata itens, por isso
    -- "sem itens" nunca significa "sem conteúdo".
    SELECT (
             dn.diag_area_m2 IS NOT NULL
             OR dn.diag_demolir_descricao IS NOT NULL
             OR dn.diag_demolir_m2 IS NOT NULL
             OR dn.diag_proteger_descricao IS NOT NULL
             OR dn.diag_intervencao_tipo IS NOT NULL
             OR dn.diag_intervencao_descricao IS NOT NULL
             OR EXISTS (
                  SELECT 1
                  FROM public.deal_need_diagnostic_materials m
                  WHERE m.deal_need_id = dn.id
                )
           )
    INTO v_need_has_diag
    FROM public.deal_needs dn
    WHERE dn.id = v_existing_need;

    -- Os itens são sempre reescritos a partir do payload, por isso apagam-se em
    -- qualquer dos casos — é o contrato que o FE já assume.
    DELETE FROM public.deal_need_items WHERE deal_need_id = v_existing_need;

    IF COALESCE(v_need_has_diag, false) THEN
      -- Necessidade PRESERVADA: apagá-la levaria atrás, por ON DELETE CASCADE,
      -- todos os deal_need_diagnostic_materials do levantamento.
      v_diff := v_diff || jsonb_build_object('deal_needs',
        jsonb_build_object(
          'id', jsonb_build_object('old', to_jsonb(v_existing_need), 'new', to_jsonb(v_existing_need)),
          'items_count', jsonb_build_object('old', NULL, 'new', to_jsonb(0))
        ));
    ELSE
      -- Comportamento histórico, intacto: necessidade sem diagnóstico e sem itens
      -- não tem razão de existir.
      DELETE FROM public.deal_needs WHERE id = v_existing_need;
      v_diff := v_diff || jsonb_build_object('deal_needs',
        jsonb_build_object('id', jsonb_build_object('old', to_jsonb(v_existing_need), 'new', NULL)));
    END IF;
  END IF;

  -- ── Combine + emit ONE audit row keyed on the deal id ─────────────────────
  IF v_deal_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('deals', v_deal_diff);
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'deals',
      p_deal_id,
      p_organization_id,
      'UPDATE',
      v_diff,
      'web_app'
    );
  END IF;

  RETURN v_deal;
END;
$function$;

COMMENT ON FUNCTION public.rpc_update_deal(uuid, jsonb, uuid, jsonb) IS
  'Grava o negócio e sincroniza a primeira necessidade. Quando p_items vem vazio e a necessidade tem levantamento de Fase 1 (algum diag_* preenchido ou materiais em deal_need_diagnostic_materials), apaga SÓ os deal_need_items e preserva a necessidade — apagá-la destruiria o diagnóstico por CASCADE. Sem diagnóstico, mantém-se o comportamento antigo (itens + necessidade apagados).';
