-- ============================================================
-- 20270106470000_stock_movimentos_custo_medio_interno
-- ============================================================
-- O que faz: repõe o comportamento de antes do 20270106070000 no INSERT direto em stock_movements. O 070000 tirou a authenticated o
--   SELECT da coluna stocks.average_cost; o gatilho fn_stock_movements_apply (INVOKER) lia essa coluna e passou a falhar com
--   "permission denied for table stocks" para quem tem inventory.edit. Agora:
--     - o gatilho continua INVOKER: a leitura da quantidade com FOR UPDATE e o upsert em stocks continuam sujeitos à RLS/permissões
--       de sempre (inventory.edit / inventory.create);
--     - só a leitura do custo médio atual passa por fn_stock_movements_custo_medio_atual (SECURITY DEFINER), que só responde
--       dentro de um gatilho (pg_trigger_depth() > 0): chamada diretamente recusa, por isso o custo continua a não se ler sem
--       products.view_cost (as RPCs inv_valor_stock_armazens / inv_custos_movimentos ficam como estão).
--   O resto da função é o texto vivo (pg_get_functiondef, 4/11/2026), sem outras mudanças. Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_stock_movements_custo_medio_atual(p_product_id uuid, p_warehouse_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cost numeric;
BEGIN
  -- 20270106470000: só para o gatilho fn_stock_movements_apply (o custo médio não se lê diretamente).
  IF pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'Função interna do registo de movimentos de stock.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT s.average_cost INTO v_cost
  FROM public.stocks s
  WHERE s.product_id = p_product_id AND s.warehouse_id = p_warehouse_id;
  RETURN v_cost;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_stock_movements_custo_medio_atual(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_stock_movements_custo_medio_atual(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_stock_movements_apply()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_increment boolean;
  v_delta        integer;
  v_current_qty  integer;
  v_current_cost numeric(12,4);
  v_new_qty      integer;
  v_new_cost     numeric(12,4);
BEGIN
  -- NOVO (20261115040000): 'estorno_venda' é sempre incremento (reversão de
  -- uma venda anterior).
  v_is_increment := NEW.movement_type IN ('entrada', 'transferencia_entrada', 'ajuste_positivo', 'estorno_venda');
  v_delta := CASE WHEN v_is_increment THEN NEW.quantity ELSE -NEW.quantity END;

  -- Lock da linha de stocks (se existir) para serializar movimentos
  -- concorrentes sobre o mesmo par produto/armazém.
  -- 20270106470000: o custo médio já não se lê diretamente (20270106070000); a quantidade e o lock continuam aqui, com a RLS de
  -- sempre, e o custo vem logo abaixo pela função interna fn_stock_movements_custo_medio_atual.
  SELECT quantity INTO v_current_qty
  FROM public.stocks
  WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- NOVO (20261115040000): 'venda' é a única exceção que pode partir de
    -- saldo inexistente sem ser rejeitada — trata como stock=0 e segue para
    -- o cálculo do novo saldo (que pode ficar negativo, ver abaixo). Todos
    -- os outros tipos de decremento continuam a exigir uma linha prévia em
    -- stocks, exatamente como antes.
    IF NOT v_is_increment AND NEW.movement_type <> 'venda' THEN
      RAISE EXCEPTION 'stock_insuficiente: não existe stock de % no armazém %', NEW.product_id, NEW.warehouse_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_current_qty := 0;
    v_current_cost := NULL;
  ELSE
    v_current_cost := public.fn_stock_movements_custo_medio_atual(NEW.product_id, NEW.warehouse_id);
  END IF;

  v_new_qty := v_current_qty + v_delta;
  -- NOVO (20261115040000): 'venda' nunca é rejeitada por saldo insuficiente —
  -- decisão de negócio confirmada no plano (Fase 5.0): a venda a stock fixo
  -- nunca pode bloquear a aceitação de uma proposta/assinatura de contrato.
  -- Todos os outros tipos de movimento (incluindo 'estorno_venda', que é
  -- sempre incremento e nunca ficaria negativo por definição) continuam a
  -- bloquear saldo negativo exatamente como antes.
  IF v_new_qty < 0 AND NEW.movement_type <> 'venda' THEN
    RAISE EXCEPTION 'stock_insuficiente: saldo atual % é inferior à quantidade pedida %', v_current_qty, NEW.quantity
      USING ERRCODE = 'check_violation';
  END IF;

  -- Custo médio ponderado (5.1.1): só recalcula em entradas reais com custo
  -- conhecido. transferencia_entrada preserva o custo médio de origem quando
  -- o chamador não passa unit_cost_at_time (é o mesmo stock a mudar de sítio,
  -- não uma nova compra). 'venda'/'estorno_venda' não recalculam average_cost
  -- (não são eventos de compra) — caem no ELSE e preservam o custo atual.
  IF NEW.movement_type IN ('entrada', 'transferencia_entrada') AND NEW.unit_cost_at_time IS NOT NULL THEN
    v_new_cost := CASE
      WHEN v_current_qty = 0 OR v_current_cost IS NULL THEN NEW.unit_cost_at_time
      ELSE ((v_current_cost * v_current_qty) + (NEW.unit_cost_at_time * NEW.quantity)) / v_new_qty
    END;
  ELSE
    v_new_cost := v_current_cost;
  END IF;

  INSERT INTO public.stocks (product_id, warehouse_id, organization_id, quantity, average_cost, created_by)
  VALUES (NEW.product_id, NEW.warehouse_id, NEW.organization_id, v_new_qty, v_new_cost, NEW.created_by)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET quantity = v_new_qty,
        average_cost = v_new_cost,
        updated_at = now();

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$function$;
