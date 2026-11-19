-- ============================================================
-- 20270124010000 materiais_em_falta_mesmo_criterio
-- ============================================================
-- Auditoria de 19/11/2026 (lote 2, materiais da obra), ponto 1: os materiais sem fornecedor preferido prendem a obra e a mensagem engana.
--
-- O problema (três contas diferentes para «o que falta pedir»):
--   - rpc_client_order_list_readiness.units_missing (20270109510000) conta TODA a falta. A obra lê-a e manda «Pedir o que falta»;
--   - rpc_get_client_order_document.can_request_missing (20270122600000) só conta as linhas com fornecedor preferido. O botão do
--     Inventário fica desligado com «Nada em falta que se possa pedir» e ninguém sabe porquê;
--   - ao contrário, uma linha com fornecedor preferido numa unidade incompatível com a do produto conta como pedível, mas
--     fn_client_order_request_missing salta-a (skipped_other) e não cria nada.
--
-- O que muda (um só critério, o de fn_client_order_request_missing):
--   1. fn_client_order_line_request_block(org, produto) (nova): porque é que a falta de um produto NÃO se pode pedir ao fornecedor.
--      'no_preferred_supplier' = sem ligação preferida, ativa, não apagada, da organização (a mesma escolha do pedido);
--      'incompatible_supplier_uom' = a unidade dessa ligação não converte para a do produto (fn_uom_fator, de 20270124000000, dá erro);
--      NULL = pode pedir-se.
--   2. rpc_get_client_order_document (trocas de texto guardadas sobre o pg_get_functiondef VIVO): cada linha traz
--      request_block_reason (o valor acima; NULL em serviços). missing_lines_count, missing_units_total e can_request_missing só contam
--      as linhas sem bloqueio: a unidade incompatível deixa de contar como pedível.
--   3. rpc_client_order_missing_causes(org, contratos) (nova, para o passo Materiais da obra e «À espera dos materiais»): por
--      encomenda de cliente, a falta total (igual a units_missing da prontidão), a parte que se pode pedir e quantas linhas estão
--      presas por cada causa. Mesmas permissões e o mesmo filtro de contratos de rpc_client_order_list_readiness (client_orders.view
--      ou o técnico pelo fn_neg_papel_permite; quem só passa pelo papel vê só as dos negócios). A prontidão não muda de assinatura.
-- O pedido em si (fn_client_order_request_missing) não muda aqui: já escolhe a ligação e a unidade assim.
-- Permissões, GRANTs, dono, SECURITY DEFINER e search_path de rpc_get_client_order_document ficam iguais.
--
-- Reversão (só como migration nova): desfazer as quatro trocas marcadas «20270124010000» em rpc_get_client_order_document (ver o fim
-- deste ficheiro); DROP FUNCTION public.rpc_client_order_missing_causes(uuid, uuid[]) e public.fn_client_order_line_request_block(uuid, uuid).
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF to_regprocedure('public.fn_uom_fator(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta fn_uom_fator (20270124000000): aplicar essa migration antes de 20270124010000.';
  END IF;
  IF position('20270122600000' IN pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'rpc_get_client_order_document não é a de 20270122600000: rever antes de aplicar 20270124010000.';
  END IF;
END $g$;

-- ---------------------------------------------------------------- 1. o critério único
CREATE OR REPLACE FUNCTION public.fn_client_order_line_request_block(p_org uuid, p_product_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uom uuid;
BEGIN
  -- 20270124010000: a ligação que fn_client_order_request_missing escolhe (preferida, não apagada, ativa, da organização)
  IF p_product_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT isup.uom_id INTO v_uom
  FROM public.item_suppliers isup
  WHERE isup.product_id = p_product_id
    AND isup.is_preferred = true
    AND isup.deleted_at IS NULL
    AND isup.is_active = true
    AND isup.organization_id = p_org
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN 'no_preferred_supplier';
  END IF;
  -- a unidade da ligação tem de converter para a do produto (o pedido salta a linha quando não converte)
  BEGIN
    IF coalesce(public.fn_uom_fator(v_uom, p_product_id), 0) <= 0 THEN
      RETURN 'incompatible_supplier_uom';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'incompatible_supplier_uom';
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_client_order_line_request_block(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_client_order_line_request_block(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.fn_client_order_line_request_block(uuid, uuid) IS
  '20270124010000: porque é que a falta do produto não se pode pedir ao fornecedor: no_preferred_supplier, incompatible_supplier_uom ou NULL (pode). O critério de fn_client_order_request_missing.';

-- ---------------------------------------------------------------- trocas de texto guardadas
CREATE OR REPLACE FUNCTION pg_temp.trocar(p_def text, p_antes text, p_depois text, p_onde text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(p_def) - length(replace(p_def, p_antes, ''))) / greatest(length(p_antes), 1) <> 1 THEN
    RAISE EXCEPTION 'Troca %: o texto antigo não aparece exatamente uma vez na definição viva; a função mudou. Rever antes de aplicar 20270124010000.', p_onde;
  END IF;
  RETURN replace(p_def, p_antes, p_depois);
END $f$;

-- ---------------------------------------------------------------- 2. o documento da encomenda de cliente
DO $m$
DECLARE
  d text := replace(pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure), chr(13) || chr(10), chr(10));
  v_pref text :=
       E'            AND isup.is_active = true\n'
    || E'            AND isup.organization_id = v_org\n'
    || E'        );\n';
BEGIN
  IF position('20270124010000' IN d) > 0 THEN
    RAISE NOTICE 'rpc_get_client_order_document já tem as trocas 20270124010000: nada a fazer.';
    RETURN;
  END IF;
  d := pg_temp.trocar(d, E'  v_has_pref          boolean;\n',
       E'  v_has_pref          boolean;\n'
    || E'  v_block             text;  -- 20270124010000: fn_client_order_line_request_block\n', 'declaração');
  d := pg_temp.trocar(d, E'      v_has_pref          := NULL;\n',
       E'      v_has_pref          := NULL;\n'
    || E'      v_block             := NULL;  -- 20270124010000\n', 'início de cada linha');
  d := pg_temp.trocar(d, v_pref,
       v_pref
    || E'        -- 20270124010000: o mesmo critério do pedido ao fornecedor (sem preferido, ou unidade incompatível)\n'
    || E'        v_block := public.fn_client_order_line_request_block(v_org, v_line.product_id);\n', 'fornecedor preferido');
  d := pg_temp.trocar(d, E'          IF v_q_missing > 0\n             AND v_has_pref THEN\n',
       E'          IF v_q_missing > 0\n             AND v_has_pref\n'
    || E'             AND v_block IS NULL THEN  -- 20270124010000: a unidade incompatível também não se pede\n', 'contagem do que se pode pedir');
  d := pg_temp.trocar(d, E'        \'has_preferred_supplier\', v_has_pref,\n',
       E'        \'has_preferred_supplier\', v_has_pref,\n'
    || E'        -- 20270124010000: porque é que a falta não se pode pedir (no_preferred_supplier | incompatible_supplier_uom); NULL = pode\n'
    || E'        \'request_block_reason\',  v_block,\n', 'linha (request_block_reason)');
  EXECUTE d;
END $m$;

-- ---------------------------------------------------------------- 3. a falta por causa, por encomenda de cliente (para a obra)
CREATE OR REPLACE FUNCTION public.rpc_client_order_missing_causes(p_organization_id uuid, p_contract_ids uuid[])
 RETURNS TABLE(contract_id uuid, units_missing numeric, units_requestable numeric, lines_no_supplier integer, lines_incompatible_uom integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_so_negocios boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  -- 20270124010000: as permissões de rpc_client_order_list_readiness
  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT (COALESCE(public.has_anew_permission_for_org(v_uid, 'client_orders.view', p_organization_id), false)
             OR public.fn_neg_papel_permite(p_organization_id, 'client_orders.view')) THEN
    RAISE EXCEPTION 'Sem permissão para ver encomendas de clientes desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_so_negocios := NOT COALESCE(public.has_anew_permission_for_org(v_uid, 'client_orders.view', p_organization_id), false);
  IF p_contract_ids IS NULL OR cardinality(p_contract_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH rc AS MATERIALIZED (
    SELECT cc.id AS c_id
    FROM public.client_contracts cc
    WHERE cc.organization_id = p_organization_id
      AND cc.deleted_at IS NULL
      AND cc.status = ANY (ARRAY['signed', 'assinado'])
      AND public.fn_ec_emitida(cc.id)
      AND cc.id = ANY (p_contract_ids)
      AND (NOT v_so_negocios OR cc.negocio_id IS NOT NULL)
  ),
  -- a falta das linhas em aberto, como units_missing da prontidão (uma linha com falta não está servida)
  f AS MATERIALIZED (
    SELECT r.contract_id AS f_contract, r.product_id AS f_product, COALESCE(r.qty_missing, 0) AS f_missing
    FROM public.fn_client_order_line_reservations_wh(p_organization_id, NULL) r
    JOIN rc ON rc.c_id = r.contract_id
    WHERE r.product_id IS NOT NULL
      AND NOT COALESCE(r.is_served, false)
      AND COALESCE(r.qty_missing, 0) > 0
  ),
  b AS (
    SELECT p.f_product AS b_product, public.fn_client_order_line_request_block(p_organization_id, p.f_product) AS b_reason
    FROM (SELECT DISTINCT f.f_product FROM f) p
  )
  SELECT rc.c_id,
         COALESCE(sum(f.f_missing), 0)::numeric,
         COALESCE(sum(f.f_missing) FILTER (WHERE b.b_reason IS NULL), 0)::numeric,
         (count(*) FILTER (WHERE b.b_reason = 'no_preferred_supplier'))::integer,
         (count(*) FILTER (WHERE b.b_reason = 'incompatible_supplier_uom'))::integer
  FROM rc
  LEFT JOIN f ON f.f_contract = rc.c_id
  LEFT JOIN b ON b.b_product = f.f_product
  GROUP BY rc.c_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.rpc_client_order_missing_causes(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_client_order_missing_causes(uuid, uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.rpc_client_order_missing_causes(uuid, uuid[]) IS
  '20270124010000: por encomenda de cliente emitida, a falta (= units_missing da prontidão), a parte que se pode pedir ao fornecedor e as linhas presas sem fornecedor preferido ou com a unidade do fornecedor incompatível. Permissões de rpc_client_order_list_readiness.';

-- ---------------------------------------------------------------- conferir
DO $c$
DECLARE d text := pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure);
BEGIN
  IF position('request_block_reason' IN d) = 0 OR position('v_block IS NULL' IN d) = 0 THEN
    RAISE EXCEPTION 'CONFERIR: rpc_get_client_order_document ficou sem as trocas 20270124010000';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.rpc_get_client_order_document(uuid)'::regprocedure) THEN
    RAISE EXCEPTION 'CONFERIR: rpc_get_client_order_document deixou de ser SECURITY DEFINER';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_client_order_line_request_block(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_client_order_missing_causes(uuid,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: permissões a mais nas funções novas de 20270124010000';
  END IF;
END $c$;

-- Reversão das trocas (só se for preciso; correr numa migration nova):
-- DO $r$
-- DECLARE d text := replace(pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure), chr(13) || chr(10), chr(10));
-- BEGIN
--   d := replace(d, E'  v_block             text;  -- 20270124010000: fn_client_order_line_request_block\n', '');
--   d := replace(d, E'      v_block             := NULL;  -- 20270124010000\n', '');
--   d := replace(d, E'        -- 20270124010000: o mesmo critério do pedido ao fornecedor (sem preferido, ou unidade incompatível)\n'
--                || E'        v_block := public.fn_client_order_line_request_block(v_org, v_line.product_id);\n', '');
--   d := replace(d, E'             AND v_has_pref\n             AND v_block IS NULL THEN  -- 20270124010000: a unidade incompatível também não se pede\n',
--                   E'             AND v_has_pref THEN\n');
--   d := regexp_replace(d, E'        -- 20270124010000: porque é que a falta[^\n]*\n        ''request_block_reason'',  v_block,\n', '');
--   EXECUTE d;
-- END $r$;
