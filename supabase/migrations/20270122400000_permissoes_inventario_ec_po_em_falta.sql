-- =============================================================================
-- Permissões no inventário / Encomendas Clientes / Encomendas de Compra (18/11).
-- Base de RH (uetjghdkwbywbftedtth). Sem tabelas, colunas nem dados novos: só funções.
-- Cada CREATE OR REPLACE parte do pg_get_functiondef da versão VIVA nesta base; as linhas mudadas estão marcadas
-- «-- 18/11 perm:». SECURITY DEFINER/INVOKER, search_path, assinatura e GRANTs ficam iguais (CREATE OR REPLACE
-- mantém o dono e os privilégios).
--
-- 1) Fuga: rpc_decrement_stock com p_sale_source_type = 'contract' (diálogo «Registar movimento › Saída» ligado a uma
--    Encomenda Cliente) pedia só inventory.edit. Passa a pedir o mesmo que rpc_confirm_client_order_stock_exit:
--    inventory.edit + client_orders.view + client_orders.confirm_stock_exit, na organização do stock
--    (has_anew_permission_for_org). As outras saídas (sem contrato ou ligadas a proposta) ficam iguais.
--
-- 2) Mensagens: quando uma ação exige várias permissões e falta alguma, o erro diz quais faltam:
--      «Sem permissão para <ação>. Falta: Editar registos de inventário (inventory.edit) e …»
--    ERRCODE 42501 (insufficient_privilege) como antes; DETAIL = códigos em falta separados por «, ».
--    A verificação é a MESMA de cada função (mesma função has_anew_permission_for_org, mesma organização,
--    auth.uid()); só a mensagem muda. A recusa por organização fora do âmbito mantém a mensagem antiga.
--    Funções auxiliares novas (só para uso interno das RPCs; sem EXECUTE para anon/authenticated):
--      fn_permissoes_em_falta(p_user, p_org, p_codigos) → text[]  (elemento 'a|b' = basta uma das duas)
--      fn_permissoes_rotulo(p_codigos) → text  («Nome (código), Nome (código) e Nome (código)»)
--      fn_exigir_permissoes(p_org, p_codigos, p_acao) → void      (levanta a exceção já formatada)
--    Helper partilhado alterado: fn_po_cancel_remainder_guard (usado só pelas 4 RPCs de anular/repor resto de PO).
-- =============================================================================

