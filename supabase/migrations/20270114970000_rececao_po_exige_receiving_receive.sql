-- ============================================================
-- 20270114970000_rececao_po_exige_receiving_receive
-- ============================================================
-- Falha (F10 do reteste): rpc_receive_purchase_order não pedia receiving.receive. O caminho normal delega em
--   rpc_receive_purchase_order_lines (que passa a pedi-la em 20270114960000); o ramo da PO só com serviços / sem linhas de
--   produto marca a PO 'received' aqui dentro, com a verificação própria, e esse ficava aberto.
-- Alterações (as únicas; o resto é o texto vivo): no ramo «só serviços», à condição de permissão junta-se
--   OR NOT has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org), com a mesma mensagem; e o bloco de
--   permissão passa para antes dos dois testes de estado, que ficam iguais.
-- Decisão (D3): manter receiving.receive e acrescentar a verificação nas duas funções que gravam a receção
--   (20270114960000 e 20270114970000). Revisão de segurança (MEDIUM): a verificação de permissão fica ANTES dos testes de
--   estado (como em rpc_receive_by_code e rpc_preview_po_receipt): quem não pode receber não fica a saber se a PO está
--   recebida ou cancelada. A existência continua primeiro (é dela que vem a organização).
-- Não se alteram (revisão da base): rpc_preview_po_receipt e rpc_receive_by_code chamam a de linhas por dentro e a recusa
--   dela propaga-se (a pré-visualização só apanha o seu próprio OLPV1); rpc_receive_by_code já exige as três.
-- Quem chama, lido em pg_proc a 11/11: rpc_receive_by_code, rpc_receive_purchase_order, rpc_preview_po_receipt e o diálogo
--   antigo de PurchaseOrders.tsx (já não é aberto).
-- Uso normal: nada. A Receção já pede as três; na nike, todos os papéis com purchase_orders.receive têm também
--   receiving.receive e inventory.edit (E2E-PERM ×2, «tecnico de armazem», System Admin, Super Admin: lido a 11/11).
--   Quem tem as três vê as mesmas mensagens de estado de hoje.
-- Fica de fora: retirar receiving.receive (alternativa B de D3), o editor de permissões (F13, outro agente),
--   rpc_po_receipt_release_to_stock (não é uma receção do fornecedor), a permissão de rpc_cancel_po_remainder.
--
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado, com as decisões D1 a D6 do coordenador).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base; na base principal só entra
--   com o ramo, e antes disso diz-se ao utilizador o que muda.
-- Partida: a definição VIVA (pg_get_functiondef, lida a 11/11), não um ficheiro. Pré-condição md5 da definição viva e do
--   ACL; no fim confere-se o md5 da definição nova, o SECURITY, o search_path e o ACL (CREATE OR REPLACE conserva o ACL).
--   O md5 esperado depois conta com os CR deste ficheiro (o corpo de uma função guarda os bytes do ficheiro): este ficheiro
--   tem de ficar em CRLF; convertido para LF, a conferência falha e a transação desfaz-se (falha segura).
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).

SET lock_timeout = '5s';

BEGIN;

-- ─── Pré-condição: a definição viva é a que foi lida (md5) e o ACL é o de hoje ──────────────────────────────────────────
DO $pre$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_receive_purchase_order(uuid,uuid,date)');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114970000: a função public.rpc_receive_purchase_order(uuid,uuid,date) não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '60066cb4df4c88509345905a55373bf1' THEN
    RAISE EXCEPTION '20270114970000: a definição viva de rpc_receive_purchase_order mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114970000: o ACL de rpc_receive_purchase_order mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
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
    IF v_org NOT IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'purchase_orders.receive', v_org)
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'inventory.edit', v_org)
       -- 20270114970000 (F10): a mesma terceira permissão que a Receção (rpc_receive_by_code) já pede.
       OR NOT public.has_anew_permission_for_org(auth.uid(), 'receiving.receive', v_org) THEN
      RAISE EXCEPTION 'Sem permissão para receber encomendas desta organização' USING ERRCODE = 'insufficient_privilege';
    END IF;

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

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.rpc_receive_purchase_order(uuid,uuid,date)');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '24ff0a350ff399d4e6378cffe94cdb2e' THEN
    RAISE EXCEPTION '20270114970000: a definição nova de rpc_receive_purchase_order não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM true
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114970000: rpc_receive_purchase_order perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
