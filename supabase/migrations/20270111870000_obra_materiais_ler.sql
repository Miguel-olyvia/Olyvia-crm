-- ============================================================
-- 20270111870000 — obra_materiais_ler: os materiais da obra (Operações › obra › Materiais) sem dinheiro (aprovado pelo utilizador, 09/11/2026)
--
-- Nova RPC obra_materiais_ler(p_org, p_negocio) → jsonb. Só leitura; sem tabelas nem colunas novas.
--   Porta: fn_cat_exigir(p_org, 'negocios.obra.materiais') (CT001).
--   Âmbito: quem não tem pessoas.view (o executar-only de fn_neg_so_execucao, 20270111100000, e qualquer outro sem pessoas.view) só lê
--           os negócios onde trabalha (fn_neg_ids_do_tecnico), senão CT001 (mesmo antes de dizer se o negócio existe); quem tem
--           pessoas.view, o âmbito de pessoas.view sobre o negócio (fn_neg_no_ambito, como neg_ler_negocios), senão CT001.
--   Encomendas: a EC do negócio e as das adendas, exatamente as que fn_neg_ler_ec devolve (as emitidas).
--   Linhas: só produtos (linhas de produto e componentes de pack), como resumoDaBase (src/emylia/real/encomendaReal.ts). Sem preço,
--           custo nem fornecedor. A enumeração, as quantidades (fn_client_order_line_reservations_wh), a saída de stock, a PO da linha e o
--           line_status (devolvido como estado_base) são cópia literal de rpc_get_client_order_document (md5 vivo na guarda abaixo). A data
--           prometida é a de neg_ler_encomendas_fornecedor (supplier_po_publications.promised_date da PO da linha). `st` é a regra de
--           estadoDaLinha (encomendaReal.ts) e `estado` a de materiaisPorFase (src/emylia/obraOps.ts): served → 'chegou',
--           ready/recvpo → 'reservado', a_chegar > 0 → 'a caminho', resto → 'em falta'.
--   A fase da obra não está na base (o frontend calcula-a pela regra única fasesObra.ts); vai o serviço que instala o produto
--   (products.servico_id) e a secção do orçamento para agrupar.
--
-- Reversão (só como migration nova): DROP FUNCTION public.obra_materiais_ler(uuid, uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure)) <> 'b0a602940a3914d5cc738f343f619ba1'
     OR md5(pg_get_functiondef('public.neg_ler_encomendas_fornecedor(uuid,uuid)'::regprocedure)) <> '1903cd647c1665ae3d9be54019517ec7'
     OR md5(pg_get_functiondef('public.fn_neg_ler_ec(uuid)'::regprocedure)) <> '75a028907d27ef9821bb29dec68577c6'
     OR md5(pg_get_functiondef('public.fn_client_order_line_reservations_wh(uuid,uuid[])'::regprocedure)) <> '33bf3aa0c9677f73a0a4490105d49b8f'
     OR md5(pg_get_functiondef('public.fn_neg_so_execucao(uuid,text)'::regprocedure)) <> 'bdde5e5e6021cddb5dc8ade04cb4847e'
     OR md5(pg_get_functiondef('public.fn_neg_ids_do_tecnico(uuid)'::regprocedure)) <> 'fc1df11d065bdce7acd88680cb5f11a0' THEN
    RAISE EXCEPTION 'Guarda: uma das funções mudou desde 9/11/2026. Rever obra_materiais_ler (a regra das linhas copia rpc_get_client_order_document).';
  END IF;
  IF to_regprocedure('public.obra_materiais_ler(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: obra_materiais_ler já existe. Rever esta migration.';
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.obra_materiais_ler(p_org uuid, p_negocio uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg negocios; v_ec jsonb; v_so boolean;
  v_ecs jsonb := '[]'::jsonb; v_out jsonb := '[]'::jsonb;
  c record;
  -- as mesmas variáveis de rpc_get_client_order_document (só as que a linha usa)
  v_status text; v_is_signed boolean; v_resolved_quote_id uuid; v_products uuid[]; v_res_map jsonb; v_res jsonb;
  v_line record; v_line_status text; v_stock_movement_id uuid; v_stock_exit_id uuid; v_po_id uuid; v_available_stock numeric;
  v_q_needed numeric; v_q_reserved numeric; v_q_ordered numeric; v_q_received numeric; v_q_missing numeric;
  v_q_served_flag boolean; v_q_served numeric; v_has_pref boolean; v_q_cancelled numeric; v_has_canc boolean;
  -- o que se devolve
  v_q numeric; v_srv numeric; v_rsv numeric; v_rec numeric; v_ped numeric; v_chegar numeric; v_st text; v_estado text;
  v_prometida date; v_prevista date; v_po_status text;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'negocios.obra.materiais');

  -- quem não tem pessoas.view (o executar-only de fn_neg_so_execucao, ou outro só com negocios.obra.materiais): só onde trabalha
  v_so := public.fn_neg_so_execucao(p_org, 'pessoas.view') OR NOT coalesce(public.fn_cat_pode(p_org, 'pessoas.view'), false);
  IF v_so AND NOT (p_negocio = ANY (public.fn_neg_ids_do_tecnico(p_org))) THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.materiais): esta obra não tem tarefas nem visitas suas.' USING ERRCODE = 'CT001';
  END IF;
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  IF NOT v_so AND NOT public.fn_neg_no_ambito(v_neg, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;

  v_ec := public.fn_neg_ler_ec(p_negocio);
  IF v_ec IS NULL THEN
    RETURN jsonb_build_object('negocio_id', p_negocio, 'ecs', '[]'::jsonb, 'linhas', '[]'::jsonb);
  END IF;

  FOR c IN
    SELECT (v_ec ->> 'contract_id')::uuid AS cid, v_ec ->> 'order_number' AS ec, NULL::text AS adenda, 0 AS ord
    UNION ALL
    SELECT (a.value ->> 'contract_id')::uuid, a.value ->> 'order_number', a.value ->> 'referencia', a.ord::int
      FROM jsonb_array_elements(coalesce(v_ec -> 'adendas', '[]'::jsonb)) WITH ORDINALITY AS a(value, ord)
    ORDER BY 4
  LOOP
    v_status := NULL; v_resolved_quote_id := NULL; v_products := NULL; v_res_map := NULL;
    -- = rpc_get_client_order_document: contrato e orçamento resolvido (quote_id ou o último da proposta)
    SELECT cc.status, COALESCE(cc.quote_id, (SELECT q2.id FROM public.quotes q2 WHERE q2.proposal_id = cc.proposal_id ORDER BY q2.created_at DESC LIMIT 1))
      INTO v_status, v_resolved_quote_id
      FROM public.client_contracts cc
     WHERE cc.id = c.cid AND cc.organization_id = p_org AND cc.deleted_at IS NULL;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_ecs := v_ecs || jsonb_build_object('ec', c.ec, 'adenda', c.adenda);
    IF v_resolved_quote_id IS NULL THEN CONTINUE; END IF;
    v_is_signed := v_status IN ('signed', 'assinado');

    IF v_is_signed THEN
      SELECT array_agg(DISTINCT t.pid) INTO v_products
      FROM (
        SELECT ql.product_id AS pid FROM public.quote_lines ql
         WHERE ql.quote_id = v_resolved_quote_id AND ql.product_id IS NOT NULL
        UNION
        SELECT (comp.value ->> 'source_id')::uuid
          FROM public.quote_lines ql
          CROSS JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') AS comp(value)
         WHERE ql.quote_id = v_resolved_quote_id AND ql.bundle_id IS NOT NULL
           AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
           AND comp.value ->> 'type' = 'product' AND comp.value ->> 'source_id' IS NOT NULL
      ) t;
      IF v_products IS NOT NULL THEN
        SELECT jsonb_object_agg(r.quote_line_id::text || ':' || COALESCE(r.component_index, 0)::text, to_jsonb(r))
          INTO v_res_map
          FROM public.fn_client_order_line_reservations_wh(p_org, v_products) r
         WHERE r.contract_id = c.cid;
      END IF;
    END IF;

    -- = rpc_get_client_order_document: as linhas de produto e os componentes de pack (as de serviço não são materiais)
    FOR v_line IN
      SELECT ql.id AS quote_line_id, p.id AS product_id, (ql.qt * COALESCE(ql.units_per_uom, 1)) AS qt, p.name AS product_name,
             ql.unidade AS line_unidade, NULL::integer AS component_index, ql.section_name, p.servico_id
        FROM public.quote_lines ql JOIN public.products p ON p.id = ql.product_id
       WHERE ql.quote_id = v_resolved_quote_id AND ql.product_id IS NOT NULL
      UNION ALL
      SELECT ql.id, p.id, (COALESCE(comp.value ->> 'quantity', '1')::numeric * COALESCE(ql.qt, 1)), p.name,
             NULL::text, comp.ord::integer, ql.section_name, p.servico_id
        FROM public.quote_lines ql
        JOIN LATERAL jsonb_array_elements(ql.selected_attributes -> 'bundle_components') WITH ORDINALITY AS comp(value, ord) ON true
        JOIN public.products p ON p.id = (comp.value ->> 'source_id')::uuid
       WHERE ql.quote_id = v_resolved_quote_id AND ql.bundle_id IS NOT NULL
         AND jsonb_typeof(ql.selected_attributes -> 'bundle_components') = 'array'
         AND comp.value ->> 'type' = 'product' AND comp.value ->> 'source_id' IS NOT NULL
      ORDER BY 1, 6 NULLS FIRST
    LOOP
      v_line_status := NULL; v_stock_movement_id := NULL; v_stock_exit_id := NULL; v_po_id := NULL; v_res := NULL;
      v_q_needed := NULL; v_q_reserved := NULL; v_q_ordered := NULL; v_q_received := NULL; v_q_missing := NULL;
      v_q_served := NULL; v_q_served_flag := NULL; v_has_pref := NULL; v_q_cancelled := NULL;
      v_prometida := NULL; v_prevista := NULL; v_po_status := NULL;

      SELECT sm.id INTO v_stock_movement_id FROM public.stock_movements sm
       WHERE sm.sale_source_type = 'contract' AND sm.sale_source_id = c.cid AND sm.product_id = v_line.product_id
         AND ((sm.movement_type = 'venda' AND sm.reference_id = v_line.quote_line_id) OR sm.movement_type = 'saida')
         AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
       ORDER BY sm.created_at DESC LIMIT 1;
      SELECT sm.id INTO v_stock_exit_id FROM public.stock_movements sm
       WHERE sm.sale_source_type = 'contract' AND sm.sale_source_id = c.cid AND sm.product_id = v_line.product_id
         AND sm.movement_type = 'saida'
         AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
       ORDER BY sm.created_at DESC LIMIT 1;
      v_has_pref := EXISTS (SELECT 1 FROM public.item_suppliers isup
                             WHERE isup.product_id = v_line.product_id AND isup.is_preferred = true AND isup.deleted_at IS NULL
                               AND isup.is_active = true AND isup.organization_id = p_org);
      IF v_res_map IS NOT NULL THEN
        v_res := v_res_map -> (v_line.quote_line_id::text || ':' || COALESCE(v_line.component_index, 0)::text);
      END IF;

      IF v_res IS NOT NULL THEN
        v_q_needed      := COALESCE((v_res ->> 'qty_needed')::numeric, 0);
        v_q_reserved    := COALESCE((v_res ->> 'qty_reserved')::numeric, 0);
        v_q_ordered     := COALESCE((v_res ->> 'qty_ordered')::numeric, 0);
        v_q_received    := COALESCE((v_res ->> 'qty_received')::numeric, 0);
        v_q_missing     := COALESCE((v_res ->> 'qty_missing')::numeric, 0);
        v_q_served_flag := COALESCE((v_res ->> 'is_served')::boolean, false);
        v_q_served      := COALESCE((v_res ->> 'qty_served')::numeric, 0);
        -- anulado: as mesmas anulações que rpc_get_client_order_document junta (só se precisa de saber se há)
        v_q_cancelled := 0;
        SELECT EXISTS (
          SELECT 1 FROM public.purchase_order_item_cancellations ca
            JOIN public.purchase_order_items poi ON poi.id = ca.purchase_order_item_id
            JOIN public.purchase_orders po ON po.id = ca.purchase_order_id
           WHERE ca.undone_at IS NULL AND ca.quantity_cancelled > 0 AND po.source_type = 'contract' AND po.source_id = c.cid
             AND po.deleted_at IS NULL AND poi.product_id = v_line.product_id
             AND (poi.quote_line_id IS NULL OR (poi.quote_line_id = v_line.quote_line_id
                                               AND poi.component_index IS NOT DISTINCT FROM v_line.component_index)))
          INTO v_has_canc;
        IF v_has_canc THEN v_q_cancelled := GREATEST(0, GREATEST(COALESCE(v_line.qt, 0), 0) - v_q_needed); END IF;

        IF v_q_served_flag THEN
          v_line_status := CASE WHEN v_q_received > 0 THEN 'recebido'
                                WHEN v_q_cancelled > 0 AND v_q_served = 0 THEN 'nao_recebido_anulado'
                                ELSE 'servido_por_stock' END;
        ELSIF v_q_reserved > 0 THEN
          v_line_status := CASE WHEN v_q_ordered = 0 AND v_q_missing = 0 THEN 'stock_disponivel_confirmar' ELSE 'parcial' END;
        ELSIF v_q_served > 0 THEN
          v_line_status := 'parcial';
        ELSIF v_q_missing > 0 THEN
          v_line_status := CASE WHEN v_q_ordered > 0 THEN 'parcial' ELSE 'sem_fornecedor' END;
        ELSIF v_q_ordered > 0 THEN
          v_line_status := CASE WHEN v_q_received >= v_q_ordered THEN 'recebido' ELSE 'a_aguardar_encomenda' END;
        ELSE
          v_line_status := 'stock_disponivel_confirmar';
        END IF;

        IF v_q_ordered > 0 THEN
          SELECT po.id INTO v_po_id
            FROM public.purchase_orders po JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
           WHERE po.source_type = 'contract' AND po.source_id = c.cid AND poi.product_id = v_line.product_id
             AND po.status IS DISTINCT FROM 'cancelled' AND po.deleted_at IS NULL
             AND (poi.quote_line_id IS NULL OR (poi.quote_line_id = v_line.quote_line_id
                                               AND poi.component_index IS NOT DISTINCT FROM v_line.component_index))
           ORDER BY (poi.quote_line_id IS NOT NULL) DESC,
                    (po.status IN ('pending', 'ordered', 'partially_received') AND poi.received_quantity < poi.quantity) DESC,
                    po.created_at DESC
           LIMIT 1;
        END IF;
      -- legado (encomenda não assinada): como rpc_get_client_order_document
      ELSIF v_stock_movement_id IS NOT NULL THEN
        v_line_status := 'servido_por_stock';
      ELSE
        SELECT po.id INTO v_po_id
          FROM public.purchase_orders po JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
         WHERE po.source_type = 'contract' AND po.source_id = c.cid AND poi.product_id = v_line.product_id
           AND (po.status = 'received' OR poi.received_quantity >= poi.quantity)
         LIMIT 1;
        IF v_po_id IS NOT NULL THEN
          v_line_status := 'recebido';
        ELSE
          SELECT po.id INTO v_po_id
            FROM public.purchase_orders po JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
           WHERE po.source_type = 'contract' AND po.source_id = c.cid AND poi.product_id = v_line.product_id
             AND po.status IN ('pending', 'ordered', 'partially_received') AND poi.received_quantity < poi.quantity
           LIMIT 1;
          IF v_po_id IS NOT NULL THEN
            v_line_status := 'a_aguardar_encomenda';
          ELSE
            SELECT COALESCE(SUM(s.quantity), 0) INTO v_available_stock
              FROM public.stocks s JOIN public.warehouses w ON w.id = s.warehouse_id
             WHERE s.product_id = v_line.product_id AND s.deleted_at IS NULL AND w.organization_id = p_org AND w.deleted_at IS NULL;
            v_line_status := CASE WHEN v_available_stock >= v_line.qt THEN 'stock_disponivel_confirmar' ELSE 'sem_fornecedor' END;
          END IF;
        END IF;
      END IF;

      -- a PO da linha: o estado, a prevista e a prometida no portal (= neg_ler_encomendas_fornecedor), sem o fornecedor
      IF v_po_id IS NOT NULL THEN
        SELECT po.status, po.expected_delivery::date, pub.promised_date::date INTO v_po_status, v_prevista, v_prometida
          FROM public.purchase_orders po LEFT JOIN public.supplier_po_publications pub ON pub.purchase_order_id = po.id
         WHERE po.id = v_po_id AND po.organization_id = p_org AND po.deleted_at IS NULL;
      END IF;

      -- = estadoDaLinha (src/emylia/real/encomendaReal.ts) sobre a linha do documento
      v_q := CASE WHEN COALESCE(v_q_needed, 0) <> 0 THEN v_q_needed ELSE COALESCE(v_line.qt, 0) END;
      v_srv := COALESCE(v_q_served, 0); v_rsv := COALESCE(v_q_reserved, 0);
      v_ped := COALESCE(v_q_ordered, 0); v_rec := COALESCE(v_q_received, 0);
      v_st := CASE
        WHEN v_q > 0 AND v_srv >= v_q THEN CASE WHEN v_stock_exit_id IS NULL THEN CASE WHEN v_rec > 0 THEN 'recvpo' ELSE 'ready' END ELSE 'served' END
        WHEN v_q > 0 AND v_srv + GREATEST(v_rsv, v_rec) >= v_q THEN CASE WHEN v_rec > 0 THEN 'recvpo' ELSE 'ready' END
        WHEN v_ped > v_rec THEN 'waitpo'
        WHEN COALESCE(v_q_missing, 0) > 0 AND v_has_pref IS FALSE THEN 'nosup'
        WHEN v_rsv > 0 OR v_srv > 0 THEN 'partial'
        ELSE 'missing' END;
      -- = resumoDaBase (aChegar) e materiaisPorFase (o estado da obra)
      v_chegar := GREATEST(0, v_ped - v_rec);
      v_estado := CASE WHEN v_st = 'served' THEN 'chegou'
                       WHEN v_st IN ('ready', 'recvpo') THEN 'reservado'
                       WHEN v_chegar > 0 THEN 'a caminho'
                       ELSE 'em falta' END;

      v_out := v_out || jsonb_build_object(
        'id', v_line.product_id, 'produto', v_line.product_id, 'linha', v_line.quote_line_id, 'componente', v_line.component_index,
        'n', v_line.product_name, 'q', v_q, 'un', COALESCE(v_line.line_unidade, 'un'),
        'ec', COALESCE(c.ec, 'Encomenda de cliente'), 'adenda', c.adenda,
        'pronto', v_rsv, 'saida', v_srv, 'a_chegar', v_chegar,
        'prometida', v_prometida, 'prevista', COALESCE(v_prometida, v_prevista),
        'po_por_aprovar', CASE WHEN v_po_id IS NULL THEN NULL ELSE v_po_status IN ('pending', 'draft') END,
        'estado', v_estado, 'st', v_st, 'estado_base', v_line_status,
        'servico', v_line.servico_id, 'servico_nome', (SELECT s.name FROM public.services s WHERE s.id = v_line.servico_id),
        'seccao', v_line.section_name);
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('negocio_id', p_negocio, 'ecs', v_ecs, 'linhas', v_out);
END $function$;

REVOKE ALL ON FUNCTION public.obra_materiais_ler(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obra_materiais_ler(uuid, uuid) TO authenticated, service_role;