-- ─── 0. Guarda: as funções vivas ainda têm o bloco que esta migração substitui ───
DO $g$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_decrement_stock';
  IF v_def IS NULL OR position($o$  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_decrement_stock mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_confirm_client_order_stock_exit';
  IF v_def IS NULL OR position($o$  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)  -- NOVO (20261205000000): era client_contracts.view
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.confirm_stock_exit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_confirm_client_order_stock_exit mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_confirm_client_order_stock_exit_split';
  IF v_def IS NULL OR position($o$  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.confirm_stock_exit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para confirmar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_confirm_client_order_stock_exit_split mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_revert_client_order_stock_exit';
  IF v_def IS NULL OR position($o$  IF NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org)  -- NOVO (20261205000000): era client_contracts.view
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.confirm_stock_exit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para estornar saída de stock desta encomenda' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_revert_client_order_stock_exit mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_receive_purchase_order';
  IF v_def IS NULL OR position($o$    IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
       -- 20270114970000 (F10): a mesma terceira permissão que a Receção (rpc_receive_by_code) já pede.
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org) THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_receive_purchase_order mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_receive_purchase_order_lines';
  IF v_def IS NULL OR position($o$  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id)
     -- 20270114960000 (F10): a mesma terceira permissão que a Receção (rpc_receive_by_code) já pede.
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_receive_purchase_order_lines mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_receive_by_code';
  IF v_def IS NULL OR position($o$  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org)  -- NOVO (20261210130000)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_receive_by_code mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_preview_po_receipt';
  IF v_def IS NULL OR position($o$  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_preview_po_receipt mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_po_receipt_release_to_stock';
  IF v_def IS NULL OR position($o$  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_po_receipt_release_to_stock mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_revert_purchase_order_receipt';
  IF v_def IS NULL OR position($o$  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.revert_receipt', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_revert_purchase_order_receipt mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'fn_po_cancel_remainder_guard';
  IF v_def IS NULL OR position($o$  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_po.organization_id)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_po.organization_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: fn_po_cancel_remainder_guard mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_request_missing_from_supplier';
  IF v_def IS NULL OR position($o$  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN  -- NOVO (20261205000000): era client_contracts.view
    RAISE EXCEPTION 'Sem permissão para pedir material ao fornecedor' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_request_missing_from_supplier mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
  IF v_def IS NULL OR position($o$  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.fn_deal_org_in_scope(v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.create', v_org)
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'client_orders.view', v_org) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_request_missing_from_supplier mudou desde a análise (bloco 2); refazer a partir da versão viva';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'rpc_receiving_lookup';
  IF v_def IS NULL OR position($o$  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.view', v_org)  -- NOVO (20261210130000)
     OR NOT (public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
             OR public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.view', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
$o$ IN v_def) = 0 THEN
    RAISE EXCEPTION '18/11 perm: rpc_receiving_lookup mudou desde a análise (bloco 1); refazer a partir da versão viva';
  END IF;
END $g$;

-- ─── 1. Auxiliares ───────────────────────────────────────────────────────────────
-- Permissões em falta, pela ordem pedida. Cada elemento é um código ou alternativas 'a|b' (falta se não tiver
-- nenhuma). Mesma regra das RPCs: has_anew_permission_for_org (organização NULL → falta tudo).
CREATE OR REPLACE FUNCTION public.fn_permissoes_em_falta(p_user uuid, p_org uuid, p_codigos text[])
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(array_agg(u.c ORDER BY u.o), ARRAY[]::text[])
  FROM unnest(p_codigos) WITH ORDINALITY AS u(c, o)
  WHERE NOT EXISTS (
    SELECT 1
    FROM unnest(string_to_array(u.c, '|')) AS a(code)
    WHERE public.has_anew_permission_for_org(p_user, btrim(a.code), p_org) IS TRUE
  )
$function$;

-- «Nome (código), Nome (código) e Nome (código)»; alternativas 'a|b' → «Nome (a) ou Nome (b)».
-- Nome de anew_permissions.name; sem nome, só o código.
CREATE OR REPLACE FUNCTION public.fn_permissoes_rotulo(p_codigos text[])
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH l AS (
    SELECT u.o,
           (SELECT string_agg(
                     COALESCE((SELECT ap.name FROM public.anew_permissions ap WHERE ap.code = btrim(a.code) LIMIT 1)
                              || ' (' || btrim(a.code) || ')', btrim(a.code)),
                     ' ou ' ORDER BY a.k)
            FROM unnest(string_to_array(u.c, '|')) WITH ORDINALITY AS a(code, k)) AS t
    FROM unnest(p_codigos) WITH ORDINALITY AS u(c, o)
  ), s AS (
    SELECT COALESCE(array_agg(l.t ORDER BY l.o), ARRAY[]::text[]) AS arr FROM l
  )
  SELECT CASE
           WHEN cardinality(s.arr) = 0 THEN ''
           WHEN cardinality(s.arr) = 1 THEN s.arr[1]
           ELSE array_to_string(s.arr[1:cardinality(s.arr) - 1], ', ') || ' e ' || s.arr[cardinality(s.arr)]
         END
  FROM s
$function$;

-- Exige TODAS as permissões (na organização p_org, para auth.uid()); senão levanta 42501 com as que faltam.
-- Lista vazia/NULL é erro de programação → recusa (nunca deixa passar).
CREATE OR REPLACE FUNCTION public.fn_exigir_permissoes(p_org uuid, p_codigos text[], p_acao text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_falta text[];
BEGIN
  IF p_codigos IS NULL OR cardinality(p_codigos) = 0 THEN
    RAISE EXCEPTION 'fn_exigir_permissoes: lista de permissões vazia' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_falta := public.fn_permissoes_em_falta(auth.uid(), p_org, p_codigos);
  IF v_falta IS NULL OR cardinality(v_falta) > 0 THEN
    RAISE EXCEPTION 'Sem permissão para %. Falta: %',
      COALESCE(p_acao, 'esta operação'), public.fn_permissoes_rotulo(COALESCE(v_falta, p_codigos))
      USING ERRCODE = 'insufficient_privilege',
            DETAIL = array_to_string(COALESCE(v_falta, p_codigos), ', ');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_permissoes_em_falta(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_permissoes_rotulo(text[]) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fn_exigir_permissoes(uuid, text[], text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_permissoes_em_falta(uuid, uuid, text[]) TO service_role;

GRANT EXECUTE ON FUNCTION public.fn_permissoes_rotulo(text[]) TO service_role;

GRANT EXECUTE ON FUNCTION public.fn_exigir_permissoes(uuid, text[], text) TO service_role;

-- ─── 2. RPCs (versão viva + diff mínimo marcado «-- 18/11 perm:») ─────────────────
-- ======================================================================
-- rpc_decrement_stock
-- ======================================================================
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
     OR (p_sale_source_type IS DISTINCT FROM 'contract'  -- 18/11 perm: saída ligada a EC verificada logo abaixo (inclui inventory.edit)
         AND NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para editar stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: saída ligada a Encomenda Cliente pede as mesmas permissões que rpc_confirm_client_order_stock_exit
  -- (inventory.edit + client_orders.view + client_orders.confirm_stock_exit, na organização do stock).
  IF p_sale_source_type = 'contract' THEN
    PERFORM public.fn_exigir_permissoes(v_org,
      ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
      'confirmar saída de stock desta encomenda');
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

-- ======================================================================
-- rpc_confirm_client_order_stock_exit
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit(p_contract_id uuid, p_product_id uuid, p_quantity integer, p_warehouse_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_balance_after   integer;
  -- NOVO (20261204310000)
  v_reserved        numeric;
  v_line_count      integer;
  -- NOVO (20261204340000)
  v_wh_qty          integer;
  -- NOVO (20261204620000): número da encomenda nas notas
  v_order_number    text;
  v_is_manual       boolean;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
  -- NOVO (serve clientes)
  v_wh_name         text;
  v_wh_active       boolean;
  v_wh_serves       boolean;
  v_wh_vehicle      boolean;  -- NOVO (EC por armazém)
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number,
         cc.order_number, COALESCE(cc.is_manual_order, false)  -- NOVO (20261204620000)
  INTO v_org, v_contract_number,
       v_order_number, v_is_manual
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (20261130080000): client_orders.confirm_stock_exit exigida
  -- ADICIONALMENTE a inventory.edit + client_orders.view (20261205000000).
  -- 18/11 perm: mesmas 3 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
    'confirmar saída de stock desta encomenda');

  -- NOVO (serve clientes): só se dá saída para EC de um armazém ativo que
  -- serve clientes. Armazém inexistente/de outra org/apagado continua a cair
  -- na validação de quantidade mais abaixo, como antes.
  SELECT w.name, w.is_active, w.serves_customers, COALESCE(w.is_vehicle, false)
    INTO v_wh_name, v_wh_active, v_wh_serves, v_wh_vehicle
  FROM public.warehouses w
  WHERE w.id = p_warehouse_id
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF FOUND AND NOT COALESCE(v_wh_active, false) THEN
    RAISE EXCEPTION 'O armazém "%" está inativo — escolha outro armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  IF FOUND AND NOT COALESCE(v_wh_serves, false) THEN
    RAISE EXCEPTION 'O armazém "%" não serve encomendas de cliente — escolha outro armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (EC por armazém): o stock de viaturas não entra na reserva das EC.
  IF FOUND AND v_wh_vehicle THEN
    RAISE EXCEPTION 'O armazém "%" é uma viatura — a saída para encomendas de cliente é feita de um armazém', v_wh_name
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204310000): lock por produto (mesma ordem que
  -- fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  -- Guarda de idempotência: não duplicar a saída se já houver um movimento
  -- (automático ou manual) registado para este contrato/produto — mesma
  -- deteção usada em rpc_get_client_order_document para line_status =
  -- 'servido_por_stock'.
  -- NOVO (20261204290000): movimentos já estornados não contam — depois de
  -- estornar uma saída é possível confirmá-la de novo.
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = p_product_id
      AND sm.movement_type IN ('venda', 'saida')
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements r
        WHERE r.reversal_of_movement_id = sm.id
      )
  ) THEN
    RAISE EXCEPTION 'Este produto já teve saída de stock registada para esta encomenda' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204310000): só se pode consumir o stock reservado para esta
  -- encomenda (fila por ordem de assinatura).
  SELECT COALESCE(SUM(r.qty_reserved), 0), count(*)
    INTO v_reserved, v_line_count
  FROM public.fn_client_order_line_reservations(v_org, ARRAY[p_product_id]) r
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- NOVO (20261204340000): o armazém escolhido tem de ter a quantidade (as
  -- linhas de stocks deste produto já estão bloqueadas acima). Só conta stock
  -- ativo, de um armazém ativo da organização do contrato — o mesmo universo
  -- que a reserva por ordem usa.
  SELECT s.quantity
    INTO v_wh_qty
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND s.warehouse_id = p_warehouse_id
    AND s.deleted_at IS NULL
    AND w.organization_id = v_org
    AND w.deleted_at IS NULL;

  IF COALESCE(v_wh_qty, 0) < p_quantity THEN
    RAISE EXCEPTION 'O armazém escolhido só tem % un — escolha outro armazém',
      GREATEST(COALESCE(v_wh_qty, 0), 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261204620000): notas com o número certo. Venda direta ANTES de
  -- manual (as de VD também têm is_manual_order); contrato real mantém o
  -- texto de antes. Só texto — nada acima nem abaixo muda.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Saída confirmada a partir da venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    WHEN v_is_manual THEN
      format('Saída confirmada a partir do documento de Encomenda Cliente %s',
             COALESCE(v_order_number, v_contract_number))
    ELSE
      format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number)
  END;

  v_balance_after := public.rpc_decrement_stock(
    p_product_id       => p_product_id,
    p_warehouse_id     => p_warehouse_id,
    p_qty              => p_quantity,
    p_document_number  => NULL,
    p_document_type    => 'venda',
    p_counterparty     => NULL,
    p_notes            => v_notes,  -- NOVO (20261204620000)
    p_sale_source_type => 'contract',
    p_sale_source_id   => p_contract_id
  );

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after
  );
END;
$function$;

-- ======================================================================
-- rpc_confirm_client_order_stock_exit_split
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_client_order_stock_exit_split(p_contract_id uuid, p_product_id uuid, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_is_manual       boolean;
  v_status          text;
  v_order_label     text;
  v_total           integer;
  v_n_alloc         integer;
  v_reserved        numeric;
  v_line_count      integer;
  v_needed          numeric;
  v_ordered         numeric;
  v_po_numbers      text;
  v_a               record;
  v_wh_qty          integer;
  v_sale_number     text;
  v_is_direct_sale  boolean;
  v_notes           text;
  v_actor           uuid;
  v_doc             text;
  v_mv_id           uuid;
  v_balance         integer;
  v_moves           jsonb := '[]'::jsonb;
BEGIN
  IF p_contract_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e product_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Indique pelo menos um armazém e quantidade' USING ERRCODE = 'check_violation';
  END IF;

  -- Formato: armazém uuid, quantidade inteira positiva, sem armazéns repetidos.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_allocations) e
    WHERE jsonb_typeof(e) <> 'object'
       OR (e ->> 'warehouse_id') IS NULL
       OR (e ->> 'warehouse_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR (e ->> 'quantity') IS NULL
       OR (e ->> 'quantity') !~ '^\s*[0-9]+\s*$'
       OR (e ->> 'quantity')::numeric <= 0
       OR (e ->> 'quantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'Cada linha tem de ter um armazém e uma quantidade inteira positiva' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), count(DISTINCT (e ->> 'warehouse_id')::uuid), SUM((e ->> 'quantity')::integer)
    INTO v_n_alloc, v_line_count, v_total
  FROM jsonb_array_elements(p_allocations) e;

  IF v_n_alloc <> v_line_count THEN
    RAISE EXCEPTION 'O mesmo armazém aparece mais de uma vez' USING ERRCODE = 'check_violation';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number,
         COALESCE(cc.is_manual_order, false), cc.status,
         COALESCE(cc.order_number, cc.contract_number)
    INTO v_org, v_contract_number, v_order_number, v_is_manual, v_status, v_order_label
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 18/11 perm: mesmas 3 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
    'confirmar saída de stock desta encomenda');

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
    RAISE EXCEPTION 'A encomenda % não está assinada — só é possível dar saída de stock para encomendas de cliente assinadas', v_order_label
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cada armazém tem de ser elegível (ativo, serve clientes, não apagado, não
  -- viatura) e desta organização.
  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, w.name, w.organization_id AS worg,
           w.deleted_at, w.is_active, w.serves_customers, COALESCE(w.is_vehicle, false) AS is_vehicle
    FROM jsonb_array_elements(p_allocations) e
    LEFT JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
  LOOP
    IF v_a.worg IS DISTINCT FROM v_org OR v_a.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(v_a.is_active, false) THEN
      RAISE EXCEPTION 'O armazém "%" está inativo — escolha outro armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
    IF NOT COALESCE(v_a.serves_customers, false) THEN
      RAISE EXCEPTION 'O armazém "%" não serve encomendas de cliente — escolha outro armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
    IF v_a.is_vehicle THEN
      RAISE EXCEPTION 'O armazém "%" é uma viatura — a saída para encomendas de cliente é feita de um armazém', v_a.name USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Lock por produto (mesma ordem que o confirm e fn_client_order_request_missing).
  PERFORM 1
  FROM public.stocks s
  JOIN public.warehouses w ON w.id = s.warehouse_id
  WHERE s.product_id = p_product_id
    AND w.organization_id = v_org
  ORDER BY s.product_id, s.warehouse_id
  FOR UPDATE OF s;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
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
  WHERE r.contract_id = p_contract_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Este produto não faz parte desta encomenda assinada' USING ERRCODE = 'check_violation';
  END IF;

  IF v_ordered > 0 THEN
    SELECT string_agg(DISTINCT COALESCE(po.order_number, po.id::text), ', ')
      INTO v_po_numbers
    FROM public.purchase_orders po
    JOIN public.purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.source_type = 'contract'
      AND po.source_id = p_contract_id
      AND po.status IS DISTINCT FROM 'cancelled'
      AND po.deleted_at IS NULL
      AND poi.product_id = p_product_id;
  END IF;

  IF v_needed > 0 AND v_ordered >= v_needed THEN
    RAISE EXCEPTION 'Este produto da encomenda % já está coberto pela encomenda a fornecedor % (recebida ou a caminho) — não é possível dar também saída de stock',
      v_order_label, COALESCE(v_po_numbers, '—')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_total > v_reserved THEN
    IF v_reserved <= 0 THEN
      RAISE EXCEPTION 'Não há stock livre para esta encomenda: o stock existente deste produto está reservado para encomendas assinadas antes desta. Peça a quantidade em falta ao fornecedor.'
        USING ERRCODE = 'check_violation';
    ELSE
      RAISE EXCEPTION 'Só pode dar saída de % unidade(s) deste produto nesta encomenda — o restante stock está reservado para encomendas assinadas antes desta ou já encomendado ao fornecedor. Peça a diferença ao fornecedor.',
        trim_scale(v_reserved)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Cada armazém tem de ter a sua quantidade (linhas já trancadas acima).
  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, (e ->> 'quantity')::integer AS qty, w.name
    FROM jsonb_array_elements(p_allocations) e
    JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
  LOOP
    v_wh_qty := NULL;
    SELECT s.quantity INTO v_wh_qty
    FROM public.stocks s
    WHERE s.product_id = p_product_id
      AND s.warehouse_id = v_a.wid
      AND s.deleted_at IS NULL;

    IF COALESCE(v_wh_qty, 0) < v_a.qty THEN
      RAISE EXCEPTION 'O armazém "%" só tem % un — ajuste a quantidade ou escolha outro armazém',
        v_a.name, GREATEST(COALESCE(v_wh_qty, 0), 0)
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Notas: as mesmas de rpc_confirm_client_order_stock_exit.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Saída confirmada a partir da venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    WHEN v_is_manual THEN
      format('Saída confirmada a partir do documento de Encomenda Cliente %s',
             COALESCE(v_order_number, v_contract_number))
    ELSE
      format('Saída confirmada a partir do documento de Encomenda Cliente %s', v_contract_number)
  END;

  v_doc := public.fn_next_stock_document_number(v_org, 'venda');

  FOR v_a IN
    SELECT (e ->> 'warehouse_id')::uuid AS wid, (e ->> 'quantity')::integer AS qty, w.name
    FROM jsonb_array_elements(p_allocations) e
    JOIN public.warehouses w ON w.id = (e ->> 'warehouse_id')::uuid
    ORDER BY (e ->> 'quantity')::integer DESC, COALESCE(w.name, ''), w.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, counterparty, notes, created_by,
      sale_source_type, sale_source_id
    ) VALUES (
      v_org, p_product_id, v_a.wid, 'saida', v_a.qty,
      v_doc, 'venda', NULL, v_notes, v_actor,
      'contract', p_contract_id
    )
    RETURNING id, balance_after INTO v_mv_id, v_balance;

    v_moves := v_moves || jsonb_build_object(
      'warehouse_id', v_a.wid, 'warehouse_name', v_a.name, 'quantity', v_a.qty,
      'movement_id', v_mv_id, 'balance_after', v_balance);
  END LOOP;

  RETURN jsonb_build_object(
    'success',         true,
    'document_number', v_doc,
    'total_quantity',  v_total,
    'movements',       v_moves
  );
END;
$function$;

-- ======================================================================
-- rpc_revert_client_order_stock_exit
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_revert_client_order_stock_exit(p_contract_id uuid, p_movement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org             uuid;
  v_contract_number text;
  v_order_number    text;
  v_actor           uuid;
  v_mov             public.stock_movements;
  v_balance_after   integer;
  -- NOVO (20261204620000)
  v_sale_number     text;
  v_is_direct_sale  boolean;
  -- NOVO (20261204630000)
  v_notes           text;
  v_result          jsonb;
  -- NOVO (saída repartida)
  v_part            record;
  v_reversed        jsonb := '[]'::jsonb;
  v_self_reversed   boolean;
BEGIN
  IF p_contract_id IS NULL OR p_movement_id IS NULL THEN
    RAISE EXCEPTION 'contract_id e movement_id são obrigatórios' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT cc.organization_id, cc.contract_number, cc.order_number
  INTO v_org, v_contract_number, v_order_number
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Mesmas verificações de âmbito e permissão da confirmação.
  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para ver esta encomenda de cliente' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 18/11 perm: mesmas 3 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'],
    'estornar saída de stock desta encomenda');

  -- Trancar o movimento original serializa estornos concorrentes do mesmo
  -- movimento: o segundo espera e depois vê o estorno do primeiro.
  SELECT sm.* INTO v_mov
  FROM public.stock_movements sm
  WHERE sm.id = p_movement_id
  FOR UPDATE;

  IF v_mov.id IS NULL THEN
    RAISE EXCEPTION 'Movimento de stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_mov.movement_type IS DISTINCT FROM 'saida'
     OR v_mov.sale_source_type IS DISTINCT FROM 'contract'
     OR v_mov.sale_source_id IS DISTINCT FROM p_contract_id THEN
    RAISE EXCEPTION 'Este movimento não é uma saída confirmada desta encomenda' USING ERRCODE = 'check_violation';
  END IF;

  IF v_mov.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Movimento de stock de outra organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- NOVO (saída repartida): uma saída confirmada pode ter várias parcelas
  -- (rpc_confirm_client_order_stock_exit_split: um movimento 'saida' por
  -- armazém, mesmo document_number, contrato e produto). Estorna-se a saída
  -- inteira: este movimento e as parcelas irmãs ainda não estornadas. Só há
  -- uma saída ativa por (encomenda, produto) — as confirmações recusam outra
  -- —, por isso as irmãs não estornadas são sempre da mesma saída. Trancadas
  -- por id (ordem fixa). Já estornado este movimento e todas as irmãs → o
  -- mesmo erro de antes; se faltar alguma irmã (estorno antigo parcial),
  -- estorna-se o que falta.
  v_self_reversed := EXISTS (
    SELECT 1 FROM public.stock_movements r
    WHERE r.reversal_of_movement_id = v_mov.id
  );

  PERFORM 1
  FROM public.stock_movements sm
  WHERE sm.organization_id = v_org
    AND sm.sale_source_type = 'contract'
    AND sm.sale_source_id = p_contract_id
    AND sm.product_id = v_mov.product_id
    AND sm.movement_type = 'saida'
    AND v_mov.document_number IS NOT NULL
    AND sm.document_number = v_mov.document_number
    AND sm.id <> v_mov.id
  ORDER BY sm.id
  FOR UPDATE;

  IF v_self_reversed AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
  ) THEN
    RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
  END IF;

  -- NOVO (20261204620000): venda direta mostra o VD-… nas notas; os outros
  -- casos ficam exatamente como antes. Só texto.
  SELECT ds.sale_number
    INTO v_sale_number
  FROM public.direct_sales ds
  WHERE ds.client_contract_id = p_contract_id
  ORDER BY ds.created_at DESC
  LIMIT 1;
  v_is_direct_sale := FOUND;

  v_notes := CASE
    WHEN v_is_direct_sale THEN
      format('Estorno da saída confirmada — venda direta %s',
             COALESCE(v_sale_number, v_order_number, v_contract_number))
    ELSE
      format('Estorno da saída confirmada — Encomenda %s', COALESCE(v_order_number, v_contract_number))
  END;  -- NOVO (20261204620000)

  -- NOVO (20261204630000): a inserção do 'estorno_venda' passa para o helper
  -- (mesmas colunas e valores). O movimento já está trancado acima, por isso
  -- 'skipped' não é possível aqui — se acontecer, mesmo erro de antes.
  IF NOT v_self_reversed THEN
    v_result := public.fn_client_order_reverse_stock_movement(v_mov.id, v_actor, v_notes);

    IF COALESCE(v_result ->> 'status', '') <> 'reversed' THEN
      RAISE EXCEPTION 'Esta saída de stock já foi estornada' USING ERRCODE = 'unique_violation';
    END IF;

    v_balance_after := (v_result ->> 'balance_after')::integer;
    v_reversed := v_reversed || jsonb_build_object(
      'movement_id', v_mov.id, 'warehouse_id', v_mov.warehouse_id, 'quantity', v_mov.quantity,
      'reversal_movement_id', v_result ->> 'reversal_movement_id', 'balance_after', v_balance_after);
  END IF;

  -- NOVO (saída repartida): as outras parcelas da mesma saída.
  FOR v_part IN
    SELECT sm.id, sm.warehouse_id, sm.quantity
    FROM public.stock_movements sm
    WHERE sm.organization_id = v_org
      AND sm.sale_source_type = 'contract'
      AND sm.sale_source_id = p_contract_id
      AND sm.product_id = v_mov.product_id
      AND sm.movement_type = 'saida'
      AND v_mov.document_number IS NOT NULL
      AND sm.document_number = v_mov.document_number
      AND sm.id <> v_mov.id
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = sm.id)
    ORDER BY sm.id
  LOOP
    v_result := public.fn_client_order_reverse_stock_movement(v_part.id, v_actor, v_notes);
    IF COALESCE(v_result ->> 'status', '') = 'reversed' THEN
      v_reversed := v_reversed || jsonb_build_object(
        'movement_id', v_part.id, 'warehouse_id', v_part.warehouse_id, 'quantity', v_part.quantity,
        'reversal_movement_id', v_result ->> 'reversal_movement_id',
        'balance_after', (v_result ->> 'balance_after')::integer);
      IF v_balance_after IS NULL THEN
        v_balance_after := (v_result ->> 'balance_after')::integer;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',       true,
    'balance_after', v_balance_after,          -- saldo do armazém do movimento pedido (ou da 1.ª parcela)
    'reversed',      v_reversed                -- NOVO (saída repartida): parcelas estornadas
  );
END;
$function$;

-- ======================================================================
-- rpc_receive_purchase_order
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order(p_purchase_order_id uuid, p_warehouse_id uuid, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_has_product_lines boolean;
  v_lines             jsonb;
  v_actor             uuid;
  v_org               uuid;
  v_status            text;
  v_order_number      text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product'
  ) INTO v_has_product_lines;

  IF NOT v_has_product_lines THEN
    -- Edge case documentado desde 20261114040000: encomenda só com linhas de
    -- serviço (sem stock físico) não tem p_lines possível para construir
    -- (rpc_receive_purchase_order_lines exige não-vazio). Replica o
    -- comportamento do RPC original (20261113280000): marca a encomenda como
    -- recebida diretamente, sem stock_movements nenhum, com os mesmos checks
    -- de status/permissão/organização/armazém. É sempre receção TOTAL, por
    -- isso grava actual_delivery_date aqui também (20261130010000).
    v_actor := public.current_business_user_id();
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
    END IF;

    SELECT organization_id, status, order_number
    INTO v_org, v_status, v_order_number
    FROM public.purchase_orders
    WHERE id = p_purchase_order_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- 18/11 perm: mesmas 3 permissões (20270114970000 F10: receiving.receive como na Receção); a mensagem diz quais faltam.
    PERFORM public.fn_exigir_permissoes(v_org,
      ARRAY['purchase_orders.receive', 'inventory.edit', 'receiving.receive'],
      'receber encomendas desta organização');

    -- 20270114970000 (F10): os testes de estado vêm depois da permissão.
    IF v_status = 'received' THEN
      RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
    END IF;
    IF v_status = 'cancelled' THEN
      RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.warehouses
      WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.purchase_orders
    SET status = 'received',
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;

    RETURN jsonb_build_object(
      'order_number', v_order_number,
      'warehouse_id', p_warehouse_id,
      'status',       'received',
      'lines',        '[]'::jsonb
    );
  END IF;

  -- Caminho normal: monta p_lines com todas as linhas de produto ainda por
  -- receber, na quantidade remanescente — e delega, incluindo
  -- p_actual_delivery_date. Linhas já totalmente recebidas (quantity <=
  -- received_quantity) ficam de fora.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'purchase_order_item_id', id,
           'quantity', (quantity - received_quantity)
         )), '[]'::jsonb)
  INTO v_lines
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id
    AND item_type = 'product'
    AND quantity > received_quantity;

  RETURN public.rpc_receive_purchase_order_lines(p_purchase_order_id, p_warehouse_id, v_lines, p_actual_delivery_date);
