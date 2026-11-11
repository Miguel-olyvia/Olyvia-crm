-- ============================================================
-- 20270115000000_purchase_orders_sem_delete_direto
-- ============================================================
-- Falha (agravante do O11 no desenho; pendente «L1»): a política purchase_orders_delete_policy deixa um DELETE físico direto pela API a
--   quem tem purchase_orders.delete. As FK de purchase_order_items, purchase_order_receipts, purchase_order_item_cancellations, supplier_delivery_note_orders e supplier_po_publications são ON DELETE CASCADE: um DELETE direto apagava a PO E as receções, por cima da recusa de rpc_delete_purchase_order (20270114920000).
-- Decisão (D1): fechar. ALTER POLICY purchase_orders_delete_policy ON public.purchase_orders USING (false). Apagar passa só pela RPC (soft delete),
--   que é SECURITY DEFINER do dono da tabela e não é afetada pela RLS.
-- Pré-condição: a política viva é a que foi lida a 11/11 (DELETE, PERMISSIVE, para authenticated, md5 da expressão
--   22060547f03011a4316c57b49fe93596); se mudou, aborta. ALTER POLICY mantém o nome, o comando e os papéis. A política restritiva
--   system_admin_pii_default_deny (ALL) não muda. Lido a 11/11: não há outra política permissiva de DELETE ou ALL.
-- Lido a 11/11: nenhum ecrã (src/), Edge Function (supabase/functions/) nem função da base faz DELETE físico nesta tabela.
-- Efeito para quem chama a API: um DELETE direto passa a apagar 0 linhas, sem erro (a RLS filtra; não recusa).
-- Bloqueio: ALTER POLICY toma ACCESS EXCLUSIVE em purchase_orders até ao COMMIT; ficheiro próprio, lock_timeout de 5s.
-- Uso normal: nada. Eliminar e Restaurar no ecrã usam as RPCs.
-- Desenho: vault/ficheiros/inventario/correcao-reteste-desenho.md (fechado; decisões do coordenador e revisão de segurança).
-- Base: RH (uetjghdkwbywbftedtth), que só tem a nike. Nada disto chega à Mudelar por esta base.
-- Aplicar: SET lock_timeout de sessão antes do BEGIN e RESET no fim (o CLI pode não correr o ficheiro numa só transação).
-- Teste: supabase/tests/inventario_reteste_buracos.test.sql — correr ANTES do db push (vermelho) e DEPOIS (verde).
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'purchase_orders' AND p.policyname = 'purchase_orders_delete_policy'
                   AND p.cmd::text = 'DELETE' AND p.permissive::text = 'PERMISSIVE'
                   AND array_to_string(p.roles, ',')::text = 'authenticated'
                   AND md5(coalesce(p.qual, '')) = '22060547f03011a4316c57b49fe93596') THEN
    RAISE EXCEPTION '20270115000000: a política purchase_orders_delete_policy mudou desde que foi lida; reler antes de aplicar';
  END IF;
END $pre$;

ALTER POLICY purchase_orders_delete_policy ON public.purchase_orders USING (false);

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = 'purchase_orders' AND p.policyname = 'purchase_orders_delete_policy'
                   AND p.cmd::text = 'DELETE' AND p.permissive::text = 'PERMISSIVE'
                   AND array_to_string(p.roles, ',')::text = 'authenticated'
                   AND p.qual = 'false') THEN
    RAISE EXCEPTION '20270115000000: a política purchase_orders_delete_policy não ficou USING (false)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = 'purchase_orders'
               AND p.cmd::text IN ('DELETE', 'ALL') AND p.permissive::text = 'PERMISSIVE'
               AND p.policyname <> 'purchase_orders_delete_policy') THEN
    RAISE EXCEPTION '20270115000000: há outra política permissiva de DELETE em purchase_orders';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.purchase_orders'::regclass) THEN
    RAISE EXCEPTION '20270115000000: a RLS de purchase_orders não está ativa';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
