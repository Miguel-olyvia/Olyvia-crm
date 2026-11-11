-- ============================================================
-- 20270114610000_inventario_integridade_warehouses
-- ============================================================
-- Lote «integridade do inventário», ficheiro 2 de 5 (warehouses). Cria a função partilhada fn_guarda_apagar_so_por_rpc,
-- usada também pelos ficheiros 3 (suppliers) e 4 (purchase_orders), que verificam que ela existe antes de a usar.
--
-- O que corrige:
--   F2 — quem tem warehouses.edit sem warehouses.delete fazia UPDATE warehouses SET deleted_at = now() (e repunha com NULL).
--   M3 (revisão de segurança) — quem tem warehouses.edit em duas organizações fazia UPDATE warehouses SET organization_id
--        = <outra>, movendo o armazém (e, na prática, o stock que lá está) para outra organização.
--
-- Como: gatilho BEFORE UPDATE OF deleted_at, deleted_by, organization_id, SECURITY INVOKER, padrão current_user (como o vivo
--   trg_stock_movements_00_guard_reversal em stock_movements e fn_purchase_orders_guard_status). Numa escrita direta
--   (authenticated/anon) recusa mudar deleted_at/deleted_by e, com o argumento 'com_organizacao', organization_id.
--   Dentro das funções SECURITY DEFINER do postgres passa: rpc_delete_warehouse / rpc_restore_warehouse (warehouses.delete),
--   rpc_fleet_create_vehicle (repõe um armazém móvel, fleet.manage). A guarda não decide a permissão — isso fazem as RPCs —,
--   só garante que o caminho é uma função do sistema.
--   Lido no remoto: nenhuma função INVOKER faz UPDATE em warehouses. Warehouses.tsx:355 e :432 fazem UPDATE direto de dados e
--   de is_active/serves_customers, filtrando pela organização ativa: não mudam deleted_at nem organization_id (um valor igual
--   não é recusado: comparação IS DISTINCT FROM).
-- Nenhuma RPC nem GRANT muda. lock_timeout de 5s; um ficheiro por tabela.
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_guarda_apagar_so_por_rpc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_com_organizacao boolean := TG_NARGS > 0 AND TG_ARGV[0] IS NOT DISTINCT FROM 'com_organizacao';
  v_linha           text;
BEGIN
  -- 20270114610000: SECURITY INVOKER de propósito. Só pedidos diretos do PostgREST; dentro das RPCs SECURITY DEFINER o
  -- current_user é o dono (postgres) e passa. Só para gatilhos BEFORE UPDATE de tabelas com deleted_at, deleted_by e
  -- organization_id.
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'fn_guarda_apagar_so_por_rpc só serve gatilhos BEFORE UPDATE (%)', TG_TABLE_NAME;
  END IF;

  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  v_linha := CASE TG_TABLE_NAME
               WHEN 'warehouses'      THEN 'um armazém'
               WHEN 'suppliers'       THEN 'um fornecedor'
               WHEN 'purchase_orders' THEN 'uma encomenda a fornecedor'
               ELSE TG_TABLE_NAME
             END;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    RAISE EXCEPTION 'Para apagar ou restaurar % use Eliminar ou Restaurar (exige a permissão de eliminar)', v_linha
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_com_organizacao AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar % de organização', v_linha
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

-- Só cria se não existir (sem DROP: evita ACCESS EXCLUSIVE; CREATE TRIGGER toma SHARE ROW EXCLUSIVE). Lido a 11/11:
-- não existe no remoto.
DO $trg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.warehouses'::regclass
                   AND t.tgname::text = 'trg_warehouses_00_guarda_apagar') THEN
    CREATE TRIGGER trg_warehouses_00_guarda_apagar
      BEFORE UPDATE OF deleted_at, deleted_by, organization_id ON public.warehouses
      FOR EACH ROW EXECUTE FUNCTION public.fn_guarda_apagar_so_por_rpc('com_organizacao');
  END IF;
END $trg$;

-- ─── Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.warehouses'::regclass
                   AND t.tgname::text = 'trg_warehouses_00_guarda_apagar'
                   AND t.tgenabled::text = 'O'
                   AND t.tgnargs = 1
                   AND p.proname::text = 'fn_guarda_apagar_so_por_rpc'
                   AND NOT p.prosecdef
                   AND array_to_string(p.proconfig, ',')::text LIKE 'search_path=%') THEN
    RAISE EXCEPTION '20270114610000: a guarda de warehouses não ficou ativa, INVOKER, com search_path fixo e com o argumento';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
