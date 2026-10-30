-- 20270101350000 (30/10/2026): os materiais novos da obra vão ao fornecedor.
--
-- No protótipo V1, quando o Gestor de obra junta uma tarefa com materiais ou muda os materiais de uma tarefa (encomendasAjuste.ts), sai uma
-- encomenda de ajuste: o que há em stock reserva-se e o resto encomenda-se ao fornecedor, pendente, para Compras e armazém aprovar. Na
-- Olyvia isto não fazia nada (a encomenda de ajuste só existia no Inventário de exemplo do browser).
--
-- obra_encomendar_materiais(org, negócio, motivo, linhas): cada linha é um produto do Catálogo (id) com a quantidade a encomendar. Vai à
-- encomenda a fornecedor PENDENTE do fornecedor preferido (item_suppliers, como o fn_client_order_request_missing), ligada à encomenda de
-- cliente do negócio (source_type 'contract', o contrato com a EC emitida): se já houver uma pendente desse fornecedor, junta-se a ela;
-- senão nasce uma nova. A quantidade passa à unidade do fornecedor, arredondada para cima. Compras e armazém aprova-a e envia-a
-- (rpc_po_send_to_supplier, com o papel do RH desde a 20270101340000). O que chega entra no stock pela Receção.
--
-- Quem pode: o Gestor de obra ou a Direção pelo papel do RH (negocios.obra), ou quem tem purchase_orders.create. O Técnico também tem
-- negocios.obra, mas os materiais novos do plano são do Gestor de obra: o técnico fica de fora.
-- Devolve as encomendas tocadas e as linhas que ficaram de fora (o produto sem fornecedor preferido, a unidade do fornecedor incompatível).
-- Erros: CT001 sem permissão; CT002 dados inválidos; CT003 não encontrado; NE011 a encomenda de cliente ainda não foi emitida.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.obra_encomendar_materiais(p_org uuid, p_negocio uuid, p_motivo text, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid; v_neg negocios; v_cc client_contracts; v_obra text;
  l jsonb; v_prod products; v_q numeric; v_sup uuid; v_preco numeric; v_uom uuid; v_ssku text; v_un numeric; v_qint integer;
  v_po uuid; v_nova boolean; v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_pos jsonb := '{}'; v_fora jsonb := '[]';
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
  -- a encomenda de cliente do negócio (a do contrato, não a das adendas)
  SELECT * INTO v_cc FROM client_contracts
  WHERE negocio_id = p_negocio AND organization_id = p_org AND deleted_at IS NULL AND adenda_id IS NULL AND ec_emitida_em IS NOT NULL
  ORDER BY ec_emitida_em DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A encomenda de cliente ainda não foi emitida: os materiais novos encomendam-se depois de validado o pagamento.' USING ERRCODE = 'NE011';
  END IF;
  SELECT codigo INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio AND organization_id = p_org ORDER BY criada_em DESC LIMIT 1;

  FOR l IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    BEGIN
      v_q := (l->>'q')::numeric;
    EXCEPTION WHEN OTHERS THEN v_q := NULL;
    END;
    IF v_q IS NULL OR v_q <= 0 THEN RAISE EXCEPTION 'Quantidade inválida: %.', l->>'q' USING ERRCODE = 'CT002'; END IF;
    SELECT * INTO v_prod FROM products WHERE id = nullif(l->>'produto', '')::uuid AND organization_id = p_org AND NOT coalesce(is_deleted, false);
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto que não é do Catálogo desta organização: %.', coalesce(l->>'n', l->>'produto') USING ERRCODE = 'CT002'; END IF;

    v_sup := NULL; v_preco := NULL; v_uom := NULL; v_ssku := NULL;
    SELECT supplier_id, purchase_price, uom_id, supplier_sku INTO v_sup, v_preco, v_uom, v_ssku
    FROM item_suppliers WHERE product_id = v_prod.id AND is_preferred AND deleted_at IS NULL AND is_active AND organization_id = p_org LIMIT 1;
    IF v_sup IS NULL THEN
      v_fora := v_fora || jsonb_build_object('n', v_prod.name, 'q', v_q, 'motivo', 'sem fornecedor preferido');
      CONTINUE;
    END IF;
    BEGIN
      v_un := public.fn_uom_units_per(v_uom, v_prod.id);
    EXCEPTION WHEN OTHERS THEN v_un := NULL;
    END;
    IF v_un IS NULL OR v_un < 1 THEN
      v_fora := v_fora || jsonb_build_object('n', v_prod.name, 'q', v_q, 'motivo', 'a unidade do fornecedor não serve');
      CONTINUE;
    END IF;
    IF v_preco IS NULL THEN
      SELECT price INTO v_preco FROM product_prices WHERE product_id = v_prod.id AND price_type = 'purchase' ORDER BY valid_from DESC NULLS LAST LIMIT 1;
      IF v_un <> 1 THEN v_preco := v_preco * v_un; END IF;
    END IF;
    v_preco := coalesce(v_preco, 0);
    v_qint := ceil(v_q / v_un)::integer;

    SELECT id INTO v_po FROM purchase_orders
    WHERE source_type = 'contract' AND source_id = v_cc.id AND supplier_id = v_sup AND status = 'pending' AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    v_nova := v_po IS NULL;
    IF v_nova THEN
      INSERT INTO purchase_orders (organization_id, supplier_id, order_date, status, source_type, source_id, notes, created_by)
      VALUES (p_org, v_sup, now()::date, 'pending', 'contract', v_cc.id,
        format('Materiais novos da obra %s (Encomenda Cliente %s)%s', coalesce(v_obra, ''), coalesce(v_cc.order_number, v_cc.contract_number),
          CASE WHEN v_motivo <> '' THEN ': ' || v_motivo ELSE '' END),
        v_user)
      RETURNING id INTO v_po;
    END IF;
    INSERT INTO purchase_order_items (purchase_order_id, item_type, product_id, description, sku, quantity, unit_price, total_price, uom_id, supplier_sku, notes)
    VALUES (v_po, 'product', v_prod.id, v_prod.name, v_prod.sku, v_qint, v_preco, v_preco * v_qint, v_uom, nullif(v_ssku, ''),
      left(format('Obra %s%s', coalesce(v_obra, ''), CASE WHEN coalesce(l->>'tarefa', '') <> '' THEN ' · ' || (l->>'tarefa') ELSE '' END), 500));
    v_pos := jsonb_set(v_pos, ARRAY[v_po::text], coalesce(v_pos->(v_po::text), jsonb_build_object('nova', v_nova, 'linhas', 0))
      || jsonb_build_object('linhas', coalesce((v_pos->(v_po::text)->>'linhas')::int, 0) + 1));
  END LOOP;

  -- o total de cada encomenda tocada
  UPDATE purchase_orders po SET total_value = (SELECT coalesce(sum(total_price), 0) FROM purchase_order_items WHERE purchase_order_id = po.id), updated_at = now()
  WHERE po.id IN (SELECT k::uuid FROM jsonb_object_keys(v_pos) k);

  RETURN jsonb_build_object(
    'encomendas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'numero', po.order_number, 'fornecedor', s.name,
                    'nova', (v_pos->(po.id::text)->>'nova')::boolean, 'linhas', (v_pos->(po.id::text)->>'linhas')::int) ORDER BY po.order_number)
                  FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id IN (SELECT k::uuid FROM jsonb_object_keys(v_pos) k)), '[]'),
    'fora', v_fora,
    'encomenda_cliente', coalesce(v_cc.order_number, v_cc.contract_number)
  );
END $$;
REVOKE ALL ON FUNCTION public.obra_encomendar_materiais(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obra_encomendar_materiais(uuid, uuid, text, jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.obra_encomendar_materiais(uuid, uuid, text, jsonb) IS 'Os materiais novos da obra (Gestor de obra) vão à encomenda a fornecedor pendente do fornecedor preferido, ligada à encomenda de cliente do negócio. Compras e armazém aprova-a.';
