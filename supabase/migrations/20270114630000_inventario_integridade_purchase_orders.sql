-- ============================================================
-- 20270114630000_inventario_integridade_purchase_orders
-- ============================================================
-- Lote «integridade do inventário», ficheiro 4 de 5 (purchase_orders). Usa fn_guarda_apagar_so_por_rpc (20270114610000).
--
-- O que corrige:
--   - quem tem purchase_orders.edit sem purchase_orders.delete fazia UPDATE purchase_orders SET deleted_at = now() (e repunha
--     com NULL) diretamente pelo PostgREST (mesma causa que F2);
--   - M3 (revisão de segurança): quem tem purchase_orders.edit em duas organizações movia a encomenda de organização com
--     UPDATE purchase_orders SET organization_id = <outra>.
--
-- Como: gatilho BEFORE UPDATE OF deleted_at, deleted_by, organization_id, SECURITY INVOKER, padrão current_user — o mesmo das
--   guardas vivas nesta tabela (trg_purchase_orders_00_guard_status, _01_guard_published, _02_guarda_prazo) e de
--   trg_stock_movements_00_guard_reversal. Fica em 03, depois das existentes. Passam as RPCs SECURITY DEFINER
--   rpc_delete_purchase_order / rpc_restore_purchase_order (purchase_orders.delete).
--   Lido no remoto: as duas funções INVOKER que fazem UPDATE em purchase_orders (fn_po_cancel_line_remainder_internal,
--   fn_po_undo_cancellations_internal) só mudam total_value/status/actual_delivery_date, e não têm EXECUTE para
--   authenticated/anon. Não há UPDATE direto de purchase_orders em src/.
-- Nenhuma RPC nem GRANT muda. lock_timeout de 5s; um ficheiro por tabela.
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.fn_guarda_apagar_so_por_rpc()') IS NULL THEN
    RAISE EXCEPTION '20270114630000: falta fn_guarda_apagar_so_por_rpc (aplicar antes 20270114610000)';
  END IF;
END $pre$;

-- Só cria se não existir (sem DROP: evita ACCESS EXCLUSIVE; CREATE TRIGGER toma SHARE ROW EXCLUSIVE). Lido a 11/11:
-- não existe no remoto.
DO $trg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.purchase_orders'::regclass
                   AND t.tgname::text = 'trg_purchase_orders_03_guarda_apagar') THEN
    CREATE TRIGGER trg_purchase_orders_03_guarda_apagar
      BEFORE UPDATE OF deleted_at, deleted_by, organization_id ON public.purchase_orders
      FOR EACH ROW EXECUTE FUNCTION public.fn_guarda_apagar_so_por_rpc('com_organizacao');
  END IF;
END $trg$;

-- ─── Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.purchase_orders'::regclass
                   AND t.tgname::text = 'trg_purchase_orders_03_guarda_apagar'
                   AND t.tgenabled::text = 'O'
                   AND t.tgnargs = 1
                   AND p.proname::text = 'fn_guarda_apagar_so_por_rpc'
                   AND NOT p.prosecdef) THEN
    RAISE EXCEPTION '20270114630000: a guarda de purchase_orders não ficou ativa';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
