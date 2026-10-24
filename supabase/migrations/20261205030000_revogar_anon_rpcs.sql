-- ============================================================
-- 20261205030000_revogar_anon_rpcs
-- ============================================================
-- Retira o EXECUTE ao papel anon em 16 RPCs SECURITY DEFINER de escrita
-- (stock, compras, encomendas, clientes, leads, submissões de formulário e
-- SMTP). Nenhuma delas é chamada sem sessão iniciada.
--
-- Estado encontrado antes (lido ao vivo com pg_proc.proacl,
-- has_function_privilege e pg_get_function_identity_arguments, 30/09/2026):
--
--   • As 16 funções são public, SECURITY DEFINER, e têm uma única assinatura
--     cada (sem overloads).
--   • Todas têm anon=X/postgres explícito na ACL.
--   • 6 delas têm também o PUBLIC (=X/postgres): rpc_resolve_form_submission,
--     rpc_revert_client_to_lead, rpc_snapshot_quote_diagnostic, rpc_update_lead,
--     rpc_upsert_org_smtp_settings, rpc_upsert_user_smtp_settings. Com o PUBLIC
--     o anon continuaria a executar mesmo sem o grant próprio, por isso também
--     se revoga o PUBLIC nestas. As outras 10 não têm PUBLIC.
--   • authenticated e service_role têm EXECUTE explícito (=X/postgres) nas 16;
--     mantêm-se, e volta-se a conceder explicitamente para não dependerem do
--     PUBLIC.
--   • anon, authenticated e service_role não são membros de nenhum outro papel
--     (pg_auth_members vazio), logo não há outra via de herança.
--
-- Quem chama (verificado no código e na BD):
--   • Frontend: só páginas do CRM atrás de CrmRouteGuard (sessão iniciada,
--     cliente supabase autenticado) — Stocks/StockMovementDialog,
--     PurchaseOrders, ClientOrders, QuoteBuilder, AnewClients/
--     ClientDetailsDialog, AnewLeads/AnewLeadEditDialog/LeadQualificationCard,
--     PendingFormSubmissions, useConversionRevert, Settings, TechnicalSettings,
--     SmtpManagement, EditProfileDialog. Nenhuma rota pública (/, /auth,
--     /form*, /lead-form, /campaign, /booking/*) nem o portal do cliente usa
--     estas RPCs. public/ (widget embebido) não as refere.
--   • Edge functions: ai-assistant (rpc_update_lead, cliente service_role);
--     nif-write-proxy (rpc_update_client, exige utilizador autenticado e chama
--     com o JWT do próprio utilizador → papel authenticated).
--   • BD: rpc_resolve_inventory_count_line, rpc_create_direct_sale_order,
--     rpc_update_manual_client_order, rpc_confirm_client_order_stock_exit,
--     rpc_receive_purchase_order, rpc_register_supplier_return e
--     rpc_update_purchase_order chamam algumas destas; todas são SECURITY
--     DEFINER (correm como postgres), não precisam do grant a anon.
--
-- Esta migration: só REVOKE/GRANT de EXECUTE. Não mexe no corpo das funções,
-- nem em owner, nem em nenhum outro objeto.
--
-- Nota: um DROP + CREATE futuro de qualquer destas funções volta a dar EXECUTE
-- a anon pelos default privileges do Supabase — repetir o REVOKE nesse caso.
-- ============================================================

-- ------------------------------------------------------------
-- A. Revogar anon nas 16 funções
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_adjust_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_direction text, p_reason text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_decrement_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_document_number text, p_document_type text, p_counterparty text, p_notes text, p_sale_source_type text, p_sale_source_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_receive_purchase_order(p_purchase_order_id uuid, p_warehouse_id uuid, p_actual_delivery_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_register_stock_entry(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_unit_cost numeric, p_counterparty text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_register_stock_loss(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_reason text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_register_stock_transfer(p_product_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_qty integer, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_register_supplier_return(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_resolve_form_submission(p_submission_id uuid, p_action text, p_field_overrides jsonb, p_entity_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_revert_client_to_lead(p_client_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_snapshot_quote_diagnostic(p_quote_id uuid, p_deal_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_update_client(p_client_id uuid, p_entity_id uuid, p_display_name text, p_norm_first text, p_norm_last text, p_email text, p_phone text, p_phone_country text, p_vat text, p_status text, p_notes text, p_assigned_to uuid, p_address_street text, p_address_city text, p_address_postal_code text, p_address_number text, p_nif_encrypted text, p_nif_hash text, p_nif_tokens text[], p_clear_nif boolean, p_entity_type text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_update_lead(p_lead_id uuid, p_field_values jsonb, p_status text, p_source text, p_notes text, p_assigned_to uuid, p_status_changed boolean, p_workflow_stage_id uuid, p_display_name text, p_first_name text, p_last_name text, p_qualification_type text, p_qualification_changed boolean, p_lost_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_upsert_org_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_daily_limit integer, p_is_default boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_upsert_user_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_reply_to text, p_daily_limit integer, p_is_default boolean) FROM anon;

-- ------------------------------------------------------------
-- B. Revogar PUBLIC nas 6 funções que o tinham
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_resolve_form_submission(p_submission_id uuid, p_action text, p_field_overrides jsonb, p_entity_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_revert_client_to_lead(p_client_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_snapshot_quote_diagnostic(p_quote_id uuid, p_deal_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_update_lead(p_lead_id uuid, p_field_values jsonb, p_status text, p_source text, p_notes text, p_assigned_to uuid, p_status_changed boolean, p_workflow_stage_id uuid, p_display_name text, p_first_name text, p_last_name text, p_qualification_type text, p_qualification_changed boolean, p_lost_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_upsert_org_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_daily_limit integer, p_is_default boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_upsert_user_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_reply_to text, p_daily_limit integer, p_is_default boolean) FROM PUBLIC;

-- ------------------------------------------------------------
-- C. authenticated e service_role mantêm o EXECUTE que já tinham
--    (as 16 tinham grant explícito; reafirma-se para não dependerem do PUBLIC)
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.rpc_adjust_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_direction text, p_reason text, p_notes text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_manual_client_order(p_organization_id uuid, p_order jsonb, p_items jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_decrement_stock(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_document_number text, p_document_type text, p_counterparty text, p_notes text, p_sale_source_type text, p_sale_source_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order(p_purchase_order_id uuid, p_warehouse_id uuid, p_actual_delivery_date date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_receive_purchase_order_lines(p_purchase_order_id uuid, p_warehouse_id uuid, p_lines jsonb, p_actual_delivery_date date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_entry(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_unit_cost numeric, p_counterparty text, p_notes text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_loss(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_reason text, p_notes text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_stock_transfer(p_product_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_qty integer, p_notes text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_register_supplier_return(p_product_id uuid, p_warehouse_id uuid, p_qty integer, p_item_supplier_id uuid, p_notes text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_resolve_form_submission(p_submission_id uuid, p_action text, p_field_overrides jsonb, p_entity_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_revert_client_to_lead(p_client_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_snapshot_quote_diagnostic(p_quote_id uuid, p_deal_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_client(p_client_id uuid, p_entity_id uuid, p_display_name text, p_norm_first text, p_norm_last text, p_email text, p_phone text, p_phone_country text, p_vat text, p_status text, p_notes text, p_assigned_to uuid, p_address_street text, p_address_city text, p_address_postal_code text, p_address_number text, p_nif_encrypted text, p_nif_hash text, p_nif_tokens text[], p_clear_nif boolean, p_entity_type text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_update_lead(p_lead_id uuid, p_field_values jsonb, p_status text, p_source text, p_notes text, p_assigned_to uuid, p_status_changed boolean, p_workflow_stage_id uuid, p_display_name text, p_first_name text, p_last_name text, p_qualification_type text, p_qualification_changed boolean, p_lost_reason text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_org_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_daily_limit integer, p_is_default boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_user_smtp_settings(p_id uuid, p_organization_id uuid, p_name text, p_smtp_host text, p_smtp_port integer, p_smtp_username text, p_smtp_password text, p_smtp_secure boolean, p_encryption text, p_from_email text, p_from_name text, p_reply_to text, p_daily_limit integer, p_is_default boolean) TO authenticated, service_role;

-- ============================================================
-- CONFERIR
-- ============================================================
DO $$
DECLARE
  v_fn      text;
  v_oid     oid;
  v_missing text := '';
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.rpc_adjust_stock(uuid, uuid, integer, text, text, text)',
    'public.rpc_create_manual_client_order(uuid, jsonb, jsonb)',
    'public.rpc_decrement_stock(uuid, uuid, integer, text, text, text, text, text, uuid)',
    'public.rpc_receive_purchase_order(uuid, uuid, date)',
    'public.rpc_receive_purchase_order_lines(uuid, uuid, jsonb, date)',
    'public.rpc_register_stock_entry(uuid, uuid, integer, uuid, numeric, text, text)',
    'public.rpc_register_stock_loss(uuid, uuid, integer, text, text)',
    'public.rpc_register_stock_transfer(uuid, uuid, uuid, integer, text)',
    'public.rpc_register_supplier_return(uuid, uuid, integer, uuid, text)',
    'public.rpc_resolve_form_submission(uuid, text, jsonb, uuid)',
    'public.rpc_revert_client_to_lead(uuid)',
    'public.rpc_snapshot_quote_diagnostic(uuid, uuid)',
    'public.rpc_update_client(uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, text, text, text[], boolean, text)',
    'public.rpc_update_lead(uuid, jsonb, text, text, text, uuid, boolean, uuid, text, text, text, text, boolean, text)',
    'public.rpc_upsert_org_smtp_settings(uuid, uuid, text, text, integer, text, text, boolean, text, text, text, integer, boolean)',
    'public.rpc_upsert_user_smtp_settings(uuid, uuid, text, text, integer, text, text, boolean, text, text, text, text, integer, boolean)'
  ] LOOP
    v_oid := v_fn::regprocedure;

    -- anon sem EXECUTE (nem directo nem via PUBLIC)
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'CONFERIR: anon ainda tem EXECUTE em %', v_fn;
    END IF;

    -- PUBLIC fora da ACL
    IF EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = v_oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'CONFERIR: PUBLIC ainda tem EXECUTE em %', v_fn;
    END IF;

    -- authenticated e service_role mantêm o EXECUTE (tinham nas 16)
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      v_missing := v_missing || ' authenticated:' || v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      v_missing := v_missing || ' service_role:' || v_fn;
    END IF;

    -- continua SECURITY DEFINER (não se mexeu no corpo)
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'CONFERIR: % deixou de ser SECURITY DEFINER', v_fn;
    END IF;
  END LOOP;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'CONFERIR: EXECUTE perdido em:%', v_missing;
  END IF;
END;
$$;
