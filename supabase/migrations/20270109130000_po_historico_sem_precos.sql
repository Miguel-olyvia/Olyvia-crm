-- ============================================================
-- 20270109130000_po_historico_sem_precos
-- ============================================================
-- Ronda 2 de permissões (05/11/2026), custos — ponto 3. O separador «Histórico» da encomenda a fornecedor
-- (rpc_po_historico, 20270108550000) devolvia o registo inteiro a quem tem purchase_orders.view, com os preços:
-- o valor da encomenda (total_value) e o preço, total e IVA de cada linha (purchase_order_items.new[]).
-- Alinha com o ecrã: o valor das encomendas só aparece com products.view_cost (PoKpis › PO_VALUE_PERMISSION; a policy
-- do registo de auditoria também pede products.view_cost para purchase_order_items). Sem ela a RPC devolve as mesmas
-- linhas, sem esses campos (em qualquer nível do JSON). Quem não podia ver o histórico continua sem poder.
--  - fn_jsonb_sem_chaves(j, chaves): tira as chaves dadas de um JSON, em qualquer profundidade.
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.rpc_po_historico(uuid,integer)'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '11cdd1db25bb4c127c0e7ff6a46e38e5' THEN
    RAISE EXCEPTION 'rpc_po_historico mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  IF to_regprocedure('public.fn_jsonb_sem_chaves(jsonb,text[])') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_jsonb_sem_chaves já existe: rever antes de aplicar';
  END IF;
END
$guarda$;

CREATE FUNCTION public.fn_jsonb_sem_chaves(p jsonb, p_chaves text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270109130000: o JSON sem as chaves dadas, em qualquer profundidade (objetos dentro de objetos e de listas).
  SELECT CASE jsonb_typeof(p)
    WHEN 'object' THEN coalesce((SELECT jsonb_object_agg(e.k, public.fn_jsonb_sem_chaves(e.v, p_chaves))
                                 FROM jsonb_each(p) AS e(k, v) WHERE NOT (e.k = ANY (p_chaves))), '{}'::jsonb)
    WHEN 'array' THEN coalesce((SELECT jsonb_agg(public.fn_jsonb_sem_chaves(a.v, p_chaves) ORDER BY a.i)
                                FROM jsonb_array_elements(p) WITH ORDINALITY AS a(v, i)), '[]'::jsonb)
    ELSE p
  END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_po_historico(p_po_id uuid, p_limite integer DEFAULT 200)
 RETURNS TABLE(id uuid, operation text, changed_fields jsonb, changed_by uuid, source text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_custos boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_po_id IS NULL OR p_limite IS NULL OR p_limite < 1 OR p_limite > 500 THEN
    RAISE EXCEPTION 'Valor inválido: encomenda ou limite (1 a 500).' USING ERRCODE = 'check_violation';
  END IF;

  SELECT po.organization_id INTO v_org FROM public.purchase_orders po WHERE po.id = p_po_id;

  -- o mesmo critério de purchase_orders_select_policy (viva, já com o Lote B): organização visível + purchase_orders.view
  -- NA organização da PO (get_user_permission_org_ids).
  -- Uma PO que não existe responde como uma que não se pode ver (não se revela a existência).
  IF v_org IS NULL
     OR v_org NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR v_org NOT IN (SELECT public.get_user_permission_org_ids(v_uid, 'purchase_orders.view')) THEN
    RAISE EXCEPTION 'Sem permissão para ver o histórico desta encomenda.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270109130000: os preços (valor da encomenda, preço/total/IVA das linhas) só a quem tem products.view_cost nessa
  -- organização — a mesma permissão do valor no ecrã das encomendas (PO_VALUE_PERMISSION) e da policy do registo de
  -- auditoria para purchase_order_items. Aos outros o histórico vem igual, sem esses campos.
  v_custos := v_org IN (SELECT public.fn_audit_orgs_com_custo(ARRAY['products.view_cost']));

  RETURN QUERY
  SELECT l.id, l.operation::text,
    CASE WHEN v_custos THEN l.changed_fields::jsonb
         ELSE public.fn_jsonb_sem_chaves(l.changed_fields::jsonb, ARRAY['total_value', 'unit_price', 'total_price', 'vat_amount',
           'purchase_price', 'unit_cost', 'unit_cost_at_time', 'cost_price', 'average_cost']) END,
    l.changed_by, l.source::text, l.created_at
  FROM public.entity_audit_log l
  WHERE l.table_name = 'purchase_orders'
    AND l.entity_id = p_po_id
    AND l.organization_id = v_org
  ORDER BY l.created_at DESC
  LIMIT p_limite;
END;
$function$
;
