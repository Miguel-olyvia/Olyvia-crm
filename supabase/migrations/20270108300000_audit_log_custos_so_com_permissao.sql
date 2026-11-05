-- ============================================================
-- 20270108300000_audit_log_custos_so_com_permissao
-- ============================================================
-- O que faz (auditoria de permissões 05/11, P1.5a):
--   entity_audit_log_select deixava ler o registo de auditoria INTEIRO da organização a quem tivesse uma permissão de «ver» do
--   catálogo (brands.view, products.view, services.view, product_categories.view, …), incluindo os custos de compra:
--   item_suppliers.purchase_price, stocks.average_cost, stock_movements.unit_cost_at_time, purchase_order_items.unit_price,
--   supplier_price_change_requests (preços do fornecedor), quote_lines.cost_price/custo_*/margem_percent e as fotografias
--   publicadas das propostas (published_snapshot/decided_snapshot levam as linhas com custo).
--   A política mantém EXATAMENTE a condição anterior e acrescenta: as linhas dessas tabelas só se leem com a permissão de custo
--   correspondente NA organização da linha (ou numa acima; o admin de sistema passa) ou pelo Papel no Negócio:
--     item_suppliers, supplier_price_change_requests  -> products.view_cost | services.view_cost | suppliers.view_pricing
--                                                        (as mesmas que já dão a leitura direta destas tabelas)
--     stocks, stock_movements, purchase_order_items    -> products.view_cost
--     quote_lines; proposals com fotografia publicada  -> quotes.view_costs | quotes.manage
--                                                        (quote_line_custos pede view_costs; o QuoteBuilder mostra custos com manage)
--   Tudo o resto do histórico continua legível como hoje.
-- Ecrãs que leem entity_audit_log na app viva: só o separador Histórico da PO (table_name='purchase_orders'), que não muda.
--   As timelines de AnewLeads/AnewClients (que leriam quote_lines/proposals) já não são importadas por nada vivo.
-- Fica como estava (reportado): as linhas de purchase_orders cujo diff consolidado leva purchase_order_items com preços (o ecrã
--   da PO mostra-os com purchase_orders.view, fuga já reportada no grupo C); services.margem e quotes.justificacao_margem.
-- Política reescrita a partir de pg_policies (viva, 05/11/2026). Sem tabelas nem colunas novas.
-- ============================================================

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.fn_audit_orgs_com_custo(p_perms text[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 20270108300000: as organizações visíveis onde quem pede tem alguma das permissões de custo (na própria ou numa acima; o
  -- admin de sistema passa, has_anew_permission_in_org_or_ancestor), ou a recebe pelo Papel no Negócio (fn_neg_papel_permite,
  -- como fn_cat_pode). Devolve um conjunto para a política o avaliar uma só vez por consulta (não linha a linha).
  SELECT g.org_id
  FROM public.get_user_visible_org_ids(auth.uid()) AS g(org_id)
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM unnest(p_perms) AS c(code)
      WHERE public.has_anew_permission_in_org_or_ancestor(auth.uid(), c.code, g.org_id)
         OR public.fn_neg_papel_permite(g.org_id, c.code)
    )
$function$;

REVOKE ALL ON FUNCTION public.fn_audit_orgs_com_custo(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_orgs_com_custo(text[]) TO authenticated, service_role;

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;
CREATE POLICY entity_audit_log_select ON public.entity_audit_log
  FOR SELECT TO authenticated
  USING (
    (
      ((organization_id IN ( SELECT get_user_visible_org_ids(( SELECT auth.uid() AS uid)) AS get_user_visible_org_ids)) AND (has_anew_permission(( SELECT auth.uid() AS uid), 'quotes.manage'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'proposals.manage'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'services.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'products.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'brands.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'brands.edit'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_categories.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_subcategories.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'service_subcategories.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_attributes.view'::text)))
      OR ((organization_id = '00000000-0000-0000-0000-000000000001'::uuid) AND (has_anew_permission(( SELECT auth.uid() AS uid), 'products.manage'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'products.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_attributes.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_categories.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'product_subcategories.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'service_subcategories.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'brands.view'::text) OR has_anew_permission(( SELECT auth.uid() AS uid), 'brands.edit'::text)))
    )
    AND (
      CASE
        WHEN table_name IN ('item_suppliers', 'supplier_price_change_requests')
          THEN organization_id IN (SELECT public.fn_audit_orgs_com_custo(ARRAY['products.view_cost', 'services.view_cost', 'suppliers.view_pricing']))
        WHEN table_name IN ('stocks', 'stock_movements', 'purchase_order_items')
          THEN organization_id IN (SELECT public.fn_audit_orgs_com_custo(ARRAY['products.view_cost']))
        WHEN table_name = 'quote_lines'
          OR (table_name = 'proposals' AND (
                coalesce(changed_fields, '{}'::jsonb) ?| ARRAY['published_snapshot', 'decided_snapshot']
                OR jsonb_typeof(full_record -> 'published_snapshot') = 'object'
                OR jsonb_typeof(full_record -> 'decided_snapshot') = 'object'))
          THEN organization_id IN (SELECT public.fn_audit_orgs_com_custo(ARRAY['quotes.view_costs', 'quotes.manage']))
        ELSE true
      END
    )
  );
