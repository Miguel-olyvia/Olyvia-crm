-- 11/11/2026 — Correções da auditoria «campos sem permissão» (Área 2, RPCs).
-- Só aperta a escrita em falta; quem tem a permissão certa continua igual.
--  1. rpc_duplicate_quote_insert: duplicar/«reabrir com desconto» cria um orçamento novo → quotes.create na organização
--     (a mesma regra de rpc_save_quote para um orçamento novo).
--  2. rpc_snapshot_quote_diagnostic: congela o diagnóstico ao gravar → quotes.edit na organização do orçamento,
--     ou quotes.create quando o orçamento foi criado pelo próprio (gravar um orçamento novo só exige quotes.create).
--  3. recalculate_proposal_value: grava proposals.value → proposals.edit na organização; numa proposta de negócio
--     também negocios.proposta.decidir (perfil ou Papel no Negócio, fn_cat_pode), o mesmo do gatilho trg_negocios_21_doc_permissao.
--  4. fn_pode_enviar_documento (nova função, sem tabelas): usada pelas edge functions send-proposal-email,
--     send-quote-email e send-schedule-invite para recusar no início quem não tem a permissão.
-- Partiu das definições vivas (md5 abaixo); aborta se mudaram entretanto. Grants, SECURITY e search_path iguais.

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.rpc_duplicate_quote_insert(uuid,text,jsonb,jsonb,jsonb)'::regprocedure)) <> '8fc6ca8b22341c3c5e9a9663baa49e0d' THEN
    RAISE EXCEPTION 'public.rpc_duplicate_quote_insert mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.rpc_snapshot_quote_diagnostic(uuid,uuid)'::regprocedure)) <> '71d62f57f785a1a0dcd5808259b2aef3' THEN
    RAISE EXCEPTION 'public.rpc_snapshot_quote_diagnostic mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.recalculate_proposal_value(uuid)'::regprocedure)) <> '5dc0279cba2d2aefe8b693b6f87b3cd1' THEN
    RAISE EXCEPTION 'public.recalculate_proposal_value mudou desde a leitura; rever antes de aplicar';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.rpc_duplicate_quote_insert(p_actor_id uuid, p_source text, p_quote jsonb, p_lines jsonb, p_fees jsonb)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- 20270113900000: duplicar cria um orçamento novo; exige quotes.create na organização (como rpc_save_quote).
    IF NOT public.has_anew_permission_for_org(auth.uid(), 'quotes.create', v_org_id) THEN
      RAISE EXCEPTION 'Sem permissão para criar orçamentos nesta organização (quotes.create).'
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
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price, retail_price_unit,
        uom_id  -- NOVO (20261204204500)
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
        COALESCE((v_line ->> 'cost_price')::numeric, 0),
        nullif(v_line ->> 'retail_price_unit', '')::numeric,
        nullif(v_line ->> 'uom_id', '')::uuid
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_snapshot_quote_diagnostic(p_quote_id uuid, p_deal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quote_org uuid;
  v_deal_org  uuid;
  v_count     integer := 0;
  -- NOVO (20261203080000): mesmos aliases de "assinado" usados por
  -- rpc_list_client_order_documents e pelas triggers de contrato assinado.
  v_signed_aliases text[] := ARRAY['signed', 'assinado'];
  v_frozen    boolean := false;
BEGIN
  IF p_quote_id IS NULL OR p_deal_id IS NULL THEN
    RAISE EXCEPTION 'quote_id e deal_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  SELECT q.organization_id INTO v_quote_org
  FROM public.quotes q
  WHERE q.id = p_quote_id;

  IF v_quote_org IS NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT d.organization_id INTO v_deal_org
  FROM public.deals d
  WHERE d.id = p_deal_id;

  IF v_deal_org IS NULL THEN
    RAISE EXCEPTION 'Negócio não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- SECURITY DEFINER: o RLS não se aplica aqui dentro, por isso o âmbito de
  -- organização é validado à mão nas DUAS pontas — o orçamento e o negócio de onde
  -- se copia o diagnóstico.
  IF v_quote_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR v_deal_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para congelar o diagnóstico deste orçamento'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270113900000: escreve quote_diagnostic_snapshot; exige quotes.edit na organização do orçamento,
  -- ou quotes.create num orçamento criado pelo próprio (gravar um orçamento novo só exige quotes.create).
  IF NOT (
       public.has_anew_permission_for_org(auth.uid(), 'quotes.edit', v_quote_org)
       OR (public.has_anew_permission_for_org(auth.uid(), 'quotes.create', v_quote_org)
           AND EXISTS (SELECT 1 FROM public.quotes q
                       WHERE q.id = p_quote_id
                         AND q.created_by IS NOT DISTINCT FROM public.current_business_user_id()))
     ) THEN
    RAISE EXCEPTION 'Sem permissão para congelar o diagnóstico deste orçamento (quotes.edit)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── NOVO (20261203080000): a fotografia está congelada? ───────────────────
  -- Resolução inversa da de rpc_get_client_order_document: para cada contrato
  -- assinado da mesma organização, o orçamento a que ele corresponde é
  -- cc.quote_id quando existe, e senão a quote mais recente da sua proposta.
  SELECT EXISTS (
    SELECT 1
    FROM public.client_contracts cc
    WHERE cc.organization_id = v_quote_org
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (v_signed_aliases)
      AND COALESCE(
            cc.quote_id,
            (
              SELECT q2.id
              FROM public.quotes q2
              WHERE q2.proposal_id = cc.proposal_id
              ORDER BY q2.created_at DESC
              LIMIT 1
            )
          ) = p_quote_id
  )
  INTO v_frozen;

  IF v_frozen THEN
    -- Sai SEM ESCREVER. Sem exceção: esta RPC corre em cada gravação do orçamento
    -- e não pode fazer falhar o save. Devolve quantas necessidades a fotografia
    -- congelada já tem — é o mesmo significado do valor devolvido no caminho
    -- normal ("necessidades que esta fotografia cobre"), por isso um chamador que
    -- só verifica `> 0` continua a ver a verdade.
    SELECT count(*) INTO v_count
    FROM public.quote_diagnostic_snapshot s
    WHERE s.quote_id = p_quote_id;

    RETURN COALESCE(v_count, 0);
  END IF;

  -- Idempotente: apaga a fotografia anterior deste orçamento e volta a tirá-la.
  DELETE FROM public.quote_diagnostic_snapshot WHERE quote_id = p_quote_id;

  INSERT INTO public.quote_diagnostic_snapshot (
    quote_id, deal_need_id, need_title,
    diag_area_m2, diag_demolir_descricao, diag_demolir_m2,
    diag_proteger_descricao, diag_intervencao_tipo, diag_intervencao_descricao,
    materials, organization_id
  )
  SELECT
    p_quote_id,
    dn.id,
    dn.title,
    dn.diag_area_m2,
    dn.diag_demolir_descricao,
    dn.diag_demolir_m2,
    dn.diag_proteger_descricao,
    dn.diag_intervencao_tipo,
    dn.diag_intervencao_descricao,
    COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'descricao',  m.descricao,
                   'quantity',   m.quantity,
                   'unidade',    m.unidade,
                   'product_id', m.product_id,
                   'service_id', m.service_id
                 )
                 ORDER BY m.sort_order NULLS LAST, m.created_at
               )
        FROM public.deal_need_diagnostic_materials m
        WHERE m.deal_need_id = dn.id
      ),
      '[]'::jsonb
    ),
    v_quote_org
  FROM public.deal_needs dn
  WHERE dn.deal_id = p_deal_id
    -- Só necessidades com levantamento: uma necessidade sem diagnóstico nenhum não
    -- tem fotografia para tirar.
    AND (
      dn.diag_area_m2 IS NOT NULL
      OR dn.diag_demolir_descricao IS NOT NULL
      OR dn.diag_demolir_m2 IS NOT NULL
      OR dn.diag_proteger_descricao IS NOT NULL
      OR dn.diag_intervencao_tipo IS NOT NULL
      OR dn.diag_intervencao_descricao IS NOT NULL
      -- NOVO (20261203080000): os materiais são tabela filha e sobrevivem ao
      -- apagamento dos campos diag_*. Uma necessidade só com materiais TEM
      -- levantamento e tem de chegar ao armazém.
      OR EXISTS (
           SELECT 1
           FROM public.deal_need_diagnostic_materials m
           WHERE m.deal_need_id = dn.id
         )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_proposal_value(p_proposal_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org_id uuid;
  v_value  numeric;
  v_negocio_id uuid;
BEGIN
  IF p_proposal_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT organization_id, negocio_id INTO v_org_id, v_negocio_id
  FROM public.proposals
  WHERE id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270113900000: grava proposals.value; exige proposals.edit na organização
  -- (numa proposta de negócio basta negocios.proposta.decidir, por perfil ou Papel no Negócio).
  IF auth.uid() IS NOT NULL AND NOT (
       public.has_anew_permission_for_org(auth.uid(), 'proposals.edit', v_org_id)
       OR (v_negocio_id IS NOT NULL AND public.fn_cat_pode(v_org_id, 'negocios.proposta.decidir'))
     ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta proposta (proposals.edit)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_value := public.calculate_proposal_value_from_quotes(p_proposal_id);

  UPDATE public.proposals
  SET value         = v_value,
      value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(p_proposal_id),
      updated_at    = now()
  WHERE id = p_proposal_id;

  RETURN v_value;
END;
$function$;

-- 20270113900000: verificação de permissão para as edge functions de envio (chamada logo no início, com o JWT de quem envia).
--   proposal      → proposals.edit na organização da proposta (numa proposta de negócio basta negocios.proposta.enviar, perfil ou Papel)
--   quote         → quotes.edit na organização do orçamento (num orçamento de negócio basta negocios.proposta.enviar)
--   schedule_item → scheduling.items.create ou scheduling.items.edit na organização do agendamento
-- Devolve só verdadeiro/falso; documento inexistente ou de outra organização = falso.
CREATE OR REPLACE FUNCTION public.fn_pode_enviar_documento(p_tipo text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_neg uuid;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_tipo = 'proposal' THEN
    SELECT p.organization_id, p.negocio_id INTO v_org, v_neg FROM public.proposals p WHERE p.id = p_id;
    IF v_org IS NULL THEN RETURN false; END IF;
    RETURN public.has_anew_permission_for_org(auth.uid(), 'proposals.edit', v_org)
        OR (v_neg IS NOT NULL AND public.fn_cat_pode(v_org, 'negocios.proposta.enviar'));
  ELSIF p_tipo = 'quote' THEN
    SELECT q.organization_id, q.negocio_id INTO v_org, v_neg FROM public.quotes q WHERE q.id = p_id;
    IF v_org IS NULL THEN RETURN false; END IF;
    RETURN public.has_anew_permission_for_org(auth.uid(), 'quotes.edit', v_org)
        OR (v_neg IS NOT NULL AND public.fn_cat_pode(v_org, 'negocios.proposta.enviar'));
  ELSIF p_tipo = 'schedule_item' THEN
    SELECT s.organization_id INTO v_org FROM public.schedule_items s WHERE s.id = p_id;
    IF v_org IS NULL THEN RETURN false; END IF;
    RETURN public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.create', v_org)
        OR public.has_anew_permission_for_org(auth.uid(), 'scheduling.items.edit', v_org);
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_pode_enviar_documento(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_pode_enviar_documento(text, uuid) TO authenticated, service_role;
