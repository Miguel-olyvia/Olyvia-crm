-- =============================================================================
-- 20270109230000 — Importar stock: definições de linhas existentes com inventory.import
-- =============================================================================
-- A importação de stock (Stocks.tsx › Importar) faz, por linha do ficheiro:
--   · linha nova  -> INSERT a 0 (aceita inventory.import desde 20270108540000)
--                    + quantidade por rpc_adjust_stock (motivo 'Importação CSV')
--   · linha que já existe -> diferença de quantidade por rpc_adjust_stock (idem)
--                    + UPDATE direto de mínimo, máximo, ponto de encomenda e
--                      localização.
-- O UPDATE direto exige inventory.edit (stocks_update_policy); com só
-- inventory.import a RLS filtrava a linha e nada era gravado. NÃO se abre o
-- UPDATE de stocks a inventory.import (deixaria mudar quantidade/custo sem
-- movimento). Em vez disso, esta RPC grava APENAS essas quatro colunas:
--   rpc_stock_import_settings(stock, mínimo, máximo, ponto, localização)
--   · a organização da linha tem de ser visível e o utilizador ter
--     inventory.edit OU inventory.import NESSA organização (por organização,
--     has_anew_permission_for_org — desce, não sobe);
--   · não toca em quantity, average_cost, deleted_at, produto, armazém nem
--     organização; linhas eliminadas são recusadas;
--   · mesmas regras do ecrã (inteiros >= 0; máximo 0 ou >= mínimo;
--     localização até 255);
--   · regista o contexto de auditoria 'csv_import' (o mesmo que o ecrã pedia).
-- Quem tem inventory.edit continua a poder fazer o mesmo (a policy de UPDATE
-- não muda); o ecrã passa a usar esta RPC na importação.
-- Função nova (sem tabelas nem colunas novas).
-- =============================================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.rpc_stock_import_settings(uuid,integer,integer,integer,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'GUARDA: rpc_stock_import_settings já existe';
  END IF;
  IF (SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stocks' AND policyname = 'stocks_update_policy')
     IS DISTINCT FROM 'a0ce61f4f028b5930f35d78fda784e6a' THEN
    RAISE EXCEPTION 'GUARDA: stocks_update_policy mudou desde a leitura (05/11/2026)';
  END IF;
END
$guarda$;

CREATE FUNCTION public.rpc_stock_import_settings(
  p_stock_id uuid,
  p_minimum_quantity integer,
  p_maximum_quantity integer,
  p_reorder_point integer,
  p_location text
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_actor   uuid;
  v_org     uuid;
  v_deleted timestamptz;
  v_loc     text := NULLIF(btrim(COALESCE(p_location, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_stock_id IS NULL THEN
    RAISE EXCEPTION 'É obrigatório indicar a linha de stock' USING ERRCODE = 'check_violation';
  END IF;

  SELECT s.organization_id, s.deleted_at INTO v_org, v_deleted
    FROM public.stocks s
   WHERE s.id = p_stock_id
   FOR UPDATE;

  IF v_org IS NULL OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Linha de stock não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (public.has_anew_permission_for_org(v_uid, 'inventory.edit', v_org)
             OR public.has_anew_permission_for_org(v_uid, 'inventory.import', v_org)) THEN
    RAISE EXCEPTION 'Sem permissão para alterar as definições de stock desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_minimum_quantity IS NULL OR p_maximum_quantity IS NULL OR p_reorder_point IS NULL
     OR p_minimum_quantity < 0 OR p_maximum_quantity < 0 OR p_reorder_point < 0 THEN
    RAISE EXCEPTION 'Mínimo, máximo e ponto de encomenda têm de ser números inteiros positivos' USING ERRCODE = 'check_violation';
  END IF;
  IF p_maximum_quantity <> 0 AND p_maximum_quantity < p_minimum_quantity THEN
    RAISE EXCEPTION 'A quantidade máxima deve ser maior ou igual à quantidade mínima.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_loc) > 255 THEN
    RAISE EXCEPTION 'A localização deve ter menos de 255 caracteres.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.set_audit_context(v_actor, 'csv_import');

  -- Só as definições: quantidade, custo e estado nunca mudam aqui.
  UPDATE public.stocks
     SET minimum_quantity = p_minimum_quantity,
         maximum_quantity = p_maximum_quantity,
         reorder_point    = p_reorder_point,
         location         = v_loc,
         updated_at       = now()
   WHERE id = p_stock_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_stock_import_settings(uuid, integer, integer, integer, text) IS
  '20270109230000: importação de stock — grava só mínimo/máximo/ponto de encomenda/localização de uma linha existente; inventory.edit OU inventory.import na organização da linha.';

REVOKE ALL ON FUNCTION public.rpc_stock_import_settings(uuid, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_stock_import_settings(uuid, integer, integer, integer, text) TO authenticated, service_role;
