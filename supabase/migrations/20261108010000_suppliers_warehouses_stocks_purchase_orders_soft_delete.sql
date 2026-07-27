-- Fornecedores / Armazéns / Stocks / Encomendas — soft-delete + restore RPCs
-- 2026-11-08 | Módulos: Suppliers, Warehouses, Stocks, Purchase Orders
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Suppliers.tsx, Warehouses.tsx, Stocks.tsx and PurchaseOrders.tsx all call
-- supabase.from(<table>).delete().eq("id", id) directly from the component,
-- wrapped only in withAuditContext() (client-side helper, TWO independent
-- PostgREST calls — see 20261107080000/20261107090000 for the same root-cause
-- pattern already fixed for anew_users). Two problems:
--   1. Hard DELETE — irreversible, no recovery path, and for purchase_orders
--      in particular this destroys rows with fiscal/accounting relevance
--      (total_value, order_number, supplier linkage).
--   2. audit source unreliable — set_audit_context()'s SET LOCAL GUCs do not
--      survive across the two separate transactions/HTTP calls.
-- Suppliers.tsx additionally has a bulk-delete path
-- (.from("suppliers").delete().in("id", ids)) with the exact same hard-delete
-- problem, multiplied across N rows in one client-driven loop.
--
-- Solution
-- --------
-- Add deleted_at/deleted_by to all four tables (NULL = active, matching the
-- deals/quotes/proposals/client_contracts/anew_users convention) and one
-- delete/restore RPC pair per table, following the exact single-transaction,
-- audit-bypass pattern established in 20261107090000_rpc_delete_user_soft_delete_and_restore.sql:
--   · SECURITY DEFINER, pinned search_path
--   · re-checks the same predicate the table's own *_delete RLS policy enforces
--     (organization_id visible to caller + has_anew_permission(...))
--   · PERFORM set_config('app.audit_bypass','on', true) to suppress the
--     existing trg_audit_* generic trigger fan-out, replaced by exactly ONE
--     fn_manual_audit_log(..., 'web_app') call per affected row, operation='UPDATE'
--     (the row is never removed).
--   · idempotency guard: re-deleting an already-deleted row / restoring an
--     already-active row raises no_data_found, mirroring rpc_restore_user.
-- rpc_bulk_delete_supplier soft-deletes an array of ids in a single statement
-- (one manual audit row per affected supplier, looped) mirroring
-- rpc_bulk_delete_deal's existing shape (20260816010000), replacing
-- Suppliers.tsx's raw .delete().in(...) bulk path.
--
-- Permission codes reused (no new permission codes — YAGNI):
--   suppliers.delete       — suppliers_delete_policy (baseline)
--   warehouses.delete      — warehouses_delete_policy (baseline)
--   inventory.delete       — stocks_delete_policy (baseline; stocks has no
--                             standalone "stocks.delete" permission code)
--   purchase_orders.delete — purchase_orders_delete_policy (baseline)
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql       — suppliers/warehouses/stocks/
--                                                     purchase_orders tables + RLS,
--                                                     has_anew_permission(),
--                                                     get_user_visible_org_ids(),
--                                                     current_business_user_id()
--   20260625010000_entity_audit_log.sql            — entity_audit_log, fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass GUC + fn_manual_audit_log()
--   20260714010000_suppliers_audit_triggers.sql    — trg_audit_suppliers (bypass-aware)
--   20260715010000_warehouses_audit_triggers.sql   — trg_audit_warehouses (bypass-aware)
--   20260716010000_stocks_audit_triggers.sql       — trg_audit_stocks (bypass-aware)
--   20260717010000_purchase_orders_audit_triggers.sql — trg_audit_purchase_orders (bypass-aware)


-- ============================================================
-- Schema: deleted_at / deleted_by on the four tables
-- ============================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.stocks
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.suppliers.deleted_at IS 'Soft-delete marker set by rpc_delete_supplier; NULL means active. Reversible via rpc_restore_supplier.';
COMMENT ON COLUMN public.warehouses.deleted_at IS 'Soft-delete marker set by rpc_delete_warehouse; NULL means active. Reversible via rpc_restore_warehouse.';
COMMENT ON COLUMN public.stocks.deleted_at IS 'Soft-delete marker set by rpc_delete_stock; NULL means active. Reversible via rpc_restore_stock.';
COMMENT ON COLUMN public.purchase_orders.deleted_at IS 'Soft-delete marker set by rpc_delete_purchase_order; NULL means active. Reversible via rpc_restore_purchase_order.';