END;
$function$;

-- ======================================================================
-- rpc_receive_purchase_order_lines
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_po               public.purchase_orders%ROWTYPE;
  v_line_input       jsonb;
  v_line_id          uuid;
  v_qty_requested    numeric;
  v_qty_int          integer;
  v_item             record;
  v_item_supplier_id uuid;
  v_remaining        numeric;
  v_balance          integer;
  v_received_total   numeric;
  v_lines_out        jsonb := '[]'::jsonb;
  v_sum_quantity     numeric;
  v_sum_received     numeric;
  v_new_status       text;
  v_skip_stock       boolean;
  -- NOVO (20261204203500): embalagens — fator congelado na linha.
  v_units            integer;
  v_stock_qty        bigint;
  v_unit_cost        numeric;
  -- NOVO (20261206130000): destino por linha (EC / stock).
  v_alloc            record;
  v_to_order         bigint;
  v_to_stock         bigint;
  v_movement_id      uuid;
  v_sum_to_order     bigint := 0;
  v_sum_to_stock     bigint := 0;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 3 permissões (20270114960000 F10: receiving.receive como na Receção); a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_po.organization_id,
    ARRAY['purchase_orders.receive', 'inventory.edit', 'receiving.receive'],
    'receber encomendas desta organização');

  -- 20270114960000 (F10): os testes de estado vêm depois da permissão.
  IF v_po.status = 'received' THEN
    RAISE EXCEPTION 'Esta encomenda já foi marcada como recebida' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Não é possível receber uma encomenda cancelada' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_po.organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Linhas de receção não podem estar vazias' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (20261206130000): o destino passa a ser decidido por linha
  -- (fn_po_receipt_allocation). PO ligada a uma Encomenda Cliente ativa: a
  -- parte que a EC ainda precisa vai para a EC (sem stock geral, como desde
  -- 20261115210000); o excedente, ou tudo se a EC estiver cancelada/apagada/
  -- não assinada, entra em stock. PO de stock: tudo para stock, como antes.
  -- v_skip_stock (stock_skipped no resultado) = nada entrou em stock numa PO
  -- de contrato; é calculado no fim.
  v_skip_stock := false;

  -- Serializa receções de POs diferentes da mesma EC (cada uma lê a
  -- necessidade em aberto da EC antes de escrever).
  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  FOR v_line_input IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_id       := nullif(v_line_input ->> 'purchase_order_item_id', '')::uuid;
    v_qty_requested := nullif(v_line_input ->> 'quantity', '')::numeric;

    IF v_line_id IS NULL THEN
      RAISE EXCEPTION 'purchase_order_item_id em falta numa linha de receção' USING ERRCODE = 'check_violation';
    END IF;

    SELECT id, product_id, item_type, quantity, unit_price, received_quantity, description,
           uom_id, units_per_uom, supplier_sku
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_line_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_line_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm stock físico e não podem ser recebidos', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested IS NULL OR v_qty_requested <= 0 THEN
      RAISE EXCEPTION 'A quantidade a receber na linha "%" tem de ser positiva', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_qty_requested <> floor(v_qty_requested) THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade não inteira (%) — o stock só regista unidades inteiras. Corrige a linha antes de receber.', v_item.description, v_qty_requested
        USING ERRCODE = 'check_violation';
    END IF;

    v_remaining := v_item.quantity - v_item.received_quantity;
    IF v_qty_requested > v_remaining THEN
      RAISE EXCEPTION 'A quantidade a receber (%) na linha "%" excede o saldo por receber desta linha (% de % por receber; já recebido % de %)',
        v_qty_requested, v_item.description, v_remaining, v_item.quantity, v_item.received_quantity, v_item.quantity
        USING ERRCODE = 'check_violation';
    END IF;

    v_qty_int := v_qty_requested::integer;
    v_balance := NULL;

    -- NOVO (20261204203500): a linha está na unidade de compra (ex. PK100);
    -- o stock entra na unidade do produto. received_quantity continua na
    -- unidade da linha. Custo por unidade de stock = preço da linha / fator.
    -- Com fator 1 tudo fica exatamente como antes.
    v_units     := COALESCE(v_item.units_per_uom, 1);
    v_stock_qty := v_qty_int::bigint * v_units;
    IF v_stock_qty > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" excede o limite de stock (% unidades)', v_item.description, v_stock_qty
        USING ERRCODE = 'numeric_value_out_of_range';
    END IF;
    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    -- NOVO (20261206130000): repartição EC / stock em unidades de stock.
    SELECT * INTO v_alloc
    FROM public.fn_po_receipt_allocation(v_item.id, v_stock_qty);
    v_to_order := v_alloc.units_to_order::bigint;
    v_to_stock := v_stock_qty - v_to_order;
    v_movement_id := NULL;

    IF v_to_stock <= 0 THEN
      -- Sem movimento de entrada — tudo vai para a Encomenda Cliente, não
      -- passa pelo stock geral. balance_after fica NULL no output
      -- (informativo, não há stock_movements gerado para esta linha).
      NULL;
    ELSE
      SELECT id INTO v_item_supplier_id
      FROM public.item_suppliers
      WHERE product_id = v_item.product_id
        AND supplier_id = v_po.supplier_id
        AND deleted_at IS NULL
      -- NOVO (20261204203500): primeiro a ligação na MESMA unidade da linha.
      ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
      LIMIT 1;

      INSERT INTO public.stock_movements (
        organization_id, product_id, warehouse_id, movement_type, quantity,
        document_number, document_type, item_supplier_id, unit_cost_at_time,
        reference_id, notes, created_by
      ) VALUES (
        v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_to_stock::integer,
        v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
        v_item.id,
        CASE
          -- Tudo para stock: texto exatamente como antes.
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' AND v_units = 1 THEN
            format('Receção de %s: %s unidades agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_item.received_quantity + v_qty_requested, v_item.quantity)
          WHEN v_to_order = 0 AND v_alloc.allocation_reason = 'stock_order' THEN
            format('Receção de %s: %s × %s un. (%s unidades de stock) agora nesta linha (total recebido %s de %s)',
                   v_po.order_number, v_qty_int, v_units, v_stock_qty, v_item.received_quantity + v_qty_requested, v_item.quantity)
          -- NOVO (20261206130000): PO de Encomenda Cliente.
          WHEN v_to_order = 0 THEN
            format('Receção de %s: %s unidades de stock agora nesta linha (total recebido %s de %s) — %s',
                   v_po.order_number, v_to_stock, v_item.received_quantity + v_qty_requested, v_item.quantity,
                   CASE WHEN v_alloc.allocation_reason = 'client_order_inactive'
                        THEN format('encomenda cliente %s inativa, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                        ELSE format('necessidade da encomenda cliente %s já coberta, entra em stock', COALESCE(v_alloc.contract_order_number, '?'))
                   END)
          ELSE
            format('Receção de %s: %s unidades de stock recebidas nesta linha, %s para a encomenda cliente %s e %s para stock (total recebido %s de %s)',
                   v_po.order_number, v_stock_qty, v_to_order, COALESCE(v_alloc.contract_order_number, '?'), v_to_stock,
                   v_item.received_quantity + v_qty_requested, v_item.quantity)
        END,
        v_actor
      )
      RETURNING id, balance_after INTO v_movement_id, v_balance;
    END IF;

    UPDATE public.purchase_order_items
    SET received_quantity       = received_quantity + v_qty_requested,
        received_to_stock_units = received_to_stock_units + v_to_stock  -- NOVO (20261206130000)
    WHERE id = v_item.id
    RETURNING received_quantity INTO v_received_total;

    -- NOVO (20261206130000): histórico da receção.
    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, received_by
    ) VALUES (
      v_po.organization_id, p_purchase_order_id, v_item.id, v_item.product_id, 'receipt',
      p_warehouse_id, v_qty_requested, v_units, v_to_order, v_to_stock,
      CASE WHEN v_po.source_type = 'contract' THEN v_alloc.contract_id END,
      v_alloc.allocation_reason, v_movement_id, v_actor
    );

    v_sum_to_order := v_sum_to_order + v_to_order;
    v_sum_to_stock := v_sum_to_stock + v_to_stock;

    v_lines_out := v_lines_out || jsonb_build_object(
      'product_id',               v_item.product_id,
      'quantity_received_now',    v_qty_int,
      'received_quantity_total',  v_received_total,
      'remaining',                v_item.quantity - v_received_total,
      'balance_after',            v_balance,
      'stock_updated',            (v_to_stock > 0),
      -- NOVO (20261204203500): chaves acrescentadas; as anteriores não mudam.
      'units_per_uom',            v_units,
      'stock_quantity_now',       CASE WHEN v_to_stock > 0 THEN v_to_stock END,
      -- NOVO (20261206130000): destino da receção. qty_* na unidade da linha
      -- (pode ser fracionária numa embalagem repartida); units_* em unidades
      -- de stock.
      'purchase_order_item_id',   v_item.id,
      'qty_to_order',             round(v_to_order::numeric / v_units, 4),
      'qty_to_stock',             round(v_to_stock::numeric / v_units, 4),
      'units_to_order',           v_to_order,
      'units_to_stock',           v_to_stock,
      'contract_id',              v_alloc.contract_id,
      'contract_order_number',    v_alloc.contract_order_number,
      'contract_active',          v_alloc.contract_active,
      'allocation_reason',        v_alloc.allocation_reason,
      'destination',              CASE WHEN v_to_order > 0 AND v_to_stock > 0 THEN 'split'
                                       WHEN v_to_order > 0 THEN 'client_order'
                                       ELSE 'stock' END
    );
  END LOOP;

  -- NOVO (20261206130000): stock_skipped = PO de contrato em que nada entrou
  -- em stock nesta receção (tudo foi para a EC). PO de stock: false.
  v_skip_stock := (v_po.source_type = 'contract' AND v_sum_to_stock = 0);

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_quantity > 0 AND v_sum_received >= v_sum_quantity THEN
    v_new_status := 'received';
  ELSIF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := v_po.status;
  END IF;

  -- NOVO (20261130010000): actual_delivery_date só é gravada quando a
  -- encomenda fica TOTALMENTE recebida — numa receção parcial ainda não há
  -- "data de entrega" da encomenda como um todo.
  IF v_new_status = 'received' THEN
    UPDATE public.purchase_orders
    SET status = v_new_status,
        updated_at = now(),
        actual_delivery_date = COALESCE(p_actual_delivery_date, current_date)
    WHERE id = p_purchase_order_id;
  ELSE
    UPDATE public.purchase_orders
    SET status = v_new_status, updated_at = now()
    WHERE id = p_purchase_order_id;
  END IF;

  RETURN jsonb_build_object(
    'order_number',   v_po.order_number,
    'warehouse_id',   p_warehouse_id,
    'status',         v_new_status,
    'lines',          v_lines_out,
    'stock_skipped',  v_skip_stock,
    -- NOVO (20261206130000)
    'units_to_order_total', v_sum_to_order,
    'units_to_stock_total', v_sum_to_stock
  );
END;
$function$;

-- ======================================================================
-- rpc_receive_by_code
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_receive_by_code(p_request_id uuid, p_warehouse_id uuid, p_product_id uuid, p_quantity numeric, p_uom_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_purchase_order_item_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_dry_run boolean DEFAULT false, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_org         uuid;
  v_dry         boolean := COALESCE(p_dry_run, false);
  v_code        text := nullif(btrim(COALESCE(p_code, '')), '');
  v_lc          text;
  v_product     record;
  v_factor      integer;
  v_uom_code    text;
  v_units       numeric;
  v_matched_by  text;
  v_replay      jsonb;
  v_forced      record;
  v_locked      uuid[];
  v_cid         uuid;
  v_open_total  numeric;
  v_open_list   text;
  v_plan        jsonb;
  v_po          record;
  v_r           jsonb;
  v_allocs      jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_to_order    numeric := 0;
  v_to_stock    numeric := 0;
  v_other       integer;
  v_result      jsonb;
  -- NOVO (guia)
  v_note_org       uuid;
  v_note_supplier  uuid;
  v_note_number    text;
  v_note_status    text;
  v_scope          uuid[];
  v_note_poi       uuid[];
  v_note_has_lines boolean := false;
  v_ann            numeric;
  v_rcv            numeric;
  v_checks         jsonb := '[]'::jsonb;
  -- NOVO (códigos)
  v_key            text;
  v_conv           boolean := COALESCE(p_unit_conversion, false);
  v_base_code      text;
  v_line           record;
  v_rest           numeric;
  v_take           numeric;
  v_open_units     numeric;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Identificador do pedido de receção em falta' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 3 permissões (receiving.receive desde 20261210130000); a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['receiving.receive', 'purchase_orders.receive', 'inventory.edit'],
    'receber encomendas desta organização');

  -- Pedido já processado → devolve o resultado gravado.
  v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
  IF v_replay IS NOT NULL THEN
    -- NOVO (guia): o identificador gravado com outra guia (ou sem guia) é erro.
    IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (códigos): gravado com outra opção de conversão de unidades → erro.
    IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
      RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN v_replay;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'A quantidade lida tem de ser positiva' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity <> floor(p_quantity) THEN
    RAISE EXCEPTION 'A quantidade lida tem de ser um número inteiro (%)', p_quantity USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, name, sku, barcode, uom_id INTO v_product
  FROM public.products
  WHERE id = p_product_id AND organization_id = v_org AND deleted_at IS NULL AND NOT is_deleted;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (guia): 1.º lock da ordem global — a guia FOR SHARE (várias leituras
  -- da mesma guia em paralelo; fechar/editar/cancelar esperam). Fixa o
  -- fornecedor e o âmbito.
  IF p_delivery_note_id IS NOT NULL THEN
    SELECT organization_id, supplier_id, note_number, status
    INTO v_note_org, v_note_supplier, v_note_number, v_note_status
    FROM public.supplier_delivery_notes
    WHERE id = p_delivery_note_id
    FOR SHARE;
    IF v_note_org IS NULL OR v_note_org <> v_org THEN
      RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_note_status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
        CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
    END IF;
    p_supplier_id := v_note_supplier;
    v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
    SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
           count(*) > 0
    INTO v_note_poi, v_note_has_lines
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id;
  END IF;

  -- Fator da unidade lida (erro claro se a unidade não for do produto).
  v_factor   := public.fn_uom_units_per(p_uom_id, p_product_id);
  v_uom_code := COALESCE((SELECT code FROM public.uom WHERE id = COALESCE(p_uom_id, v_product.uom_id)), 'un.');
  v_units    := p_quantity * v_factor;
  IF v_units > 2147483647 THEN
    RAISE EXCEPTION 'A leitura excede o limite de stock (% unidades)', v_units USING ERRCODE = 'numeric_value_out_of_range';
  END IF;

  -- Como o código lido corresponde a este produto (só registo/aviso).
  IF v_code IS NOT NULL THEN
    v_lc := lower(v_code);
    v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)
    v_matched_by := CASE
      -- NOVO (códigos): chave normalizada + códigos aprendidos
      WHEN public.fn_product_code_key(v_product.barcode) = v_key
        OR EXISTS (SELECT 1 FROM public.product_codes pc
                   WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
                     AND pc.kind = 'barcode' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'barcode'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.item_suppliers i
                   WHERE i.organization_id = v_org AND i.product_id = p_product_id
                     AND i.deleted_at IS NULL AND lower(btrim(i.supplier_sku)) = v_lc)
        OR EXISTS (SELECT 1 FROM public.product_codes pc  -- NOVO (códigos)
                   WHERE pc.product_id = p_product_id AND pc.organization_id = v_org
                     AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL AND pc.code_key = v_key) THEN 'supplier_sku'
      WHEN lower(btrim(v_product.sku)) = v_lc THEN 'sku'
      WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi
                   JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
                   WHERE po.organization_id = v_org AND poi.product_id = p_product_id
                     AND lower(btrim(poi.sku)) = v_lc) THEN 'po_line_sku'
    END;
    IF v_matched_by IS NULL THEN
      v_warnings := v_warnings || to_jsonb(format('O código «%s» não corresponde a «%s»', v_code, v_product.name));
    END IF;
  END IF;

  -- Linha forçada: validações com mensagens claras.
  IF p_purchase_order_item_id IS NOT NULL THEN
    SELECT poi.id, poi.product_id, poi.item_type, poi.quantity, poi.received_quantity,
           COALESCE(poi.units_per_uom, 1) AS units_per_uom, poi.description,
           po.status, po.supplier_id, po.order_number
    INTO v_forced
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE poi.id = p_purchase_order_item_id AND po.organization_id = v_org AND po.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_forced.item_type <> 'product' OR v_forced.product_id IS DISTINCT FROM p_product_id THEN
      RAISE EXCEPTION 'A linha "%" (%) não é do produto lido', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND v_forced.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'A linha "%" (%) é de outro fornecedor', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (guia): a linha forçada tem de estar no âmbito da guia.
    IF v_scope IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.purchase_order_items poi
      WHERE poi.id = p_purchase_order_item_id AND poi.purchase_order_id = ANY (v_scope)
    ) THEN
      RAISE EXCEPTION 'A linha "%" (%) não está nas encomendas da guia %', v_forced.description, v_forced.order_number, v_note_number
        USING ERRCODE = 'check_violation';
    END IF;
    -- NOVO (códigos): com conversão a linha pode estar noutra unidade (a
    -- divisibilidade é verificada no plano).
    IF NOT v_conv AND v_forced.units_per_uom <> v_factor THEN
      RAISE EXCEPTION 'A linha "%" (%) está noutra unidade (% un. por unidade; a leitura tem %)', v_forced.description, v_forced.order_number, v_forced.units_per_uom, v_factor
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_forced.status NOT IN ('pending', 'ordered', 'partially_received') OR v_forced.quantity <= v_forced.received_quantity THEN
      RAISE EXCEPTION 'A linha "%" (%) não está em aberto', v_forced.description, v_forced.order_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Reserva do identificador (fica com o resultado no fim). Um pedido igual
  -- em paralelo espera aqui pelo primeiro e, quando este confirma, devolve o
  -- resultado gravado. Em dry-run nada é gravado.
  IF NOT v_dry THEN
    INSERT INTO public.receiving_scans (
      id, organization_id, warehouse_id, supplier_id, code, matched_by,
      product_id, uom_id, quantity, units, result, created_by,
      delivery_note_id  -- NOVO (guia)
    ) VALUES (
      p_request_id, v_org, p_warehouse_id, p_supplier_id, v_code, v_matched_by,
      p_product_id, p_uom_id, p_quantity, v_units, '{}'::jsonb, v_actor,
      p_delivery_note_id
    )
    ON CONFLICT (id) DO NOTHING;

    IF NOT FOUND THEN
      v_replay := public.fn_receiving_scan_replay(p_request_id, v_org, v_actor, p_warehouse_id, p_product_id, p_quantity, p_uom_id);
      IF v_replay IS NULL THEN
        RAISE EXCEPTION 'Pedido de receção em conflito — tenta de novo' USING ERRCODE = 'serialization_failure';
      END IF;
      -- NOVO (guia)
      IF (SELECT s.delivery_note_id FROM public.receiving_scans s WHERE s.id = p_request_id) IS DISTINCT FROM p_delivery_note_id THEN
        RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra guia)'
          USING ERRCODE = 'check_violation';
      END IF;
      -- NOVO (códigos)
      IF COALESCE((v_replay ->> 'unit_conversion')::boolean, false) IS DISTINCT FROM v_conv THEN
        RAISE EXCEPTION 'O identificador do pedido de receção já foi usado noutra leitura (outra opção de conversão de unidades)'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN v_replay;
    END IF;
  END IF;

  -- 1. Serializa leituras do mesmo produto.
  PERFORM pg_advisory_xact_lock(hashtextextended('receiving:' || v_org::text || ':' || p_product_id::text, 0));

  BEGIN
    -- 2. Tranca as POs candidatas (ordem fixa por id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]) INTO v_locked
    FROM (
      SELECT po.id
      FROM public.purchase_orders po
      WHERE po.id IN (
              SELECT o.purchase_order_id
              FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
              WHERE (v_conv OR o.units_per_uom = v_factor)  -- NOVO (códigos)
                AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
                AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope)))  -- NOVO (guia)
        AND po.deleted_at IS NULL
        AND po.status IN ('pending', 'ordered', 'partially_received')
      ORDER BY po.id
      FOR UPDATE
    ) t;

    -- 3. Locks das Encomendas Cliente (os da Fase 1), ordem fixa.
    FOR v_cid IN
      SELECT DISTINCT po.source_id
      FROM public.purchase_orders po
      WHERE po.id = ANY (v_locked) AND po.source_type = 'contract' AND po.source_id IS NOT NULL
      ORDER BY po.source_id
    LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_cid::text, 0));
    END LOOP;

    -- 4. Em aberto relido com tudo trancado (só POs trancadas). take = o que
    --    cada linha recebe, enchendo pela ordem D2 (NOVO (guia): primeiro as
    --    linhas indicadas na guia; sem guia a ordem é a mesma).
    IF NOT v_conv THEN  -- caminho da fatia 2 (sem conversão), intacto
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'rn', a.rn, 'purchase_order_id', a.purchase_order_id, 'order_number', a.order_number,
             'po_status', a.po_status, 'purchase_order_item_id', a.purchase_order_item_id,
             'open_quantity', a.open_quantity, 'take', a.take) ORDER BY a.rn), '[]'::jsonb),
           COALESCE(SUM(a.open_quantity), 0),
           string_agg(DISTINCT a.order_number, ', ')
    INTO v_plan, v_open_total, v_open_list
    FROM (
      SELECT c.rn, c.purchase_order_id, c.order_number, c.po_status, c.purchase_order_item_id, c.open_quantity,
             LEAST(c.open_quantity,
                   GREATEST(0, p_quantity - COALESCE(SUM(c.open_quantity) OVER (
                     ORDER BY c.rn ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0))) AS take
      FROM (
        SELECT o.*, row_number() OVER (
                 ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,  -- NOVO (guia)
                          o.allocation_rank) AS rn
        FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
        WHERE o.purchase_order_id = ANY (v_locked)
          AND o.units_per_uom = v_factor
          AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
      ) c
    ) a;

    -- D3: acima do em aberto → recusa tudo.
    IF v_open_total < p_quantity THEN
      RAISE EXCEPTION '%', format('Leste %s %s; em aberto %s %s%s', p_quantity, v_uom_code, v_open_total, v_uom_code,
        CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
             WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
             ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
                         CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor nesta unidade' ELSE ' nesta unidade' END)
        END)
        -- NOVO (guia): âmbito da guia na mensagem ('' sem guia)
        || CASE WHEN p_delivery_note_id IS NOT NULL
                THEN format(' — âmbito da guia %s%s', v_note_number,
                            CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
                                 ELSE ' (encomendas do fornecedor)' END)
                ELSE '' END
        USING ERRCODE = 'check_violation';
    END IF;

    ELSE
      -- NOVO (códigos): conversão caixa↔unidades. Linhas elegíveis = todas as
      -- linhas em aberto trancadas (os fatores das linhas são todos sobre a
      -- unidade de stock do produto — mesma base); ordem = linhas da guia →
      -- D2, sem preferir a unidade lida. Cada linha só leva unidades inteiras
      -- suas: take = LEAST(em aberto, floor(resto / fator)). Resto ≠ 0 →
      -- recusa tudo (mensagens em unidades de stock).
      v_rest := v_units;
      v_open_units := 0;
      v_plan := '[]'::jsonb;
      v_base_code := COALESCE((SELECT code FROM public.uom WHERE id = v_product.uom_id), 'un.');
      FOR v_line IN
        SELECT o.*, row_number() OVER (
                 ORDER BY CASE WHEN o.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END,
                          o.allocation_rank) AS rn
        FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
        WHERE o.purchase_order_id = ANY (v_locked)
          AND o.units_per_uom >= 1
          AND (p_purchase_order_item_id IS NULL OR o.purchase_order_item_id = p_purchase_order_item_id)
        ORDER BY rn
      LOOP
        v_take := LEAST(v_line.open_quantity, floor(v_rest / v_line.units_per_uom));
        v_rest := v_rest - v_take * v_line.units_per_uom;
        v_open_units := v_open_units + v_line.open_quantity * v_line.units_per_uom;
        v_plan := v_plan || jsonb_build_object(
          'rn', v_line.rn, 'purchase_order_id', v_line.purchase_order_id, 'order_number', v_line.order_number,
          'po_status', v_line.po_status, 'purchase_order_item_id', v_line.purchase_order_item_id,
          'open_quantity', v_line.open_quantity, 'take', v_take);
      END LOOP;
      SELECT string_agg(DISTINCT x ->> 'order_number', ', ') INTO v_open_list
      FROM jsonb_array_elements(v_plan) x;

      IF v_rest <> 0 THEN
        RAISE EXCEPTION '%', CASE
          WHEN v_open_units < v_units THEN
            format('Leste %s %s (%s %s); em aberto %s %s%s', p_quantity, v_uom_code, trim_scale(v_units), v_base_code,
                   trim_scale(v_open_units), v_base_code,
                   CASE WHEN v_open_list IS NOT NULL THEN format(' (%s)', v_open_list)
                        WHEN p_purchase_order_item_id IS NOT NULL THEN ' (a linha indicada já não está em aberto)'
                        ELSE format(' — sem encomendas a fornecedor em aberto para «%s»%s', v_product.name,
                                    CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
                   END)
          ELSE
            format('Leste %s %s (%s %s); as linhas em aberto (%s) só recebem unidades inteiras da sua embalagem — ficam %s %s por distribuir',
                   p_quantity, v_uom_code, trim_scale(v_units), v_base_code, v_open_list, trim_scale(v_rest), v_base_code)
          END
          || CASE WHEN p_delivery_note_id IS NOT NULL
                  THEN format(' — âmbito da guia %s%s', v_note_number,
                              CASE WHEN v_scope IS NOT NULL THEN format(' (%s encomenda(s) da guia)', cardinality(v_scope))
                                   ELSE ' (encomendas do fornecedor)' END)
                  ELSE '' END
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- NOVO (guia): avisos de anunciado (decisão 1: aviso + confirmação no
    -- ecrã). Com o lock do produto detido, o recebido pela guia é estável.
    IF p_delivery_note_id IS NOT NULL AND v_note_has_lines THEN
      SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
      FROM public.supplier_delivery_note_lines l
      WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = p_product_id;
      IF v_ann = 0 THEN
        v_checks   := v_checks || to_jsonb('nao_consta_da_guia'::text);
        v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_product.name, v_note_number));
      ELSE
        SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
        FROM public.purchase_order_receipts pr
        WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = p_product_id
          AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
        IF v_rcv + v_units > v_ann THEN
          v_checks   := v_checks || to_jsonb('acima_do_anunciado'::text);
          v_warnings := v_warnings || to_jsonb(format('«%s»: com esta leitura ficam %s un. recebidas pela guia %s; anunciadas %s un.',
                          v_product.name, trim_scale(v_rcv + v_units), v_note_number, trim_scale(v_ann)));
        END IF;
      END IF;
    END IF;

    -- 5. Receção pela Fase 1, uma chamada por PO, pela ordem D2 (os locks já
    --    estão todos detidos, a ordem das chamadas não cria esperas novas).
    FOR v_po IN
      SELECT l.purchase_order_id, min(l.order_number) AS order_number,
             bool_or(l.po_status = 'pending') AS pending,
             jsonb_agg(jsonb_build_object('purchase_order_item_id', l.purchase_order_item_id, 'quantity', l.take) ORDER BY l.rn) AS lines,
             array_agg(l.purchase_order_item_id ORDER BY l.rn) AS ids
      FROM jsonb_to_recordset(v_plan) AS l(rn bigint, purchase_order_id uuid, order_number text, po_status text,
                                           purchase_order_item_id uuid, open_quantity numeric, take numeric)
      WHERE l.take > 0
      GROUP BY l.purchase_order_id
      ORDER BY min(l.rn)
    LOOP
      v_r := public.rpc_receive_purchase_order_lines(v_po.purchase_order_id, p_warehouse_id, v_po.lines, NULL);

      IF NOT v_dry THEN
        -- Liga as linhas de histórico acabadas de gravar pela Fase 1 a esta
        -- leitura (received_at = now() = início da transação; received_by =
        -- current_business_user_id(), como a Fase 1 grava).
        UPDATE public.purchase_order_receipts
        SET receiving_scan_id = p_request_id,
            delivery_note_id  = p_delivery_note_id  -- NOVO (guia); NULL sem guia (já era NULL)
        WHERE purchase_order_id = v_po.purchase_order_id
          AND purchase_order_item_id = ANY (v_po.ids)
          AND kind = 'receipt'
          AND receiving_scan_id IS NULL
          AND received_at = now()
          AND received_by = v_actor;
      END IF;

      IF v_po.pending THEN
        v_warnings := v_warnings || to_jsonb(format('%s ainda está pendente (não confirmada ao fornecedor)', v_po.order_number));
      END IF;

      v_allocs := v_allocs || jsonb_build_object(
        'purchase_order_id',    v_po.purchase_order_id,
        'order_number',         v_r -> 'order_number',
        'status',               v_r -> 'status',
        'stock_skipped',        v_r -> 'stock_skipped',
        'units_to_order_total', v_r -> 'units_to_order_total',
        'units_to_stock_total', v_r -> 'units_to_stock_total',
        'lines',                v_r -> 'lines'
      );
      v_to_order := v_to_order + COALESCE((v_r ->> 'units_to_order_total')::numeric, 0);
      v_to_stock := v_to_stock + COALESCE((v_r ->> 'units_to_stock_total')::numeric, 0);
    END LOOP;

    IF v_dry THEN
      RAISE EXCEPTION USING ERRCODE = 'OLPV2', MESSAGE = 'receive_by_code_dry_run_rollback';
    END IF;
  EXCEPTION WHEN SQLSTATE 'OLPV2' THEN
    NULL;  -- dry-run: tudo o que a receção escreveu foi desfeito com a subtransação
  END;

  SELECT count(*) INTO v_other
  FROM public.fn_receiving_open_lines(v_org, ARRAY[p_product_id], p_supplier_id) o
  WHERE NOT v_conv AND o.units_per_uom <> v_factor  -- NOVO (códigos): com conversão nenhuma fica de fora
    AND (v_scope IS NULL OR o.purchase_order_id = ANY (v_scope));  -- NOVO (guia)
  IF v_other > 0 THEN
    v_warnings := v_warnings || to_jsonb(format('%s linha(s) em aberto de «%s» noutra unidade não entraram nesta leitura', v_other, v_product.name));
  END IF;

  v_result := jsonb_build_object(
    'request_id',           p_request_id,
    'replayed',             false,
    'dry_run',              v_dry,
    'product_id',           p_product_id,
    'warehouse_id',         p_warehouse_id,
    'supplier_id',          p_supplier_id,
    'uom_id',               p_uom_id,
    'uom_code',             v_uom_code,
    'units_per_uom',        v_factor,
    'quantity',             p_quantity,
    'units',                v_units,
    'matched_by',           v_matched_by,
    'allocations',          v_allocs,
    'units_to_order_total', v_to_order,
    'units_to_stock_total', v_to_stock,
    'warnings',             v_warnings
  ) || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia): '{}' sem guia
            THEN jsonb_build_object('delivery_note_id', p_delivery_note_id,
                                    'delivery_note_number', v_note_number,
                                    'delivery_note_checks', v_checks)
            ELSE '{}'::jsonb END
    || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)

  IF NOT v_dry THEN
    UPDATE public.receiving_scans SET result = v_result WHERE id = p_request_id;
  END IF;

  RETURN v_result;
