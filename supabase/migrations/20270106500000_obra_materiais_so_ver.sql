-- ============================================================
-- 20270106500000_obra_materiais_so_ver
-- ============================================================
-- O que faz (decisão do utilizador, 4/11/2026): negocios.obra.materiais passa a significar só "Ver materiais da obra".
--   1. anew_permissions: o nome e a descrição de negocios.obra.materiais (o código fica).
--   2. neg_papeis_permissoes: ACRESCENTA negocios.obra.materiais aos papéis que já abrem a obra e veem os materiais (armazem,
--      comercial, financeiro, juridico, tecnico); direcao e operacoes já a tinham. Não retira nada.
--   3. obra_encomendar_materiais: deixa de aceitar negocios.obra.materiais; pede só purchase_orders.create (fn_cat_pode na
--      organização). O resto da função é o texto vivo (pg_get_functiondef, 4/11/2026), sem outras mudanças.
-- Sem tabelas nem colunas novas.
-- Reversão (só como migration nova): repor o nome/descrição antigos, apagar as 5 linhas de neg_papeis_permissoes e voltar a
--   aceitar negocios.obra.materiais OU purchase_orders.create em obra_encomendar_materiais.
-- ============================================================

SET lock_timeout = '5s';

-- 1. O catálogo
UPDATE public.anew_permissions
   SET name = 'Ver materiais da obra',
       description = 'Ver o bloco de materiais da obra (linhas da encomenda de cliente, reservas e encomendas a fornecedor)'
 WHERE code = 'negocios.obra.materiais';

-- 2. O Papel no Negócio: quem abre a obra continua a ver os materiais
INSERT INTO public.neg_papeis_permissoes (papel, permission_code)
VALUES ('armazem', 'negocios.obra.materiais'), ('comercial', 'negocios.obra.materiais'), ('financeiro', 'negocios.obra.materiais'),
       ('juridico', 'negocios.obra.materiais'), ('tecnico', 'negocios.obra.materiais')
ON CONFLICT DO NOTHING;

-- 3. Encomendar: só purchase_orders.create
CREATE OR REPLACE FUNCTION public.obra_encomendar_materiais(p_org uuid, p_negocio uuid, p_motivo text, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid; v_neg negocios; v_cc client_contracts; v_quote uuid; v_obra text; v_ordem int;
  l jsonb; v_prod products; v_q numeric; v_ql uuid; v_ids uuid[] := '{}';
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 200); v_r jsonb;
BEGIN
  -- 20270106500000: a permissão dos materiais da obra passou a ser só de VER; pedir materiais novos ao fornecedor é de quem
  -- cria encomendas de compra (purchase_orders.create: perfil, Papel no Negócio ou admin do sistema, por fn_cat_pode na organização).
  IF NOT public.fn_cat_pode(p_org, 'purchase_orders.create') THEN
    RAISE EXCEPTION 'Sem permissão (purchase_orders.create): só quem cria encomendas de compra pede materiais novos ao fornecedor.' USING ERRCODE = 'CT001';
  END IF;
  v_user := public.current_business_user_id();
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
END $function$;

-- Conferir
DO $do$
BEGIN
  IF (SELECT name FROM public.anew_permissions WHERE code = 'negocios.obra.materiais') IS DISTINCT FROM 'Ver materiais da obra' THEN
    RAISE EXCEPTION 'CONFERIR: o nome de negocios.obra.materiais não mudou';
  END IF;
  IF (SELECT count(*) FROM public.neg_papeis_permissoes WHERE permission_code = 'negocios.obra.materiais') <> 7 THEN
    RAISE EXCEPTION 'CONFERIR: esperados os 7 papéis com negocios.obra.materiais';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosrc LIKE '%negocios.obra.materiais%') THEN
    RAISE EXCEPTION 'CONFERIR: ainda há funções que pedem negocios.obra.materiais';
  END IF;
END $do$;
