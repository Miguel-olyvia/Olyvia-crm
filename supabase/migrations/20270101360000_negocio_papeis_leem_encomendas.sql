-- 20270101360000 (30/10/2026): quem tem um papel do Negócio pelo RH (20270101340000) vê a encomenda de cliente e as encomendas a fornecedor
-- do negócio, no passo dos materiais da obra. Sem isto, Compras e armazém (só com o papel do RH) não via as encomendas pendentes nem o
-- botão para as aprovar: o documento e a prontidão pedem client_orders.view, e purchase_orders lê-se pelo RLS do perfil da Olyvia.
--  · client_orders.view passa a vir também dos papéis Comercial, Direção, Financeiro, Compras e armazém e Gestor de obra (não do Técnico);
--  · rpc_get_client_order_document e rpc_client_order_list_readiness aceitam o papel (md5 guardado, texto vivo trocado num só sítio);
--  · neg_ler_encomendas_fornecedor(org, contrato): as encomendas a fornecedor de uma encomenda de cliente (o que o ecrã lia da tabela).

SET lock_timeout = '5s';

DO $do$
DECLARE v text; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.rpc_get_client_order_document(uuid)', 'b77e174a0226385419232211f6f9edbc'),
    ('public.rpc_client_order_list_readiness(uuid,uuid[])', '17accd348fcc95f50136cfcf4cc5dbbe')
  ) AS t(assinatura, md5) LOOP
    v := pg_get_functiondef(r.assinatura::regprocedure);
    IF position('20270101360000' IN v) = 0 AND md5(v) <> r.md5 THEN
      RAISE EXCEPTION 'A função % mudou: rever a migration 20270101360000 contra o texto vivo.', r.assinatura;
    END IF;
  END LOOP;
END $do$;

INSERT INTO public.neg_papeis_permissoes (papel, permission_code)
SELECT p, 'client_orders.view' FROM unnest(ARRAY['comercial', 'direcao', 'financeiro', 'armazem', 'operacoes']) p
ON CONFLICT DO NOTHING;

DO $do$
DECLARE v text; n text;
BEGIN
  v := pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure);
  IF position('20270101360000' IN v) = 0 THEN
    n := replace(v, $q$OR NOT public.has_anew_permission(auth.uid(), 'client_orders.view') THEN$q$,
                    $q$OR NOT (public.has_anew_permission(auth.uid(), 'client_orders.view') OR public.fn_neg_papel_permite(v_org, 'client_orders.view')) THEN -- 20270101360000$q$);
    IF n = v THEN RAISE EXCEPTION 'rpc_get_client_order_document: a verificação não está onde se esperava.'; END IF;
    EXECUTE n;
  END IF;

  v := pg_get_functiondef('public.rpc_client_order_list_readiness(uuid,uuid[])'::regprocedure);
  IF position('20270101360000' IN v) = 0 THEN
    n := replace(v, $q$OR NOT COALESCE(public.has_anew_permission(v_uid, 'client_orders.view'), false) THEN$q$,
                    $q$OR NOT (COALESCE(public.has_anew_permission(v_uid, 'client_orders.view'), false) OR public.fn_neg_papel_permite(p_organization_id, 'client_orders.view')) THEN -- 20270101360000$q$);
    IF n = v THEN RAISE EXCEPTION 'rpc_client_order_list_readiness: a verificação não está onde se esperava.'; END IF;
    EXECUTE n;
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION public.neg_ler_encomendas_fornecedor(p_org uuid, p_contrato uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['client_orders.view', 'purchase_orders.view']);
  IF NOT EXISTS (SELECT 1 FROM client_contracts WHERE id = p_contrato AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Encomenda de cliente não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'order_number', po.order_number, 'status', po.status,
      'expected_delivery', po.expected_delivery, 'fornecedor', s.name) ORDER BY po.created_at)
    FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.organization_id = p_org AND po.source_type = 'contract' AND po.source_id = p_contrato AND po.deleted_at IS NULL), '[]');
END $$;
REVOKE ALL ON FUNCTION public.neg_ler_encomendas_fornecedor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_encomendas_fornecedor(uuid, uuid) TO authenticated, service_role;

DO $do$
BEGIN
  IF position('20270101360000' IN pg_get_functiondef('public.rpc_get_client_order_document(uuid)'::regprocedure)) = 0
     OR position('20270101360000' IN pg_get_functiondef('public.rpc_client_order_list_readiness(uuid,uuid[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '20270101360000: uma das funções não ficou redefinida.';
  END IF;
END $do$;
