-- ============================================================
-- 20270109100000_custos_linhas_orcamento_rpc
-- ============================================================
-- Ronda 2 de permissões (05/11/2026), custos — P1 da auditoria (A/P7): quote_lines.cost_price e as outras colunas de
-- custo leem-se com só quotes.view. MUDANÇA DE FUNCIONAMENTO APROVADA. Esta migração prepara o fecho; o SELECT das
-- colunas só é revogado na 20270109110000, depois de o ecrã e as edge functions lerem por aqui.
--
--  1. fn_quote_custos_pode(org): quotes.view_costs ou quotes.manage na organização (ou numa acima, como o registo de
--     auditoria: has_anew_permission_in_org_or_ancestor), pelo Papel no Negócio (fn_neg_papel_permite, como fn_cat_pode),
--     ou admin de sistema (is_system_admin_user, como as policies *_custos).
--  2. rpc_quote_lines_custos(ids de orçamentos): as linhas que a pessoa vê (o critério da quote_lines_select_policy e do
--     acesso de suporte) com pode_ver_custos e, só quando pode, as colunas de custo. A todas devolve preco_un_calculado:
--     o preço unitário que o ecrã calcula a partir do custo (getLineUnitPrice: custo × (1+markup) × (1+intermediação),
--     fechado ao cêntimo, em vírgula flutuante como o JavaScript) — é o que deixa quem não vê custos continuar a editar.
--     Mesmo padrão de inv_custos_movimentos (stocks).
--  3. ops_v_orcamento (security invoker) lia o custo de quote_lines: passa a lê-lo por fn_quote_custo_previsto, que o
--     devolve a NULL a quem não pode. Mesmas colunas, mesmos tipos.
--  4. rpc_save_quote: apaga e volta a inserir as linhas com o custo que vem do ecrã. Quem não vê custos manda as linhas
--     que não mexeu com custos_ocultos = true e o id da linha; o custo, a mão de obra, a margem e o cost_price
--     verdadeiros vêm da linha guardada (mesmo artigo, mesma organização). Sem a marca grava-se como sempre.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM 'f3e45a0897c1d5f90b8505d7062e849d' THEN
    RAISE EXCEPTION 'rpc_save_quote mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  SELECT md5(pg_get_viewdef('public.ops_v_orcamento'::regclass)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '1fde939be6936c86976997f0986e11d6' THEN
    RAISE EXCEPTION 'ops_v_orcamento mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  IF to_regprocedure('public.fn_quote_custos_pode(uuid)') IS NOT NULL
     OR to_regprocedure('public.rpc_quote_lines_custos(uuid[])') IS NOT NULL
     OR to_regprocedure('public.fn_quote_custo_previsto(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'funções de custos das linhas já existem: rever antes de aplicar';
  END IF;
END
$guarda$;

-- 1 ───────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_quote_custos_pode(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270109100000: quem vê os custos e as margens das linhas de um orçamento desta organização.
  SELECT auth.uid() IS NOT NULL AND p_org IS NOT NULL AND (
    public.is_system_admin_user(auth.uid())
    OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['quotes.view_costs', 'quotes.manage']) AS c(code)
      WHERE public.has_anew_permission_in_org_or_ancestor(auth.uid(), c.code, p_org)
         OR public.fn_neg_papel_permite(p_org, c.code)
    )
  )
$function$;

REVOKE ALL ON FUNCTION public.fn_quote_custos_pode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_quote_custos_pode(uuid) TO authenticated;

