-- =============================================================================
-- 20261213120000_rpc_supplier_portal_profile_status.sql
--
-- NOVA função de leitura: estado do Portal do Fornecedor por fornecedor da
-- organização, numa só chamada (substitui as N chamadas a
-- rpc_supplier_catalog_list(p_filter 'unlinked') e a leitura direta de
-- supplier_account_links em useSupplierListStats). Só leitura, sem tabelas
-- nem colunas novas, sem alterar funções existentes.
--
-- Âmbito: fornecedores da organização ativa (suppliers.organization_id =
-- p_organization_id) não apagados (deleted_at IS NULL). Uma linha por
-- fornecedor, também os sem portal ('none').
--
-- Regras:
--   • awaiting_profile (copiado de rpc_inventory_today.suppliers
--     .awaiting_profile): ligação ativa (supplier_account_links.status
--     'active', organization_id = p_organization_id) a uma conta ativa
--     (supplier_accounts.status 'active') sem owner ativo com
--     supplier_portal_users.profile_confirmed_at preenchido. A soma por
--     fornecedor dá o contador de rpc_inventory_today.
--   • portal_status (a lógica de useSupplierListStats, mas com a regra exata
--     de awaiting_profile em vez de supplier_data_updated_at):
--       ligação ativa e awaiting_profile → 'invited_awaiting'
--       ligação ativa                    → 'active'
--       só ligações revogadas            → 'revoked'
--       sem ligação                      → 'none'
--     Há no máximo uma ligação ativa por fornecedor
--     (uq_supplier_account_links_active_supplier). Conta suspensa com
--     ligação ativa fica 'active' (como no frontend) e awaiting_profile
--     false (como em rpc_inventory_today); account_status permite distinguir.
--   • account_status: supplier_accounts.status da ligação ativa
--     ('active' | 'suspended'); null sem ligação ativa.
--   • catalog_unlinked (copiado de rpc_supplier_catalog_list, counts
--     .unlinked, e de rpc_inventory_today.suppliers.catalog_unlinked):
--     artigos ativos (is_active) do catálogo da conta da ligação ativa, sem
--     item_suppliers não apagado deste fornecedor ligado ao artigo e sem
--     dispensa (supplier_catalog_dismissals) nessa ligação. 0 sem ligação
--     ativa (como rpc_supplier_catalog_list). Como lá
--     (fn_sp_crm_supplier_org), exige perfil do CRM
--     (current_business_user_id); sem ele vem null.
--
-- Segurança: utilizador autenticado, org visível (get_user_visible_org_ids)
-- e suppliers.view (has_anew_permission); senão exceção
-- insufficient_privilege, como rpc_list_client_order_documents.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_supplier_portal_profile_status(
  p_organization_id uuid
)
RETURNS TABLE(
  supplier_id      uuid,
  portal_status    text,
  awaiting_profile boolean,
  account_status   text,
  catalog_unlinked integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_can_catalog boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  IF p_organization_id NOT IN (SELECT public.get_user_visible_org_ids(v_uid))
     OR NOT COALESCE(public.has_anew_permission(v_uid, 'suppliers.view'), false) THEN
    RAISE EXCEPTION 'Sem permissão para ver os fornecedores desta organização' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Mesma condição de rpc_inventory_today.catalog_unlinked
  -- (fn_sp_crm_supplier_org exige perfil do CRM).
  v_can_catalog := public.current_business_user_id() IS NOT NULL;

  RETURN QUERY
  WITH s AS (
    SELECT sp.id AS s_id
    FROM public.suppliers sp
    WHERE sp.organization_id = p_organization_id
      AND sp.deleted_at IS NULL
  ),
  al AS (
    -- Ligação ativa (no máximo uma por fornecedor).
    SELECT l.id                  AS al_link_id,
           l.supplier_id         AS al_supplier_id,
           l.supplier_account_id AS al_account_id,
           l.organization_id     AS al_org_id,
           a.status              AS al_account_status
    FROM public.supplier_account_links l
    JOIN s ON s.s_id = l.supplier_id
    LEFT JOIN public.supplier_accounts a ON a.id = l.supplier_account_id
    WHERE l.status = 'active'
  ),
  anyl AS (
    SELECT DISTINCT l.supplier_id AS any_supplier_id
    FROM public.supplier_account_links l
    JOIN s ON s.s_id = l.supplier_id
  ),
  aw AS (
    -- Regra de rpc_inventory_today.suppliers.awaiting_profile.
    SELECT al.al_supplier_id AS aw_supplier_id,
           (al.al_org_id = p_organization_id
            AND al.al_account_status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM public.supplier_portal_users u
               WHERE u.supplier_account_id = al.al_account_id
                 AND u.role = 'owner'
                 AND u.status = 'active'
                 AND u.profile_confirmed_at IS NOT NULL
            )) AS aw_awaiting
    FROM al
  ),
  cat AS (
    -- Fila "por ligar" de rpc_supplier_catalog_list (counts.unlinked).
    SELECT al.al_supplier_id AS cat_supplier_id, count(*)::integer AS cat_unlinked
    FROM al
    JOIN public.supplier_catalog_items ci
      ON ci.supplier_account_id = al.al_account_id AND ci.is_active
    WHERE v_can_catalog
      AND NOT EXISTS (SELECT 1 FROM public.item_suppliers isup
                       WHERE isup.supplier_id = al.al_supplier_id
                         AND isup.catalog_item_id = ci.id
                         AND isup.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.supplier_catalog_dismissals d
                       WHERE d.link_id = al.al_link_id
                         AND d.catalog_item_id = ci.id)
    GROUP BY al.al_supplier_id
  )
  SELECT
    s.s_id,
    CASE
      WHEN al.al_link_id IS NOT NULL AND COALESCE(aw.aw_awaiting, false) THEN 'invited_awaiting'
      WHEN al.al_link_id IS NOT NULL THEN 'active'
      WHEN anyl.any_supplier_id IS NOT NULL THEN 'revoked'
      ELSE 'none'
    END::text,
    COALESCE(aw.aw_awaiting, false),
    al.al_account_status::text,
    CASE WHEN v_can_catalog THEN COALESCE(cat.cat_unlinked, 0) END
  FROM s
  LEFT JOIN al   ON al.al_supplier_id = s.s_id
  LEFT JOIN aw   ON aw.aw_supplier_id = s.s_id
  LEFT JOIN anyl ON anyl.any_supplier_id = s.s_id
  LEFT JOIN cat  ON cat.cat_supplier_id = s.s_id;
END;
$function$;

COMMENT ON FUNCTION public.rpc_supplier_portal_profile_status(uuid) IS
  'Estado do Portal do Fornecedor por fornecedor (não apagado) da organização: portal_status (invited_awaiting|active|revoked|none), awaiting_profile (regra de rpc_inventory_today), account_status da conta ligada e catalog_unlinked (fila por ligar de rpc_supplier_catalog_list; null sem perfil do CRM). Exige org visível e suppliers.view. Só leitura.';

REVOKE ALL ON FUNCTION public.rpc_supplier_portal_profile_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_supplier_portal_profile_status(uuid) TO authenticated, service_role;

COMMIT;