END;
$function$;

-- ======================================================================
-- rpc_preview_po_receipt
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_preview_po_receipt(p_purchase_order_id uuid, p_lines jsonb DEFAULT NULL::jsonb, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org     uuid;
  v_wh      uuid := p_warehouse_id;
  v_lines   jsonb := p_lines;
  v_result  jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['purchase_orders.receive', 'inventory.edit'],
    'receber encomendas desta organização');

  IF v_wh IS NULL THEN
    SELECT id INTO v_wh
    FROM public.warehouses
    WHERE organization_id = v_org AND deleted_at IS NULL
    ORDER BY created_at, id
    LIMIT 1;
  END IF;

  IF v_lines IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'purchase_order_item_id', id,
             'quantity', (quantity - received_quantity)
           )), '[]'::jsonb)
    INTO v_lines
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id
      AND item_type = 'product'
      AND quantity > received_quantity;
  END IF;

  BEGIN
    v_result := public.rpc_receive_purchase_order_lines(p_purchase_order_id, v_wh, v_lines, NULL);
    RAISE EXCEPTION USING ERRCODE = 'OLPV1', MESSAGE = 'preview_rollback';
  EXCEPTION WHEN SQLSTATE 'OLPV1' THEN
    NULL;  -- tudo o que a receção escreveu foi desfeito com a subtransação
  END;

  RETURN jsonb_build_object(
    'preview',              true,
    'order_number',         v_result -> 'order_number',
    'status',               v_result -> 'status',
    'stock_skipped',        v_result -> 'stock_skipped',
    'units_to_order_total', v_result -> 'units_to_order_total',
    'units_to_stock_total', v_result -> 'units_to_stock_total',
    'lines', COALESCE((
      SELECT jsonb_agg(l.value - 'balance_after' ORDER BY l.ord)
      FROM jsonb_array_elements(v_result -> 'lines') WITH ORDINALITY AS l(value, ord)
    ), '[]'::jsonb)
  );