-- Partial indexes to keep the default "active rows only" list query cheap,
-- matching the idx_deals_active / idx_deals_trash convention (20260615130000).
CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON public.suppliers (organization_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_suppliers_trash
  ON public.suppliers (organization_id) WHERE (deleted_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_warehouses_soft_active
  ON public.warehouses (organization_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_warehouses_trash
  ON public.warehouses (organization_id) WHERE (deleted_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_stocks_active
  ON public.stocks (organization_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_stocks_trash
  ON public.stocks (organization_id) WHERE (deleted_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_active
  ON public.purchase_orders (organization_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_trash
  ON public.purchase_orders (organization_id) WHERE (deleted_at IS NOT NULL);


-- ============================================================
-- Suppliers
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_supplier(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.suppliers;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id IS NULL
     OR v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Fornecedor já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.suppliers
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_supplier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_supplier(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_supplier(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.suppliers;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.suppliers WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fornecedor não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id IS NULL
     OR v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Fornecedor já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.suppliers
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'suppliers', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_supplier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_supplier(uuid) TO authenticated;


-- Bulk variant — replaces Suppliers.tsx handleBulkDelete's raw
-- .from("suppliers").delete().in("id", ids). One manual audit row per
-- affected supplier, all inside one transaction/audit-bypass window.
CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_supplier(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_ids    uuid[];
  v_before public.suppliers;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'suppliers.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar fornecedores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  FOR v_before IN
    SELECT * FROM public.suppliers
    WHERE id = ANY (v_ids)
      AND deleted_at IS NULL
      AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  LOOP
    UPDATE public.suppliers
    SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
    WHERE  id = v_before.id;

    PERFORM public.fn_manual_audit_log(
      'suppliers', v_before.id, v_before.organization_id, 'UPDATE',
      jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
        'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
      ),
      'web_app'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_supplier(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_supplier(uuid[]) TO authenticated;


-- ============================================================
-- Warehouses
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_warehouse(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.warehouses;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.warehouses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'warehouses.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar armazéns' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Armazém já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.warehouses
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'warehouses', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_warehouse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_warehouse(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_warehouse(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.warehouses;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.warehouses WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Armazém não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'warehouses.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar armazéns' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Armazém já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.warehouses
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'warehouses', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_warehouse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_warehouse(uuid) TO authenticated;


-- ============================================================
-- Stocks
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_stock(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.stocks;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.stocks WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar stocks' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Stock já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.stocks
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'stocks', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_stock(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_stock(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.stocks;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.stocks WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'inventory.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar stocks' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Stock já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.stocks
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'stocks', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_stock(uuid) TO authenticated;


-- ============================================================
-- Purchase Orders
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_delete_purchase_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.purchase_orders;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar encomendas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Encomenda já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.purchase_orders
  SET    deleted_at = now(), deleted_by = v_actor, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now())),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', to_jsonb(v_actor))
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_purchase_order(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_restore_purchase_order(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.purchase_orders;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.purchase_orders WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Encomenda não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(auth.uid(), 'purchase_orders.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar encomendas' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Encomenda já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.purchase_orders
  SET    deleted_at = NULL, deleted_by = NULL, updated_at = now()
  WHERE  id = p_id;

  PERFORM public.fn_manual_audit_log(
    'purchase_orders', p_id, v_before.organization_id, 'UPDATE',
    jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL),
      'deleted_by', jsonb_build_object('old', to_jsonb(v_before.deleted_by), 'new', NULL)
    ),
    'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_purchase_order(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Deleting a test supplier/warehouse/stock/purchase_order via its RPC
--    leaves the row in place with deleted_at set, and produces exactly ONE
--    entity_audit_log row (operation='UPDATE', source='web_app'):
--
--   SELECT deleted_at, deleted_by FROM public.suppliers WHERE id = '<id>';
--   SELECT source, changed_by, operation, table_name, created_at
--   FROM public.entity_audit_log
--   WHERE table_name = 'suppliers' AND entity_id = '<id>'
--   ORDER BY created_at DESC LIMIT 2;
--
-- 2. Restoring reverses deleted_at/deleted_by and appends a second audit row.
--
-- 3. A caller without the relevant permission code raises insufficient_privilege
--    on both the delete and restore RPCs, for all four tables.
--
-- 4. rpc_bulk_delete_supplier(ARRAY[...]) soft-deletes only rows already
--    visible+undeleted for the caller, skips the rest silently, and returns
--    the count actually affected — mirroring rpc_bulk_delete_deal (20260816010000).
