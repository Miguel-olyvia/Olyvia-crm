-- ============================================================
-- 20270106080000_stocks_quantidade_so_rpc
-- ============================================================
-- O que faz (Lote A, item 10): stocks_update_policy deixa quem tem inventory.edit fazer UPDATE direto (PostgREST) à linha de stock,
--   incluindo a quantidade - stock a mudar sem movimento no livro. Gatilho novo, INVOKER (como fn_direct_sales_guard_system_columns):
--   numa escrita DIRETA (current_user = authenticated/anon):
--     UPDATE: recusa mudar quantity, average_cost, product_id ou warehouse_id (trocar o produto/armazém de uma linha com quantidade
--             também moveria stock sem movimento);
--     INSERT: a linha nasce com quantity = 0 e sem average_cost (é o que Stocks.tsx faz; a quantidade inicial vai por rpc_adjust_stock).
--   Quem muda a quantidade são as RPCs SECURITY DEFINER (rpc_adjust_stock, rpc_register_stock_*, receções, contagens, encomendas...),
--   via o gatilho fn_stock_movements_apply - lá dentro current_user é o dono e passa.
--   Consequência: um INSERT direto em stock_movements por authenticated (que nenhum ecrã faz: todos usam as RPCs) deixa de conseguir
--   mexer em stocks (o gatilho fn_stock_movements_apply é INVOKER) e é recusado.
--   As definições da linha (mínimo, máximo, ponto de encomenda, localização) continuam a gravar-se diretamente (Stocks.tsx).
-- Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_stocks_guardar_quantidade()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_blocked text[] := ARRAY[]::text[];
BEGIN
  -- 20270106080000: só pedidos diretos do PostgREST; dentro das RPCs SECURITY DEFINER current_user é o dono e passa.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.quantity, 0) <> 0                     THEN v_blocked := v_blocked || 'quantity'::text; END IF;
    IF NEW.average_cost IS NOT NULL                       THEN v_blocked := v_blocked || 'average_cost'::text; END IF;
  ELSE
    IF NEW.quantity IS DISTINCT FROM OLD.quantity         THEN v_blocked := v_blocked || 'quantity'::text; END IF;
    IF NEW.average_cost IS DISTINCT FROM OLD.average_cost THEN v_blocked := v_blocked || 'average_cost'::text; END IF;
    IF NEW.product_id IS DISTINCT FROM OLD.product_id     THEN v_blocked := v_blocked || 'product_id'::text; END IF;
    IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id THEN v_blocked := v_blocked || 'warehouse_id'::text; END IF;
  END IF;

  IF array_length(v_blocked, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'A quantidade e o custo do stock só mudam por um movimento (Registar movimento, receção, contagem): %',
      array_to_string(v_blocked, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stocks_00_guardar_quantidade ON public.stocks;
CREATE TRIGGER trg_stocks_00_guardar_quantidade
  BEFORE INSERT OR UPDATE ON public.stocks
  FOR EACH ROW EXECUTE FUNCTION public.fn_stocks_guardar_quantidade();
