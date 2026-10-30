-- 20270101410000 (30/10/2026, visto no teste no browser): as encomendas a fornecedor do negócio dizem se foram publicadas no portal do
-- fornecedor e a data que ele prometeu lá. Antes, uma encomenda aprovada de um fornecedor sem portal aparecia "no portal do fornecedor".
-- Igual à da 20270101360000, com 'publicada' e 'prometida' (supplier_po_publications).

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.neg_ler_encomendas_fornecedor(p_org uuid, p_contrato uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['client_orders.view', 'purchase_orders.view']);
  IF NOT EXISTS (SELECT 1 FROM client_contracts WHERE id = p_contrato AND organization_id = p_org AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Encomenda de cliente não encontrada nesta organização.' USING ERRCODE = 'CT003';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'order_number', po.order_number, 'status', po.status,
      'expected_delivery', po.expected_delivery, 'fornecedor', s.name,
      'publicada', pub.purchase_order_id IS NOT NULL AND pub.status <> 'withdrawn', 'prometida', pub.promised_date) ORDER BY po.created_at)
    FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
    LEFT JOIN supplier_po_publications pub ON pub.purchase_order_id = po.id
    WHERE po.organization_id = p_org AND po.source_type = 'contract' AND po.source_id = p_contrato AND po.deleted_at IS NULL), '[]');
END $$;
REVOKE ALL ON FUNCTION public.neg_ler_encomendas_fornecedor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_encomendas_fornecedor(uuid, uuid) TO authenticated, service_role;
