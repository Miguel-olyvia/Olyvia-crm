-- 20270101400000 (30/10/2026, visto no teste no browser): os materiais novos da obra ficam reservados à obra.
--
-- Com a 20270101350000, o que o Gestor de obra juntava ia a uma encomenda a fornecedor sem linha na encomenda de cliente: chegava e
-- entrava no stock ("1 un para stock"), sem ficar para a obra. Agora cada material novo é uma linha da encomenda de cliente:
--   · uma linha do orçamento do contrato, tipo_emylia 'material_obra', a preço 0, escondida do cliente (visible_to_client = false: não
--     muda a proposta aceite que ele vê; o preço fica fora, como nos materiais do modelo);
--   · a quantidade arredonda para cima (a encomenda de cliente salta as quantidades com casas decimais);
--   · e pede-se o que falta só dessas linhas, pela função da própria base (fn_client_order_request_missing): primeiro reserva-se do
--     stock e, do que faltar, encomenda-se ao fornecedor preferido, pendente para Compras e armazém. O que chega fica reservado à obra.
-- A resposta mantém a forma da 350000 (encomendas, fora, encomenda_cliente) e junta reservadas (as linhas que o stock já cobre).

SET lock_timeout = '5s';

ALTER TABLE public.quote_lines DROP CONSTRAINT IF EXISTS quote_lines_tipo_emylia_check;
ALTER TABLE public.quote_lines ADD CONSTRAINT quote_lines_tipo_emylia_check
  CHECK (tipo_emylia IS NULL OR tipo_emylia IN ('servico', 'materiais_modelo', 'material_modelo', 'produto', 'livre', 'material_obra'));

