-- ============================================================
-- 20270112310000 — po_linhas_so_por_rpc
-- ============================================================
-- O que faz (auditoria de permissões, inventário F4 / correção B5): as políticas de escrita de purchase_order_items deixavam
--   authenticated inserir/alterar/apagar linhas de encomendas de compra diretamente, com fn_tem_alguma_permissao (que não é por
--   organização) e sem olhar ao estado da encomenda:
--     - purchase_orders.create sem .edit acrescentava linhas a uma PO pendente (p_create_only.sql: 1 linha);
--     - purchase_orders.edit ou .delete apagavam linhas de uma PO já recebida (p_edit_only/p_delete_only: 1 linha cada),
--       contornando o bloqueio "linhas recebidas" da RPC e desalinhando stock e encomendas de cliente.
--   Todas as escritas legítimas passam por funções SECURITY DEFINER que já verificam permissão, organização e estado:
--     rpc_create_purchase_order, rpc_update_purchase_order, rpc_receive_purchase_order_lines, rpc_revert_purchase_order_receipt,
--     rpc_po_receipt_release_to_stock, fn_client_order_request_missing, fn_proposal_supplier_request (gatilho) e
--     rpc_cancel_po_line_remainder / rpc_cancel_po_remainder / rpc_undo_po_* (via fn_po_*_internal, que authenticated não executa).
--   Verificado a 9/11/2026 (base RH uetjghdkwbywbftedtth): nenhum .insert/.update/.upsert/.delete em purchase_order_items em src/
--   nem em supabase/functions (ramo feature/rh-pessoas e main); nenhuma função SECURITY INVOKER executável por authenticated
--   escreve na tabela.
--   Por isso: apagam-se as três políticas de escrita. A leitura (política SELECT) não muda. Sem política, o RLS recusa
--   INSERT/UPDATE/DELETE diretos de authenticated; as RPCs SECURITY DEFINER continuam a escrever como dono da tabela.
--
-- Reversão (só como migration nova): recriar as três políticas com o texto guardado na guarda abaixo (pg_policies de 9/11/2026).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'purchase_order_items'
     AND (policyname, cmd, md5(coalesce(qual,'') || '|' || coalesce(with_check,''))) IN (
       ('Users can delete purchase order items', 'DELETE', '8e833049b9233773561d8eafaea8ebbe'),
       ('Users can insert purchase order items', 'INSERT', '69f87b100ef34e76b0f1ffda5e020208'),
       ('Users can update purchase order items', 'UPDATE', '5969d96ccfb35607ea7d1ce552e2f7ed'));
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'Guarda: as políticas de escrita de purchase_order_items mudaram desde 9/11/2026 (encontradas % de 3). Rever esta migration.', v_n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT p.prosecdef
       AND has_function_privilege('authenticated', p.oid, 'execute')
       AND pg_get_functiondef(p.oid) ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?purchase_order_items') THEN
    RAISE EXCEPTION 'Guarda: há uma função SECURITY INVOKER executável por authenticated que escreve em purchase_order_items. Rever esta migration.';
  END IF;
END $do$;

DROP POLICY "Users can insert purchase order items" ON public.purchase_order_items;
DROP POLICY "Users can update purchase order items" ON public.purchase_order_items;
DROP POLICY "Users can delete purchase order items" ON public.purchase_order_items;
