-- ============================================================
-- 20270114620000_inventario_integridade_suppliers
-- ============================================================
-- Lote «integridade do inventário», ficheiro 3 de 5 (suppliers). Usa fn_guarda_apagar_so_por_rpc, criada em 20270114610000.
--
-- O que corrige: quem tem suppliers.edit sem suppliers.delete fazia UPDATE suppliers SET deleted_at = now() (e repunha com
--   NULL) diretamente pelo PostgREST. Mesma causa que F2 nos armazéns (políticas e privilégios iguais, lidos no remoto).
--
-- Como: gatilho BEFORE UPDATE OF deleted_at, deleted_by, SECURITY INVOKER, padrão current_user (como o vivo
--   trg_stock_movements_00_guard_reversal). Passam as RPCs SECURITY DEFINER rpc_delete_supplier, rpc_bulk_delete_supplier e
--   rpc_restore_supplier (suppliers.delete).
--   SEM organization_id, de propósito: Suppliers.tsx:831 muda organization_id de um fornecedor por UPDATE direto (é uma
--   funcionalidade), e essa coluna já tem a sua guarda viva (trg_suppliers_portal_nif_guard). Mudar isso é decisão à parte.
--   Lido no remoto: nenhuma função INVOKER faz UPDATE em suppliers; os UPDATE diretos de Suppliers.tsx (:654, :766, :831) não
--   tocam em deleted_at.
-- Nenhuma RPC nem GRANT muda. lock_timeout de 5s; um ficheiro por tabela.
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.fn_guarda_apagar_so_por_rpc()') IS NULL THEN
    RAISE EXCEPTION '20270114620000: falta fn_guarda_apagar_so_por_rpc (aplicar antes 20270114610000)';
  END IF;
END $pre$;

-- Só cria se não existir (sem DROP: evita ACCESS EXCLUSIVE; CREATE TRIGGER toma SHARE ROW EXCLUSIVE). Lido a 11/11:
-- não existe no remoto.
DO $trg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.suppliers'::regclass
                   AND t.tgname::text = 'trg_suppliers_00_guarda_apagar') THEN
    CREATE TRIGGER trg_suppliers_00_guarda_apagar
      BEFORE UPDATE OF deleted_at, deleted_by ON public.suppliers
      FOR EACH ROW EXECUTE FUNCTION public.fn_guarda_apagar_so_por_rpc();
  END IF;
END $trg$;

-- ─── Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.suppliers'::regclass
                   AND t.tgname::text = 'trg_suppliers_00_guarda_apagar'
                   AND t.tgenabled::text = 'O'
                   AND t.tgnargs = 0
                   AND p.proname::text = 'fn_guarda_apagar_so_por_rpc'
                   AND NOT p.prosecdef) THEN
    RAISE EXCEPTION '20270114620000: a guarda de suppliers não ficou ativa';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
