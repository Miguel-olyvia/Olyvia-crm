-- =============================================================================
-- 20270109520000 — «Ver histórico de alterações» (product_categories.view) passa a ser a chave do registo de alterações
-- =============================================================================
-- A permissão aparecia no editor como «Ver histórico de alterações» mas não guardava nada: a leitura do registo de auditoria
-- (entity_audit_log_select) aceitava qualquer uma de 11 permissões do catálogo/orçamentos (services.view, products.view,
-- brands.view, quotes.manage, ...), globais (has_anew_permission, em qualquer organização). Agora:
--   * a parte «quem pode ler o registo» pede product_categories.view NA organização da linha (Lote B,
--     get_user_permission_org_ids); as linhas da organização do catálogo global (…0001) pedem-na em qualquer organização,
--     como antes faziam as outras;
--   * a regra dos custos de 20270108300000 (o CASE: item_suppliers/stocks/stock_movements/purchase_order_items/quote_lines/
--     fotografias das propostas só com a permissão de custo) fica EXATAMENTE igual — copiada da policy viva.
-- Para ninguém perder o que lê hoje, os papéis que têm uma das outras 10 permissões recebem product_categories.view (o editor
-- passa a mostrá-la marcada; quem gere os papéis pode tirá-la). Os papéis de sistema não se mexem (o gatilho
-- protect_system_role_permissions recusa): super_admin e system_admin já a têm.
-- No ecrã: o único leitor vivo do registo é o separador Histórico da encomenda a fornecedor; lê por rpc_po_historico
-- (purchase_orders.view, 20270108550000, não muda) e, se essa recusar, diretamente — esta leitura direta é a que passa a pedir
-- product_categories.view. O assistente IA e as edge functions leem com service_role.
-- Sem tabelas nem colunas novas. Policy viva lida a 05/11/2026; a guarda para se mudou.
-- =============================================================================

SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF (SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'entity_audit_log' AND policyname = 'entity_audit_log_select') IS DISTINCT FROM '7cbd39a57093ded970777e284bd5d750' THEN
    RAISE EXCEPTION 'entity_audit_log_select mudou desde a leitura de 05/11: rever antes de aplicar';
  END IF;
END
$guarda$;

-- Quem hoje lê o registo por uma das outras permissões fica com «Ver histórico de alterações».
INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
SELECT DISTINCT rp.role_id, 'product_categories.view', NULL::uuid
FROM public.anew_role_permissions rp
JOIN public.anew_roles r ON r.id = rp.role_id AND r.deleted_at IS NULL AND r.is_system IS NOT TRUE
WHERE rp.permission_code IN ('quotes.manage', 'proposals.manage', 'services.view', 'products.view', 'products.manage', 'brands.view', 'brands.edit', 'product_subcategories.view', 'service_subcategories.view', 'product_attributes.view')
  AND EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = 'product_categories.view')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER POLICY entity_audit_log_select ON public.entity_audit_log
  USING (
    (((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids))
      AND (organization_id IN ( SELECT get_user_permission_org_ids(( SELECT auth.uid() AS uid), 'product_categories.view'::text) AS get_user_permission_org_ids)))
    OR ((organization_id = '00000000-0000-0000-0000-000000000001'::uuid)
      AND has_anew_permission(( SELECT auth.uid() AS uid), 'product_categories.view'::text)))
    AND
    CASE
    WHEN (table_name = ANY (ARRAY['item_suppliers'::text, 'supplier_price_change_requests'::text])) THEN (organization_id IN ( SELECT fn_audit_orgs_com_custo(ARRAY['products.view_cost'::text, 'services.view_cost'::text, 'suppliers.view_pricing'::text]) AS fn_audit_orgs_com_custo))
    WHEN (table_name = ANY (ARRAY['stocks'::text, 'stock_movements'::text, 'purchase_order_items'::text])) THEN (organization_id IN ( SELECT fn_audit_orgs_com_custo(ARRAY['products.view_cost'::text]) AS fn_audit_orgs_com_custo))
    WHEN ((table_name = 'quote_lines'::text) OR ((table_name = 'proposals'::text) AND ((COALESCE(changed_fields, '{}'::jsonb) ?| ARRAY['published_snapshot'::text, 'decided_snapshot'::text]) OR (jsonb_typeof((full_record -> 'published_snapshot'::text)) = 'object'::text) OR (jsonb_typeof((full_record -> 'decided_snapshot'::text)) = 'object'::text)))) THEN (organization_id IN ( SELECT fn_audit_orgs_com_custo(ARRAY['quotes.view_costs'::text, 'quotes.manage'::text]) AS fn_audit_orgs_com_custo))
    ELSE true
END
  );
