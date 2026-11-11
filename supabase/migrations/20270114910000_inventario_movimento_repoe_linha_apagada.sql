-- ============================================================
-- 20270114910000_inventario_movimento_repoe_linha_apagada
-- ============================================================
-- Falha (F11 do reteste): um movimento (entrada, receção, transferência, ajuste) num armazém cuja linha de stock estava
--   apagada somava a quantidade a essa linha apagada (o índice único produto/armazém inclui as apagadas) e deixava
--   deleted_at como estava: as unidades ficavam invisíveis nas Existências e fora da reserva das encomendas de cliente.
-- Decisão (D4): o movimento REPÕE a linha. Volta a aparecer com a quantidade que já tinha mais a movimentada; com o
--   20270114900000 uma linha apagada está sempre a 0, por isso mostra só o que o movimento trouxe.
-- Alteração (a única; o resto é o texto vivo): no ON CONFLICT … DO UPDATE SET acrescenta-se deleted_at = NULL,
--   deleted_by = NULL. Nada mais muda: nem a leitura com FOR UPDATE, nem o custo médio, nem as recusas de saldo.
-- Função: gatilho BEFORE INSERT de stock_movements, SECURITY INVOKER (fica INVOKER) e com EXECUTE para PUBLIC (fica igual).
-- Interação com as guardas de hoje (20270114600000…640000), lida nas definições vivas:
--   - trg_stocks_00_guarda_escrita_direta (BEFORE INSERT OR UPDATE OF …, deleted_at, deleted_by) só atua com
--     current_user authenticated/anon. Os movimentos legítimos entram por RPCs SECURITY DEFINER (current_user = postgres):
--     a guarda deixa passar a reposição.
--   - Um INSERT direto em stock_movements como authenticated continua recusado: a guarda de stocks recusa primeiro a
--     mudança de quantidade (a mensagem não muda) e a política stock_movements_insert_policy é WITH CHECK (false)
--     (20270114640000). Numa linha ativa, deleted_at = NULL não muda nada e não acrescenta motivo de recusa.
-- Uso normal: quem recebe, transfere ou ajusta num armazém onde a linha estava apagada (por ex. desligada no Catálogo) passa
--   a vê-la de volta nas Existências, com a quantidade certa. Para todas as outras linhas, nada muda.
--   MUDA também (pretendido, revisão da base): um movimento de 'venda' numa linha apagada (por ex. desligada no Catálogo)
--   passa a reativá-la, possivelmente com quantidade negativa (a venda nunca é recusada por saldo): a linha aparece nas
--   Existências com a dívida, em vez de a dívida ficar escondida numa linha apagada.
-- Custo: duas atribuições no DO UPDATE que já existia; nenhuma leitura nova. É o caminho quente de todos os movimentos.
-- Fica de fora: recusar o movimento (alternativa de D4, não escolhida).
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
  v_oid oid := to_regprocedure('public.fn_stock_movements_apply()');
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '20270114910000: a função public.fn_stock_movements_apply() não existe';
  END IF;
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '61075ac8072235faddce5db94d9742e9' THEN
    RAISE EXCEPTION '20270114910000: a definição viva de fn_stock_movements_apply mudou desde que foi lida (md5 %); reler antes de aplicar',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114910000: o ACL de fn_stock_movements_apply mudou desde que foi lido';
  END IF;
END $pre$;

-- ─── A função (texto vivo + a alteração descrita no cabeçalho) ──────────────────────────────────────────────────────────
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
        updated_at = now(),
        -- 20270114910000 (F11): um movimento numa linha apagada repõe-na (as unidades não ficam invisíveis).
        deleted_at = NULL,
        deleted_by = NULL;

  NEW.balance_after := v_new_qty;
  RETURN NEW;
END;
$function$;

-- ─── Conferir: corpo novo (md5 com os CR deste ficheiro), DEFINER/INVOKER, search_path e ACL mantidos ───────────────────
DO $chk$
DECLARE
  v_oid oid := to_regprocedure('public.fn_stock_movements_apply()');
BEGIN
  IF md5(pg_get_functiondef(v_oid)) IS DISTINCT FROM '8600c326d6dd5d3a1a8de3c431ddf4f6' THEN
    RAISE EXCEPTION '20270114910000: a definição nova de fn_stock_movements_apply não é a esperada (md5 %); o ficheiro tem de estar em CRLF',
      md5(pg_get_functiondef(v_oid));
  END IF;
  IF (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM false
     OR (SELECT array_to_string(p.proconfig, ',')::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM 'search_path=public, pg_temp'
     OR (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = v_oid) IS DISTINCT FROM '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '20270114910000: fn_stock_movements_apply perdeu o SECURITY, o search_path ou o ACL';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