END;
$function$;

-- ======================================================================
-- rpc_po_receipt_release_to_stock
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_po_receipt_release_to_stock(p_item_ids uuid[], p_warehouse_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor            uuid;
  v_org              uuid;
  v_org_count        integer;
  v_po               record;
  v_item             record;
  v_cc               record;
  v_units            integer;
  v_pending          numeric;
  v_mov_units        numeric;
  v_unit_cost        numeric;
  v_item_supplier_id uuid;
  v_movement_id      uuid;
  v_balance          integer;
  v_reason           text := nullif(btrim(COALESCE(p_reason, '')), '');
  v_lines_out        jsonb := '[]'::jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para passar para stock' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  -- Todas as linhas da mesma organização.
  SELECT min(po.organization_id::text)::uuid, count(DISTINCT po.organization_id)
  INTO v_org, v_org_count
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  WHERE poi.id = ANY (p_item_ids);

  IF v_org IS NULL OR (SELECT count(*) FROM public.purchase_order_items WHERE id = ANY (p_item_ids)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'Linha de encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_org_count <> 1 THEN
    RAISE EXCEPTION 'As linhas têm de ser todas da mesma organização' USING ERRCODE = 'check_violation';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['purchase_orders.receive', 'inventory.edit'],
    'receber encomendas desta organização');

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Armazém inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- Trancar as POs (mesma ordem sempre) — serializa com receções/reversões.
  PERFORM 1
  FROM public.purchase_orders po
  WHERE po.id IN (SELECT purchase_order_id FROM public.purchase_order_items WHERE id = ANY (p_item_ids))
  ORDER BY po.id
  FOR UPDATE;

  FOR v_item IN
    SELECT poi.id, poi.purchase_order_id, poi.product_id, poi.item_type, poi.description,
           poi.quantity, poi.received_quantity, poi.received_to_stock_units, poi.unit_price,
           poi.uom_id, COALESCE(poi.units_per_uom, 1) AS units_per_uom
    FROM public.purchase_order_items poi
    WHERE poi.id = ANY (p_item_ids)
    ORDER BY poi.id
    FOR UPDATE
  LOOP
    SELECT id, organization_id, order_number, status, source_type, source_id, supplier_id, deleted_at
    INTO v_po
    FROM public.purchase_orders WHERE id = v_item.purchase_order_id;

    IF v_po.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A encomenda % foi apagada', v_po.order_number USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto', v_item.description USING ERRCODE = 'check_violation';
    END IF;
    IF v_po.source_type IS DISTINCT FROM 'contract' THEN
      RAISE EXCEPTION 'A linha "%" é de uma encomenda de stock — o recebido já está em stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT cc.id, COALESCE(cc.order_number, cc.contract_number) AS num,
           (cc.deleted_at IS NULL AND cc.status IN ('signed', 'assinado')) AS active
    INTO v_cc
    FROM public.client_contracts cc
    WHERE cc.id = v_po.source_id AND cc.organization_id = v_po.organization_id;

    IF FOUND AND v_cc.active THEN
      RAISE EXCEPTION 'A encomenda cliente % da linha "%" está ativa — o recebido pertence-lhe e não pode passar para stock',
        v_cc.num, v_item.description USING ERRCODE = 'check_violation';
    END IF;

    v_units   := v_item.units_per_uom;
    v_pending := v_item.received_quantity * v_units - v_item.received_to_stock_units;

    IF v_pending <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida por passar para stock', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_pending <> floor(v_pending) OR v_pending > 2147483647 THEN
      RAISE EXCEPTION 'A linha "%" tem uma quantidade por passar para stock inválida (%)', v_item.description, v_pending
        USING ERRCODE = 'check_violation';
    END IF;

    -- As entradas por estornar da linha têm de bater com o que já está
    -- marcado como stock; senão (p.ex. entrada antiga de PO-2026-0010) a
    -- passagem duplicaria stock.
    SELECT COALESCE(sum(m.quantity), 0) INTO v_mov_units
    FROM public.stock_movements m
    WHERE m.reference_id = v_item.id
      AND m.organization_id = v_po.organization_id
      AND m.product_id = v_item.product_id
      AND m.document_type = 'compra'
      AND m.movement_type = 'entrada'
      AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of_movement_id = m.id);

    IF v_mov_units <> v_item.received_to_stock_units THEN
      RAISE EXCEPTION 'Não é possível passar "%" para stock automaticamente: as entradas de stock da linha (% un.) não batem com o registado (% un.)',
        v_item.description, v_mov_units, v_item.received_to_stock_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_unit_cost := CASE WHEN v_units = 1 THEN v_item.unit_price
                        ELSE round(v_item.unit_price / v_units, 6) END;

    SELECT id INTO v_item_supplier_id
    FROM public.item_suppliers
    WHERE product_id = v_item.product_id
      AND supplier_id = v_po.supplier_id
      AND deleted_at IS NULL
    ORDER BY (uom_id IS NOT DISTINCT FROM v_item.uom_id) DESC, is_preferred DESC
    LIMIT 1;

    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      reference_id, notes, created_by
    ) VALUES (
      v_po.organization_id, v_item.product_id, p_warehouse_id, 'entrada', v_pending::integer,
      v_po.order_number, 'compra', v_item_supplier_id, v_unit_cost,
      v_item.id,
      format('Passagem para stock de %s: %s unidades recebidas para a encomenda cliente %s (inativa)%s',
             v_po.order_number, v_pending, COALESCE(v_cc.num, '?'),
             CASE WHEN v_reason IS NOT NULL THEN format(' (motivo: %s)', v_reason) ELSE '' END),
      v_actor
    )
    RETURNING id, balance_after INTO v_movement_id, v_balance;

    UPDATE public.purchase_order_items
    SET received_to_stock_units = received_to_stock_units + v_pending
    WHERE id = v_item.id;

    INSERT INTO public.purchase_order_receipts (
      organization_id, purchase_order_id, purchase_order_item_id, product_id, kind,
      warehouse_id, quantity, units_per_uom, units_to_order, units_to_stock,
      contract_id, allocation_reason, stock_movement_id, notes, received_by
    ) VALUES (
      v_po.organization_id, v_po.id, v_item.id, v_item.product_id, 'release_to_stock',
      p_warehouse_id, 0, v_units, 0, v_pending,
      v_po.source_id, 'client_order_inactive', v_movement_id, v_reason, v_actor
    );

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'purchase_order_id',      v_po.id,
      'order_number',           v_po.order_number,
      'product_id',             v_item.product_id,
      'units_to_stock',         v_pending,
      'qty_to_stock',           round(v_pending / v_units, 4),
      'contract_id',            v_po.source_id,
      'contract_order_number',  v_cc.num,
      'balance_after',          v_balance
    );
  END LOOP;

  RETURN jsonb_build_object('warehouse_id', p_warehouse_id, 'lines', v_lines_out);
