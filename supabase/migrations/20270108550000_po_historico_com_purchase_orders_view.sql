-- ============================================================
-- 20270108550000_po_historico_com_purchase_orders_view
-- ============================================================
-- Só permissões (P2 da auditoria de 05/11/2026, problema 5 do grupo C).
-- O separador «Histórico» da encomenda a fornecedor lia entity_audit_log diretamente; a policy desse registo não aceita
-- purchase_orders.view (só permissões do catálogo), por isso quem só tem purchase_orders.view via o histórico vazio.
-- A policy do registo de auditoria NÃO se toca aqui (é de outra frente: custos/registo de auditoria). Em vez disso,
-- uma leitura própria e estreita: rpc_po_historico devolve SÓ as linhas do registo dessa PO (table_name =
-- 'purchase_orders', entity_id = a PO), com as mesmas colunas que o ecrã já lia, a quem pode ver essa PO — o mesmo
-- critério da policy viva purchase_orders_select_policy (organização visível + purchase_orders.view na organização da PO,
-- como ficou com o Lote B).
-- Quem não passa recebe 42501 e o ecrã volta à leitura direta de antes (ninguém perde o que já via).
-- ============================================================

DO $guarda$
DECLARE
  v_md5 text;
BEGIN
  -- o critério de leitura replica a policy viva da PO: se ela mudou (ex.: Lote B por organização), rever antes.
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'purchase_orders' AND policyname = 'purchase_orders_select_policy';
  IF v_md5 IS DISTINCT FROM '5bbd763cd96188296b7943540ea86ad3' THEN
    RAISE EXCEPTION 'purchase_orders_select_policy mudou desde a leitura (md5 %): rever antes de aplicar', v_md5;
  END IF;
  IF to_regprocedure('public.rpc_po_historico(uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'rpc_po_historico já existe: rever antes de aplicar';
  END IF;
END
$guarda$;

CREATE FUNCTION public.rpc_po_historico(p_po_id uuid, p_limite integer DEFAULT 200)
 RETURNS TABLE(id uuid, operation text, changed_fields jsonb, changed_by uuid, source text, created_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
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

  RETURN QUERY
  SELECT l.id, l.operation::text, l.changed_fields::jsonb, l.changed_by, l.source::text, l.created_at
  FROM public.entity_audit_log l
  WHERE l.table_name = 'purchase_orders'
    AND l.entity_id = p_po_id
    AND l.organization_id = v_org
  ORDER BY l.created_at DESC
  LIMIT p_limite;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_po_historico(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_po_historico(uuid, integer) TO authenticated;