-- 2 ───────────────────────────────────────────────────────────
CREATE FUNCTION public.rpc_quote_lines_custos(p_quote_ids uuid[])
 RETURNS TABLE(
   id uuid, quote_id uuid, pode_ver_custos boolean,
   cost_price numeric, custo_material_unit numeric, custo_mao_obra_unit numeric, margem_percent numeric,
   custo_un_exato numeric, custo_un_origem numeric, mao_obra_congelada numeric,
   preco_un_calculado double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- 20270109100000: as linhas dos orçamentos pedidos que a pessoa vê (o mesmo critério de quote_lines_select_policy e
  -- de system_admin_support_access); os custos só onde fn_quote_custos_pode(organização do orçamento). As outras
  -- linhas não vêm.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(cardinality(p_quote_ids), 0) > 500 THEN
    RAISE EXCEPTION 'Demasiados orçamentos num pedido (máximo 500).' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH vq AS (
    SELECT q.id AS qid, public.fn_quote_custos_pode(q.organization_id) AS pode
    FROM public.quotes q
    WHERE q.id = ANY (p_quote_ids)
      AND (
        (q.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
          AND public.has_anew_permission(v_uid, 'quotes.view'))
        OR (public.is_system_admin(v_uid)
          AND (public.has_active_support_access(q.organization_id) OR public.has_active_support_access(q.root_organization_id)))
      )
  )
  SELECT l.id, l.quote_id, vq.pode,
    CASE WHEN vq.pode THEN l.cost_price END,
    CASE WHEN vq.pode THEN l.custo_material_unit END,
    CASE WHEN vq.pode THEN l.custo_mao_obra_unit END,
    CASE WHEN vq.pode THEN l.margem_percent END,
    CASE WHEN vq.pode THEN l.custo_un_exato END,
    CASE WHEN vq.pode THEN l.custo_un_origem END,
    CASE WHEN vq.pode THEN l.mao_obra_congelada END,
    -- getLineUnitPrice (quoteLinePricing.ts) só pela parte do custo: Math.round((n + Number.EPSILON) * 100) / 100,
    -- com as mesmas operações em float8 para dar o mesmo número que o navegador.
    CASE WHEN coalesce(l.custo_material_unit, 0)::float8 + coalesce(l.custo_mao_obra_unit, 0)::float8 = 0 THEN 0::float8
         ELSE floor(((coalesce(l.custo_material_unit, 0)::float8 + coalesce(l.custo_mao_obra_unit, 0)::float8)
                     * (1::float8 + coalesce(l.margem_percent, 0)::float8 / 100::float8)
                     * (1::float8 + coalesce(l.int_percent, 0)::float8 / 100::float8)
                     + 2.220446049250313e-16::float8) * 100::float8 + 0.5::float8) / 100::float8
    END
  FROM public.quote_lines l
  JOIN vq ON vq.qid = l.quote_id
  ORDER BY l.quote_id, l.ordem;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_quote_lines_custos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_quote_lines_custos(uuid[]) TO authenticated;

-- 3 ───────────────────────────────────────────────────────────
CREATE FUNCTION public.fn_quote_custo_previsto(p_quote_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270109100000: o custo previsto do orçamento (soma de custo × quantidade), a NULL para quem não vê custos.
  SELECT CASE WHEN public.fn_quote_custos_pode(q.organization_id) THEN
    COALESCE((SELECT sum((COALESCE(l.custo_material_unit, 0) + COALESCE(l.custo_mao_obra_unit, 0)) * COALESCE(l.qt, 1))
              FROM public.quote_lines l WHERE l.quote_id = q.id), 0)
  END
  FROM public.quotes q WHERE q.id = p_quote_id
$function$;

REVOKE ALL ON FUNCTION public.fn_quote_custo_previsto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_quote_custo_previsto(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.ops_v_orcamento WITH (security_invoker = true) AS
 SELECT id,
    organization_id,
    cliente_id,
    COALESCE(quote_number, '—'::text) AS numero,
    COALESCE(NULLIF(btrim(title), ''::text), 'Sem título'::text) AS titulo,
    obra_endereco,
    estado,
    accepted_at,
    total,
    moeda,
    (public.fn_quote_custo_previsto(q.id))::numeric(12,2) AS custo_previsto,
    (( SELECT count(*) AS count
           FROM quote_lines l
          WHERE (l.quote_id = q.id)))::integer AS linhas,
    (EXISTS ( SELECT 1
           FROM ops_ordem o
          WHERE (o.orcamento_id = q.id))) AS tem_obra
   FROM quotes q
  WHERE ((deleted_at IS NULL) AND (estado = ANY (ARRAY['aceite'::text, 'finalizado'::text])));

-- 4 ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_save_quote(p_quote_id uuid, p_quote_data jsonb, p_lines jsonb, p_fees jsonb, p_totals jsonb, p_inline_quotes jsonb DEFAULT '[]'::jsonb, p_diagnostic_suggestions jsonb DEFAULT '[]'::jsonb)
 RETURNS quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor        uuid;
  v_saved_id     uuid;
  v_org_id       uuid;
  v_before       public.quotes;
  v_after        public.quotes;
  v_quote        public.quotes;
  v_entity_id    uuid;
  v_proposal_id  uuid;
  v_deal_id      uuid;
  v_root_org_id  uuid;
  v_line         jsonb;
  v_line_idx     bigint;
  v_line_id      uuid;
  -- 20270109100000: custos das linhas que o ecrã não mostrou a quem grava sem quotes.view_costs/quotes.manage
  v_old_lines    jsonb := '{}'::jsonb;
  v_src          jsonb;
  v_cm           numeric;
  v_cmo          numeric;
  v_mg           numeric;
  v_cp           numeric;
  v_retail       numeric;
  v_int          numeric;
  v_lines_audit  jsonb := '[]'::jsonb;
  v_suggestion   jsonb;
  v_fee          jsonb;
  v_existing_link uuid;
  v_link_op      text;           -- 'update' | 'insert' | NULL
  v_link_id      uuid;
  v_proposal_val numeric;
  v_proposal_old numeric;

  -- inline-quote locals
  v_iq           jsonb;
  v_iq_data      jsonb;
  v_iq_line      jsonb;
  v_iq_id        uuid;
  v_iq_ids       uuid[] := ARRAY[]::uuid[];

  -- diff accumulators
  v_diff         jsonb := '{}'::jsonb;
  v_quote_diff   jsonb := '{}'::jsonb;
  v_key          text;
  v_new_json     jsonb;
  v_old_json     jsonb;
  v_editable_cols text[] := ARRAY[
    'deal_id','cliente_id','organization_id','root_organization_id','entity_id',
    'title','obra_notas','modelo_base','desconto_global_percent','estado',
    'validade_dias','iva_rate','client_notes','conditions','proposal_id',
    'assigned_to','template_id'
  ];
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve target org from the incoming payload ──────────────────────────
  v_org_id      := nullif(p_quote_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_quote_data ->> 'root_organization_id', '')::uuid;
  v_entity_id   := nullif(p_quote_data ->> 'entity_id', '')::uuid;
  v_proposal_id := nullif(p_quote_data ->> 'proposal_id', '')::uuid;
  v_deal_id     := nullif(p_quote_data ->> 'deal_id', '')::uuid;

  -- ── Authorization parity with quotes RLS: org must be in caller's scope ───
  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. quotes: INSERT (new) or UPDATE metadata (edit)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    INSERT INTO public.quotes (
      deal_id, cliente_id, organization_id, root_organization_id, entity_id,
      title, obra_notas, modelo_base, desconto_global_percent, estado,
      validade_dias, iva_rate, client_notes, conditions, proposal_id,
      assigned_to, template_id, created_by
    )
    VALUES (
      v_deal_id,
      nullif(p_quote_data ->> 'cliente_id', '')::uuid,
      v_org_id,
      v_root_org_id,
      v_entity_id,
      nullif(p_quote_data ->> 'title', ''),
      p_quote_data ->> 'obra_notas',
      p_quote_data ->> 'modelo_base',
      COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
      COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
      (p_quote_data ->> 'validade_dias')::integer,
      (p_quote_data ->> 'iva_rate')::numeric,
      nullif(p_quote_data ->> 'client_notes', ''),
      nullif(p_quote_data ->> 'conditions', ''),
      v_proposal_id,
      nullif(p_quote_data ->> 'assigned_to', '')::uuid,
      nullif(p_quote_data ->> 'template_id', '')::uuid,
      v_actor
    )
    RETURNING * INTO v_after;

    v_saved_id := v_after.id;

  ELSE
    -- Load the before-image and enforce org scope on the existing row too.
    SELECT * INTO v_before FROM public.quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
      RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.quotes
    SET deal_id                 = v_deal_id,
        cliente_id              = nullif(p_quote_data ->> 'cliente_id', '')::uuid,
        organization_id         = v_org_id,
        root_organization_id    = v_root_org_id,
        entity_id               = v_entity_id,
        title                   = nullif(p_quote_data ->> 'title', ''),
        obra_notas              = p_quote_data ->> 'obra_notas',
        modelo_base             = p_quote_data ->> 'modelo_base',
        desconto_global_percent = COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
        estado                  = COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
        validade_dias           = (p_quote_data ->> 'validade_dias')::integer,
        iva_rate                = (p_quote_data ->> 'iva_rate')::numeric,
        client_notes            = nullif(p_quote_data ->> 'client_notes', ''),
        conditions              = nullif(p_quote_data ->> 'conditions', ''),
        proposal_id             = v_proposal_id,
        assigned_to             = nullif(p_quote_data ->> 'assigned_to', '')::uuid,
        template_id             = nullif(p_quote_data ->> 'template_id', '')::uuid
    WHERE id = p_quote_id
    RETURNING * INTO v_after;

    v_saved_id := p_quote_id;

    -- delete-all children (mirrors handleSave: delete quote_lines on edit; fees below)
    -- 20270109100000: guarda as linhas antes de as apagar. Quem grava sem ver os custos recebeu do ecrã um custo que não
    -- é o verdadeiro (o ecrã não o tem: rpc_quote_lines_custos); essas linhas vêm marcadas com custos_ocultos e o custo
    -- verdadeiro volta a ser gravado a partir daqui.
    SELECT coalesce(jsonb_object_agg(ql.id::text, to_jsonb(ql)), '{}'::jsonb) INTO v_old_lines
    FROM public.quote_lines ql WHERE ql.quote_id = p_quote_id;

    DELETE FROM public.quote_lines WHERE quote_id = p_quote_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. quote_lines: insert the full computed set (both new and edit paths)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line, v_line_idx IN
      SELECT value, ordinality - 1
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(value, ordinality)
    LOOP
      -- 20270109100000: por omissão grava-se o custo que veio do ecrã (como sempre). Uma linha marcada com
      -- custos_ocultos = true (o ecrã de quem não vê custos não a alterou: mesmo artigo, mesmo custo que recebeu) e com o
      -- id de uma linha existente da mesma organização fica com o custo, a mão de obra, a margem e o cost_price
      -- VERDADEIROS dessa linha. Se o preço de venda definido mudou, a margem passa a ser o markup que o reproduz
      -- (o mesmo cálculo do ecrã: markupFromCostAndPrice).
      v_cm  := (v_line ->> 'custo_material_unit')::numeric;
      v_cmo := (v_line ->> 'custo_mao_obra_unit')::numeric;
      v_mg  := (v_line ->> 'margem_percent')::numeric;
      v_cp  := COALESCE((v_line ->> 'cost_price')::numeric, 0);
      v_src := NULL;
      IF (v_line -> 'custos_ocultos') = 'true'::jsonb
         AND (v_line ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_src := v_old_lines -> lower(v_line ->> 'id');
        IF v_src IS NULL THEN
          SELECT to_jsonb(ql) INTO v_src
          FROM public.quote_lines ql JOIN public.quotes q ON q.id = ql.quote_id
          WHERE ql.id = (v_line ->> 'id')::uuid AND q.organization_id = v_org_id;
        END IF;
        IF v_src IS NOT NULL
           AND lower(v_src ->> 'product_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'product_id', ''))
           AND lower(v_src ->> 'service_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'service_id', ''))
           AND lower(v_src ->> 'bundle_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'bundle_id', ''))
           AND lower(v_src ->> 'item_supplier_id') IS NOT DISTINCT FROM lower(nullif(v_line ->> 'item_supplier_id', '')) THEN
          v_cm  := (v_src ->> 'custo_material_unit')::numeric;
          v_cmo := (v_src ->> 'custo_mao_obra_unit')::numeric;
          v_mg  := (v_src ->> 'margem_percent')::numeric;
          v_cp  := COALESCE((v_src ->> 'cost_price')::numeric, 0);
          v_retail := nullif(v_line ->> 'retail_price_unit', '')::numeric;
          v_int := COALESCE((v_line ->> 'int_percent')::numeric, 0);
          IF v_retail IS DISTINCT FROM (v_src ->> 'retail_price_unit')::numeric AND v_retail > 0
             AND COALESCE(v_cm, 0) + COALESCE(v_cmo, 0) > 0 THEN
            v_mg := greatest(0, round(((v_retail / (1 + v_int / 100)) / (COALESCE(v_cm, 0) + COALESCE(v_cmo, 0)) - 1) * 100, 2));
          END IF;
        ELSE
          v_src := NULL;
        END IF;
      END IF;
      -- o registo de auditoria não leva o custo inventado pelo ecrã
      v_lines_audit := v_lines_audit || jsonb_build_array(
        CASE WHEN v_src IS NOT NULL
             THEN v_line - ARRAY['custo_material_unit', 'custo_mao_obra_unit', 'margem_percent', 'cost_price']
             ELSE v_line END);

      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
        retail_price_unit, visible_to_client, source_deal_need_item_id,
        source_deal_need_id,
        uom_id
      )
      VALUES (
        v_saved_id,
        nullif(v_line ->> 'catalog_item_id', '')::uuid,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'service_id', '')::uuid,
        nullif(v_line ->> 'bundle_id', '')::uuid,
        nullif(v_line ->> 'item_supplier_id', '')::uuid,
        COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
        v_line ->> 'categoria',
        v_line ->> 'descricao_snapshot',
        (v_line ->> 'qt')::numeric,
        v_cm,
        v_cmo,
        v_mg,
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
        v_cp,
        nullif(v_line ->> 'retail_price_unit', '')::numeric,
        COALESCE((v_line ->> 'visible_to_client')::boolean, true),
        -- NOVO (20261203030000): origem da linha. Ausente/'' => NULL, exatamente
        -- como todas as outras referências opcionais desta função.
        nullif(v_line ->> 'source_deal_need_item_id', '')::uuid,
        -- NOVO (20261203060000): a origem ESTÁVEL — é esta que serve de chave à
        -- idempotência da importação; a de cima é volátil (delete+reinsert).
        nullif(v_line ->> 'source_deal_need_id', '')::uuid,
        -- NOVO (20261204204500): unidade da linha; units_per_uom é calculado
        -- no servidor pelo gatilho trg_quote_lines_units_per_uom.
        nullif(v_line ->> 'uom_id', '')::uuid
      )
      RETURNING id INTO v_line_id;

      -- Fecha o gap de quote_diagnostic_area_suggestions nunca ser escrita:
      -- para cada sugestão da Fase 1 cujo line_index aponta para a posição
      -- (0-based) desta linha dentro de p_lines, grava a auditoria de origem
      -- (regra ou IA) já ligada ao id real da linha que acabou de ser inserida.
      -- Nunca se aplica a p_inline_quotes — essas sugestões só se tornam
      -- linhas "principais" (ver 7º parâmetro, comentário acima da função).
      IF p_diagnostic_suggestions IS NOT NULL AND jsonb_typeof(p_diagnostic_suggestions) = 'array' THEN
        FOR v_suggestion IN
          SELECT * FROM jsonb_array_elements(p_diagnostic_suggestions)
          WHERE (value ->> 'line_index')::integer = v_line_idx
        LOOP
          INSERT INTO public.quote_diagnostic_area_suggestions (
            diagnostic_area_id, quote_line_id, source, rule_id, ai_rationale,
            ai_confidence, source_field, suggested_qty, was_edited_by_user
          )
          VALUES (
            nullif(v_suggestion ->> 'diagnostic_area_id', '')::uuid,
            v_line_id,
            v_suggestion ->> 'source',
            nullif(v_suggestion ->> 'rule_id', '')::uuid,
            v_suggestion ->> 'ai_rationale',
            (v_suggestion ->> 'ai_confidence')::numeric,
            v_suggestion ->> 'source_field',
            (v_suggestion ->> 'suggested_qty')::numeric,
            COALESCE((v_suggestion ->> 'was_edited_by_user')::boolean, false)
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. quote_fees: delete-all (edit) then insert full set
  -- ══════════════════════════════════════════════════════════════════════════
  -- handleSave() only deletes existing fees in edit mode (a fresh quote has none).
  IF p_quote_id IS NOT NULL THEN
    DELETE FROM public.quote_fees WHERE quote_id = v_saved_id;
  END IF;

  IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
    LOOP
      INSERT INTO public.quote_fees (
        quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
      )
      VALUES (
        v_saved_id,
        nullif(v_fee ->> 'fee_type_id', '')::uuid,
        (v_fee ->> 'base_amount')::numeric,
        (v_fee ->> 'calculated_value')::numeric,
        (v_fee ->> 'vat_rate')::numeric,
        (v_fee ->> 'vat_amount')::numeric
      );
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. quotes totals UPDATE (folded into the same tx — was a separate call in FE)
  -- ══════════════════════════════════════════════════════════════════════════
  UPDATE public.quotes
  SET subtotal   = (p_totals ->> 'subtotal')::numeric,
      total_fees = (p_totals ->> 'total_fees')::numeric,
      total      = (p_totals ->> 'total')::numeric
  WHERE id = v_saved_id
  RETURNING * INTO v_quote;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. proposals value sync (conditional) — regra de negócio real, via
  --    calculate_proposal_value_from_quotes() (FIX: substitui a soma manual
  --    ingénua que ignorava `estado`, sobrepondo-se ao valor correto que o
  --    trigger do passo 4 acabou de calcular)
  -- ══════════════════════════════════════════════════════════════════════════
  -- Written in THIS transaction together with quotes.proposal_id + pipeline_links
  -- so the FK linkage and the aggregate can never desynchronize.
  IF v_saved_id IS NOT NULL AND v_proposal_id IS NOT NULL THEN
    SELECT value INTO v_proposal_old FROM public.proposals WHERE id = v_proposal_id;

    v_proposal_val := public.calculate_proposal_value_from_quotes(v_proposal_id);

    UPDATE public.proposals
    SET value         = v_proposal_val,
        value_sem_iva = public.calculate_proposal_value_sem_iva_from_quotes(v_proposal_id)
    WHERE id = v_proposal_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. pipeline_links UPDATE/INSERT (conditional on deal_id)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_saved_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
    SELECT id INTO v_existing_link
    FROM   public.pipeline_links
    WHERE  deal_id = v_deal_id
      AND  status  = 'active'
    LIMIT  1;

    IF v_existing_link IS NOT NULL THEN
      UPDATE public.pipeline_links
      SET quote_id   = v_saved_id,
          updated_at = now()
      WHERE id = v_existing_link;
      v_link_op := 'update';
      v_link_id := v_existing_link;
    ELSE
      INSERT INTO public.pipeline_links
        (deal_id, quote_id, organization_id, root_organization_id, status)
      VALUES
        (v_deal_id, v_saved_id, v_org_id, COALESCE(v_root_org_id, v_org_id), 'active')
      RETURNING id INTO v_link_id;
      v_link_op := 'insert';
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. inline quotes: each is a full standalone quote (INSERT + lines + totals)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
    FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
    LOOP
      v_iq_data := v_iq -> 'data';
      -- FE skips inline quotes with no qt>0 lines.
      IF v_iq_data IS NULL
         OR jsonb_typeof(v_iq -> 'lines') <> 'array'
         OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.quotes (
        deal_id, organization_id, root_organization_id, title, obra_notas,
        modelo_base, desconto_global_percent, estado, validade_dias, iva_rate,
        client_notes, conditions, created_by
      )
      VALUES (
        nullif(v_iq_data ->> 'deal_id', '')::uuid,
        v_org_id,
        COALESCE(v_root_org_id, v_org_id),
        nullif(v_iq_data ->> 'title', ''),
        nullif(v_iq_data ->> 'obra_notas', ''),
        COALESCE(nullif(v_iq_data ->> 'modelo_base', ''), 'default'),
        COALESCE((v_iq_data ->> 'desconto_global_percent')::numeric, 0),
        COALESCE(nullif(v_iq_data ->> 'estado', ''), 'rascunho'),
        (v_iq_data ->> 'validade_dias')::integer,
        (v_iq_data ->> 'iva_rate')::numeric,
        nullif(v_iq_data ->> 'client_notes', ''),
        nullif(v_iq_data ->> 'conditions', ''),
        v_actor
      )
      RETURNING id INTO v_iq_id;

      -- FIX 1: filter qt > 0 here (mirrors handleSave iq.lines.filter(l => l.qt > 0)),
      -- rather than trusting the caller to pre-filter. Lines with qt <= 0 (or null) are
      -- skipped exactly as the current FE code does.
      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_iq -> 'lines')
      LOOP
        CONTINUE WHEN COALESCE((v_iq_line ->> 'qt')::numeric, 0) <= 0;

        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id, bundle_id, item_supplier_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price,
          retail_price_unit, visible_to_client, uom_id
        )
        VALUES (
          v_iq_id,
          nullif(v_iq_line ->> 'catalog_item_id', '')::uuid,
          nullif(v_iq_line ->> 'product_id', '')::uuid,
          nullif(v_iq_line ->> 'service_id', '')::uuid,
          nullif(v_iq_line ->> 'bundle_id', '')::uuid,
          nullif(v_iq_line ->> 'item_supplier_id', '')::uuid,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          -- FIX 2: inline quote lines always persist categoria = '' to match handleSave
          -- (QuoteBuilder.tsx:2087), which never forwards l.categoria for inline lines.
          '',
          v_iq_line ->> 'descricao_snapshot',
          (v_iq_line ->> 'qt')::numeric,
          (v_iq_line ->> 'custo_material_unit')::numeric,
          (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
          (v_iq_line ->> 'margem_percent')::numeric,
          (v_iq_line ->> 'iva_percent')::numeric,
          (v_iq_line ->> 'int_percent')::numeric,
          (v_iq_line ->> 'discount_percent')::numeric,
          (v_iq_line ->> 'total_sem_iva')::numeric,
          (v_iq_line ->> 'total_com_iva')::numeric,
          (v_iq_line ->> 'total_com_desconto')::numeric,
          (v_iq_line ->> 'ordem')::integer,
          COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
          nullif(v_iq_line ->> 'unidade', ''),
          nullif(v_iq_line ->> 'item_description', ''),
          COALESCE((v_iq_line ->> 'cost_price')::numeric, 0),
          nullif(v_iq_line ->> 'retail_price_unit', '')::numeric,
          COALESCE((v_iq_line ->> 'visible_to_client')::boolean, true),
          nullif(v_iq_line ->> 'uom_id', '')::uuid  -- NOVO (20261204204500)
        );
      END LOOP;

      UPDATE public.quotes
      SET subtotal = (v_iq -> 'totals' ->> 'subtotal')::numeric,
          total    = (v_iq -> 'totals' ->> 'total')::numeric
      WHERE id = v_iq_id;

      v_iq_ids := v_iq_ids || v_iq_id;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. Build ONE combined diff and write ONE audit row
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    -- INSERT: snapshot the editable columns of the created quote.
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY v_editable_cols LOOP
      v_quote_diff := v_quote_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
      );
    END LOOP;
  ELSE
    -- UPDATE: diff before-image vs. metadata after-image (v_after captured the
    -- metadata UPDATE; totals were applied afterwards into v_quote — include those too).
    v_old_json := to_jsonb(v_before);
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY (v_editable_cols || ARRAY['subtotal','total_fees','total']) LOOP
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_quote_diff := v_quote_diff || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;
  END IF;

  IF v_quote_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('quotes', v_quote_diff);
  END IF;

  -- quote_lines / quote_fees are rewritten wholesale (delete-all + reinsert). Record
  -- the resulting sets so the single log row still reflects what the save produced.
  v_diff := v_diff || jsonb_build_object(
    'quote_lines', jsonb_build_object('new', CASE WHEN p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN v_lines_audit ELSE COALESCE(p_lines, '[]'::jsonb) END),
    'quote_fees',  jsonb_build_object('new', COALESCE(p_fees,  '[]'::jsonb))
  );

  IF v_proposal_id IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'proposals', jsonb_build_object(
        'value', jsonb_build_object('old', to_jsonb(v_proposal_old), 'new', to_jsonb(v_proposal_val))
      )
    );
  END IF;

  IF v_link_op IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'pipeline_links', jsonb_build_object(
        'op',       to_jsonb(v_link_op),
        'id',       to_jsonb(v_link_id),
        'deal_id',  to_jsonb(v_deal_id),
        'quote_id', to_jsonb(v_saved_id)
      )
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  -- Single consolidated audit row for the primary quote.
  PERFORM public.fn_manual_audit_log(
    'quotes',
    v_saved_id,
    v_org_id,
    CASE WHEN p_quote_id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_diff,
    'web_app'
  );

  -- Each inline quote is an independent creation — one INSERT row apiece so the log
  -- does not hide the fact that extra quotes were created.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_org_id, 'INSERT',
        jsonb_build_object('inline_of', to_jsonb(v_saved_id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_quote;
END;
$function$
;
