-- fn_manual_audit_log(...) never writes record_id
-- ============================================================
-- entity_audit_log.record_id was added in 20261009010000 specifically so
-- audit rows could be located reliably by the audited row's own PK, not the
-- non-unique entity_id. fn_generic_entity_audit() (the trigger path) was
-- updated to populate it, but fn_manual_audit_log() (20260719010000) — the
-- single consolidated-log writer used by ~90 RPCs across the app — was never
-- updated. Its INSERT never listed record_id, so every manual audit row ever
-- written through it has record_id = NULL.
--
-- Found live during E2E verification of the Warehouses/Stocks soft-delete
-- RPCs added in 20261108010000: delete/restore round-tripped correctly and
-- produced exactly one audit row each, but that row was unreachable by
-- record_id (only by entity_id, which for these tables happens to equal the
-- row's own id, but that's incidental, not guaranteed by the function).
--
-- Fix: add p_record_id as a new trailing parameter with DEFAULT NULL. This
-- keeps every existing positional call (all ~90 of them, across every
-- module using the consolidated-audit-log pattern since 20260719010000)
-- working unchanged — none of them pass a 7th argument, so record_id simply
-- stays NULL for them, exactly as it does today. No regression, no widened
-- blast radius.
--
-- Then update the 4 tables actually in scope for this round (suppliers,
-- warehouses, stocks, purchase_orders — the ones just converted to
-- soft-delete in 20261108010000) to pass record_id explicitly, since those
-- call sites are already being touched this round and the id is trivially
-- available (v_before.id / p_id).
--
-- Known gap, NOT addressed here: the other ~90 call sites across every other
-- module (roles, organizations, products, services, users, deals, quotes,
-- proposals, contracts, bundles, ...) still don't pass record_id and will
-- keep writing NULL there. Retrofitting all of them is a much larger,
-- separate effort and out of scope for the soft-delete conversion this
-- migration belongs to.

CREATE OR REPLACE FUNCTION public.fn_manual_audit_log(
  p_table_name      text,
  p_entity_id       uuid,
  p_organization_id uuid,
  p_operation       text,
  p_changed_fields  jsonb,
  p_source          text DEFAULT 'web_app',
  p_record_id       uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed_by uuid;
BEGIN
  BEGIN
    v_changed_by := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (p_organization_id,
       p_entity_id,
       p_record_id,
       p_table_name,
       p_operation,
       p_changed_fields,
       NULL,
       v_changed_by,
       COALESCE(nullif(p_source, ''), 'web_app'),
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_manual_audit_log(text, uuid, uuid, text, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_manual_audit_log(text, uuid, uuid, text, jsonb, text, uuid)
  TO authenticated, service_role;


-- ============================================================
-- Suppliers/Warehouses/Stocks/Purchase Orders — pass record_id explicitly
-- ============================================================
-- Bodies otherwise byte-identical to 20261108010000; only the
-- fn_manual_audit_log calls gain the trailing p_record_id argument.

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
    'web_app', p_id
  );
END;
$$;

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
    'web_app', p_id
  );
END;
$$;

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
      'web_app', v_before.id
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

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
    'web_app', p_id
  );
END;
$$;

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
    'web_app', p_id
  );
END;
$$;

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
    'web_app', p_id
  );
END;
$$;

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
    'web_app', p_id
  );
END;
$$;

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
    'web_app', p_id
  );
END;
$$;

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
    'web_app', p_id
  );
END;
$$;