END;
$function$;

-- ======================================================================
-- rpc_revert_purchase_order_receipt
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_revert_purchase_order_receipt(p_purchase_order_id uuid, p_item_ids uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor          uuid;
  v_po             public.purchase_orders%ROWTYPE;
  v_reason         text;
  v_skip_stock     boolean;
  v_item_id        uuid;
  v_item           record;
  v_line_mov_ids   uuid[];
  v_line_mov_units bigint;
  v_line_expected  numeric;
  v_all_mov_ids    uuid[] := ARRAY[]::uuid[];
  v_lines_out      jsonb := '[]'::jsonb;
  v_audit_lines    jsonb := '[]'::jsonb;
  v_grp            record;
  v_stock_qty      integer;
  v_stock_cost     numeric;
  v_new_cost       numeric;
  v_mov            public.stock_movements%ROWTYPE;
  v_sum_quantity   numeric;
  v_sum_received   numeric;
  v_new_status     text;
  v_prev_bypass    text;
  v_diff           jsonb;
  -- NOVO (20261206130000)
  v_line_legacy    boolean;
  v_rev_mov_id     uuid;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- Trancar a encomenda serializa com receções e reversões concorrentes
  -- (rpc_receive_purchase_order_lines tranca-a da mesma forma).
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.status NOT IN ('received', 'partially_received') THEN
    RAISE EXCEPTION 'Só é possível reverter a receção de encomendas recebidas ou parcialmente recebidas (estado atual: %)', v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para reverter receções desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_po.organization_id,
    ARRAY['purchase_orders.revert_receipt', 'inventory.edit'],
    'reverter receções desta organização');

  v_reason := btrim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indica o motivo da reversão (pelo menos 3 caracteres)' USING ERRCODE = 'check_violation';
  END IF;

  IF p_item_ids IS NULL OR cardinality(p_item_ids) = 0 THEN
    RAISE EXCEPTION 'Escolhe pelo menos uma linha para reverter' USING ERRCODE = 'check_violation';
  END IF;
  IF array_position(p_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'A lista de linhas tem valores vazios' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_item_ids) AS t(x)) <> cardinality(p_item_ids) THEN
    RAISE EXCEPTION 'A lista de linhas tem linhas repetidas' USING ERRCODE = 'check_violation';
  END IF;

  v_skip_stock := (v_po.source_type = 'contract');

  -- ── 1. Validar e trancar as linhas e as entradas de stock de cada uma ──
  FOREACH v_item_id IN ARRAY p_item_ids
  LOOP
    SELECT id, product_id, item_type, quantity, received_quantity, description,
           COALESCE(units_per_uom, 1) AS units_per_uom,
           received_to_stock_units  -- NOVO (20261206130000)
    INTO v_item
    FROM public.purchase_order_items
    WHERE id = v_item_id AND purchase_order_id = p_purchase_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha de encomenda % não encontrada nesta encomenda', v_item_id
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_item.item_type <> 'product' THEN
      RAISE EXCEPTION 'A linha "%" não é um produto — serviços não têm receção de stock a reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_item.received_quantity IS NULL OR v_item.received_quantity <= 0 THEN
      RAISE EXCEPTION 'A linha "%" não tem quantidade recebida para reverter', v_item.description
        USING ERRCODE = 'check_violation';
    END IF;

    -- Entradas da receção desta linha ainda sem estorno. O filtro por
    -- organização e produto usa idx_stock_movements_product (não há índice
    -- em reference_id).
    SELECT COALESCE(array_agg(t.id ORDER BY t.id), ARRAY[]::uuid[]),
           COALESCE(sum(t.quantity), 0)
    INTO v_line_mov_ids, v_line_mov_units
    FROM (
      SELECT m.id, m.quantity
      FROM public.stock_movements m
      WHERE m.reference_id = v_item.id
        AND m.organization_id = v_po.organization_id
        AND m.product_id = v_item.product_id
        AND m.document_type = 'compra'
        AND m.movement_type = 'entrada'
        AND NOT EXISTS (
          SELECT 1 FROM public.stock_movements r
          WHERE r.reversal_of_movement_id = m.id
        )
      ORDER BY m.id
      FOR UPDATE OF m
    ) t;

    -- NOVO (20261206130000): as entradas por estornar têm de explicar a
    -- parte da linha que foi para stock (received_to_stock_units); a parte
    -- entregue à Encomenda Cliente não tem movimento e só repõe contadores.
    -- PO de stock: received_to_stock_units = recebido × fator (backfill),
    -- exatamente a verificação anterior. PO de contrato sem entradas: 0.
    -- Legado (receção anterior a esta migração, sem linhas em
    -- purchase_order_receipts) com entradas = recebido × fator, como antes
    -- (PO-2026-0010): continua a reverter-se.
    v_line_expected := v_item.received_to_stock_units;
    v_line_legacy := NOT EXISTS (
        SELECT 1 FROM public.purchase_order_receipts pr
        WHERE pr.purchase_order_item_id = v_item.id
      )
      AND v_line_mov_units = v_item.received_quantity * v_item.units_per_uom;

    IF v_line_mov_units <> v_line_expected AND NOT v_line_legacy THEN
      RAISE EXCEPTION 'Não é possível reverter "%" automaticamente: a linha tem % recebidas (% unidades de stock deram entrada em stock), mas as entradas de stock por estornar somam % unidades',
        v_item.description, v_item.received_quantity, v_line_expected, v_line_mov_units
        USING ERRCODE = 'check_violation';
    END IF;

    v_all_mov_ids := v_all_mov_ids || v_line_mov_ids;

    v_lines_out := v_lines_out || jsonb_build_object(
      'purchase_order_item_id', v_item.id,
      'description',            v_item.description,
      'quantity_reverted',      v_item.received_quantity,
      'stock_reverted',         cardinality(v_line_mov_ids) > 0,
      'movements_reverted',     cardinality(v_line_mov_ids),
      -- NOVO (20261206130000)
      'units_reverted_from_stock',        v_line_mov_units,
      'units_reverted_from_client_order', GREATEST(0, v_item.received_quantity * v_item.units_per_uom - v_line_mov_units)
    );
  END LOOP;

  -- ── 2. Stock suficiente e custo médio, por produto/armazém ──
  -- Tudo verificado antes do primeiro estorno. Ordem fixa para trancar
  -- stocks sempre pela mesma sequência.
  FOR v_grp IN
    SELECT m.product_id,
           m.warehouse_id,
           sum(m.quantity)::bigint                        AS qty,
           bool_or(m.unit_cost_at_time IS NULL)           AS any_cost_null,
           sum(m.unit_cost_at_time * m.quantity)          AS cost_total,
           string_agg(DISTINCT poi.description, '", "')   AS descriptions,
           w.name                                         AS warehouse_name
    FROM public.stock_movements m
    JOIN public.purchase_order_items poi ON poi.id = m.reference_id
    LEFT JOIN public.warehouses w ON w.id = m.warehouse_id
    WHERE m.id = ANY (v_all_mov_ids)
    GROUP BY m.product_id, m.warehouse_id, w.name
    ORDER BY m.product_id, m.warehouse_id
  LOOP
    v_stock_qty  := NULL;
    v_stock_cost := NULL;

    SELECT s.quantity, s.average_cost
    INTO v_stock_qty, v_stock_cost
    FROM public.stocks s
    WHERE s.product_id = v_grp.product_id
      AND s.warehouse_id = v_grp.warehouse_id
    FOR UPDATE;

    IF COALESCE(v_stock_qty, 0) < v_grp.qty THEN
      RAISE EXCEPTION 'Não é possível reverter "%": o armazém % tem % unidades e a receção deu entrada de % (já saiu stock)',
        v_grp.descriptions, COALESCE(v_grp.warehouse_name, v_grp.warehouse_id::text),
        COALESCE(v_stock_qty, 0), v_grp.qty
        USING ERRCODE = 'check_violation';
    END IF;

    -- Repor o custo médio antes dos estornos: o apply lê average_cost desta
    -- linha e volta a gravá-lo tal como está.
    IF v_stock_qty - v_grp.qty > 0
       AND v_stock_cost IS NOT NULL
       AND NOT v_grp.any_cost_null THEN
      v_new_cost := round(
        ((v_stock_cost * v_stock_qty) - v_grp.cost_total) / (v_stock_qty - v_grp.qty),
        4
      );
      IF v_new_cost >= 0 AND v_new_cost IS DISTINCT FROM v_stock_cost THEN
        UPDATE public.stocks
        SET average_cost = v_new_cost,
            updated_at   = now()
        WHERE product_id = v_grp.product_id
          AND warehouse_id = v_grp.warehouse_id;
      END IF;
    END IF;
  END LOOP;

  -- ── 3. Estornos ──
  FOR v_mov IN
    SELECT m.*
    FROM public.stock_movements m
    WHERE m.id = ANY (v_all_mov_ids)
    ORDER BY m.product_id, m.warehouse_id, m.created_at, m.id
  LOOP
    INSERT INTO public.stock_movements (
      organization_id, product_id, warehouse_id, movement_type, quantity,
      document_number, document_type, item_supplier_id, unit_cost_at_time,
      supplier_sku_at_time, reference_id, reversal_of_movement_id, notes, created_by
    ) VALUES (
      v_mov.organization_id, v_mov.product_id, v_mov.warehouse_id, 'ajuste_negativo', v_mov.quantity,
      v_mov.document_number, 'compra', v_mov.item_supplier_id, v_mov.unit_cost_at_time,
      v_mov.supplier_sku_at_time, v_mov.reference_id, v_mov.id,
      format('Estorno da receção de %s: %s unidades (motivo: %s)', v_po.order_number, v_mov.quantity, v_reason),
      v_actor
    )
    RETURNING id INTO v_rev_mov_id;  -- NOVO (20261206130000)

    UPDATE public.purchase_order_receipts
    SET revert_movement_id = v_rev_mov_id
    WHERE stock_movement_id = v_mov.id
      AND purchase_order_item_id = v_mov.reference_id;
  END LOOP;

  -- NOVO (20261206130000): receções destas linhas ficam marcadas como
  -- revertidas (o histórico não se apaga).
  UPDATE public.purchase_order_receipts
  SET reverted_at   = now(),
      reverted_by   = v_actor,
      revert_reason = v_reason
  WHERE purchase_order_item_id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id
    AND reverted_at IS NULL;

  -- ── 4. Linhas e estado da encomenda ──
  -- A encomenda e as linhas ficam numa única linha de auditoria (abaixo);
  -- o bypass só cobre estes dois UPDATE e é reposto a seguir.
  v_prev_bypass := current_setting('app.audit_bypass', true);
  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.purchase_order_items
  SET received_quantity       = 0,
      received_to_stock_units = 0  -- NOVO (20261206130000)
  WHERE id = ANY (p_item_ids)
    AND purchase_order_id = p_purchase_order_id;

  SELECT COALESCE(sum(quantity), 0), COALESCE(sum(received_quantity), 0)
  INTO v_sum_quantity, v_sum_received
  FROM public.purchase_order_items
  WHERE purchase_order_id = p_purchase_order_id AND item_type = 'product';

  IF v_sum_received > 0 THEN
    v_new_status := 'partially_received';
  ELSE
    -- Último estado anterior à receção. Gatilho genérico: status em
    -- changed_fields (UPDATE) ou full_record (INSERT), record_id = PO;
    -- rpc_update_purchase_order: changed_fields.purchase_orders.status,
    -- entity_id = PO e record_id NULL. Dentro da mesma linha, 'new' é
    -- posterior a 'old'.
    SELECT v.val
    INTO v_new_status
    FROM public.entity_audit_log a
    CROSS JOIN LATERAL (VALUES
      (1, a.full_record ->> 'status'),
      (2, a.changed_fields #>> '{status,old}'),
      (3, a.changed_fields #>> '{status,new}'),
      (2, a.changed_fields #>> '{purchase_orders,status,old}'),
      (3, a.changed_fields #>> '{purchase_orders,status,new}')
    ) AS v(ord, val)
    WHERE a.table_name = 'purchase_orders'
      AND (a.record_id = p_purchase_order_id OR a.entity_id = p_purchase_order_id)
      AND v.val IN ('pending', 'ordered')
    ORDER BY a.created_at DESC, v.ord DESC
    LIMIT 1;

    v_new_status := COALESCE(v_new_status, 'ordered');
  END IF;

  UPDATE public.purchase_orders
  SET status               = v_new_status,
      actual_delivery_date = NULL,
      updated_at           = now()
  WHERE id = p_purchase_order_id;

  PERFORM set_config('app.audit_bypass', COALESCE(v_prev_bypass, ''), true);

  SELECT COALESCE(jsonb_agg(
           (l.value - 'quantity_reverted')
           || jsonb_build_object(
                'received_quantity', jsonb_build_object('old', l.value -> 'quantity_reverted', 'new', 0)
              )
         ), '[]'::jsonb)
  INTO v_audit_lines
  FROM jsonb_array_elements(v_lines_out) AS l(value);

  v_diff := jsonb_build_object(
    'status', jsonb_build_object('old', v_po.status, 'new', v_new_status),
    'receipt_reversal', jsonb_build_object(
      'reason',               v_reason,
      'lines',                v_audit_lines,
      'reversal_of_movement_ids', to_jsonb(v_all_mov_ids)
    )
  );
  IF v_po.actual_delivery_date IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'actual_delivery_date', jsonb_build_object('old', v_po.actual_delivery_date, 'new', NULL)
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_purchase_order_id, v_po.organization_id, 'UPDATE', v_diff, 'web_app', p_purchase_order_id
  );

  RETURN jsonb_build_object(
    'order_number', v_po.order_number,
    'status',       v_new_status,
    'lines',        v_lines_out
  );
END;
$function$;

-- ======================================================================
-- fn_po_cancel_remainder_guard
-- ======================================================================
CREATE OR REPLACE FUNCTION public.fn_po_cancel_remainder_guard(p_purchase_order_id uuid)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_po.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para alterar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões (anular/repor resto de PO); a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_po.organization_id,
    ARRAY['purchase_orders.receive', 'inventory.edit'],
    'alterar encomendas desta organização');

  IF v_po.source_type = 'contract' AND v_po.source_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('po_receipt_contract:' || v_po.source_id::text, 0));
  END IF;

  RETURN v_po;
END;
$function$;

-- ======================================================================
-- rpc_request_missing_from_supplier
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_request_missing_from_supplier(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_org    uuid;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_contract_id IS NULL THEN
    RAISE EXCEPTION 'contract_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.create')
     OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN  -- NOVO (20261205000000): era client_contracts.view
    -- 18/11 perm: mesma verificação; a mensagem diz quais faltam (em nenhuma organização).
    RAISE EXCEPTION 'Sem permissão para pedir material ao fornecedor. Falta: %',
      public.fn_permissoes_rotulo(ARRAY(
        SELECT x.c FROM unnest(ARRAY['purchase_orders.create', 'client_orders.view']) WITH ORDINALITY AS x(c, o)
        WHERE NOT public.has_anew_permission(auth.uid(), x.c) ORDER BY x.o))
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT cc.organization_id, cc.status
    INTO v_org, v_status
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id
    AND cc.deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
     OR NOT public.fn_deal_org_in_scope(v_org) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesmas 2 permissões na organização da encomenda; a mensagem diz quais faltam.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['purchase_orders.create', 'client_orders.view'],
    'pedir material ao fornecedor nesta organização');

  IF v_status IS NULL OR v_status NOT IN ('signed', 'assinado') THEN
    RAISE EXCEPTION 'Só é possível pedir material para encomendas ativas (assinadas)' USING ERRCODE = 'check_violation';
  END IF;

  v_result := public.fn_client_order_request_missing(p_contract_id, v_actor, NULL);

  RETURN jsonb_build_object(
    'success',                 COALESCE((v_result ->> 'success')::boolean, false),
    'purchase_orders_created', COALESCE((v_result ->> 'purchase_orders_created')::int, 0),
    'items_created',           COALESCE((v_result ->> 'items_created')::int, 0),
    'skipped_no_supplier',     COALESCE((v_result ->> 'skipped_no_supplier')::int, 0),
    'skipped_other',           COALESCE((v_result ->> 'skipped_other')::int, 0),
    'errors',                  COALESCE((v_result ->> 'errors')::int, 0)
  );
