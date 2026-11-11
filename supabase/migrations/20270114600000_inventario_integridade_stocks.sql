-- ============================================================
-- 20270114600000_inventario_integridade_stocks
-- ============================================================
-- Lote «integridade do inventário», ficheiro 1 de 5 (stocks). Não é um lote de permissões: é integridade do livro de
-- movimentos, e é pedido explicitamente. Repõe, alargada, a guarda de 20270106080000, que foi revertida em 20270106440000
-- por arrumação de lotes («não é permissões»), não por avaria.
--
-- O que corrige:
--   F1 — quem tem inventory.edit fazia UPDATE stocks SET quantity = … diretamente (PostgREST) e o stock deixava de bater com
--        os movimentos. Idem average_cost, e trocar produto/armazém/organização de uma linha com quantidade.
--   F2 (parte stocks) — quem tem inventory.edit sem inventory.delete fazia UPDATE stocks SET deleted_at = now().
--   M2 (revisão de segurança) — um INSERT direto podia criar uma linha de stock da organização A com um armazém ou um produto
--        da organização B.
--
-- Como: gatilho BEFORE INSERT OR UPDATE OF <colunas>, SECURITY INVOKER, que só atua numa escrita DIRETA
--   (current_user IN ('authenticated','anon')). Dentro de uma função SECURITY DEFINER o current_user é o dono (postgres) e
--   passa; service_role também passa. É o mesmo padrão do gatilho vivo trg_stock_movements_00_guard_reversal
--   (BEFORE INSERT ON stock_movements, fn_stock_movements_guard_reversal) e de fn_purchase_orders_guard_status.
--   Lido no remoto antes de escrever: todas as funções que escrevem stocks.quantity / average_cost / deleted_at são
--   SECURITY DEFINER do postgres; a única INVOKER que escreve em stocks é fn_stock_movements_apply (gatilho do livro), que só
--   corre como authenticated num INSERT direto em stock_movements — esse caminho fecha-se no ficheiro 20270114640000.
--     UPDATE direto: recusa mudar quantity, average_cost, product_id, warehouse_id, organization_id, deleted_at, deleted_by.
--     INSERT direto: exige quantity = 0, average_cost NULL, deleted_at/deleted_by NULL, e que o armazém e o produto pertençam
--       à organização da linha (produto: products.organization_id ou product_organizations).
--   A verificação de pertença corre numa função auxiliar SECURITY DEFINER (fn_stocks_destino_da_organizacao) para não depender
--   da RLS de products/warehouses (quem tem inventory.create pode não ter products.view: a guarda, sendo INVOKER, veria
--   «não existe» e recusaria um pedido legítimo). A auxiliar só responde dentro de um gatilho (pg_trigger_depth), e a guarda
--   só a chama se a organização da linha for visível ao utilizador (get_user_visible_org_ids); fora disso a recusa tem a mesma
--   mensagem genérica, por isso não serve de oráculo sobre armazéns/produtos de outras organizações.
--   É uma função NOVA com EXECUTE para authenticated; nenhuma RPC nem GRANT existente muda.
--
-- O que NÃO muda: as definições da linha (mínimo, máximo, ponto de encomenda, localização) continuam a gravar-se diretamente
--   (Stocks.tsx) e nem disparam o gatilho (não estão na lista UPDATE OF). Stocks.tsx já cria a linha com quantity 0.
--
-- Aplicar: um ficheiro por tabela, este primeiro; lock_timeout de 5s para não ficar em fila atrás de escritas em curso
--   (SET de sessão, não SET LOCAL, e RESET no fim: o CLI pode não correr o ficheiro numa só transação).
--   O gatilho só se cria se ainda não existir (sem DROP TRIGGER IF EXISTS, que pediria ACCESS EXCLUSIVE). Lido a 11/11:
--   não existe no remoto.
-- Medido (11/11, só leitura, no remoto RH): 100 mil avaliações de current_user NOT IN ('authenticated','anon') custam
--   ~21 ms acima de um ciclo vazio (~0,2 microssegundos cada).
-- ============================================================

SET lock_timeout = '5s';

BEGIN;