CREATE OR REPLACE FUNCTION public.obra_encomendar_materiais(p_org uuid, p_negocio uuid, p_motivo text, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid; v_neg negocios; v_cc client_contracts; v_quote uuid; v_obra text; v_ordem int;
  l jsonb; v_prod products; v_q numeric; v_ql uuid; v_ids uuid[] := '{}';
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 200); v_r jsonb;
BEGIN
  v_user := public.fn_cat_exigir_uma(p_org, ARRAY['purchase_orders.create', 'negocios.obra']);
  -- o técnico (só ele) não encomenda: os materiais do plano são do Gestor de obra
  IF NOT (public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'purchase_orders.create', p_org)
          OR public.fn_neg_papeis(p_org) && ARRAY['operacoes', 'direcao']) THEN
    RAISE EXCEPTION 'Só o Gestor de obra pede materiais novos ao fornecedor.' USING ERRCODE = 'CT001';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'Sem materiais para encomendar.' USING ERRCODE = 'CT002';
  END IF;
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'CT003'; END IF;
  IF v_neg.anulado_em IS NOT NULL THEN RAISE EXCEPTION 'O contrato deste negócio foi anulado.' USING ERRCODE = 'CT002'; END IF;
  SELECT * INTO v_cc FROM client_contracts
  WHERE negocio_id = p_negocio AND organization_id = p_org AND deleted_at IS NULL AND adenda_id IS NULL AND ec_emitida_em IS NOT NULL
  ORDER BY ec_emitida_em DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A encomenda de cliente ainda não foi emitida: os materiais novos encomendam-se depois de validado o pagamento.' USING ERRCODE = 'NE011';
  END IF;
  -- o orçamento da encomenda de cliente (o do contrato; senão o último da proposta, como o rpc_get_client_order_document)
  v_quote := coalesce(v_cc.quote_id, (SELECT q.id FROM quotes q WHERE q.proposal_id = v_cc.proposal_id ORDER BY q.created_at DESC LIMIT 1));
  IF v_quote IS NULL THEN RAISE EXCEPTION 'A encomenda de cliente não tem orçamento.' USING ERRCODE = 'CT003'; END IF;
  SELECT codigo INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio AND organization_id = p_org ORDER BY criada_em DESC LIMIT 1;
  SELECT coalesce(max(ordem), 0) INTO v_ordem FROM quote_lines WHERE quote_id = v_quote;

  FOR l IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    BEGIN
      v_q := (l->>'q')::numeric;
    EXCEPTION WHEN OTHERS THEN v_q := NULL;
    END;
    IF v_q IS NULL OR v_q <= 0 THEN RAISE EXCEPTION 'Quantidade inválida: %.', l->>'q' USING ERRCODE = 'CT002'; END IF;
    SELECT * INTO v_prod FROM products WHERE id = nullif(l->>'produto', '')::uuid AND organization_id = p_org AND NOT coalesce(is_deleted, false);
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto que não é do Catálogo desta organização: %.', coalesce(l->>'n', l->>'produto') USING ERRCODE = 'CT002'; END IF;
    v_ordem := v_ordem + 1;
    INSERT INTO quote_lines (quote_id, product_id, categoria, descricao_snapshot, tipo_emylia, qt, quantidade_exata, unidade, section_name, ordem,
      iva_percent, cost_price, custo_material_unit, retail_price_unit, preco_un_exato, total_sem_iva, total_com_desconto, total_com_iva,
      visible_to_client, item_description)
    VALUES (v_quote, v_prod.id, 'Materiais', v_prod.name, 'material_obra', ceil(v_q), ceil(v_q), coalesce(v_prod.unidade, 'un'), 'Obra', v_ordem,
      23, 0, 0, 0, 0, 0, 0, 0, false,
      left(format('Material novo da obra %s%s%s', coalesce(v_obra, ''), CASE WHEN coalesce(l->>'tarefa', '') <> '' THEN ' · ' || (l->>'tarefa') ELSE '' END,
        CASE WHEN v_motivo <> '' THEN ' (' || v_motivo || ')' ELSE '' END), 500))
    RETURNING id INTO v_ql;
    v_ids := v_ids || v_ql;
  END LOOP;

  -- o que falta destas linhas: reserva do stock e, do resto, a encomenda ao fornecedor preferido (pendente)
  v_r := public.fn_client_order_request_missing(v_cc.id, v_user, v_ids);

  RETURN jsonb_build_object(
    'encomendas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'numero', po.order_number, 'fornecedor', s.name, 'linhas', x.n) ORDER BY po.order_number)
                  FROM (SELECT i.purchase_order_id, count(*) n FROM purchase_order_items i WHERE i.quote_line_id = ANY (v_ids) GROUP BY 1) x
                  JOIN purchase_orders po ON po.id = x.purchase_order_id LEFT JOIN suppliers s ON s.id = po.supplier_id), '[]'),
    -- ainda em falta (sem stock nem encomenda: o produto sem fornecedor preferido): ficam por resolver
    'fora', coalesce((SELECT jsonb_agg(jsonb_build_object('n', ql.descricao_snapshot, 'q', r.qty_missing, 'motivo', 'sem fornecedor preferido'))
                  FROM quote_lines ql JOIN public.fn_client_order_line_reservations(p_org, ARRAY(SELECT product_id FROM quote_lines WHERE id = ANY (v_ids))) r
                    ON r.quote_line_id = ql.id AND r.contract_id = v_cc.id
                  WHERE ql.id = ANY (v_ids) AND r.qty_missing > 0
                    AND NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.quote_line_id = ql.id)), '[]'),
    -- já cobertas pelo stock (reservadas para a obra, sem encomenda ao fornecedor)
    'reservadas', (SELECT count(*) FROM quote_lines ql JOIN public.fn_client_order_line_reservations(p_org, ARRAY(SELECT product_id FROM quote_lines WHERE id = ANY (v_ids))) r
                    ON r.quote_line_id = ql.id AND r.contract_id = v_cc.id
                  WHERE ql.id = ANY (v_ids) AND r.qty_missing <= 0
                    AND NOT EXISTS (SELECT 1 FROM purchase_order_items i WHERE i.quote_line_id = ql.id)),
    'pedido', v_r,
    'encomenda_cliente', coalesce(v_cc.order_number, v_cc.contract_number)
  );
END $$;
REVOKE ALL ON FUNCTION public.obra_encomendar_materiais(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obra_encomendar_materiais(uuid, uuid, text, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.obra_encomendar_materiais(uuid, uuid, text, jsonb) IS 'Os materiais novos da obra (Gestor de obra) passam a linhas da encomenda de cliente (material_obra, escondidas do cliente) e pede-se o que falta: reserva do stock e encomenda ao fornecedor preferido. O que chega fica reservado à obra.';