END;
$function$;

-- ======================================================================
-- rpc_receiving_lookup
-- ======================================================================
CREATE OR REPLACE FUNCTION public.rpc_receiving_lookup(p_warehouse_id uuid, p_code text, p_supplier_id uuid DEFAULT NULL::uuid, p_delivery_note_id uuid DEFAULT NULL::uuid, p_unit_conversion boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org         uuid;
  v_code        text := btrim(COALESCE(p_code, ''));
  v_lc          text;
  v_can_receive boolean;
  v_level       integer;
  v_cand        record;
  v_factor      integer;
  v_lines       jsonb;
  v_candidates  jsonb := '[]'::jsonb;
  v_warnings    jsonb := '[]'::jsonb;
  v_other       integer;
  v_other_txt   text;
  v_matches     jsonb;
  -- NOVO (guia)
  v_note_org       uuid;
  v_note_supplier  uuid;
  v_note_number    text;
  v_note_status    text;
  v_scope          uuid[];
  v_note_poi       uuid[];
  v_note_has_lines boolean := false;
  v_ann            numeric;
  v_rcv            numeric;
  v_note_info      jsonb := '{}'::jsonb;
  -- NOVO (códigos)
  v_key            text;
  v_conv           boolean := COALESCE(p_unit_conversion, false);
BEGIN
  SELECT organization_id INTO v_org
  FROM public.warehouses
  WHERE id = p_warehouse_id AND deleted_at IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para consultar encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 18/11 perm: mesma regra (receiving.view E (purchase_orders.receive OU purchase_orders.view)); a mensagem diz o que falta.
  PERFORM public.fn_exigir_permissoes(v_org,
    ARRAY['receiving.view', 'purchase_orders.receive|purchase_orders.view'],
    'consultar encomendas desta organização');

  v_can_receive := public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org)  -- NOVO (20261210130000)
               AND public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
               AND public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org);

  IF v_code = '' THEN
    RAISE EXCEPTION 'Indica o código lido' USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_code) > 200 THEN
    RAISE EXCEPTION 'Código lido demasiado longo' USING ERRCODE = 'check_violation';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND organization_id = v_org AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Fornecedor inválido para esta organização' USING ERRCODE = 'check_violation';
  END IF;

  -- NOVO (guia): a guia fixa o fornecedor e o âmbito (POs da guia, ou todas
  -- as do fornecedor se não tiver POs).
  IF p_delivery_note_id IS NOT NULL THEN
    SELECT organization_id, supplier_id, note_number, status
    INTO v_note_org, v_note_supplier, v_note_number, v_note_status
    FROM public.supplier_delivery_notes
    WHERE id = p_delivery_note_id;
    IF v_note_org IS NULL OR v_note_org <> v_org THEN
      RAISE EXCEPTION 'Guia do fornecedor não encontrada nesta organização' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_note_status <> 'open' THEN
      RAISE EXCEPTION 'A guia % está % — reabre-a para receber', v_note_number,
        CASE v_note_status WHEN 'closed' THEN 'fechada' ELSE 'cancelada' END
        USING ERRCODE = 'check_violation';
    END IF;
    IF p_supplier_id IS NOT NULL AND p_supplier_id <> v_note_supplier THEN
      RAISE EXCEPTION 'A guia % é de outro fornecedor', v_note_number USING ERRCODE = 'check_violation';
    END IF;
    p_supplier_id := v_note_supplier;
    v_scope := public.fn_delivery_note_scope(p_delivery_note_id);
    SELECT array_agg(DISTINCT l.purchase_order_item_id) FILTER (WHERE l.purchase_order_item_id IS NOT NULL),
           count(*) > 0
    INTO v_note_poi, v_note_has_lines
    FROM public.supplier_delivery_note_lines l
    WHERE l.delivery_note_id = p_delivery_note_id;
    v_note_info := jsonb_build_object('delivery_note', jsonb_build_object(
      'id', p_delivery_note_id, 'note_number', v_note_number, 'status', v_note_status,
      'supplier_id', v_note_supplier, 'purchase_order_ids', to_jsonb(v_scope), 'has_lines', v_note_has_lines));
  END IF;

  v_lc := lower(v_code);
  v_key := public.fn_product_code_key(v_code);  -- NOVO (códigos)

  -- Correspondências (produto, unidade, nível) num jsonb — sem tabelas
  -- temporárias (função STABLE).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', mm.product_id, 'uom_id', mm.uom_id,
                                               'matched_by', mm.matched_by, 'lvl', mm.lvl,
                                               'code_id', mm.code_id)), '[]'::jsonb)  -- NOVO (códigos): code_id
  INTO v_matches
  FROM (
  -- 1 código de barras
  SELECT p.id AS product_id, NULL::uuid AS uom_id, 'barcode'::text AS matched_by, 1 AS lvl, NULL::uuid AS code_id
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND public.fn_product_code_key(p.barcode) = v_key  -- NOVO (códigos): chave normalizada (GTIN)
  UNION
  -- 1b NOVO (códigos): código de barras aprendido (unidade do código)
  SELECT pc.product_id, pc.uom_id, 'barcode', 1, pc.id
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.kind = 'barcode' AND pc.deleted_at IS NULL
    AND pc.code_key = v_key
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
  UNION
  -- 2a referência do fornecedor nas linhas em aberto
  SELECT poi.product_id, poi.uom_id, 'supplier_sku', 2, NULL::uuid
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.organization_id = v_org AND po.deleted_at IS NULL
    AND po.status IN ('pending', 'ordered', 'partially_received')
    AND poi.item_type = 'product' AND poi.quantity > poi.received_quantity
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(poi.supplier_sku)) = v_lc
  UNION
  -- 2b referência do fornecedor na ficha do produto (item_suppliers)
  SELECT i.product_id, i.uom_id, 'supplier_sku', 2, NULL::uuid
  FROM public.item_suppliers i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.organization_id = v_org AND i.deleted_at IS NULL AND i.product_id IS NOT NULL
    AND (p_supplier_id IS NULL OR i.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(i.supplier_sku)) = v_lc
  UNION
  -- 2c NOVO (códigos): referência do fornecedor aprendida (filtrada pelo
  -- fornecedor quando há; unidade do código)
  SELECT pc.product_id, pc.uom_id, 'supplier_sku', 2, pc.id
  FROM public.product_codes pc
  JOIN public.products p ON p.id = pc.product_id
  WHERE pc.organization_id = v_org AND pc.kind = 'supplier_ref' AND pc.deleted_at IS NULL
    AND pc.code_key = v_key
    AND (p_supplier_id IS NULL OR pc.supplier_id = p_supplier_id)
    AND p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
  UNION
  -- 3 SKU do produto
  SELECT p.id, NULL::uuid, 'sku', 3, NULL::uuid
  FROM public.products p
  WHERE p.organization_id = v_org AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(p.sku)) = v_lc
  UNION
  -- 4 SKU gravado nas linhas das POs da organização
  SELECT poi.product_id, NULL::uuid, 'po_line_sku', 4, NULL::uuid
  FROM public.purchase_order_items poi
  JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
  JOIN public.products p ON p.id = poi.product_id
  WHERE po.organization_id = v_org AND po.deleted_at IS NULL
    AND poi.item_type = 'product'
    AND (p_supplier_id IS NULL OR po.supplier_id = p_supplier_id)
    AND p.deleted_at IS NULL AND NOT p.is_deleted
    AND lower(btrim(poi.sku)) = v_lc
  ) mm;

  SELECT min(m.lvl) INTO v_level
  FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer);

  IF v_level IS NULL THEN
    RETURN jsonb_build_object(
      'found', false, 'code', v_code, 'organization_id', v_org,
      'warehouse_id', p_warehouse_id, 'supplier_id', p_supplier_id,
      'can_receive', v_can_receive, 'candidates', '[]'::jsonb,
      'warnings', jsonb_build_array(format('Código «%s» não encontrado nesta organização', v_code))
    ) || v_note_info  -- NOVO (guia): '{}' sem guia
     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
  END IF;

  -- Níveis inferiores com outros produtos: só aviso.
  SELECT count(DISTINCT m.product_id),
         string_agg(DISTINCT format('%s (%s)', p.name, m.matched_by), ', ')
  INTO v_other, v_other_txt
  FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer)
  JOIN public.products p ON p.id = m.product_id
  WHERE m.lvl > v_level
    AND m.product_id NOT IN (
      SELECT m2.product_id
      FROM jsonb_to_recordset(v_matches) AS m2(product_id uuid, uom_id uuid, matched_by text, lvl integer)
      WHERE m2.lvl = v_level);
  IF v_other > 0 THEN
    v_warnings := v_warnings || to_jsonb(format('O código também corresponde a: %s', v_other_txt));
  END IF;

  FOR v_cand IN
    SELECT DISTINCT ON (m.product_id, COALESCE(m.uom_id, p.uom_id))
           m.product_id, m.matched_by,
           -- unidade lida: a da ligação/linha; senão a do produto
           CASE WHEN m.uom_id IS NULL OR m.uom_id IS NOT DISTINCT FROM p.uom_id THEN p.uom_id ELSE m.uom_id END AS uom_id,
           (m.uom_id IS NOT NULL AND m.uom_id IS DISTINCT FROM p.uom_id) AS is_pack,
           p.name, p.sku, p.barcode, m.code_id  -- NOVO (códigos)
    FROM jsonb_to_recordset(v_matches) AS m(product_id uuid, uom_id uuid, matched_by text, lvl integer, code_id uuid)
    JOIN public.products p ON p.id = m.product_id
    WHERE m.lvl = v_level
    ORDER BY m.product_id, COALESCE(m.uom_id, p.uom_id), p.name, m.code_id NULLS FIRST  -- NOVO (códigos)
  LOOP
    v_factor := 1;
    IF v_cand.is_pack THEN
      BEGIN
        v_factor := public.fn_uom_units_per(v_cand.uom_id, v_cand.product_id);
      EXCEPTION WHEN OTHERS THEN
        v_warnings := v_warnings || to_jsonb(format('«%s»: a unidade da referência do fornecedor não é compatível com a do produto (%s)', v_cand.name, SQLERRM));
        CONTINUE;
      END;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'purchase_order_id',      o.purchase_order_id,
             'order_number',           o.order_number,
             'po_status',              o.po_status,
             'confirmed',              o.confirmed,
             'supplier_id',            o.supplier_id,
             'supplier_name',          o.supplier_name,
             'expected_delivery',      o.expected_delivery,
             'purchase_order_item_id', o.purchase_order_item_id,
             'description',            o.description,
             'quantity',               o.quantity,
             'received_quantity',      o.received_quantity,
             'open_quantity',          o.open_quantity,
             'uom_id',                 o.uom_id,
             'units_per_uom',          o.units_per_uom,
             'same_unit',              (o.units_per_uom = v_factor),
             'contract_id',            o.contract_id,
             'contract_order_number',  o.contract_order_number,
             'contract_active',        o.contract_active,
             -- Posição na ordem de enchimento (só linhas da mesma unidade).
             -- NOVO (códigos): com conversão todas as linhas entram na ordem.
             'allocation_rank',        CASE WHEN v_conv OR o.units_per_uom = v_factor THEN o.r END
           -- NOVO (guia): linha indicada na guia (só com guia)
           ) || CASE WHEN p_delivery_note_id IS NOT NULL
                     THEN jsonb_build_object('in_delivery_note', COALESCE(o.purchase_order_item_id = ANY (v_note_poi), false))
                     ELSE '{}'::jsonb END
           -- NOVO (códigos): em aberto em unidades de stock (só com conversão)
           || CASE WHEN v_conv THEN jsonb_build_object('open_units', o.open_quantity * o.units_per_uom)
                   ELSE '{}'::jsonb END
           ORDER BY (v_conv OR o.units_per_uom = v_factor) DESC, o.prio, o.allocation_rank), '[]'::jsonb),
           count(*) FILTER (WHERE NOT v_conv AND o.units_per_uom <> v_factor)
    INTO v_lines, v_other
    FROM (
      -- NOVO (guia): prio 0 = linha indicada na guia (sem guia é sempre 1);
      -- só POs do âmbito da guia.
      SELECT ol.*, pr.prio,
             row_number() OVER (PARTITION BY (v_conv OR ol.units_per_uom = v_factor) ORDER BY pr.prio, ol.allocation_rank) AS r
      FROM public.fn_receiving_open_lines(v_org, ARRAY[v_cand.product_id], p_supplier_id) ol
      CROSS JOIN LATERAL (SELECT CASE WHEN ol.purchase_order_item_id = ANY (v_note_poi) THEN 0 ELSE 1 END AS prio) pr
      WHERE v_scope IS NULL OR ol.purchase_order_id = ANY (v_scope)
    ) o;

    IF jsonb_array_length(v_lines) = 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s» não tem encomendas a fornecedor em aberto%s', v_cand.name,
                      CASE WHEN p_supplier_id IS NOT NULL THEN ' deste fornecedor' ELSE '' END)
                      -- NOVO (guia)
                      || CASE WHEN v_scope IS NOT NULL THEN format(' nas encomendas da guia %s', v_note_number) ELSE '' END);
    ELSIF v_other > 0 THEN
      v_warnings := v_warnings || to_jsonb(format('«%s»: %s linha(s) em aberto noutra unidade — não entram numa leitura nesta unidade', v_cand.name, v_other));
    END IF;

    -- NOVO (guia): anunciado / recebido pela guia (unidades de stock).
    IF p_delivery_note_id IS NOT NULL THEN
      SELECT COALESCE(sum(l.quantity * l.units_per_uom), 0) INTO v_ann
      FROM public.supplier_delivery_note_lines l
      WHERE l.delivery_note_id = p_delivery_note_id AND l.product_id = v_cand.product_id;
      SELECT COALESCE(sum(pr.quantity * pr.units_per_uom), 0) INTO v_rcv
      FROM public.purchase_order_receipts pr
      WHERE pr.delivery_note_id = p_delivery_note_id AND pr.product_id = v_cand.product_id
        AND pr.kind = 'receipt' AND pr.reverted_at IS NULL;
      IF v_note_has_lines AND v_ann = 0 THEN
        v_warnings := v_warnings || to_jsonb(format('«%s» não consta da guia %s', v_cand.name, v_note_number));
      END IF;
    END IF;

    v_candidates := v_candidates || (jsonb_build_object(
      'product_id',    v_cand.product_id,
      'name',          v_cand.name,
      'sku',           v_cand.sku,
      'barcode',       v_cand.barcode,
      'matched_by',    v_cand.matched_by,
      'uom_id',        v_cand.uom_id,
      'uom_code',      (SELECT code FROM public.uom WHERE id = v_cand.uom_id),
      'units_per_uom', v_factor,
      'open_lines',    v_lines
    ) || CASE WHEN v_cand.code_id IS NOT NULL  -- NOVO (códigos)
              THEN jsonb_build_object('learned_code_id', v_cand.code_id) ELSE '{}'::jsonb END
      || CASE WHEN p_delivery_note_id IS NOT NULL  -- NOVO (guia)
              THEN jsonb_build_object('delivery_note', jsonb_build_object(
                     'announced', v_ann > 0, 'announced_units', trim_scale(v_ann), 'received_units', trim_scale(v_rcv)))
              ELSE '{}'::jsonb END);
  END LOOP;

  RETURN jsonb_build_object(
    'found',           jsonb_array_length(v_candidates) > 0,
    'code',            v_code,
    'organization_id', v_org,
    'warehouse_id',    p_warehouse_id,
    'supplier_id',     p_supplier_id,
    'can_receive',     v_can_receive,
    'candidates',      v_candidates,
    'warnings',        v_warnings
  ) || v_note_info  -- NOVO (guia): '{}' sem guia
     || CASE WHEN v_conv THEN jsonb_build_object('unit_conversion', true) ELSE '{}'::jsonb END;  -- NOVO (códigos)
