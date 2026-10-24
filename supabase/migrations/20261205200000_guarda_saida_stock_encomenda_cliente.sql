-- 20261205200000: guarda na saída manual de stock ligada a uma Encomenda Cliente
--
-- Problema: rpc_decrement_stock (StockMovementDialog, tipo "Saída" com
-- Encomenda Cliente escolhida) só validava que o contrato existia na
-- organização. Isto permitiu servir a EC-2026-0082 duas vezes: saída manual
-- + PO-2026-0012 ligada ao contrato recebida.
--
-- Agora, quando p_sale_source_type = 'contract' e p_sale_source_id não é
-- nulo, aplicam-se as mesmas regras de rpc_confirm_client_order_stock_exit:
--   1. o produto tem de estar numa linha da encomenda (assinada);
--   2. a quantidade (unidades base) não pode passar do que está reservado
--      para esta encomenda nesse produto (fn_client_order_line_reservations,
--      fila por data de assinatura);
--   3. recusa se já houver saída/venda ativa (não estornada) desse produto
--      nessa encomenda;
--   4. recusa se a linha já estiver coberta por PO ligada ao contrato
--      (recebida ou a caminho), com o número da PO na mensagem.
-- As linhas de stocks do produto na organização são trancadas (mesma ordem
-- que o confirm e fn_client_order_request_missing) para serializar duas
-- saídas concorrentes da mesma encomenda.
--
-- Sem sale_source (saída livre), com 'proposal', ou 'contract' sem id:
-- comportamento exatamente igual ao anterior.
--
-- rpc_confirm_client_order_stock_exit chama esta função depois de fazer as
-- mesmas verificações com as linhas já trancadas, na mesma transação: a
-- repetição dá o mesmo resultado e o confirm fica intocado.
--
-- Segurança inalterada: SECURITY DEFINER, search_path public, pg_temp,
-- mesmas verificações de permissão/organização, mesma assinatura (sem
-- overloads). CREATE OR REPLACE mantém dono e GRANTs.
--
-- Reversão: voltar a aplicar o corpo anterior (no fim deste ficheiro).

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_document_number text, p_document_type text, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_sale_source_type text DEFAULT NULL::text, p_sale_source_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_doc    text;
  v_result integer;
  -- NOVO (20261205200000): guarda da saída ligada a Encomenda Cliente
  v_order_label  text;
  v_status       text;
  v_line_count   integer;
  v_needed       numeric;
  v_ordered      numeric;
  v_reserved     numeric;
  v_po_numbers   text;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  IF p_sale_source_type IS NOT NULL AND p_sale_source_type NOT IN ('contract', 'proposal') THEN
    RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.stocks
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Confirma que o contrato/proposta indicado é visível pelo utilizador e
  -- pertence à mesma organização — nunca confiar num id vindo do cliente sem
  -- validar o scope (mesmo princípio de segurança usado em
  -- rpc_get_client_order_document).
  IF p_sale_source_type = 'contract' AND p_sale_source_id IS NOT NULL THEN
    -- NOVO (20261205200000): lê também o número e o estado (era só EXISTS).
    SELECT COALESCE(cc.order_number, cc.contract_number), cc.status
      INTO v_order_label, v_status
    FROM public.client_contracts cc
    WHERE cc.id = p_sale_source_id
      AND cc.organization_id = v_org
      AND cc.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;

    -- NOVO (20261205200000): guarda — mesmas regras de
    -- rpc_confirm_client_order_stock_exit.
    IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
      RAISE EXCEPTION 'A encomenda % não está assinada — só é possível dar saída de stock para encomendas de cliente assinadas', v_order_label
        USING ERRCODE = 'check_violation';
    END IF;

    -- Lock por produto (mesma ordem que o confirm e
    -- fn_client_order_request_missing): serializa saídas concorrentes da
    -- mesma encomenda/produto. Dentro do confirm as linhas já estão trancadas.
    PERFORM 1
    FROM public.stocks s
    JOIN public.warehouses w ON w.id = s.warehouse_id
    WHERE s.product_id = p_product_id
      AND w.organization_id = v_org
    ORDER BY s.product_id, s.warehouse_id
    FOR UPDATE OF s;

    -- 3. Já há saída/venda ativa (não estornada) deste produto nesta encomenda.
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.sale_source_type = 'contract'
        AND sm.sale_source_id = p_sale_source_id
        AND sm.product_id = p_product_id
        AND sm.movement_type IN ('venda', 'saida')
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = sm.id
        )
    ) THEN
      RAISE EXCEPTION 'Este produto já teve saída de stock registada na encomenda % — estorne a saída anterior antes de registar outra', v_order_label
        USING ERRCODE = 'unique_violation';
    END IF;

    SELECT count(*),
           COALESCE(SUM(r.qty_needed), 0),
           COALESCE(SUM(r.qty_ordered), 0),
           COALESCE(SUM(r.qty_reserved), 0)
      INTO v_line_count, v_needed, v_ordered, v_reserved
    FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
    WHERE r.contract_id = p_sale_source_id;

    -- 1. O produto tem de estar numa linha da encomenda.
    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Este produto não faz parte da encomenda %', v_order_label
        USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Coberto por PO ligada ao contrato (recebida ou a caminho) — mesmo
    -- universo de POs que fn_client_order_line_reservations conta.
    IF v_ordered > 0 THEN
      SELECT string_agg(DISTINCT COALESCE(po.order_number, po.id::text), ', ')
        INTO v_po_numbers
      FROM public.purchase_orders po
      JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.source_type = 'contract'
        AND po.source_id = p_sale_source_id
        AND po.status IS DISTINCT FROM 'cancelled'
        AND po.deleted_at IS NULL
        AND poi.product_id = p_product_id;
    END IF;

    IF v_needed > 0 AND v_ordered >= v_needed THEN
      RAISE EXCEPTION 'Este produto da encomenda % já está coberto pela encomenda a fornecedor % (recebida ou a caminho) — não é possível dar também saída de stock',
        v_order_label, COALESCE(v_po_numbers, '—')
        USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Só se consome o stock reservado para esta encomenda.
    IF p_qty > v_reserved THEN
      IF v_ordered > 0 THEN
        RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto na encomenda % — o restante já está encomendado ao fornecedor (%) ou reservado para encomendas assinadas antes desta',
          trim_scale(GREATEST(v_reserved, 0)), v_order_label, COALESCE(v_po_numbers, '—')
          USING ERRCODE = 'check_violation';
      ELSIF v_reserved <= 0 THEN
        RAISE EXCEPTION 'Não há stock livre para a encomenda %: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.',
          v_order_label
          USING ERRCODE = 'check_violation';
      ELSE
        RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto na encomenda % — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
          trim_scale(v_reserved), v_order_label
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  v_doc := COALESCE(p_document_number, public.fn_next_stock_document_number(v_org, p_document_type));

  INSERT INTO public.stock_movements (
    organization_id, product_id, warehouse_id, movement_type, quantity,
    document_number, document_type, counterparty, notes, created_by,
    sale_source_type, sale_source_id
  ) VALUES (
    v_org, p_product_id, p_warehouse_id, 'saida', p_qty,
    v_doc, p_document_type, p_counterparty, p_notes, v_actor,
    p_sale_source_type, p_sale_source_id
  )
  RETURNING balance_after INTO v_result;

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- REVERSÃO — corpo vivo anterior (pg_get_functiondef em 2026-10-01):
--
-- CREATE OR REPLACE FUNCTION public.rpc_decrement_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_document_number text, p_document_type text, p_counterparty text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_sale_source_type text DEFAULT NULL::text, p_sale_source_id uuid DEFAULT NULL::uuid)
--  RETURNS integer
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_actor  uuid;
--   v_org    uuid;
--   v_doc    text;
--   v_result integer;
-- BEGIN
--   v_actor := public.current_business_user_id();
--   IF v_actor IS NULL THEN
--     RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF p_qty IS NULL OR p_qty <= 0 THEN
--     RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
--   END IF;
--
--   IF p_sale_source_type IS NOT NULL AND p_sale_source_type NOT IN ('contract', 'proposal') THEN
--     RAISE EXCEPTION 'sale_source_type inválido: %', p_sale_source_type USING ERRCODE = 'check_violation';
--   END IF;
--
--   SELECT organization_id INTO v_org
--   FROM public.stocks
--   WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
--
--   IF v_org IS NULL THEN
--     RAISE EXCEPTION 'Não existe stock deste produto neste armazém' USING ERRCODE = 'no_data_found';
--   END IF;
--
--   IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
--      OR NOT public.has_anew_permission(auth.uid(), 'inventory.edit') THEN
--     RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
--   END IF;
--
--   -- Confirma que o contrato/proposta indicado é visível pelo utilizador e
--   -- pertence à mesma organização — nunca confiar num id vindo do cliente sem
--   -- validar o scope (mesmo princípio de segurança usado em
--   -- rpc_get_client_order_document).
--   IF p_sale_source_type = 'contract' AND p_sale_source_id IS NOT NULL THEN
--     IF NOT EXISTS (
--       SELECT 1 FROM public.client_contracts
--       WHERE id = p_sale_source_id
--         AND organization_id = v_org
--         AND deleted_at IS NULL
--     ) THEN
--       RAISE EXCEPTION 'Encomenda Cliente (contrato) não encontrada nesta organização' USING ERRCODE = 'no_data_found';
--     END IF;
--   END IF;
--
--   v_doc := COALESCE(p_document_number, public.fn_next_stock_document_number(v_org, p_document_type));
--
--   INSERT INTO public.stock_movements (
--     organization_id, product_id, warehouse_id, movement_type, quantity,
--     document_number, document_type, counterparty, notes, created_by,
--     sale_source_type, sale_source_id
--   ) VALUES (
--     v_org, p_product_id, p_warehouse_id, 'saida', p_qty,
--     v_doc, p_document_type, p_counterparty, p_notes, v_actor,
--     p_sale_source_type, p_sale_source_id
--   )
--   RETURNING balance_after INTO v_result;
--
--   RETURN v_result;
-- END;
-- $function$;