-- ─── Auxiliar: o armazém e o produto pertencem à organização? (só dentro de gatilho) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_stocks_destino_da_organizacao(p_organization_id uuid, p_product_id uuid, p_warehouse_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- 20270114600000: só é chamada pela guarda de stocks; fora de um gatilho não responde.
  IF pg_trigger_depth() < 1 THEN
    RAISE EXCEPTION 'Função interna da guarda de stocks' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.warehouses w
                 WHERE w.id = p_warehouse_id AND w.organization_id = p_organization_id)
     AND (EXISTS (SELECT 1 FROM public.products p
                  WHERE p.id = p_product_id AND p.organization_id = p_organization_id)
          OR EXISTS (SELECT 1 FROM public.product_organizations po
                     WHERE po.product_id = p_product_id AND po.organization_id = p_organization_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_stocks_destino_da_organizacao(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_stocks_destino_da_organizacao(uuid, uuid, uuid) TO authenticated, service_role;

-- ─── Guarda ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_stocks_guarda_escrita_direta()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_movimento text[] := ARRAY[]::text[];
  v_apagar    boolean := false;
BEGIN
  -- 20270114600000: SECURITY INVOKER de propósito. Só pedidos diretos do PostgREST; dentro das RPCs SECURITY DEFINER o
  -- current_user é o dono (postgres) e passa.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.quantity IS DISTINCT FROM 0 THEN v_movimento := v_movimento || 'quantity'::text; END IF;
    IF NEW.average_cost IS NOT NULL    THEN v_movimento := v_movimento || 'average_cost'::text; END IF;
    v_apagar := NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL;
  ELSE
    IF NEW.quantity IS DISTINCT FROM OLD.quantity               THEN v_movimento := v_movimento || 'quantity'::text; END IF;
    IF NEW.average_cost IS DISTINCT FROM OLD.average_cost       THEN v_movimento := v_movimento || 'average_cost'::text; END IF;
    IF NEW.product_id IS DISTINCT FROM OLD.product_id           THEN v_movimento := v_movimento || 'product_id'::text; END IF;
    IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id       THEN v_movimento := v_movimento || 'warehouse_id'::text; END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN v_movimento := v_movimento || 'organization_id'::text; END IF;
    v_apagar := NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by;
  END IF;

  IF array_length(v_movimento, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'A quantidade e o custo do stock só mudam por um movimento (Registar movimento, receção, contagem): %',
      array_to_string(v_movimento, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_apagar THEN
    RAISE EXCEPTION 'Para apagar ou restaurar uma linha de stock use Eliminar ou Restaurar (exige a permissão de eliminar)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Primeiro a organização visível (sem chamar a auxiliar); só depois a pertença do armazém e do produto. A mesma
    -- mensagem nos dois casos.
    IF NEW.organization_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.get_user_visible_org_ids(auth.uid()) AS v(org_id)
                      WHERE v.org_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'O produto e o armazém de uma linha de stock têm de pertencer à organização da linha'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT public.fn_stocks_destino_da_organizacao(NEW.organization_id, NEW.product_id, NEW.warehouse_id) THEN
      RAISE EXCEPTION 'O produto e o armazém de uma linha de stock têm de pertencer à organização da linha'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Só cria se não existir (sem DROP: evita ACCESS EXCLUSIVE; CREATE TRIGGER toma SHARE ROW EXCLUSIVE).
DO $trg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                 WHERE t.tgrelid = 'public.stocks'::regclass
                   AND t.tgname::text = 'trg_stocks_00_guarda_escrita_direta') THEN
    CREATE TRIGGER trg_stocks_00_guarda_escrita_direta
      BEFORE INSERT OR UPDATE OF quantity, average_cost, product_id, warehouse_id, organization_id, deleted_at, deleted_by
      ON public.stocks
      FOR EACH ROW EXECUTE FUNCTION public.fn_stocks_guarda_escrita_direta();
  END IF;
END $trg$;

-- ─── Conferir ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
                 WHERE t.tgrelid = 'public.stocks'::regclass
                   AND t.tgname::text = 'trg_stocks_00_guarda_escrita_direta'
                   AND t.tgenabled::text = 'O'
                   AND p.proname::text = 'fn_stocks_guarda_escrita_direta'
                   AND NOT p.prosecdef
                   AND array_to_string(p.proconfig, ',')::text LIKE 'search_path=%') THEN
    RAISE EXCEPTION '20270114600000: a guarda de stocks não ficou ativa, INVOKER e com search_path fixo';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p
          WHERE p.oid = 'public.fn_stocks_destino_da_organizacao(uuid,uuid,uuid)'::regprocedure)
     OR has_function_privilege('anon', 'public.fn_stocks_destino_da_organizacao(uuid,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.fn_stocks_destino_da_organizacao(uuid,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '20270114600000: auxiliar fn_stocks_destino_da_organizacao com privilégios errados';
  END IF;
END $chk$;

COMMIT;

RESET lock_timeout;