END;
$function$;

-- ─── 3. Conferir ─────────────────────────────────────────────────────────────────
DO $c$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname IN ('rpc_decrement_stock', 'rpc_confirm_client_order_stock_exit', 'rpc_confirm_client_order_stock_exit_split',
                      'rpc_revert_client_order_stock_exit', 'rpc_receive_purchase_order', 'rpc_receive_purchase_order_lines',
                      'rpc_receive_by_code', 'rpc_preview_po_receipt', 'rpc_po_receipt_release_to_stock',
                      'rpc_revert_purchase_order_receipt', 'fn_po_cancel_remainder_guard', 'rpc_request_missing_from_supplier',
                      'rpc_receiving_lookup')
    AND pg_get_functiondef(p.oid) LIKE '%18/11 perm:%';
  IF v_n <> 13 THEN
    RAISE EXCEPTION '18/11 perm: esperava 13 funções alteradas, há %', v_n;
  END IF;
  IF has_function_privilege('anon', 'public.fn_exigir_permissoes(uuid, text[], text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_exigir_permissoes(uuid, text[], text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_permissoes_em_falta(uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_permissoes_em_falta(uuid, uuid, text[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_permissoes_rotulo(text[])', 'EXECUTE') THEN
    RAISE EXCEPTION '18/11 perm: auxiliares não podem ser executáveis por anon/authenticated';
  END IF;
  IF public.fn_permissoes_rotulo(ARRAY['inventory.edit', 'client_orders.view', 'client_orders.confirm_stock_exit'])
     NOT LIKE '% (inventory.edit), % (client_orders.view) e % (client_orders.confirm_stock_exit)' THEN
    RAISE EXCEPTION '18/11 perm: rótulo mal formado';
  END IF;
END $c$;
