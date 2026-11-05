-- =============================================================================
-- 20270108250000 — Lote B (P1.4): permissão por organização · catálogo (produtos, serviços, marcas, categorias, atributos, bundles, taxas) — só escrita
-- =============================================================================
-- Só verificação de permissão: cada has_anew_permission / has_scheduling_permission
-- (globais) passa a has_anew_permission_for_org(uid, código, organização da linha)
-- ou, quando a organização só se conhece depois, a verificação de âmbito usa
-- get_user_permission_org_ids(uid, código) em vez de get_user_visible_org_ids.
-- As verificações globais que já existiam ficam (mesmas mensagens). Nada mais muda.
-- Cada função parte de pg_get_functiondef da versão viva (05/11/2026).
-- Funções: _bundle_children_authorize, rpc_bulk_delete_brand, rpc_bulk_delete_bundle, rpc_bulk_delete_product, rpc_bulk_delete_product_attribute, rpc_bulk_delete_product_category, rpc_bulk_delete_service, rpc_bulk_import_bundles, rpc_bulk_import_products, rpc_bulk_org_brand, rpc_bulk_org_product, rpc_bulk_org_product_attribute, rpc_bulk_org_product_category, rpc_bulk_org_service, rpc_bulk_restore_brand, rpc_bulk_restore_bundle, rpc_bulk_restore_product, rpc_bulk_restore_product_attribute, rpc_bulk_restore_product_category, rpc_bulk_status_brand, rpc_bulk_status_bundle, rpc_bulk_status_product, rpc_bulk_status_product_category, rpc_bulk_status_service, rpc_create_brand, rpc_create_bundle, rpc_create_product, rpc_create_product_attribute, rpc_create_product_category, rpc_create_product_subcategory, rpc_create_service, rpc_delete_brand, rpc_delete_bundle, rpc_delete_product, rpc_delete_product_attribute, rpc_delete_product_category, rpc_delete_product_subcategory, rpc_delete_service, rpc_delete_service_fee_type, rpc_duplicate_product_attribute, rpc_import_service_csv, rpc_manage_attribute_option_group, rpc_manage_attribute_organizations, rpc_manage_category_attribute_palette, rpc_restore_brand, rpc_restore_bundle, rpc_restore_product, rpc_restore_product_attribute, rpc_restore_product_category, rpc_restore_product_subcategory, rpc_restore_service, rpc_restore_service_fee_type, rpc_update_brand, rpc_update_bundle, rpc_update_product, rpc_update_product_attribute, rpc_update_product_category, rpc_update_product_subcategory, rpc_update_service
-- =============================================================================

CREATE OR REPLACE FUNCTION public._bundle_children_authorize(p_bundle_id uuid)
 RETURNS bundles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_bundle   public.bundles;
BEGIN
  SELECT * INTO v_bundle
  FROM public.bundles
  WHERE id = p_bundle_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para editar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_bundle.organization_id IS NULL
       OR NOT (v_bundle.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN v_bundle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_brand(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_deleted_at  timestamptz;
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  FOR v_rec IN
    UPDATE public.brands b
    SET is_active  = false,
        deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.deleted_at IS NULL
    RETURNING b.id, b.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
        'is_active',  jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_bundle(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_ids        uuid[];
  v_deleted_at timestamptz;
  v_before     public.bundles;
  v_diff       jsonb;
  v_count      integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  -- ── SELECT pre-image → SOFT delete → per-entity consolidated audit row ────
  -- Only non-deleted, in-scope rows are affected (deleted_at IS NULL guard mirrors the list
  -- filter). Capturing the pre-image lets the audit diff carry the true old deleted_at (NULL by
  -- the guard, but recorded explicitly for consistency with the brands SELECT-then-mutate loop).
  FOR v_before IN
    SELECT *
    FROM   public.bundles b
    WHERE  b.id = ANY (v_ids)
      AND  b.organization_id = p_organization_id
      AND  b.deleted_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE public.bundles
    SET deleted_at = v_deleted_at
    WHERE id = v_before.id;

    v_diff := jsonb_build_object(
      'bundles', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(v_deleted_at))
      )
    );

    IF v_before.organization_id IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log(
        'bundles', v_before.id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_product(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_deleted_at  timestamptz;
  v_rec         record;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
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

  -- ── Authorization parity with products_delete RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.delete'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  -- ── SOFT delete (never a real DELETE) + per-entity consolidated audit row ─
  -- Only non-deleted, in-scope rows are affected (idempotent under retries).
  FOR v_rec IN
    UPDATE public.products p
    SET is_deleted = true,
        deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.is_deleted = false
    RETURNING p.id, p.organization_id
  LOOP
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      COALESCE(v_rec.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'is_deleted', jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_product_attribute(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_ids        uuid[];
  v_deleted_at timestamptz;
  v_rec        record;
  v_audit_org  uuid;
  v_count      integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  FOR v_rec IN
    UPDATE public.product_attributes pa
    SET deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
      AND pa.deleted_at IS NULL
    RETURNING pa.id, pa.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_attributes', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_product_category(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_deleted_at  timestamptz;
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para eliminação em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.delete'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_deleted_at := now();

  FOR v_rec IN
    UPDATE public.product_categories pc
    SET is_active  = false,
        deleted_at = v_deleted_at,
        deleted_by = v_actor
    WHERE pc.id = ANY (v_ids)
      AND pc.organization_id = p_organization_id
      AND pc.deleted_at IS NULL
    RETURNING pc.id, pc.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'is_active',  jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_service(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_rec    record;
  v_diff   jsonb;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with services_delete ────────────────────────────
  IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.delete'))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    DELETE FROM public.services s
    WHERE s.id = ANY(p_ids)
      AND s.organization_id = p_organization_id
    RETURNING s.id, s.organization_id, s.sku, s.name, s.slug, s.is_active,
              s.service_type, s.long_desc, s.service_category_id, s.service_subcategory_id
  LOOP
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'sku',                    jsonb_build_object('old', to_jsonb(v_rec.sku), 'new', NULL),
        'name',                   jsonb_build_object('old', to_jsonb(v_rec.name), 'new', NULL),
        'slug',                   jsonb_build_object('old', to_jsonb(v_rec.slug), 'new', NULL),
        'is_active',              jsonb_build_object('old', to_jsonb(v_rec.is_active), 'new', NULL),
        'organization_id',        jsonb_build_object('old', to_jsonb(v_rec.organization_id), 'new', NULL),
        'service_type',           jsonb_build_object('old', to_jsonb(v_rec.service_type), 'new', NULL),
        'long_desc',              jsonb_build_object('old', to_jsonb(v_rec.long_desc), 'new', NULL),
        'service_category_id',    jsonb_build_object('old', to_jsonb(v_rec.service_category_id), 'new', NULL),
        'service_subcategory_id', jsonb_build_object('old', to_jsonb(v_rec.service_subcategory_id), 'new', NULL)
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_rec.id, v_rec.organization_id, 'DELETE', v_diff, 'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_import_bundles(p_org_id uuid, p_bundles jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_row        jsonb;
  v_row_idx    int := -1;
  v_mode       text;
  v_row_org    uuid;
  v_bundle_id  uuid;
  v_bundle     public.bundles;
  v_before     public.bundles;
  v_diff       jsonb;
  v_bundle_diff jsonb;
  v_results    jsonb := '[]'::jsonb;
  v_is_active  boolean;
BEGIN
  -- Consolidate all writes (whole batch) into one audit row per bundle.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para importar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.create'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_bundles IS NULL OR jsonb_typeof(p_bundles) <> 'array' THEN
    RAISE EXCEPTION 'p_bundles deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_bundles) LOOP
    v_row_idx := v_row_idx + 1;
    v_mode    := v_row ->> 'mode';
    v_row_org := NULLIF(v_row ->> 'organization_id', '')::uuid;

    IF NOT v_is_admin AND v_row_org IS NOT NULL
       AND NOT (v_row_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.create'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador (linha %)', v_row_idx
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_is_active := (COALESCE(v_row ->> 'status', 'draft') = 'active');

    IF v_mode = 'insert' THEN
      -- ── INSERT bundle (server-generated id; ignore any client-side id) ────
      INSERT INTO public.bundles
        (organization_id, sku, name, description, pricing_type,
         fixed_price, discount_percent, discount_fixed,
         status, valid_from, valid_to, is_active, created_by)
      VALUES
        (v_row_org,
         btrim(v_row ->> 'sku'),
         btrim(v_row ->> 'name'),
         NULLIF(btrim(COALESCE(v_row ->> 'description', '')), ''),
         COALESCE(v_row ->> 'pricing_type', 'custom')::public.bundle_pricing_type,
         CASE WHEN (v_row ->> 'pricing_type') = 'fixed_price'
              THEN (v_row ->> 'fixed_price')::numeric ELSE NULL END,
         CASE WHEN (v_row ->> 'pricing_type') = 'percentage_discount'
              THEN (v_row ->> 'discount_percent')::numeric ELSE NULL END,
         CASE WHEN (v_row ->> 'pricing_type') = 'fixed_discount'
              THEN (v_row ->> 'discount_fixed')::numeric ELSE NULL END,
         COALESCE(v_row ->> 'status', 'draft'),
         NULLIF(v_row ->> 'valid_from', '')::timestamptz,
         NULLIF(v_row ->> 'valid_to', '')::timestamptz,
         v_is_active,
         v_actor)
      RETURNING * INTO v_bundle;

      v_diff := jsonb_build_object(
        'bundles', jsonb_build_object(
          'sku',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.sku)),
          'name',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.name)),
          'description',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.description)),
          'pricing_type',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.pricing_type)),
          'fixed_price',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.fixed_price)),
          'discount_percent', jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_percent)),
          'discount_fixed',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_fixed)),
          'status',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.status)),
          'valid_from',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_from)),
          'valid_to',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_to)),
          'is_active',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.is_active)),
          'organization_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.organization_id))
        ),
        'source', 'bulk_import'
      );

      IF v_bundle.organization_id IS NOT NULL THEN
        PERFORM public.fn_manual_audit_log(
          'bundles', v_bundle.id, v_bundle.organization_id, 'INSERT', v_diff, 'web_app'
        );
      END IF;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx, 'bundle_id', v_bundle.id, 'action', 'insert'
      );

    ELSIF v_mode = 'update' THEN
      -- ── UPDATE bundle (scoped like rpc_update_bundle: org + non-deleted) ──
      v_bundle_id := NULLIF(v_row ->> 'id', '')::uuid;
      IF v_bundle_id IS NULL THEN
        RAISE EXCEPTION 'mode=update requer id (linha %)', v_row_idx USING ERRCODE = 'invalid_parameter_value';
      END IF;

      SELECT * INTO v_before FROM public.bundles
        WHERE id = v_bundle_id AND organization_id = p_org_id AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bundle não encontrado nesta organização (linha %)', v_row_idx
          USING ERRCODE = 'no_data_found';
      END IF;

      UPDATE public.bundles SET
        sku              = btrim(v_row ->> 'sku'),
        name             = btrim(v_row ->> 'name'),
        description      = NULLIF(btrim(COALESCE(v_row ->> 'description', '')), ''),
        pricing_type     = COALESCE(v_row ->> 'pricing_type', 'custom')::public.bundle_pricing_type,
        fixed_price      = CASE WHEN (v_row ->> 'pricing_type') = 'fixed_price'
                                 THEN (v_row ->> 'fixed_price')::numeric ELSE NULL END,
        discount_percent = CASE WHEN (v_row ->> 'pricing_type') = 'percentage_discount'
                                 THEN (v_row ->> 'discount_percent')::numeric ELSE NULL END,
        discount_fixed   = CASE WHEN (v_row ->> 'pricing_type') = 'fixed_discount'
                                 THEN (v_row ->> 'discount_fixed')::numeric ELSE NULL END,
        status           = COALESCE(v_row ->> 'status', 'draft'),
        valid_from       = NULLIF(v_row ->> 'valid_from', '')::timestamptz,
        valid_to         = NULLIF(v_row ->> 'valid_to', '')::timestamptz,
        is_active        = v_is_active
      WHERE id = v_bundle_id AND organization_id = p_org_id AND deleted_at IS NULL
      RETURNING * INTO v_bundle;

      v_bundle_diff := '{}'::jsonb;
      IF v_before.sku IS DISTINCT FROM v_bundle.sku THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('sku',
          jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_bundle.sku)));
      END IF;
      IF v_before.name IS DISTINCT FROM v_bundle.name THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('name',
          jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_bundle.name)));
      END IF;
      IF v_before.description IS DISTINCT FROM v_bundle.description THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('description',
          jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_bundle.description)));
      END IF;
      IF v_before.pricing_type IS DISTINCT FROM v_bundle.pricing_type THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('pricing_type',
          jsonb_build_object('old', to_jsonb(v_before.pricing_type), 'new', to_jsonb(v_bundle.pricing_type)));
      END IF;
      IF v_before.fixed_price IS DISTINCT FROM v_bundle.fixed_price THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('fixed_price',
          jsonb_build_object('old', to_jsonb(v_before.fixed_price), 'new', to_jsonb(v_bundle.fixed_price)));
      END IF;
      IF v_before.discount_percent IS DISTINCT FROM v_bundle.discount_percent THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_percent',
          jsonb_build_object('old', to_jsonb(v_before.discount_percent), 'new', to_jsonb(v_bundle.discount_percent)));
      END IF;
      IF v_before.discount_fixed IS DISTINCT FROM v_bundle.discount_fixed THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_fixed',
          jsonb_build_object('old', to_jsonb(v_before.discount_fixed), 'new', to_jsonb(v_bundle.discount_fixed)));
      END IF;
      IF v_before.status IS DISTINCT FROM v_bundle.status THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('status',
          jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_bundle.status)));
      END IF;
      IF v_before.valid_from IS DISTINCT FROM v_bundle.valid_from THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_from',
          jsonb_build_object('old', to_jsonb(v_before.valid_from), 'new', to_jsonb(v_bundle.valid_from)));
      END IF;
      IF v_before.valid_to IS DISTINCT FROM v_bundle.valid_to THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_to',
          jsonb_build_object('old', to_jsonb(v_before.valid_to), 'new', to_jsonb(v_bundle.valid_to)));
      END IF;
      IF v_before.is_active IS DISTINCT FROM v_bundle.is_active THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('is_active',
          jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_bundle.is_active)));
      END IF;

      v_diff := '{}'::jsonb;
      IF v_bundle_diff <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('bundles', v_bundle_diff) || jsonb_build_object('source', 'bulk_import');
      END IF;

      IF v_diff <> '{}'::jsonb AND v_bundle.organization_id IS NOT NULL THEN
        PERFORM public.fn_manual_audit_log(
          'bundles', v_bundle.id, v_bundle.organization_id, 'UPDATE', v_diff, 'web_app'
        );
      END IF;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx, 'bundle_id', v_bundle.id, 'action', 'update'
      );

    ELSE
      RAISE EXCEPTION 'mode inválido "%": deve ser insert ou update (linha %)', v_mode, v_row_idx
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  RETURN v_results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_import_products(p_org_id uuid, p_products jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_row          jsonb;
  v_row_idx      int := -1;
  v_mode         text;
  v_row_org      uuid;
  v_product_id   uuid;
  v_product      public.products;
  v_before       public.products;
  v_price        jsonb;
  v_price_new    jsonb;
  v_diff         jsonb;
  v_results      jsonb := '[]'::jsonb;
  v_existing_price public.product_prices;
  v_price_diff   jsonb;
  v_price_changed boolean;
  v_deleted_count int;
  v_sqlerrm      text;
  v_supplier_id  uuid;
BEGIN
  -- Consolidate all writes (whole batch) into one audit row per product.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para importar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.create'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_products IS NULL OR jsonb_typeof(p_products) <> 'array' THEN
    RAISE EXCEPTION 'p_products deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_row_idx := v_row_idx + 1;

    -- Each row runs in its own BEGIN/EXCEPTION block, which PL/pgSQL already
    -- backs with an implicit savepoint: a failure here only unwinds this
    -- row's partial writes, never the rows already committed within this
    -- same call (explicit SAVEPOINT/ROLLBACK TO SAVEPOINT are plain-SQL
    -- transaction commands and are not valid inside a PL/pgSQL block).
    BEGIN
      v_mode := v_row ->> 'mode';
      v_row_org := NULLIF(v_row ->> 'organization_id', '')::uuid;

      IF NOT v_is_admin AND v_row_org IS NOT NULL
         AND NOT (v_row_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.create'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador (linha %)', v_row_idx
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF v_mode = 'insert' THEN
        -- ── INSERT product ────────────────────────────────────────────────
        -- ON CONFLICT (sku, organization_id) DO UPDATE mirrors the OLD FE's
        -- `.upsert(..., { onConflict: "sku,organization_id" })`: a SKU that
        -- already exists in the DB but is invisible to the caller under RLS
        -- must merge into that row instead of raising a duplicate-key
        -- violation. Audit semantics below treat this path the same as a
        -- fresh insert, matching prior FE behavior.
        INSERT INTO public.products
          (sku, name, description, barcode, status, is_active,
           is_sellable, is_purchasable, category_id, subcategory_id,
           brand_id, supplier_id, organization_id, created_by)
        VALUES
          (v_row ->> 'sku',
           v_row ->> 'name',
           NULLIF(v_row ->> 'description', ''),
           NULLIF(v_row ->> 'barcode', ''),
           COALESCE(v_row ->> 'status', 'draft')::public.product_status,
           true,
           COALESCE((v_row ->> 'is_sellable')::boolean, false),
           COALESCE((v_row ->> 'is_purchasable')::boolean, false),
           NULLIF(v_row ->> 'category_id', '')::uuid,
           NULLIF(v_row ->> 'subcategory_id', '')::uuid,
           NULLIF(v_row ->> 'brand_id', '')::uuid,
           NULLIF(v_row ->> 'supplier_id', '')::uuid,
           v_row_org,
           v_actor)
        ON CONFLICT (sku, organization_id) DO UPDATE SET
          name            = EXCLUDED.name,
          description     = EXCLUDED.description,
          barcode         = EXCLUDED.barcode,
          status          = EXCLUDED.status,
          is_sellable     = EXCLUDED.is_sellable,
          is_purchasable  = EXCLUDED.is_purchasable,
          category_id     = EXCLUDED.category_id,
          subcategory_id  = EXCLUDED.subcategory_id,
          brand_id        = EXCLUDED.brand_id,
          supplier_id     = EXCLUDED.supplier_id,
          updated_at      = now()
        RETURNING * INTO v_product;

        v_product_id := v_product.id;

        IF v_row_org IS NOT NULL THEN
          INSERT INTO public.product_organizations (product_id, organization_id, created_by)
          VALUES (v_product_id, v_row_org, v_actor)
          ON CONFLICT (product_id, organization_id) DO NOTHING;
        END IF;

        -- Sincronizar item_suppliers (Fase 3) — ver comentário no topo do
        -- ficheiro. Fila sem supplier_id não mexe em nada.
        --
        -- FIX (24/09): o índice único real em item_suppliers passou a ser
        -- (product_id, supplier_id, COALESCE(uom_id, sentinela)) — ver
        -- 20261204202500_linhas_com_unidade_de_embalagem. O ON CONFLICT tem
        -- de repetir exactamente essa expressão e o predicado parcial para o
        -- Postgres o poder usar como árbitro.
        v_supplier_id := NULLIF(v_row ->> 'supplier_id', '')::uuid;
        IF v_supplier_id IS NOT NULL THEN
          UPDATE public.item_suppliers
             SET is_preferred = false, updated_at = now()
           WHERE product_id = v_product_id
             AND is_preferred
             AND deleted_at IS NULL
             AND supplier_id <> v_supplier_id;

          INSERT INTO public.item_suppliers
            (organization_id, item_type, product_id, supplier_id, is_preferred, is_active, created_by)
          VALUES
            (v_product.organization_id, 'product', v_product_id, v_supplier_id, true, true, v_actor)
          ON CONFLICT (product_id, supplier_id, COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid))
            WHERE (deleted_at IS NULL AND product_id IS NOT NULL) DO UPDATE SET
            is_preferred = true,
            is_active    = true,
            deleted_at   = NULL,
            updated_at   = now();
        END IF;

        v_price_new := '[]'::jsonb;
        IF v_row ? 'prices' AND jsonb_typeof(v_row -> 'prices') = 'array' THEN
          FOR v_price IN SELECT * FROM jsonb_array_elements(v_row -> 'prices') LOOP
            INSERT INTO public.product_prices
              (product_id, price_type, price, currency, vat_rate, valid_from, valid_to, created_by)
            VALUES
              (v_product_id,
               (v_price ->> 'price_type')::public.price_type,
               (v_price ->> 'price')::numeric,
               COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code,
               (v_price ->> 'vat_rate')::numeric,
               NULLIF(v_price ->> 'valid_from', '')::timestamptz,
               NULLIF(v_price ->> 'valid_to', '')::timestamptz,
               v_actor);
            v_price_new := v_price_new || jsonb_build_object(
              'price_type', v_price ->> 'price_type',
              'price',      v_price -> 'price',
              'currency',   v_price ->> 'currency',
              'vat_rate',   v_price -> 'vat_rate'
            );
          END LOOP;
        END IF;

        v_diff := jsonb_build_object(
          'products', jsonb_build_object(
            'sku',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.sku)),
            'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.name)),
            'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.status)),
            'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_active)),
            'is_sellable',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_sellable)),
            'is_purchasable',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_purchasable)),
            'category_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.category_id)),
            'subcategory_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.subcategory_id)),
            'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.organization_id)),
            'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.description)),
            'barcode',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.barcode)),
            'brand_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.brand_id)),
            'supplier_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.supplier_id))
          ),
          'product_organizations', jsonb_build_object(
            'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row_org))
          ),
          'product_prices', jsonb_build_object(
            'prices', jsonb_build_object('old', NULL, 'new', v_price_new)
          ),
          'source', 'bulk_import'
        );

        PERFORM public.fn_manual_audit_log(
          'products', v_product.id, v_product.organization_id, 'INSERT', v_diff, 'web_app'
        );

        v_results := v_results || jsonb_build_object(
          'input_index', v_row_idx, 'status', 'ok', 'product_id', v_product_id, 'action', 'insert'
        );

      ELSIF v_mode = 'update' THEN
        -- ── UPDATE product (scoped like the FE's .eq organization_id guard) ──
        v_product_id := NULLIF(v_row ->> 'id', '')::uuid;
        IF v_product_id IS NULL THEN
          RAISE EXCEPTION 'mode=update requer id (linha %)', v_row_idx USING ERRCODE = 'invalid_parameter_value';
        END IF;

        SELECT * INTO v_before FROM public.products
          WHERE id = v_product_id AND organization_id = p_org_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Produto não encontrado nesta organização (linha %)', v_row_idx
            USING ERRCODE = 'no_data_found';
        END IF;

        UPDATE public.products SET
          sku             = v_row ->> 'sku',
          name            = v_row ->> 'name',
          description     = NULLIF(v_row ->> 'description', ''),
          barcode         = NULLIF(v_row ->> 'barcode', ''),
          status          = COALESCE(v_row ->> 'status', 'draft')::public.product_status,
          category_id     = NULLIF(v_row ->> 'category_id', '')::uuid,
          subcategory_id  = NULLIF(v_row ->> 'subcategory_id', '')::uuid,
          brand_id        = NULLIF(v_row ->> 'brand_id', '')::uuid,
          supplier_id     = NULLIF(v_row ->> 'supplier_id', '')::uuid,
          is_sellable     = COALESCE((v_row ->> 'is_sellable')::boolean, false),
          is_purchasable  = COALESCE((v_row ->> 'is_purchasable')::boolean, false),
          updated_at      = now()
        WHERE id = v_product_id AND organization_id = p_org_id
        RETURNING * INTO v_product;

        IF v_row_org IS NOT NULL THEN
          INSERT INTO public.product_organizations (product_id, organization_id, created_by)
          VALUES (v_product_id, v_row_org, v_actor)
          ON CONFLICT (product_id, organization_id) DO NOTHING;
        END IF;

        -- Sincronizar item_suppliers (Fase 3) — ver comentário no topo do
        -- ficheiro / FIX acima (mesmo alvo de 3 colunas repetido aqui).
        v_supplier_id := NULLIF(v_row ->> 'supplier_id', '')::uuid;
        IF v_supplier_id IS NOT NULL THEN
          UPDATE public.item_suppliers
             SET is_preferred = false, updated_at = now()
           WHERE product_id = v_product_id
             AND is_preferred
             AND deleted_at IS NULL
             AND supplier_id <> v_supplier_id;

          INSERT INTO public.item_suppliers
            (organization_id, item_type, product_id, supplier_id, is_preferred, is_active, created_by)
          VALUES
            (v_product.organization_id, 'product', v_product_id, v_supplier_id, true, true, v_actor)
          ON CONFLICT (product_id, supplier_id, COALESCE(uom_id, '00000000-0000-0000-0000-000000000000'::uuid))
            WHERE (deleted_at IS NULL AND product_id IS NOT NULL) DO UPDATE SET
            is_preferred = true,
            is_active    = true,
            deleted_at   = NULL,
            updated_at   = now();
        END IF;

        -- Reconcile prices to exactly match the row's `prices` array: delete
        -- any existing price_type not present in the incoming payload first,
        -- mirroring the OLD FE's delete-then-insert net effect.
        DELETE FROM public.product_prices
        WHERE product_id = v_product_id
          AND price_type <> ALL (
            COALESCE(
              ARRAY(
                SELECT (elem ->> 'price_type')::public.price_type
                FROM jsonb_array_elements(
                  CASE WHEN v_row ? 'prices' AND jsonb_typeof(v_row -> 'prices') = 'array'
                       THEN v_row -> 'prices' ELSE '[]'::jsonb END
                ) elem
              ),
              ARRAY[]::public.price_type[]
            )
          );
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        v_price_changed := v_deleted_count > 0;

        v_price_diff := '[]'::jsonb;
        IF v_row ? 'prices' AND jsonb_typeof(v_row -> 'prices') = 'array' THEN
          FOR v_price IN SELECT * FROM jsonb_array_elements(v_row -> 'prices') LOOP
            SELECT * INTO v_existing_price FROM public.product_prices
              WHERE product_id = v_product_id
                AND price_type = (v_price ->> 'price_type')::public.price_type
              LIMIT 1;

            IF FOUND THEN
              IF v_existing_price.price      IS DISTINCT FROM (v_price ->> 'price')::numeric
                 OR v_existing_price.currency   IS DISTINCT FROM COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code
                 OR v_existing_price.vat_rate   IS DISTINCT FROM (v_price ->> 'vat_rate')::numeric
                 OR v_existing_price.valid_from IS DISTINCT FROM NULLIF(v_price ->> 'valid_from', '')::timestamptz
                 OR v_existing_price.valid_to   IS DISTINCT FROM NULLIF(v_price ->> 'valid_to', '')::timestamptz THEN
                v_price_changed := true;
              END IF;

              UPDATE public.product_prices SET
                price      = (v_price ->> 'price')::numeric,
                currency   = COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code,
                vat_rate   = (v_price ->> 'vat_rate')::numeric,
                valid_from = NULLIF(v_price ->> 'valid_from', '')::timestamptz,
                valid_to   = NULLIF(v_price ->> 'valid_to', '')::timestamptz,
                updated_at = now()
              WHERE id = v_existing_price.id;
            ELSE
              INSERT INTO public.product_prices
                (product_id, price_type, price, currency, vat_rate, valid_from, valid_to, created_by)
              VALUES
                (v_product_id,
                 (v_price ->> 'price_type')::public.price_type,
                 (v_price ->> 'price')::numeric,
                 COALESCE(v_price ->> 'currency', 'EUR')::public.currency_code,
                 (v_price ->> 'vat_rate')::numeric,
                 NULLIF(v_price ->> 'valid_from', '')::timestamptz,
                 NULLIF(v_price ->> 'valid_to', '')::timestamptz,
                 v_actor);
              v_price_changed := true;
            END IF;

            v_price_diff := v_price_diff || jsonb_build_object(
              'price_type', v_price ->> 'price_type',
              'price',      v_price -> 'price',
              'currency',   v_price ->> 'currency',
              'vat_rate',   v_price -> 'vat_rate'
            );
          END LOOP;
        END IF;

        v_diff := '{}'::jsonb;

        IF v_before.sku             IS DISTINCT FROM v_product.sku THEN
          v_diff := jsonb_set(v_diff, '{products,sku}', jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_product.sku)), true); END IF;
        IF v_before.name            IS DISTINCT FROM v_product.name THEN
          v_diff := jsonb_set(v_diff, '{products,name}', jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_product.name)), true); END IF;
        IF v_before.status          IS DISTINCT FROM v_product.status THEN
          v_diff := jsonb_set(v_diff, '{products,status}', jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_product.status)), true); END IF;
        IF v_before.is_sellable     IS DISTINCT FROM v_product.is_sellable THEN
          v_diff := jsonb_set(v_diff, '{products,is_sellable}', jsonb_build_object('old', to_jsonb(v_before.is_sellable), 'new', to_jsonb(v_product.is_sellable)), true); END IF;
        IF v_before.is_purchasable  IS DISTINCT FROM v_product.is_purchasable THEN
          v_diff := jsonb_set(v_diff, '{products,is_purchasable}', jsonb_build_object('old', to_jsonb(v_before.is_purchasable), 'new', to_jsonb(v_product.is_purchasable)), true); END IF;
        IF v_before.category_id     IS DISTINCT FROM v_product.category_id THEN
          v_diff := jsonb_set(v_diff, '{products,category_id}', jsonb_build_object('old', to_jsonb(v_before.category_id), 'new', to_jsonb(v_product.category_id)), true); END IF;
        IF v_before.subcategory_id  IS DISTINCT FROM v_product.subcategory_id THEN
          v_diff := jsonb_set(v_diff, '{products,subcategory_id}', jsonb_build_object('old', to_jsonb(v_before.subcategory_id), 'new', to_jsonb(v_product.subcategory_id)), true); END IF;
        IF v_before.description     IS DISTINCT FROM v_product.description THEN
          v_diff := jsonb_set(v_diff, '{products,description}', jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_product.description)), true); END IF;
        IF v_before.barcode         IS DISTINCT FROM v_product.barcode THEN
          v_diff := jsonb_set(v_diff, '{products,barcode}', jsonb_build_object('old', to_jsonb(v_before.barcode), 'new', to_jsonb(v_product.barcode)), true); END IF;
        IF v_before.brand_id        IS DISTINCT FROM v_product.brand_id THEN
          v_diff := jsonb_set(v_diff, '{products,brand_id}', jsonb_build_object('old', to_jsonb(v_before.brand_id), 'new', to_jsonb(v_product.brand_id)), true); END IF;
        IF v_before.supplier_id     IS DISTINCT FROM v_product.supplier_id THEN
          v_diff := jsonb_set(v_diff, '{products,supplier_id}', jsonb_build_object('old', to_jsonb(v_before.supplier_id), 'new', to_jsonb(v_product.supplier_id)), true); END IF;

        IF v_price_changed THEN
          v_diff := jsonb_set(v_diff, '{product_prices,prices}', jsonb_build_object('old', NULL, 'new', v_price_diff), true);
        END IF;

        -- Only emit an audit row when something actually changed (matches
        -- rpc_update_product's no-op-skip semantics) — re-running the same
        -- import file repeatedly must not generate audit noise.
        IF v_diff <> '{}'::jsonb THEN
          v_diff := v_diff || jsonb_build_object('source', 'bulk_import');
          PERFORM public.fn_manual_audit_log(
            'products', v_product.id, v_product.organization_id, 'UPDATE', v_diff, 'web_app'
          );
        END IF;

        v_results := v_results || jsonb_build_object(
          'input_index', v_row_idx, 'status', 'ok', 'product_id', v_product_id, 'action', 'update'
        );

      ELSE
        RAISE EXCEPTION 'mode inválido "%": deve ser insert ou update (linha %)', v_mode, v_row_idx
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- The enclosing BEGIN/EXCEPTION block already rolled back this row's
      -- partial writes via its implicit savepoint; every previously
      -- committed row in this same call (and this same transaction) is
      -- left intact.
      GET STACKED DIAGNOSTICS v_sqlerrm = MESSAGE_TEXT;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx,
        'status', 'error',
        'sku', v_row ->> 'sku',
        'error', v_sqlerrm
      );
    END;
  END LOOP;

  RETURN v_results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_brand(p_ids uuid[], p_organization_id uuid, p_new_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_org_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with brands_update RLS (pre + post org visible) ──
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update (scope) org must be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update (target) org must be visible.
    IF NOT (p_new_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  FOR v_rec IN
    UPDATE public.brands b
    SET organization_id = p_new_org_id
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.organization_id IS DISTINCT FROM p_new_org_id
    RETURNING b.id, p_organization_id AS old_org, p_new_org_id AS new_org
  LOOP
    -- Audit row is routed under the NEW org (the row's post-update org), matching the
    -- trigger which reads NEW.organization_id.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_product(p_ids uuid[], p_organization_id uuid, p_new_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_organization_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with products_update RLS (pre + post org visible) ──
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update (scope) org must be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update (target) org must be visible.
    IF NOT (p_new_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.edit'))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  FOR v_rec IN
    UPDATE public.products p
    SET organization_id = p_new_organization_id
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.organization_id IS DISTINCT FROM p_new_organization_id
    RETURNING p.id, p_organization_id AS old_org, p_new_organization_id AS new_org
  LOOP
    -- Audit row is routed under the NEW org (the row's post-update org), matching the
    -- trigger which reads NEW.organization_id.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_product_attribute(p_ids uuid[], p_organization_id uuid, p_new_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_ids        uuid[];
  v_rec        record;
  v_audit_org  uuid;
  v_count      integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_new_organization_id IS NULL THEN
    RAISE EXCEPTION 'Nova empresa obrigatória' USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: current org visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: target org visible.
    IF NOT (p_new_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.product_attributes pa
    SET organization_id = p_new_organization_id
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
      AND pa.organization_id IS DISTINCT FROM p_new_organization_id
    RETURNING pa.id,
              p_organization_id     AS old_org,
              p_new_organization_id AS new_org
  LOOP
    -- Route the log under the NEW org (post-image), matching where the row now lives.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('product_attributes', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_product_category(p_ids uuid[], p_organization_id uuid, p_new_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de empresa em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_organization_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with product_categories_update RLS (pre + post org visible) ──
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update (scope) org must be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update (target) org must be visible.
    IF NOT (p_new_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.edit'))) THEN
      RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  FOR v_rec IN
    UPDATE public.product_categories c
    SET organization_id = p_new_organization_id
    WHERE c.id = ANY (v_ids)
      AND c.organization_id = p_organization_id
      AND c.organization_id IS DISTINCT FROM p_new_organization_id
    RETURNING c.id, p_organization_id AS old_org, p_new_organization_id AS new_org
  LOOP
    -- Audit row is routed under the NEW org (the row's post-update org), matching the
    -- trigger which reads NEW.organization_id.
    v_audit_org := COALESCE(v_rec.new_org, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_org_service(p_ids uuid[], p_organization_id uuid, p_new_org_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_rec    record;
  v_diff   jsonb;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;
  -- The FE only fires when bulkNewCompanyId is truthy.
  IF p_new_org_id IS NULL THEN
    RAISE EXCEPTION 'Empresa de destino obrigatória' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with services_update (pre + post org visible) ────
  IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- USING: pre-update (scope) org must be visible.
  IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- WITH CHECK: post-update (target) org must be visible.
  IF NOT (p_new_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
    RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Update only rows in the scope org whose org actually changes; one audit row each,
  -- routed under the NEW org (the row's post-update org), matching the trigger which reads
  -- NEW.organization_id.
  FOR v_rec IN
    UPDATE public.services s
    SET organization_id = p_new_org_id
    WHERE s.id = ANY(p_ids)
      AND s.organization_id = p_organization_id
      AND s.organization_id IS DISTINCT FROM p_new_org_id
    RETURNING s.id, p_organization_id AS old_org, p_new_org_id AS new_org
  LOOP
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_rec.old_org), 'new', to_jsonb(v_rec.new_org))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_rec.id, v_rec.new_org, 'UPDATE', v_diff, 'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_brand(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_ids       uuid[];
  v_rec       record;
  v_audit_org uuid;
  v_count     integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para restauro em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.brands b
    SET is_active  = true,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.deleted_at IS NOT NULL
    RETURNING b.id, b.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
        'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_bundle(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_ids      uuid[];
  v_before   public.bundles;
  v_count    integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para restauro em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_before IN
    SELECT *
    FROM   public.bundles b
    WHERE  b.id = ANY (v_ids)
      AND  b.organization_id = p_organization_id
      AND  b.deleted_at IS NOT NULL
    FOR UPDATE
  LOOP
    UPDATE public.bundles
    SET deleted_at = NULL
    WHERE id = v_before.id;

    IF v_before.organization_id IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log(
        'bundles', v_before.id, v_before.organization_id, 'UPDATE',
        jsonb_build_object('bundles', jsonb_build_object(
          'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
        )),
        'web_app'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_product(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_ids      uuid[];
  v_rec      record;
  v_count    integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para restauro em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.delete'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.products p
    SET is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.is_deleted = true
    RETURNING p.id, p.organization_id
  LOOP
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      COALESCE(v_rec.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'is_deleted', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_product_attribute(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_ids       uuid[];
  v_rec       record;
  v_audit_org uuid;
  v_count     integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para restauro em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.product_attributes pa
    SET deleted_at = NULL,
        deleted_by = NULL
    WHERE pa.id = ANY (v_ids)
      AND pa.organization_id = p_organization_id
      AND pa.deleted_at IS NOT NULL
    RETURNING pa.id, pa.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_attributes', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_attributes', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_restore_product_category(p_ids uuid[], p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_ids       uuid[];
  v_rec       record;
  v_audit_org uuid;
  v_count     integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para restauro em massa'
      USING ERRCODE = 'check_violation';
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

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.delete'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  FOR v_rec IN
    UPDATE public.product_categories pc
    SET is_active  = true,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE pc.id = ANY (v_ids)
      AND pc.organization_id = p_organization_id
      AND pc.deleted_at IS NOT NULL
    RETURNING pc.id, pc.organization_id
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories', v_rec.id, v_audit_org, 'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
        'deleted_at', jsonb_build_object('old', NULL, 'new', NULL)
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_brand(p_ids uuid[], p_organization_id uuid, p_is_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with brands_update RLS ──────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The .eq(organization_id) FE scope + RLS both require the target org be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose is_active actually flips are audited (mirrors trigger skip-on-no-change).
  FOR v_rec IN
    UPDATE public.brands b
    SET is_active = p_is_active
    WHERE b.id = ANY (v_ids)
      AND b.organization_id = p_organization_id
      AND b.is_active IS DISTINCT FROM p_is_active
    RETURNING b.id, b.organization_id,
              (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'brands',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('brands', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_bundle(p_ids uuid[], p_organization_id uuid, p_status text, p_is_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_is_admin  boolean;
  v_ids       uuid[];
  v_before    public.bundles;
  v_diff      jsonb;
  v_count     integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_status IS NULL THEN
    RAISE EXCEPTION 'Estado obrigatório para alteração em massa' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para editar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── SELECT pre-image → UPDATE → per-entity consolidated audit row ─────────
  -- Iterate the in-scope rows that would actually change (status/is_active differs). Capturing
  -- the pre-image here lets the audit diff carry the TRUE old values (not NULL). Same
  -- SELECT-then-mutate loop as rpc_bulk_delete_brand / rpc_update_bundle's v_before.
  FOR v_before IN
    SELECT *
    FROM   public.bundles b
    WHERE  b.id = ANY (v_ids)
      AND  b.organization_id = p_organization_id
      AND  b.deleted_at IS NULL
      AND  (b.status IS DISTINCT FROM p_status
            OR b.is_active IS DISTINCT FROM p_is_active)
    FOR UPDATE
  LOOP
    UPDATE public.bundles
    SET status    = p_status,
        is_active = p_is_active
    WHERE id = v_before.id;

    v_diff := jsonb_build_object(
      'bundles', jsonb_build_object(
        'status',    jsonb_build_object('old', to_jsonb(v_before.status),    'new', to_jsonb(p_status)),
        'is_active', jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(p_is_active))
      )
    );

    IF v_before.organization_id IS NOT NULL THEN
      PERFORM public.fn_manual_audit_log(
        'bundles', v_before.id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_product(p_ids uuid[], p_organization_id uuid, p_is_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with products_update RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The .eq(organization_id) FE scope + RLS both require the target org be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose is_active actually flips are audited (mirrors trigger skip-on-no-change).
  FOR v_rec IN
    UPDATE public.products p
    SET is_active = p_is_active
    WHERE p.id = ANY (v_ids)
      AND p.organization_id = p_organization_id
      AND p.is_active IS DISTINCT FROM p_is_active
    RETURNING p.id, p.organization_id,
              (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'products',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('products', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_product_category(p_ids uuid[], p_organization_id uuid, p_is_active boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_ids         uuid[];
  v_rec         record;
  v_audit_org   uuid;
  v_count       integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
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

  -- ── Authorization parity with product_categories_update RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The .eq(organization_id) FE scope + RLS both require the target org be visible.
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose is_active actually flips are audited (mirrors trigger skip-on-no-change).
  FOR v_rec IN
    UPDATE public.product_categories c
    SET is_active = p_is_active
    WHERE c.id = ANY (v_ids)
      AND c.organization_id = p_organization_id
      AND c.is_active IS DISTINCT FROM p_is_active
    RETURNING c.id, c.organization_id,
              (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_audit_org := COALESCE(v_rec.organization_id, k_system_sentinel);
    PERFORM public.fn_manual_audit_log(
      'product_categories',
      v_rec.id,
      v_audit_org,
      'UPDATE',
      jsonb_build_object('product_categories', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_service(p_ids uuid[], p_is_active boolean, p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_rec    record;
  v_diff   jsonb;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with services_update ────────────────────────────
  IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Update only rows in the target org (same scope as the hook), one audit row each.
  FOR v_rec IN
    UPDATE public.services s
    SET is_active = COALESCE(p_is_active, s.is_active)
    WHERE s.id = ANY(p_ids)
      AND s.organization_id = p_organization_id
      AND s.is_active IS DISTINCT FROM COALESCE(p_is_active, s.is_active)
    RETURNING s.id, s.organization_id, (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_rec.id, v_rec.organization_id, 'UPDATE', v_diff, 'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_brand(p_name text, p_slug text, p_description text, p_website text, p_logo_url text, p_organization_id uuid, p_org_ids uuid[])
 RETURNS brands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_brand       public.brands;
  v_audit_org   uuid;
  v_diff        jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order (mirrors allCompanyIds / upsert dedup) ──
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  -- ── Authorization parity with brands_insert RLS ──────────────────────────
  -- brands_insert requires organization_id IS NOT NULL for non-admins; the FE always
  -- sets organization_id = active company.
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para criar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible too (brand_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the brand (identical column set to the FE brandPayload + created_by) ──
  INSERT INTO public.brands
    (name, slug, is_active, organization_id, description, website, logo_url, created_by)
  VALUES
    (p_name,
     p_slug,
     true,
     p_organization_id,
     nullif(p_description, ''),
     nullif(p_website, ''),
     nullif(p_logo_url, ''),
     v_actor)
  RETURNING * INTO v_brand;

  -- ── UPSERT company associations (mirrors the ignoreDuplicates upsert) ─────
  FOREACH v_org IN ARRAY v_dedup_orgs LOOP
    INSERT INTO public.brand_organizations (brand_id, organization_id, created_by)
    VALUES (v_brand.id, v_org, v_actor)
    ON CONFLICT (brand_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── Combined diff: full snapshot of created row + granted org associations ─
  v_diff := jsonb_build_object(
    'brands', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.slug)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.description)),
      'website',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.website)),
      'logo_url',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.logo_url)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.is_active)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_brand.organization_id))
    ),
    'brand_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_dedup_orgs))
    )
  );

  -- Route global brands under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_brand.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', v_brand.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_brand;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_bundle(p_organization_id uuid, p_sku text, p_name text, p_description text, p_pricing_type text, p_fixed_price numeric, p_discount_percent numeric, p_discount_fixed numeric, p_status text, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone, p_choice_groups jsonb DEFAULT '[]'::jsonb, p_components jsonb DEFAULT '[]'::jsonb)
 RETURNS bundles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_bundle       public.bundles;
  v_is_active    boolean;
  v_group        jsonb;
  v_comp         jsonb;
  v_idx          integer;
  v_ref          integer;
  v_group_ids    uuid[] := ARRAY[]::uuid[];
  v_new_group_id uuid;
  v_target_grp   uuid;
  v_groups_diff  jsonb := '[]'::jsonb;
  v_comps_diff   jsonb := '[]'::jsonb;
  v_diff         jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with bundles_insert RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para criar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_is_active := (p_status = 'active');

  -- ── INSERT the bundle (identical column set to bundleData + created_by) ───
  INSERT INTO public.bundles
    (organization_id, sku, name, description, pricing_type,
     fixed_price, discount_percent, discount_fixed,
     status, valid_from, valid_to, is_active, created_by)
  VALUES
    (p_organization_id,
     btrim(p_sku),
     btrim(p_name),
     nullif(btrim(coalesce(p_description, '')), ''),
     p_pricing_type::public.bundle_pricing_type,
     CASE WHEN p_pricing_type = 'fixed_price'          THEN p_fixed_price      ELSE NULL END,
     CASE WHEN p_pricing_type = 'percentage_discount'  THEN p_discount_percent ELSE NULL END,
     CASE WHEN p_pricing_type = 'fixed_discount'       THEN p_discount_fixed   ELSE NULL END,
     p_status,
     p_valid_from,
     p_valid_to,
     v_is_active,
     v_actor)
  RETURNING * INTO v_bundle;

  -- ── INSERT choice groups (preserving order); remember generated ids ───────
  IF p_choice_groups IS NOT NULL AND jsonb_typeof(p_choice_groups) = 'array' THEN
    FOR v_idx IN 0 .. (jsonb_array_length(p_choice_groups) - 1) LOOP
      v_group := p_choice_groups -> v_idx;

      INSERT INTO public.bundle_choice_groups
        (bundle_id, name, description, min_selections, max_selections, is_required, sort_order)
      VALUES
        (v_bundle.id,
         v_group ->> 'name',
         nullif(v_group ->> 'description', ''),
         COALESCE((v_group ->> 'min_selections')::integer, 1),
         COALESCE((v_group ->> 'max_selections')::integer, 1),
         COALESCE((v_group ->> 'is_required')::boolean, true),
         COALESCE((v_group ->> 'sort_order')::integer, v_idx))
      RETURNING id INTO v_new_group_id;

      v_group_ids := v_group_ids || v_new_group_id;
      v_groups_diff := v_groups_diff || jsonb_build_array(
        jsonb_build_object(
          'id',             to_jsonb(v_new_group_id),
          'name',           v_group -> 'name',
          'min_selections', v_group -> 'min_selections',
          'max_selections', v_group -> 'max_selections',
          'is_required',    v_group -> 'is_required'
        )
      );
    END LOOP;
  END IF;

  -- ── INSERT components (choice_group_ref = index into p_choice_groups) ─────
  IF p_components IS NOT NULL AND jsonb_typeof(p_components) = 'array' THEN
    FOR v_idx IN 0 .. (jsonb_array_length(p_components) - 1) LOOP
      v_comp := p_components -> v_idx;

      v_target_grp := NULL;
      IF (v_comp ->> 'choice_group_ref') IS NOT NULL THEN
        v_ref := (v_comp ->> 'choice_group_ref')::integer;
        IF v_ref >= 0 AND v_ref < COALESCE(array_length(v_group_ids, 1), 0) THEN
          v_target_grp := v_group_ids[v_ref + 1];  -- arrays are 1-based
        END IF;
      END IF;

      INSERT INTO public.bundle_components
        (bundle_id, product_id, service_id, quantity, pricing_mode,
         custom_price, custom_discount_percent, custom_discount_fixed,
         is_optional, choice_group_id, sort_order)
      VALUES
        (v_bundle.id,
         nullif(v_comp ->> 'product_id', '')::uuid,
         nullif(v_comp ->> 'service_id', '')::uuid,
         COALESCE((v_comp ->> 'quantity')::numeric, 1),
         COALESCE((v_comp ->> 'pricing_mode'), 'original')::public.component_pricing_mode,
         nullif(v_comp ->> 'custom_price', '')::numeric,
         nullif(v_comp ->> 'custom_discount_percent', '')::numeric,
         nullif(v_comp ->> 'custom_discount_fixed', '')::numeric,
         COALESCE((v_comp ->> 'is_optional')::boolean, false),
         v_target_grp,
         COALESCE((v_comp ->> 'sort_order')::integer, v_idx));

      v_comps_diff := v_comps_diff || jsonb_build_array(
        jsonb_build_object(
          'product_id',      v_comp -> 'product_id',
          'service_id',      v_comp -> 'service_id',
          'quantity',        v_comp -> 'quantity',
          'pricing_mode',    v_comp -> 'pricing_mode',
          'is_optional',     v_comp -> 'is_optional',
          'choice_group_id', to_jsonb(v_target_grp)
        )
      );
    END LOOP;
  END IF;

  -- ── Combined diff: full snapshot of the created bundle + created children ─
  v_diff := jsonb_build_object(
    'bundles', jsonb_build_object(
      'sku',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.sku)),
      'name',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.name)),
      'description',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.description)),
      'pricing_type',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.pricing_type)),
      'fixed_price',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.fixed_price)),
      'discount_percent', jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_percent)),
      'discount_fixed',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_fixed)),
      'status',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.status)),
      'valid_from',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_from)),
      'valid_to',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_to)),
      'is_active',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.is_active)),
      'organization_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.organization_id))
    )
  );

  IF jsonb_array_length(v_groups_diff) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'bundle_choice_groups', jsonb_build_object('old', NULL, 'new', v_groups_diff)
    );
  END IF;
  IF jsonb_array_length(v_comps_diff) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'bundle_components', jsonb_build_object('old', NULL, 'new', v_comps_diff)
    );
  END IF;

  -- Emit a single audit row. bundles uses fn_generic_entity_audit(), which SKIPS
  -- silently when organization_id IS NULL; mirror that here.
  IF v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', v_bundle.id, v_bundle.organization_id, 'INSERT', v_diff, 'web_app'
    );
  END IF;

  RETURN v_bundle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_product(p_sku text, p_name text, p_status text, p_is_sellable boolean, p_is_purchasable boolean, p_category_id uuid, p_subcategory_id uuid, p_primary_org_id uuid, p_uom_id uuid, p_description text, p_barcode text, p_brand_id uuid, p_supplier_id uuid, p_all_org_ids uuid[], p_prices jsonb, p_attribute_values jsonb, p_manages_stock boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_org         uuid;
  v_unique_orgs uuid[];
  v_product     public.products;
  v_price       jsonb;
  v_attr        jsonb;
  v_diff        jsonb;
  v_price_new   jsonb := '[]'::jsonb;
  v_attr_new    jsonb := '[]'::jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Build the unique org set: {primaryOrgId} ∪ p_all_org_ids (FE's Set) ───
  -- Preserve insertion order: primary first, then each new id in first-seen order.
  WITH combined AS (
    SELECT p_primary_org_id AS o, 0 AS ord WHERE p_primary_org_id IS NOT NULL
    UNION ALL
    SELECT o, ord
    FROM unnest(COALESCE(p_all_org_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(o, ord)
    WHERE o IS NOT NULL
  ),
  dedup AS (
    SELECT o, min(ord) AS ord FROM combined GROUP BY o
  )
  SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
  INTO   v_unique_orgs
  FROM   dedup;

  -- ── Authorization parity with products_insert RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_primary_org_id IS NULL
       OR NOT (p_primary_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.create'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_unique_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.create'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the product (FE productData + conditional fields + supplier_id) ─
  -- The FE only sets description/barcode when truthy and brand_id when present;
  -- '' → NULL here is equivalent to the key being absent for these nullable columns.
  INSERT INTO public.products
    (sku, name, status, is_active, is_sellable, is_purchasable,
     category_id, subcategory_id, organization_id, uom_id,
     description, barcode, brand_id, supplier_id, created_by,
     manages_stock)
  VALUES
    (p_sku,
     p_name,
     p_status::public.product_status,
     true,
     COALESCE(p_is_sellable, false),
     COALESCE(p_is_purchasable, false),
     p_category_id,
     p_subcategory_id,
     p_primary_org_id,
     p_uom_id,
     nullif(p_description, ''),
     nullif(p_barcode, ''),
     p_brand_id,
     p_supplier_id,
     v_actor,
     COALESCE(p_manages_stock, false))
  RETURNING * INTO v_product;

  -- ── INSERT org associations for the full unique set ───────────────────────
  FOREACH v_org IN ARRAY v_unique_orgs LOOP
    INSERT INTO public.product_organizations (product_id, organization_id, created_by)
    VALUES (v_product.id, v_org, v_actor)
    ON CONFLICT (product_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── INSERT prices (every provided entry is fresh on create) ───────────────
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'array' THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
      INSERT INTO public.product_prices
        (product_id, price_type, price, currency, vat_rate, created_by)
      VALUES
        (v_product.id,
         (v_price ->> 'price_type')::public.price_type,
         (v_price ->> 'price')::numeric,
         (v_price ->> 'currency')::public.currency_code,
         (v_price ->> 'vat_rate')::numeric,
         v_actor);
      v_price_new := v_price_new || jsonb_build_object(
        'price_type', v_price ->> 'price_type',
        'price',      v_price -> 'price',
        'currency',   v_price ->> 'currency',
        'vat_rate',   v_price -> 'vat_rate'
      );
    END LOOP;
  END IF;

  -- ── INSERT attribute values (every provided entry is fresh on create) ─────
  IF p_attribute_values IS NOT NULL AND jsonb_typeof(p_attribute_values) = 'array' THEN
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attribute_values) LOOP
      INSERT INTO public.product_attribute_values
        (product_id, attribute_id, value_text, value_number, value_bool)
      VALUES
        (v_product.id,
         (v_attr ->> 'attribute_id')::uuid,
         CASE WHEN v_attr ? 'value_text'   THEN v_attr ->> 'value_text' END,
         CASE WHEN v_attr ? 'value_number' THEN (v_attr ->> 'value_number')::numeric END,
         CASE WHEN v_attr ? 'value_bool'   THEN (v_attr ->> 'value_bool')::boolean END);
      v_attr_new := v_attr_new || v_attr;
    END LOOP;
  END IF;

  -- ── Combined diff: full snapshot of the created product + child sets ──────
  v_diff := jsonb_build_object(
    'products', jsonb_build_object(
      'sku',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.sku)),
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.name)),
      'status',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.status)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_active)),
      'is_sellable',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_sellable)),
      'is_purchasable',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.is_purchasable)),
      'category_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.category_id)),
      'subcategory_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.subcategory_id)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.organization_id)),
      'uom_id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.uom_id)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.description)),
      'barcode',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.barcode)),
      'brand_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.brand_id)),
      'supplier_id',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.supplier_id)),
      'manages_stock',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_product.manages_stock))
    ),
    'product_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_unique_orgs))
    ),
    'product_prices', jsonb_build_object(
      'prices', jsonb_build_object('old', NULL, 'new', v_price_new)
    ),
    'product_attribute_values', jsonb_build_object(
      'values', jsonb_build_object('old', NULL, 'new', v_attr_new)
    )
  );

  PERFORM public.fn_manual_audit_log(
    'products', v_product.id, v_product.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_product.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_product_attribute(p_organization_id uuid, p_code text, p_label text, p_value_type text, p_unit text, p_is_filterable boolean, p_is_required boolean, p_is_variant_option boolean, p_sort_order integer, p_pricing_type text, p_price_per_unit numeric, p_pricing_unit text, p_has_hex_color boolean, p_is_measurement boolean, p_measurement_type text, p_pricing_dimension text)
 RETURNS product_attributes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_row          public.product_attributes;
  -- Derived column values (mirror the FE conditional expressions)
  v_has_hex      boolean;
  v_is_meas      boolean;
  v_meas_type    text;
  v_valoriz      text;
  v_price_unit   numeric;
  v_pricing_unit text;
  v_pricing_dim  text;
  v_unit         text;
  v_audit_org    uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_attributes_insert RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Derive conditional column values exactly as the FE does ───────────────
  v_has_hex     := CASE WHEN p_value_type = 'list' THEN COALESCE(p_has_hex_color, false) ELSE false END;
  v_is_meas     := CASE WHEN p_value_type = 'number' THEN COALESCE(p_is_measurement, false) ELSE false END;
  v_meas_type   := CASE WHEN p_value_type = 'number' AND COALESCE(p_is_measurement, false)
                        THEN p_measurement_type ELSE NULL END;
  v_valoriz     := CASE WHEN p_value_type IN ('list', 'number')
                        THEN COALESCE(p_pricing_type, 'none') ELSE 'none' END;
  v_price_unit  := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN COALESCE(p_price_per_unit, 0) ELSE 0 END;
  v_pricing_unit := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN p_pricing_unit ELSE NULL END;
  v_pricing_dim := CASE
                     WHEN v_has_hex THEN 'color'
                     WHEN v_is_meas AND p_pricing_type = 'base_price' THEN 'size'
                     ELSE nullif(p_pricing_dimension, '')
                   END;
  v_unit        := nullif(p_unit, '');  -- FE only sets unit when non-empty

  -- ── INSERT (identical column set to attributeData) ────────────────────────
  INSERT INTO public.product_attributes (
    code, label, value_type, unit, is_filterable, is_required, is_variant_option,
    sort_order, organization_id, pricing_type, price_per_unit, pricing_unit,
    has_hex_color, is_measurement, measurement_type, valorization_type,
    pricing_dimension, created_by
  )
  VALUES (
    p_code, p_label, p_value_type, v_unit, COALESCE(p_is_filterable, false),
    COALESCE(p_is_required, false), COALESCE(p_is_variant_option, false),
    COALESCE(p_sort_order, 0), p_organization_id, COALESCE(p_pricing_type, 'none'),
    v_price_unit, v_pricing_unit, v_has_hex, v_is_meas, v_meas_type, v_valoriz,
    v_pricing_dim, v_actor
  )
  RETURNING * INTO v_row;

  v_audit_org := COALESCE(v_row.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    v_row.id,
    v_audit_org,
    'INSERT',
    jsonb_build_object('product_attributes', to_jsonb(v_row)),
    'web_app'
  );

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_product_category(p_name text, p_slug text, p_path text, p_description text, p_parent_id uuid, p_sort_order integer, p_org_ids uuid[])
 RETURNS product_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_primary_org uuid;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_category    public.product_categories;
  v_audit_org   uuid;
  v_diff        jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order (mirrors the FE's Array.from(new Set(...))) ──
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  IF array_length(v_dedup_orgs, 1) IS NULL OR array_length(v_dedup_orgs, 1) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  v_primary_org := v_dedup_orgs[1];

  -- ── Authorization parity with product_categories_insert RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Primary org must be non-null and visible (WITH CHECK on product_categories).
    IF v_primary_org IS NULL
       OR NOT (v_primary_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.create'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible too (product_category_organizations_insert).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.create'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── INSERT the category (identical column set to the FE insertPayload) ────
  INSERT INTO public.product_categories
    (name, slug, path, description, parent_id, sort_order, is_active,
     created_by, organization_id)
  VALUES
    (p_name,
     p_slug,
     p_path,
     nullif(p_description, ''),
     p_parent_id,
     COALESCE(p_sort_order, 0),
     true,
     v_actor,
     v_primary_org)
  RETURNING * INTO v_category;

  -- ── INSERT company associations (one row per deduped org) ─────────────────
  FOREACH v_org IN ARRAY v_dedup_orgs LOOP
    INSERT INTO public.product_category_organizations
      (category_id, organization_id, created_by)
    VALUES (v_category.id, v_org, v_actor);
  END LOOP;

  -- ── Combined diff: full snapshot of created row + granted org associations ─
  v_diff := jsonb_build_object(
    'product_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.slug)),
      'path',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.path)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.description)),
      'parent_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.parent_id)),
      'sort_order',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.sort_order)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.is_active)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_category.organization_id))
    ),
    'product_category_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_dedup_orgs))
    )
  );

  -- Route global categories under the sentinel, exactly like the trigger.
  v_audit_org := COALESCE(v_category.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', v_category.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_category;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_product_subcategory(p_name text, p_slug text, p_path text, p_description text, p_parent_id uuid, p_organization_id uuid, p_sort_order integer)
 RETURNS product_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_parent_org uuid;
  v_subcat     public.product_categories;
  v_audit_org  uuid;
  v_diff       jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Required-field guards mirroring the FE early returns ─────────────────
  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Categoria pai obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Selecione uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Authorization parity with product_categories_insert SUBCATEGORY arm ──
  -- Wave 7 §2 subcategory arm:
  --   has_anew_permission(uid,'product_subcategories.create')
  --   AND get_product_category_org_id(parent_id) IN visible_orgs
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_parent_org := public.get_product_category_org_id(p_parent_id);
    IF v_parent_org IS NULL
       OR NOT (v_parent_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_subcategories.create'))) THEN
      RAISE EXCEPTION 'Categoria pai fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── INSERT the subcategory (identical column set to the FE insert payload) ─
  INSERT INTO public.product_categories
    (name, slug, path, description, parent_id, organization_id,
     sort_order, is_active, created_by)
  VALUES
    (p_name,
     p_slug,
     p_path,
     nullif(p_description, ''),
     p_parent_id,
     p_organization_id,
     COALESCE(p_sort_order, 0),
     true,
     v_actor)
  RETURNING * INTO v_subcat;

  -- ── Combined diff: full snapshot of the created subcategory row ───────────
  v_diff := jsonb_build_object(
    'product_categories', jsonb_build_object(
      'name',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.name)),
      'slug',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.slug)),
      'path',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.path)),
      'description',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.description)),
      'parent_id',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.parent_id)),
      'sort_order',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.sort_order)),
      'is_active',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.is_active)),
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_subcat.organization_id))
    )
  );

  -- Attribute the audit row under the parent-resolved org (mirrors the subcategory
  -- audit trigger); fall back to the row's own org, then the sentinel.
  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_subcat.id),
    v_subcat.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', v_subcat.id, v_audit_org, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_subcat;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_service(p_sku text, p_name text, p_slug text, p_long_desc text, p_service_type text, p_is_active boolean, p_organization_id uuid, p_category_id uuid, p_subcategory_id uuid, p_org_ids uuid[], p_purchase numeric, p_retail numeric, p_currency text, p_vat_rate numeric)
 RETURNS services
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_uid         uuid := (SELECT auth.uid());
  v_admin       boolean;
  v_row         public.services;
  v_org         uuid;
  v_added_orgs  uuid[] := ARRAY[]::uuid[];
  v_diff        jsonb;
  v_price_diff  jsonb := '{}'::jsonb;
  v_existing    uuid;
  v_ptype       text;
  v_pvalue      numeric;
  v_ptypes      text[] := ARRAY['purchase', 'retail'];
  i             integer;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user(v_uid);

  -- ── Authorization parity with services_insert (no admin OR-branch on services) ──
  IF NOT public.has_anew_permission(v_uid, 'services.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.create'))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the service (identical conditional column set to handleSubmit) ──
  INSERT INTO public.services
    (sku, name, slug, is_active, organization_id, service_type,
     long_desc, service_category_id, service_subcategory_id, created_by)
  VALUES
    (p_sku,
     p_name,
     p_slug,
     COALESCE(p_is_active, true),
     p_organization_id,
     p_service_type,
     nullif(p_long_desc, ''),
     p_category_id,
     p_subcategory_id,
     v_actor)
  RETURNING * INTO v_row;

  -- ── INSERT service_organizations (only when the list is non-empty, like the FE) ──
  IF p_org_ids IS NOT NULL AND array_length(p_org_ids, 1) > 0 THEN
    FOREACH v_org IN ARRAY p_org_ids LOOP
      -- Authorization parity with service_organizations_insert per row.
      IF NOT v_admin THEN
        IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
          RAISE EXCEPTION 'Sem permissão para associar empresas ao serviço'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
          RAISE EXCEPTION 'Empresa associada fora do âmbito do utilizador'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;

      INSERT INTO public.service_organizations (service_id, organization_id, created_by)
      VALUES (v_row.id, v_org, v_actor);
      v_added_orgs := v_added_orgs || v_org;
    END LOOP;
  END IF;

  -- ── Upsert both price rows (purchase + retail), matching handleSubmit ──────
  FOR i IN 1..2 LOOP
    v_ptype  := v_ptypes[i];
    v_pvalue := COALESCE(CASE WHEN v_ptype = 'purchase' THEN p_purchase ELSE p_retail END, 0);

    SELECT id INTO v_existing
    FROM public.service_prices
    WHERE service_id = v_row.id AND price_type = v_ptype
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.service_prices
      SET price = v_pvalue, currency = p_currency, vat_rate = p_vat_rate, created_by = v_actor
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.service_prices
        (service_id, price_type, price, currency, vat_rate, created_by)
      VALUES (v_row.id, v_ptype, v_pvalue, p_currency, p_vat_rate, v_actor);
    END IF;

    v_price_diff := v_price_diff || jsonb_build_object(
      v_ptype, jsonb_build_object('old', NULL, 'new', to_jsonb(v_pvalue))
    );
  END LOOP;

  -- ── Combined diff: full snapshot of the created service + orgs + prices ────
  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'sku',                    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.sku)),
      'name',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
      'slug',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.slug)),
      'is_active',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active)),
      'organization_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.organization_id)),
      'service_type',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_type)),
      'long_desc',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.long_desc)),
      'service_category_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_category_id)),
      'service_subcategory_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_subcategory_id))
    ),
    'service_prices', v_price_diff
  );

  IF array_length(v_added_orgs, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'service_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_added_orgs))
      )
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'services', v_row.id, v_row.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_brand(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.brands;
  v_deleted_at timestamptz;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Marca já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  -- Soft delete only. brand_organizations junction rows are kept intact so a
  -- restore recovers the exact same company associations.
  UPDATE public.brands
  SET is_active  = false,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('brands', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_bundle(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.bundles;
  v_deleted_at timestamptz;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org, non-deleted ────────────
  SELECT * INTO v_before
  FROM public.bundles
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Soft delete ───────────────────────────────────────────────────────────
  v_deleted_at := now();
  UPDATE public.bundles
  SET deleted_at = v_deleted_at
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  -- ── Diff: the deleted_at transition (mirrors the trigger's UPDATE diff) ───
  v_diff := jsonb_build_object(
    'bundles', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )
  );

  IF v_before.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_product(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.products;
  v_deleted_at timestamptz;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.delete'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Produto já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();
  UPDATE public.products
  SET is_deleted = true,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id AND organization_id = p_organization_id;

  PERFORM public.fn_manual_audit_log(
    'products',
    p_id,
    COALESCE(v_before.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
    'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_product_attribute(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.product_attributes;
  v_deleted_at timestamptz;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Atributo já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  UPDATE public.product_attributes
  SET deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_attributes', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_product_category(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_before     public.product_categories;
  v_deleted_at timestamptz;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.delete'))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Categoria já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  -- Soft delete only. product_category_organizations junction rows are kept
  -- intact so a restore recovers the exact same company associations.
  UPDATE public.product_categories
  SET is_active  = false,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_product_subcategory(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.product_categories;
  v_parent_org  uuid;
  v_deleted_at  timestamptz;
  v_audit_org   uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Subcategoria sem contexto de organização' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_parent_org := public.get_product_category_org_id(v_before.parent_id);
    IF v_parent_org IS NULL
       OR NOT (v_parent_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_subcategories.delete'))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Subcategoria já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_deleted_at := now();

  UPDATE public.product_categories
  SET is_active  = false,
      deleted_at = v_deleted_at,
      deleted_by = v_actor
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_before.parent_id),
    v_before.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', NULL, 'new', to_jsonb(v_deleted_at))
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_service(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor   uuid;
  v_uid     uuid := (SELECT auth.uid());
  v_before  public.services;
  v_diff    jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with services_delete ────────────────────────────
  IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.delete'))) THEN
    RAISE EXCEPTION 'Serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency guard: nothing to do (and nothing new to audit) if already soft-deleted.
  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Serviço já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.services
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_actor
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
    )
  );

  PERFORM public.fn_manual_audit_log(
    'services', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_service_fee_type(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_before public.service_fee_types;
  v_diff   jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_fee_types WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taxa de serviço não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with service_fee_types_delete ───────────────────
  IF NOT public.is_system_admin_user(v_uid) THEN
    IF NOT public.has_anew_permission(v_uid, 'service_fees.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar taxas de serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'service_fees.delete'))) THEN
      RAISE EXCEPTION 'Taxa de serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Taxa de serviço já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.service_fee_types
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_actor,
      updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(true)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
  );

  PERFORM public.fn_manual_audit_log(
    'service_fee_types', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_duplicate_product_attribute(p_id uuid, p_organization_id uuid)
 RETURNS product_attributes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_src        public.product_attributes;
  v_new        public.product_attributes;
  v_new_code   text;
  v_suffix     integer := 1;
  v_exists     boolean;
  v_grp        record;
  v_new_grp_id uuid;
  v_audit_org  uuid;
  v_counts     jsonb := '{}'::jsonb;
  v_grp_count  integer := 0;
  v_val_count  integer := 0;
  v_vp_count   integer := 0;
  v_pr_count   integer := 0;
  v_org_count  integer := 0;
  v_pal_count  integer := 0;
  -- old attribute_option_groups.id -> new attribute_option_groups.id
  v_group_map  jsonb := '{}'::jsonb;
  v_pal        record;
  v_new_base_group_id uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load source attribute scoped by the active org (FE looks up by activeCompany) ──
  SELECT * INTO v_src
  FROM public.product_attributes
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_attributes_insert RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The new attribute inherits the source org; it must be non-null and visible.
    IF v_src.organization_id IS NULL
       OR NOT (v_src.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Atributo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── The clone always inherits the SOURCE org (the INSERT below uses
  --    v_src.organization_id). p_organization_id is the active-company id the FE
  --    passes; for the duplicate flow it MUST match the source org, otherwise the
  --    uniqueness check below would run against the wrong org and could either
  --    admit a duplicate `code` into the real target org or fabricate needless
  --    `_copy_N` suffixes. Enforce the invariant explicitly so both the check and
  --    the INSERT are guaranteed to operate on the same org. ─────────────────────
  IF p_organization_id IS DISTINCT FROM v_src.organization_id THEN
    RAISE EXCEPTION 'Organização de destino tem de coincidir com a organização do atributo de origem'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Find a unique code, scoped to the org the clone will actually live in ──
  v_new_code := v_src.code || '_copy';
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.product_attributes
      WHERE code = v_new_code
        AND organization_id = v_src.organization_id
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
    v_suffix := v_suffix + 1;
    v_new_code := v_src.code || '_copy_' || v_suffix;
  END LOOP;

  -- ── INSERT the cloned attribute (all columns except id; new code/label/created_by) ──
  INSERT INTO public.product_attributes (
    code, label, type, unit, options, is_filterable, is_required, is_variant_attribute,
    sort_order, value_type, is_variant_option, allowed_values, organization_id,
    pricing_type, price_per_unit, pricing_unit, has_hex_color, is_measurement,
    measurement_type, valorization_type, pricing_dimension, created_by
  )
  SELECT
    v_new_code, v_src.label || ' (cópia)', v_src.type, v_src.unit, v_src.options,
    v_src.is_filterable, v_src.is_required, v_src.is_variant_attribute, v_src.sort_order,
    v_src.value_type, v_src.is_variant_option, v_src.allowed_values, v_src.organization_id,
    v_src.pricing_type, v_src.price_per_unit, v_src.pricing_unit, v_src.has_hex_color,
    v_src.is_measurement, v_src.measurement_type, v_src.valorization_type,
    v_src.pricing_dimension, v_actor
  RETURNING * INTO v_new;

  -- ── 1) Option groups + their values ───────────────────────────────────────
  FOR v_grp IN
    SELECT id, organization_id, name, description, is_active, sort_order
    FROM public.attribute_option_groups
    WHERE attribute_id = v_src.id
  LOOP
    INSERT INTO public.attribute_option_groups (
      attribute_id, organization_id, name, description, is_active, sort_order, created_by
    )
    VALUES (
      v_new.id, v_grp.organization_id, v_grp.name, v_grp.description,
      v_grp.is_active, v_grp.sort_order, v_actor
    )
    RETURNING id INTO v_new_grp_id;
    v_grp_count := v_grp_count + 1;

    -- Track old group id -> new group id so downstream references
    -- (category_attribute_palettes.base_group_id) can be remapped.
    v_group_map := v_group_map || jsonb_build_object(v_grp.id::text, v_new_grp_id);

    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, hex_color, sort_order, is_active
    )
    SELECT v_new_grp_id, aogv.value_text, aogv.display_name, aogv.hex_color,
           COALESCE(aogv.sort_order, 0), COALESCE(aogv.is_active, true)
    FROM public.attribute_option_group_values aogv
    WHERE aogv.group_id = v_grp.id;
    GET DIAGNOSTICS v_val_count = ROW_COUNT;
  END LOOP;

  -- ── 2) Category-level value prices (product_id IS NULL) ────────────────────
  INSERT INTO public.product_attribute_value_prices (
    attribute_id, organization_id, category_id, value_option, price, cost_impact,
    is_available, sort_order, price_context_id
  )
  SELECT v_new.id, organization_id, category_id, value_option, price, cost_impact,
         is_available, sort_order, price_context_id
  FROM public.product_attribute_value_prices
  WHERE attribute_id = v_src.id
    AND product_id IS NULL;
  GET DIAGNOSTICS v_vp_count = ROW_COUNT;

  -- ── 3) Category-level price ranges (product_id IS NULL) ────────────────────
  INSERT INTO public.product_attribute_price_ranges (
    attribute_id, organization_id, category_id, range_type, min_value, max_value,
    min_width, max_width, min_height, max_height, min_depth, max_depth,
    price_per_unit, cost_impact, price_context_id
  )
  SELECT v_new.id, organization_id, category_id, range_type, min_value, max_value,
         min_width, max_width, min_height, max_height, min_depth, max_depth,
         price_per_unit, cost_impact, price_context_id
  FROM public.product_attribute_price_ranges
  WHERE attribute_id = v_src.id
    AND product_id IS NULL;
  GET DIAGNOSTICS v_pr_count = ROW_COUNT;

  -- ── 4) Organization links ─────────────────────────────────────────────────
  INSERT INTO public.product_attribute_organizations (
    attribute_id, organization_id, created_by
  )
  SELECT v_new.id, organization_id, v_actor
  FROM public.product_attribute_organizations
  WHERE attribute_id = v_src.id;
  GET DIAGNOSTICS v_org_count = ROW_COUNT;

  -- ── 5) Category attribute palette configuration ───────────────────────────
  -- base_group_id must be remapped to the newly cloned attribute_option_groups
  -- row (via v_group_map), NOT copied verbatim from the source palette row.
  -- Fall back to NULL if the source's base_group_id has no corresponding
  -- clone (e.g. it referenced a group belonging to a different attribute).
  FOR v_pal IN
    SELECT category_id, base_group_id, additional_values, excluded_values
    FROM public.category_attribute_palettes
    WHERE attribute_id = v_src.id
  LOOP
    v_new_base_group_id := NULL;
    IF v_pal.base_group_id IS NOT NULL THEN
      v_new_base_group_id := NULLIF(v_group_map ->> v_pal.base_group_id::text, '')::uuid;
    END IF;

    INSERT INTO public.category_attribute_palettes (
      category_id, attribute_id, base_group_id, additional_values, excluded_values
    )
    VALUES (
      v_pal.category_id, v_new.id, v_new_base_group_id,
      v_pal.additional_values, v_pal.excluded_values
    );
    v_pal_count := v_pal_count + 1;
  END LOOP;

  -- ── Single consolidated INSERT audit row on the new attribute ─────────────
  v_counts := jsonb_build_object(
    'attribute_option_groups',        v_grp_count,
    'attribute_option_group_values',  v_val_count,
    'product_attribute_value_prices', v_vp_count,
    'product_attribute_price_ranges', v_pr_count,
    'product_attribute_organizations', v_org_count,
    'category_attribute_palettes',    v_pal_count
  );

  v_audit_org := COALESCE(v_new.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    v_new.id,
    v_audit_org,
    'INSERT',
    jsonb_build_object(
      'product_attributes', to_jsonb(v_new),
      'duplicated_from',     to_jsonb(v_src.id),
      'cloned_children',     v_counts
    ),
    'web_app'
  );

  RETURN v_new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_import_service_csv(p_organization_id text, p_sku text, p_name text, p_slug text, p_long_desc text, p_is_active boolean, p_service_type text, p_category_id uuid, p_subcategory_id uuid, p_purchase numeric, p_retail numeric, p_currency text, p_vat_rate numeric)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_uid         uuid := (SELECT auth.uid());
  v_admin       boolean;
  v_org         uuid := p_organization_id::uuid;
  v_existing    uuid;
  v_row         public.services;
  v_result      text;
  v_diff        jsonb;
  v_link        uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user(v_uid);

  -- ── Locate existing service by SKU within the org (matches the FE preload) ──
  SELECT id INTO v_existing
  FROM public.services
  WHERE organization_id = v_org
    AND sku = p_sku
    AND is_deleted = false
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- ── Authorization parity with services_update ──────────────────────────
    IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.services
    SET sku                    = p_sku,
        name                   = p_name,
        slug                   = p_slug,
        long_desc              = nullif(p_long_desc, ''),
        is_active              = COALESCE(p_is_active, true),
        service_type           = p_service_type,
        organization_id        = v_org,
        service_category_id    = p_category_id,
        service_subcategory_id = p_subcategory_id
    WHERE id = v_existing
    RETURNING * INTO v_row;
    v_result := 'updated';
  ELSE
    -- ── Authorization parity with services_insert ──────────────────────────
    IF NOT public.has_anew_permission(v_uid, 'services.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar serviços' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_org IS NULL OR NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.create'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.services
      (sku, name, slug, long_desc, is_active, service_type,
       organization_id, service_category_id, service_subcategory_id, created_by)
    VALUES
      (p_sku,
       p_name,
       p_slug,
       nullif(p_long_desc, ''),
       COALESCE(p_is_active, true),
       p_service_type,
       v_org,
       p_category_id,
       p_subcategory_id,
       v_actor)
    RETURNING * INTO v_row;
    v_result := 'inserted';
  END IF;

  -- ── Sync prices: delete existing then insert purchase + retail (like the FE) ──
  IF NOT v_admin THEN
    IF NOT public.has_anew_permission_for_org(v_uid, 'services.delete', v_org) THEN
      RAISE EXCEPTION 'Sem permissão para redefinir preços do serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  DELETE FROM public.service_prices WHERE service_id = v_row.id;

  INSERT INTO public.service_prices
    (service_id, price_type, price, currency, vat_rate, created_by)
  VALUES
    (v_row.id, 'purchase', COALESCE(p_purchase, 0), p_currency, p_vat_rate, v_actor),
    (v_row.id, 'retail',   COALESCE(p_retail, 0),   p_currency, p_vat_rate, v_actor);

  -- ── Ensure the service_organizations link exists ───────────────────────────
  SELECT id INTO v_link
  FROM public.service_organizations
  WHERE service_id = v_row.id AND organization_id = v_org
  LIMIT 1;

  IF v_link IS NULL THEN
    IF NOT v_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
        RAISE EXCEPTION 'Sem permissão para associar empresa ao serviço' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
        RAISE EXCEPTION 'Empresa fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    INSERT INTO public.service_organizations (service_id, organization_id, created_by)
    VALUES (v_row.id, v_org, v_actor);
  END IF;

  -- ── Single audit row per CSV row, source='csv_import' ──────────────────────
  IF v_result = 'inserted' THEN
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'sku',                    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.sku)),
        'name',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
        'is_active',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active)),
        'organization_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.organization_id)),
        'service_type',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_type)),
        'service_category_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_category_id)),
        'service_subcategory_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_subcategory_id))
      ),
      'service_prices', jsonb_build_object(
        'purchase', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_purchase, 0))),
        'retail',   jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_retail, 0)))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_row.id, v_row.organization_id, 'INSERT', v_diff, 'csv_import'
    );
  ELSE
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'name',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
        'is_active',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active)),
        'service_type',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_type)),
        'service_category_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_category_id)),
        'service_subcategory_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_subcategory_id))
      ),
      'service_prices', jsonb_build_object(
        'purchase', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_purchase, 0))),
        'retail',   jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_retail, 0)))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_row.id, v_row.organization_id, 'UPDATE', v_diff, 'csv_import'
    );
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_manage_attribute_option_group(p_action text, p_attribute_id uuid DEFAULT NULL::uuid, p_organization_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_value_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_sort_order integer DEFAULT NULL::integer, p_value_text text DEFAULT NULL::text, p_display_name text DEFAULT NULL::text, p_hex_color text DEFAULT NULL::text, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_org_id       uuid;
  v_attr_id      uuid;
  v_group        public.attribute_option_groups;
  v_value        public.attribute_option_group_values;
  v_new_group_id uuid;
  v_new_val_id   uuid;
  v_audit_org    uuid;
  v_diff         jsonb;
  v_op           text;
  v_val_count    integer := 0;
  v_next_sort    integer;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);

  IF p_action = 'create_group' THEN
    -- ── Resolve + authorize org (attribute_option_groups_insert) ─────────────
    v_org_id  := p_organization_id;
    v_attr_id := p_attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir grupos de opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    INSERT INTO public.attribute_option_groups (
      attribute_id, organization_id, name, description, sort_order, created_by
    )
    VALUES (
      v_attr_id, v_org_id, p_name, nullif(p_description, ''),
      COALESCE(p_sort_order, 0), v_actor
    )
    RETURNING * INTO v_group;

    v_new_group_id := v_group.id;
    v_attr_id      := v_group.attribute_id;
    v_org_id       := v_group.organization_id;
    v_op           := 'INSERT';
    v_diff         := jsonb_build_object('attribute_option_groups', to_jsonb(v_group));

  ELSIF p_action = 'duplicate_group' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir grupos de opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- New group cloned; sort_order = count of groups on the attribute (FE uses groups.length)
    SELECT COUNT(*) INTO v_next_sort
    FROM public.attribute_option_groups
    WHERE attribute_id = v_group.attribute_id;

    INSERT INTO public.attribute_option_groups (
      attribute_id, organization_id, name, description, sort_order, created_by
    )
    VALUES (
      v_group.attribute_id, v_group.organization_id, p_name, v_group.description,
      v_next_sort, v_actor
    )
    RETURNING id INTO v_new_group_id;

    -- Copy values with re-sequenced sort_order (FE maps index i)
    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, hex_color, sort_order, is_active
    )
    SELECT v_new_group_id, s.value_text, s.display_name, s.hex_color,
           (row_number() OVER (ORDER BY s.sort_order) - 1)::int, s.is_active
    FROM public.attribute_option_group_values s
    WHERE s.group_id = p_group_id;
    GET DIAGNOSTICS v_val_count = ROW_COUNT;

    v_attr_id := v_group.attribute_id;
    v_op      := 'INSERT';
    v_diff    := jsonb_build_object(
      'attribute_option_groups', jsonb_build_object('id', to_jsonb(v_new_group_id), 'name', to_jsonb(p_name)),
      'duplicated_from', to_jsonb(p_group_id),
      'cloned_values',   v_val_count
    );

  ELSIF p_action = 'delete_group' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir grupos de opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Values cascade via FK; delete explicitly so the diff is complete and no orphan remains.
    DELETE FROM public.attribute_option_group_values WHERE group_id = p_group_id;
    DELETE FROM public.attribute_option_groups WHERE id = p_group_id;

    v_new_group_id := p_group_id;
    v_op   := 'DELETE';
    v_diff := jsonb_build_object('attribute_option_groups', to_jsonb(v_group));

  ELSIF p_action = 'add_value' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, hex_color, sort_order
    )
    VALUES (
      p_group_id, upper(btrim(p_value_text)), btrim(p_value_text),
      nullif(p_hex_color, ''), COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_value;

    v_new_val_id   := v_value.id;
    v_new_group_id := p_group_id;
    v_op   := 'INSERT';
    v_diff := jsonb_build_object('attribute_option_group_values', to_jsonb(v_value));

  ELSIF p_action = 'remove_value' THEN
    SELECT * INTO v_value FROM public.attribute_option_group_values WHERE id = p_value_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opção não encontrada' USING ERRCODE = 'no_data_found';
    END IF;
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = v_value.group_id;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Opção fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    DELETE FROM public.attribute_option_group_values WHERE id = p_value_id;

    v_new_group_id := v_value.group_id;
    v_op   := 'DELETE';
    v_diff := jsonb_build_object('attribute_option_group_values', to_jsonb(v_value));

  ELSIF p_action = 'import_values' THEN
    SELECT * INTO v_group FROM public.attribute_option_groups WHERE id = p_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    v_org_id  := v_group.organization_id;
    v_attr_id := v_group.attribute_id;
    IF NOT v_is_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
        RAISE EXCEPTION 'Sem permissão para gerir opções' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_org_id IS NULL
         OR NOT (v_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Grupo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Insert only values whose UPPER(value_text) is not already present (mirrors FE filter).
    INSERT INTO public.attribute_option_group_values (
      group_id, value_text, display_name, sort_order
    )
    SELECT p_group_id,
           upper(v.value_text),
           v.display_name,
           v.sort_order
    FROM jsonb_to_recordset(COALESCE(p_values, '[]'::jsonb))
         AS v(value_text text, display_name text, sort_order integer)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.attribute_option_group_values existing
      WHERE existing.group_id = p_group_id
        AND upper(existing.value_text) = upper(v.value_text)
    );
    GET DIAGNOSTICS v_val_count = ROW_COUNT;

    v_new_group_id := p_group_id;
    v_op   := 'UPDATE';
    v_diff := jsonb_build_object(
      'attribute_option_group_values',
      jsonb_build_object('imported_count', jsonb_build_object('old', 0, 'new', v_val_count))
    );

  ELSE
    RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = 'check_violation';
  END IF;

  v_audit_org := COALESCE(v_org_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    v_attr_id,
    v_audit_org,
    v_op,
    v_diff,
    'web_app'
  );

  RETURN v_new_group_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_manage_attribute_organizations(p_attribute_id uuid, p_org_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_attr       public.product_attributes;
  v_target     uuid[];
  v_old_orgs   uuid[];
  v_org        uuid;
  v_audit_org  uuid;
  v_count      integer := 0;
  v_diff       jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_attr FROM public.product_attributes WHERE id = p_attribute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup target orgs (order-insensitive) ─────────────────────────────────
  IF p_org_ids IS NULL THEN
    v_target := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_target
    FROM   unnest(p_org_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  -- ── Authorization: every target org must be visible (+ products.manage) ───
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    FOREACH v_org IN ARRAY v_target LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
    -- Pruned (removed) orgs must also be visible to the actor (DELETE RLS parity).
    FOR v_org IN
      SELECT organization_id FROM public.product_attribute_organizations
      WHERE attribute_id = p_attribute_id
    LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
        RAISE EXCEPTION 'Associação fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── Snapshot old links ────────────────────────────────────────────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.product_attribute_organizations
  WHERE  attribute_id = p_attribute_id;

  -- ── Upsert-then-prune to target set ───────────────────────────────────────
  -- product_attribute_organizations has only a PK on id (no unique on
  -- (attribute_id, organization_id)), so ON CONFLICT is unavailable. Insert only
  -- orgs not already linked (NOT EXISTS guard) to stay idempotent.
  IF array_length(v_target, 1) IS NOT NULL AND array_length(v_target, 1) > 0 THEN
    FOREACH v_org IN ARRAY v_target LOOP
      INSERT INTO public.product_attribute_organizations (attribute_id, organization_id, created_by)
      SELECT p_attribute_id, v_org, v_actor
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_attribute_organizations
        WHERE attribute_id = p_attribute_id AND organization_id = v_org
      );
    END LOOP;

    DELETE FROM public.product_attribute_organizations
    WHERE attribute_id = p_attribute_id
      AND NOT (organization_id = ANY (v_target));
  ELSE
    DELETE FROM public.product_attribute_organizations WHERE attribute_id = p_attribute_id;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.product_attribute_organizations
  WHERE attribute_id = p_attribute_id;

  -- ── Emit a single log row only when the set actually changed ──────────────
  IF EXISTS (SELECT unnest(v_old_orgs) EXCEPT SELECT unnest(v_target))
     OR EXISTS (SELECT unnest(v_target) EXCEPT SELECT unnest(v_old_orgs)) THEN
    v_audit_org := COALESCE(v_attr.organization_id, k_system_sentinel);
    v_diff := jsonb_build_object(
      'product_attribute_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_old_orgs), 'new', to_jsonb(v_target))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'product_attributes', p_attribute_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_manage_category_attribute_palette(p_category_id uuid, p_attribute_id uuid, p_base_group_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_cat_org    uuid;
  v_cat_own_org uuid;
  v_cat_parent uuid;
  v_cat_id     uuid;
  v_existing   public.category_attribute_palettes;
  v_row        public.category_attribute_palettes;
  v_audit_org  uuid;
  v_op         text;
  v_diff       jsonb;
  v_ret        uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve parent category org (audit + RLS scope) ───────────────────────
  -- Mirrors the dual-arm org resolution in category_attribute_palettes_* RLS:
  --   arm (a): pc.organization_id (direct org), else
  --   arm (b): subcategory with NULL org → org resolved from the parent chain
  --            via get_product_category_org_id(COALESCE(pc.parent_id, pc.parent_category_id)).
  SELECT pc.organization_id, pc.id, COALESCE(pc.parent_id, pc.parent_category_id)
    INTO v_cat_own_org, v_cat_id, v_cat_parent
  FROM public.product_categories pc
  WHERE pc.id = p_category_id
  LIMIT 1;
  IF v_cat_id IS NULL THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Effective org: direct org when present, otherwise inherit from parent chain
  -- exactly like the RLS arm (b). Only fall back when a parent exists, matching
  -- the policy's 'COALESCE(pc.parent_id, pc.parent_category_id) IS NOT NULL' guard.
  IF v_cat_own_org IS NOT NULL THEN
    v_cat_org := v_cat_own_org;
  ELSIF v_cat_parent IS NOT NULL THEN
    v_cat_org := public.get_product_category_org_id(v_cat_parent);
  ELSE
    v_cat_org := NULL;
  END IF;

  -- ── Authorization parity with category_attribute_palettes_* RLS ───────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir paletas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_cat_org IS NULL
       OR NOT (v_cat_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Existing palette for this (category, attribute) ───────────────────────
  SELECT * INTO v_existing
  FROM public.category_attribute_palettes
  WHERE category_id = p_category_id
    AND attribute_id = p_attribute_id
  LIMIT 1;

  IF p_base_group_id IS NOT NULL THEN
    IF FOUND THEN
      UPDATE public.category_attribute_palettes
      SET base_group_id = p_base_group_id
      WHERE id = v_existing.id
      RETURNING * INTO v_row;
      v_op   := 'UPDATE';
      v_diff := jsonb_build_object('category_attribute_palettes', jsonb_build_object(
        'base_group_id', jsonb_build_object('old', to_jsonb(v_existing.base_group_id), 'new', to_jsonb(p_base_group_id))
      ));
      v_ret := v_row.id;
    ELSE
      INSERT INTO public.category_attribute_palettes (category_id, attribute_id, base_group_id)
      VALUES (p_category_id, p_attribute_id, p_base_group_id)
      RETURNING * INTO v_row;
      v_op   := 'INSERT';
      v_diff := jsonb_build_object('category_attribute_palettes', to_jsonb(v_row));
      v_ret := v_row.id;
    END IF;
  ELSE
    IF FOUND THEN
      DELETE FROM public.category_attribute_palettes WHERE id = v_existing.id;
      v_op   := 'DELETE';
      v_diff := jsonb_build_object('category_attribute_palettes', to_jsonb(v_existing));
      v_ret := NULL;
    ELSE
      -- No-op: no palette to remove, matching the FE else-branch.
      RETURN NULL;
    END IF;
  END IF;

  v_audit_org := COALESCE(v_cat_org, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes',
    p_attribute_id,
    v_audit_org,
    v_op,
    v_diff,
    'web_app'
  );

  RETURN v_ret;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_brand(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_before    public.brands;
  v_audit_org uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Marca já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.brands
  SET is_active  = true,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'brands', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('brands', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_bundle(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_before   public.bundles;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.bundles
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.bundles
  SET deleted_at = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NOT NULL;

  IF v_before.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', p_id, v_before.organization_id, 'UPDATE',
      jsonb_build_object('bundles', jsonb_build_object(
        'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
      )),
      'web_app'
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_product(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_before   public.products;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.delete'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Produto já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.products
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id AND organization_id = p_organization_id;

  PERFORM public.fn_manual_audit_log(
    'products',
    p_id,
    COALESCE(v_before.organization_id, '00000000-0000-0000-0000-000000000001'::uuid),
    'UPDATE',
    jsonb_build_object('products', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(true), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_product_attribute(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_before    public.product_attributes;
  v_audit_org uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Atributo já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_attributes
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_attributes', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_attributes', jsonb_build_object(
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_product_category(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid       uuid := auth.uid();
  v_is_admin  boolean;
  v_before    public.product_categories;
  v_audit_org uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.delete'))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Categoria já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_categories
  SET is_active  = true,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(v_before.organization_id, k_system_sentinel);

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_product_subcategory(p_id uuid, p_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid        uuid := auth.uid();
  v_is_admin   boolean;
  v_before     public.product_categories;
  v_parent_org uuid;
  v_audit_org  uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  IF public.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Subcategoria sem contexto de organização' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.product_categories
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_parent_org := public.get_product_category_org_id(v_before.parent_id);
    IF v_parent_org IS NULL
       OR NOT (v_parent_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_subcategories.delete'))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Subcategoria já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.product_categories
  SET is_active  = true,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id
    AND organization_id = p_organization_id;

  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_before.parent_id),
    v_before.organization_id,
    k_system_sentinel
  );

  PERFORM public.fn_manual_audit_log(
    'product_categories', p_id, v_audit_org, 'UPDATE',
    jsonb_build_object('product_categories', jsonb_build_object(
      'is_active',  jsonb_build_object('old', to_jsonb(false), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )),
    'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_service(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor   uuid;
  v_uid     uuid := (SELECT auth.uid());
  v_before  public.services;
  v_diff    jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.delete'))) THEN
    RAISE EXCEPTION 'Serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Serviço já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.services
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )
  );

  PERFORM public.fn_manual_audit_log(
    'services', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_restore_service_fee_type(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_before public.service_fee_types;
  v_diff   jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_fee_types WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taxa de serviço não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_system_admin_user(v_uid) THEN
    IF NOT public.has_anew_permission(v_uid, 'service_fees.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar taxas de serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'service_fees.delete'))) THEN
      RAISE EXCEPTION 'Taxa de serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Taxa de serviço já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.service_fee_types
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL,
      updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(false)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
  );

  PERFORM public.fn_manual_audit_log(
    'service_fee_types', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_brand(p_id uuid, p_organization_id uuid, p_name text, p_slug text, p_description text, p_website text, p_logo_url text, p_org_ids uuid[])
 RETURNS brands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.brands;
  v_brand       public.brands;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_old_orgs    uuid[];
  v_audit_org   uuid;
  v_diff        jsonb;
  v_brand_diff  jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.brands
  WHERE id = p_id
    AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marca não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order ──────────────────────────────────────
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  -- ── Authorization parity with brands_update RLS ──────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'brands.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar marcas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Marca fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (brand_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'brands.edit'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── Snapshot old associations before the upsert/prune rewrite ─────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.brand_organizations
  WHERE  brand_id = p_id;

  -- ── UPDATE the brand (identical column set to brandPayload) ───────────────
  UPDATE public.brands
  SET name            = p_name,
      slug            = p_slug,
      is_active       = true,
      organization_id = p_organization_id,
      description     = nullif(p_description, ''),
      website         = nullif(p_website, ''),
      logo_url        = nullif(p_logo_url, '')
  WHERE id = p_id
    AND organization_id = p_organization_id
  RETURNING * INTO v_brand;

  -- ── Rewrite associations: upsert-then-prune (matches FE insert-before-delete) ──
  IF array_length(v_dedup_orgs, 1) IS NOT NULL AND array_length(v_dedup_orgs, 1) > 0 THEN
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      INSERT INTO public.brand_organizations (brand_id, organization_id, created_by)
      VALUES (p_id, v_org, v_actor)
      ON CONFLICT (brand_id, organization_id) DO NOTHING;
    END LOOP;

    DELETE FROM public.brand_organizations
    WHERE brand_id = p_id
      AND NOT (organization_id = ANY (v_dedup_orgs));
  ELSE
    -- No target companies — remove all associations (matches FE else-branch).
    DELETE FROM public.brand_organizations WHERE brand_id = p_id;
  END IF;

  -- ── Build combined diff across both tables ────────────────────────────────
  v_brand_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_brand.name THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_brand.name)));
  END IF;
  IF v_before.slug IS DISTINCT FROM v_brand.slug THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('slug',
      jsonb_build_object('old', to_jsonb(v_before.slug), 'new', to_jsonb(v_brand.slug)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_brand.description THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_brand.description)));
  END IF;
  IF v_before.website IS DISTINCT FROM v_brand.website THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('website',
      jsonb_build_object('old', to_jsonb(v_before.website), 'new', to_jsonb(v_brand.website)));
  END IF;
  IF v_before.logo_url IS DISTINCT FROM v_brand.logo_url THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('logo_url',
      jsonb_build_object('old', to_jsonb(v_before.logo_url), 'new', to_jsonb(v_brand.logo_url)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_brand.is_active THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_brand.is_active)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_brand.organization_id THEN
    v_brand_diff := v_brand_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_brand.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_brand_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('brands', v_brand_diff);
  END IF;

  -- Record an associations change only when the org set actually changed (order-insensitive).
  IF EXISTS (SELECT unnest(v_old_orgs)   EXCEPT SELECT unnest(v_dedup_orgs))
     OR EXISTS (SELECT unnest(v_dedup_orgs) EXCEPT SELECT unnest(v_old_orgs)) THEN
    v_diff := v_diff || jsonb_build_object(
      'brand_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object(
          'old', to_jsonb(v_old_orgs),
          'new', to_jsonb(v_dedup_orgs)
        )
      )
    );
  END IF;

  v_audit_org := COALESCE(v_brand.organization_id, k_system_sentinel);

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behavior of the triggers.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'brands', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_brand;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_bundle(p_id uuid, p_organization_id uuid, p_sku text, p_name text, p_description text, p_pricing_type text, p_fixed_price numeric, p_discount_percent numeric, p_discount_fixed numeric, p_status text, p_valid_from timestamp with time zone, p_valid_to timestamp with time zone)
 RETURNS bundles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.bundles;
  v_bundle      public.bundles;
  v_is_active   boolean;
  v_bundle_diff jsonb;
  v_diff        jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org, non-deleted ────────────
  SELECT * INTO v_before
  FROM public.bundles
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with bundles_update RLS ─────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para editar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING (pre-image) + WITH CHECK (post-image, unchanged org) both require the org visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Bundle fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  v_is_active := (p_status = 'active');

  -- ── UPDATE the bundle (identical column set to bundleData) ────────────────
  UPDATE public.bundles
  SET sku              = btrim(p_sku),
      name             = btrim(p_name),
      description      = nullif(btrim(coalesce(p_description, '')), ''),
      pricing_type     = p_pricing_type::public.bundle_pricing_type,
      fixed_price      = CASE WHEN p_pricing_type = 'fixed_price'         THEN p_fixed_price      ELSE NULL END,
      discount_percent = CASE WHEN p_pricing_type = 'percentage_discount' THEN p_discount_percent ELSE NULL END,
      discount_fixed   = CASE WHEN p_pricing_type = 'fixed_discount'      THEN p_discount_fixed   ELSE NULL END,
      status           = p_status,
      valid_from       = p_valid_from,
      valid_to         = p_valid_to,
      is_active        = v_is_active
  WHERE id = p_id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL
  RETURNING * INTO v_bundle;

  -- ── Build the diff (only fields that actually changed) ────────────────────
  v_bundle_diff := '{}'::jsonb;
  IF v_before.sku IS DISTINCT FROM v_bundle.sku THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('sku',
      jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_bundle.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_bundle.name THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_bundle.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_bundle.description THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_bundle.description)));
  END IF;
  IF v_before.pricing_type IS DISTINCT FROM v_bundle.pricing_type THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('pricing_type',
      jsonb_build_object('old', to_jsonb(v_before.pricing_type), 'new', to_jsonb(v_bundle.pricing_type)));
  END IF;
  IF v_before.fixed_price IS DISTINCT FROM v_bundle.fixed_price THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('fixed_price',
      jsonb_build_object('old', to_jsonb(v_before.fixed_price), 'new', to_jsonb(v_bundle.fixed_price)));
  END IF;
  IF v_before.discount_percent IS DISTINCT FROM v_bundle.discount_percent THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_percent',
      jsonb_build_object('old', to_jsonb(v_before.discount_percent), 'new', to_jsonb(v_bundle.discount_percent)));
  END IF;
  IF v_before.discount_fixed IS DISTINCT FROM v_bundle.discount_fixed THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_fixed',
      jsonb_build_object('old', to_jsonb(v_before.discount_fixed), 'new', to_jsonb(v_bundle.discount_fixed)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_bundle.status THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_bundle.status)));
  END IF;
  IF v_before.valid_from IS DISTINCT FROM v_bundle.valid_from THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_from',
      jsonb_build_object('old', to_jsonb(v_before.valid_from), 'new', to_jsonb(v_bundle.valid_from)));
  END IF;
  IF v_before.valid_to IS DISTINCT FROM v_bundle.valid_to THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_to',
      jsonb_build_object('old', to_jsonb(v_before.valid_to), 'new', to_jsonb(v_bundle.valid_to)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_bundle.is_active THEN
    v_bundle_diff := v_bundle_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_bundle.is_active)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_bundle_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('bundles', v_bundle_diff);
  END IF;

  -- Emit a single UPDATE row only when something meaningful changed, matching the
  -- trigger's skip-when-nothing-changed behavior. Skip when org is NULL (trigger silent-skip).
  IF v_diff <> '{}'::jsonb AND v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundles', p_id, v_bundle.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_bundle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_product(p_id uuid, p_active_org_id uuid, p_sku text, p_name text, p_status text, p_is_sellable boolean, p_is_purchasable boolean, p_category_id uuid, p_subcategory_id uuid, p_primary_org_id uuid, p_uom_id uuid, p_description text, p_barcode text, p_brand_id uuid, p_supplier_id uuid, p_all_org_ids uuid[], p_prices jsonb, p_attribute_ids uuid[], p_attribute_values jsonb, p_manages_stock boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_before       public.products;
  v_product      public.products;
  v_org          uuid;
  v_unique_orgs  uuid[];
  v_price        jsonb;
  v_attr         jsonb;
  v_existing_id  uuid;
  v_attr_ids     uuid[];
  v_prod_diff    jsonb;
  v_diff         jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row scoped by the active org (mirrors the FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.products
  WHERE id = p_id
    AND organization_id = p_active_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Build the unique org set (same rule as create) ────────────────────────
  WITH combined AS (
    SELECT p_primary_org_id AS o, 0 AS ord WHERE p_primary_org_id IS NOT NULL
    UNION ALL
    SELECT o, ord
    FROM unnest(COALESCE(p_all_org_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(o, ord)
    WHERE o IS NOT NULL
  ),
  dedup AS (
    SELECT o, min(ord) AS ord FROM combined GROUP BY o
  )
  SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
  INTO   v_unique_orgs
  FROM   dedup;

  v_attr_ids := COALESCE(p_attribute_ids, ARRAY[]::uuid[]);

  -- ── Authorization parity with products_update RLS ────────────────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar produtos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.edit'))) THEN
      RAISE EXCEPTION 'Produto fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF p_primary_org_id IS NULL
       OR NOT (p_primary_org_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_organizations_insert WITH CHECK).
    FOREACH v_org IN ARRAY v_unique_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.edit'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── UPDATE the product (FE main-fields UPDATE + folded supplier_id UPDATE) ─
  UPDATE public.products
  SET sku             = p_sku,
      name            = p_name,
      status          = p_status::public.product_status,
      is_active       = true,
      is_sellable     = COALESCE(p_is_sellable, false),
      is_purchasable  = COALESCE(p_is_purchasable, false),
      category_id     = p_category_id,
      subcategory_id  = p_subcategory_id,
      organization_id = p_primary_org_id,
      uom_id          = p_uom_id,
      description     = nullif(p_description, ''),
      barcode         = nullif(p_barcode, ''),
      brand_id        = p_brand_id,
      supplier_id     = p_supplier_id,
      manages_stock   = COALESCE(p_manages_stock, false)
  WHERE id = p_id
    AND organization_id = p_active_org_id
  RETURNING * INTO v_product;

  -- ── Rewrite org associations: delete the active company row, then insert set ──
  -- Mirrors the FE: .delete().eq(product_id).eq(organization_id, activeCompany.id)
  -- followed by insert of the full unique set.
  -- INTENTIONAL BEHAVIOUR CHANGE (see 20260817010000 header): ON CONFLICT DO NOTHING
  -- makes the insert idempotent for orgs already associated (other than the active
  -- company, which was just deleted).
  DELETE FROM public.product_organizations
  WHERE product_id = p_id
    AND organization_id = p_active_org_id;

  FOREACH v_org IN ARRAY v_unique_orgs LOOP
    INSERT INTO public.product_organizations (product_id, organization_id, created_by)
    VALUES (p_id, v_org, v_actor)
    ON CONFLICT (product_id, organization_id) DO NOTHING;
  END LOOP;

  -- ── Upsert prices by (product_id, price_type) — mirrors FE maybeSingle then up/insert ──
  IF p_prices IS NOT NULL AND jsonb_typeof(p_prices) = 'array' THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices) LOOP
      SELECT id INTO v_existing_id
      FROM public.product_prices
      WHERE product_id = p_id
        AND price_type = (v_price ->> 'price_type')::public.price_type
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.product_prices
        SET price      = (v_price ->> 'price')::numeric,
            currency   = (v_price ->> 'currency')::public.currency_code,
            vat_rate   = (v_price ->> 'vat_rate')::numeric,
            created_by = v_actor
        WHERE id = v_existing_id;
      ELSE
        INSERT INTO public.product_prices
          (product_id, price_type, price, currency, vat_rate, created_by)
        VALUES
          (p_id,
           (v_price ->> 'price_type')::public.price_type,
           (v_price ->> 'price')::numeric,
           (v_price ->> 'currency')::public.currency_code,
           (v_price ->> 'vat_rate')::numeric,
           v_actor);
      END IF;
      v_existing_id := NULL;
    END LOOP;
  END IF;

  -- ── Reconcile attribute values ────────────────────────────────────────────
  DELETE FROM public.product_attribute_values
  WHERE product_id = p_id
    AND NOT (attribute_id = ANY (v_attr_ids));

  IF p_attribute_values IS NOT NULL AND jsonb_typeof(p_attribute_values) = 'array' THEN
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attribute_values) LOOP
      SELECT id INTO v_existing_id
      FROM public.product_attribute_values
      WHERE product_id = p_id
        AND attribute_id = (v_attr ->> 'attribute_id')::uuid
      LIMIT 1;

      IF v_existing_id IS NOT NULL THEN
        UPDATE public.product_attribute_values AS pav
        SET value_text   = CASE WHEN v_attr ? 'value_text'
                                THEN v_attr ->> 'value_text'
                                ELSE pav.value_text END,
            value_number = CASE WHEN v_attr ? 'value_number'
                                THEN (v_attr ->> 'value_number')::numeric
                                ELSE pav.value_number END,
            value_bool   = CASE WHEN v_attr ? 'value_bool'
                                THEN (v_attr ->> 'value_bool')::boolean
                                ELSE pav.value_bool END
        WHERE pav.id = v_existing_id;
      ELSE
        INSERT INTO public.product_attribute_values
          (product_id, attribute_id, value_text, value_number, value_bool)
        VALUES
          (p_id,
           (v_attr ->> 'attribute_id')::uuid,
           CASE WHEN v_attr ? 'value_text'   THEN v_attr ->> 'value_text' END,
           CASE WHEN v_attr ? 'value_number' THEN (v_attr ->> 'value_number')::numeric END,
           CASE WHEN v_attr ? 'value_bool'   THEN (v_attr ->> 'value_bool')::boolean END);
      END IF;
      v_existing_id := NULL;
    END LOOP;
  END IF;

  -- ── Build the products-table diff (only changed columns) ──────────────────
  v_prod_diff := '{}'::jsonb;
  IF v_before.sku IS DISTINCT FROM v_product.sku THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('sku',
      jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_product.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_product.name THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_product.name)));
  END IF;
  IF v_before.status IS DISTINCT FROM v_product.status THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_product.status)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_product.is_active THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_active',
      jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_product.is_active)));
  END IF;
  IF v_before.is_sellable IS DISTINCT FROM v_product.is_sellable THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_sellable',
      jsonb_build_object('old', to_jsonb(v_before.is_sellable), 'new', to_jsonb(v_product.is_sellable)));
  END IF;
  IF v_before.is_purchasable IS DISTINCT FROM v_product.is_purchasable THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('is_purchasable',
      jsonb_build_object('old', to_jsonb(v_before.is_purchasable), 'new', to_jsonb(v_product.is_purchasable)));
  END IF;
  IF v_before.category_id IS DISTINCT FROM v_product.category_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('category_id',
      jsonb_build_object('old', to_jsonb(v_before.category_id), 'new', to_jsonb(v_product.category_id)));
  END IF;
  IF v_before.subcategory_id IS DISTINCT FROM v_product.subcategory_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('subcategory_id',
      jsonb_build_object('old', to_jsonb(v_before.subcategory_id), 'new', to_jsonb(v_product.subcategory_id)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_product.organization_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_product.organization_id)));
  END IF;
  IF v_before.uom_id IS DISTINCT FROM v_product.uom_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('uom_id',
      jsonb_build_object('old', to_jsonb(v_before.uom_id), 'new', to_jsonb(v_product.uom_id)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_product.description THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_product.description)));
  END IF;
  IF v_before.barcode IS DISTINCT FROM v_product.barcode THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('barcode',
      jsonb_build_object('old', to_jsonb(v_before.barcode), 'new', to_jsonb(v_product.barcode)));
  END IF;
  IF v_before.brand_id IS DISTINCT FROM v_product.brand_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('brand_id',
      jsonb_build_object('old', to_jsonb(v_before.brand_id), 'new', to_jsonb(v_product.brand_id)));
  END IF;
  IF v_before.supplier_id IS DISTINCT FROM v_product.supplier_id THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('supplier_id',
      jsonb_build_object('old', to_jsonb(v_before.supplier_id), 'new', to_jsonb(v_product.supplier_id)));
  END IF;
  -- NOVO (20261115040000)
  IF v_before.manages_stock IS DISTINCT FROM v_product.manages_stock THEN
    v_prod_diff := v_prod_diff || jsonb_build_object('manages_stock',
      jsonb_build_object('old', to_jsonb(v_before.manages_stock), 'new', to_jsonb(v_product.manages_stock)));
  END IF;

  -- ── Combined diff across all tables touched ───────────────────────────────
  v_diff := '{}'::jsonb;
  IF v_prod_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('products', v_prod_diff);
  END IF;
  v_diff := v_diff || jsonb_build_object(
    'product_organizations', jsonb_build_object(
      'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_unique_orgs))
    ),
    'product_prices', jsonb_build_object(
      'prices', jsonb_build_object('old', NULL, 'new', COALESCE(p_prices, '[]'::jsonb))
    ),
    'product_attribute_values', jsonb_build_object(
      'values', jsonb_build_object('old', NULL, 'new', COALESCE(p_attribute_values, '[]'::jsonb))
    )
  );

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'products', p_id, v_product.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_product.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_product_attribute(p_id uuid, p_active_org_id uuid, p_organization_id uuid, p_label text, p_value_type text, p_unit text, p_is_filterable boolean, p_is_required boolean, p_is_variant_option boolean, p_sort_order integer, p_pricing_type text, p_price_per_unit numeric, p_pricing_unit text, p_has_hex_color boolean, p_is_measurement boolean, p_measurement_type text, p_pricing_dimension text)
 RETURNS product_attributes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_is_admin     boolean;
  v_before       public.product_attributes;
  v_row          public.product_attributes;
  v_has_hex      boolean;
  v_is_meas      boolean;
  v_meas_type    text;
  v_valoriz      text;
  v_price_unit   numeric;
  v_pricing_unit text;
  v_pricing_dim  text;
  v_unit         text;
  v_diff         jsonb;
  v_attr_diff    jsonb;
  v_audit_org    uuid;
  v_old_json     jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_noise_cols   text[] := ARRAY['updated_at', 'created_at'];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load pre-image scoped by the active company (mirrors FE .eq filters) ──
  SELECT * INTO v_before
  FROM public.product_attributes
  WHERE id = p_id
    AND organization_id = p_active_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atributo não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_attributes_update RLS ───────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.manage') THEN
      RAISE EXCEPTION 'Sem permissão para gerir atributos' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-image org visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Atributo fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-image org visible (prevents cross-org reassignment).
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'products.manage'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── Derive conditional column values exactly as the FE does ───────────────
  v_has_hex     := CASE WHEN p_value_type = 'list' THEN COALESCE(p_has_hex_color, false) ELSE false END;
  v_is_meas     := CASE WHEN p_value_type = 'number' THEN COALESCE(p_is_measurement, false) ELSE false END;
  v_meas_type   := CASE WHEN p_value_type = 'number' AND COALESCE(p_is_measurement, false)
                        THEN p_measurement_type ELSE NULL END;
  v_valoriz     := CASE WHEN p_value_type IN ('list', 'number')
                        THEN COALESCE(p_pricing_type, 'none') ELSE 'none' END;
  v_price_unit  := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN COALESCE(p_price_per_unit, 0) ELSE 0 END;
  v_pricing_unit := CASE WHEN p_pricing_type IN ('per_unit', 'both')
                        THEN p_pricing_unit ELSE NULL END;
  v_pricing_dim := CASE
                     WHEN v_has_hex THEN 'color'
                     WHEN v_is_meas AND p_pricing_type = 'base_price' THEN 'size'
                     ELSE nullif(p_pricing_dimension, '')
                   END;
  v_unit        := nullif(p_unit, '');

  -- ── UPDATE (attributeData minus code/created_by; unit ONLY when non-empty) ─
  -- The FE only adds `unit` to attributeData when formData.unit is truthy; when empty
  -- it does not touch the column. We mirror that: leave unit unchanged if p_unit empty.
  UPDATE public.product_attributes
  SET label            = p_label,
      value_type        = p_value_type,
      is_filterable     = COALESCE(p_is_filterable, false),
      is_required       = COALESCE(p_is_required, false),
      is_variant_option = COALESCE(p_is_variant_option, false),
      sort_order        = COALESCE(p_sort_order, 0),
      organization_id   = p_organization_id,
      pricing_type      = COALESCE(p_pricing_type, 'none'),
      price_per_unit    = v_price_unit,
      pricing_unit      = v_pricing_unit,
      has_hex_color     = v_has_hex,
      is_measurement    = v_is_meas,
      measurement_type  = v_meas_type,
      valorization_type = v_valoriz,
      pricing_dimension = v_pricing_dim,
      unit              = CASE WHEN v_unit IS NOT NULL THEN v_unit ELSE unit END
  WHERE id = p_id
    AND organization_id = p_active_org_id
  RETURNING * INTO v_row;

  -- ── Build diff (skip noise columns) ───────────────────────────────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_row);
  v_attr_diff := '{}'::jsonb;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
  LOOP
    CONTINUE WHEN v_key = ANY(v_noise_cols);
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_attr_diff := v_attr_diff || jsonb_build_object(
        v_key,
        jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  v_diff := '{}'::jsonb;
  IF v_attr_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('product_attributes', v_attr_diff);
  END IF;

  v_audit_org := COALESCE(v_row.organization_id, k_system_sentinel);

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'product_attributes', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_product_category(p_id uuid, p_name text, p_description text, p_sort_order integer, p_org_ids uuid[])
 RETURNS product_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_is_admin    boolean;
  v_before      public.product_categories;
  v_category    public.product_categories;
  v_primary_org uuid;
  v_org         uuid;
  v_dedup_orgs  uuid[];
  v_old_orgs    uuid[];
  v_audit_org   uuid;
  v_diff        jsonb;
  v_cat_diff    jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + auth guards) ────────
  SELECT * INTO v_before FROM public.product_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Dedup org ids, preserving order ──────────────────────────────────────
  IF p_org_ids IS NULL THEN
    v_dedup_orgs := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(o ORDER BY ord), ARRAY[]::uuid[])
    INTO   v_dedup_orgs
    FROM (
      SELECT o, min(ord) AS ord
      FROM   unnest(p_org_ids) WITH ORDINALITY AS u(o, ord)
      WHERE  o IS NOT NULL
      GROUP  BY o
    ) d;
  END IF;

  IF array_length(v_dedup_orgs, 1) IS NULL OR array_length(v_dedup_orgs, 1) = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  v_primary_org := v_dedup_orgs[1];

  -- ── Authorization parity with product_categories_update RLS ──────────────
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_categories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar categorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- USING: pre-update org must be visible.
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.edit'))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- WITH CHECK: post-update org must be visible (prevents cross-org reassignment).
    IF v_primary_org IS NULL
       OR NOT (v_primary_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.edit'))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- Every associated org must be visible (product_category_organizations_insert).
    FOREACH v_org IN ARRAY v_dedup_orgs LOOP
      IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_categories.edit'))) THEN
        RAISE EXCEPTION 'Organização fora do âmbito do utilizador'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END LOOP;
  END IF;

  -- ── Snapshot old associations before the delete/insert rewrite ────────────
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.product_category_organizations
  WHERE  category_id = p_id;

  -- ── UPDATE the category (identical column set to updatePayload) ───────────
  UPDATE public.product_categories
  SET name            = p_name,
      description     = nullif(p_description, ''),
      sort_order      = COALESCE(p_sort_order, 0),
      organization_id = v_primary_org
  WHERE id = p_id
  RETURNING * INTO v_category;

  -- ── Rewrite associations: delete all, then re-insert (matches the FE) ─────
  DELETE FROM public.product_category_organizations WHERE category_id = p_id;

  FOREACH v_org IN ARRAY v_dedup_orgs LOOP
    INSERT INTO public.product_category_organizations
      (category_id, organization_id, created_by)
    VALUES (p_id, v_org, v_actor);
  END LOOP;

  -- ── Build combined diff across both tables ────────────────────────────────
  v_cat_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_category.name THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_category.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_category.description THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_category.description)));
  END IF;
  IF v_before.sort_order IS DISTINCT FROM v_category.sort_order THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('sort_order',
      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', to_jsonb(v_category.sort_order)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_category.organization_id THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_category.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_cat_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('product_categories', v_cat_diff);
  END IF;

  -- Record an associations change only when the org set actually changed (order-insensitive).
  IF EXISTS (SELECT unnest(v_old_orgs)   EXCEPT SELECT unnest(v_dedup_orgs))
     OR EXISTS (SELECT unnest(v_dedup_orgs) EXCEPT SELECT unnest(v_old_orgs)) THEN
    v_diff := v_diff || jsonb_build_object(
      'product_category_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object(
          'old', to_jsonb(v_old_orgs),
          'new', to_jsonb(v_dedup_orgs)
        )
      )
    );
  END IF;

  v_audit_org := COALESCE(v_category.organization_id, k_system_sentinel);

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behavior of the triggers.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'product_categories', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_category;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_product_subcategory(p_id uuid, p_name text, p_description text, p_sort_order integer, p_parent_id uuid, p_organization_id uuid)
 RETURNS product_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k_system_sentinel constant uuid := '00000000-0000-0000-0000-000000000001';
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_is_admin       boolean;
  v_before         public.product_categories;
  v_subcat         public.product_categories;
  v_pre_parent_org uuid;
  v_post_parent_org uuid;
  v_audit_org      uuid;
  v_cat_diff       jsonb;
  v_diff           jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Categoria pai obrigatória' USING ERRCODE = 'check_violation';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Selecione uma empresa' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Load the current row (before-image for the diff + auth guards) ────────
  SELECT * INTO v_before FROM public.product_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcategoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with product_categories_update SUBCATEGORY arms ──
  -- Wave 9 §1 (supersedes Wave 7 §2 for UPDATE).
  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'product_subcategories.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar subcategorias de produtos'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- USING arm: pre-update parent org must be visible (resolved via parent chain,
    -- NOT the row's own organization_id — historic rows may carry NULL org).
    v_pre_parent_org := public.get_product_category_org_id(v_before.parent_id);
    IF v_pre_parent_org IS NULL
       OR NOT (v_pre_parent_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_subcategories.edit'))) THEN
      RAISE EXCEPTION 'Subcategoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- WITH CHECK arm: post-update parent org must be visible (blocks reparenting
    -- under a root category from another org).
    v_post_parent_org := public.get_product_category_org_id(p_parent_id);
    IF v_post_parent_org IS NULL
       OR NOT (v_post_parent_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'product_subcategories.edit'))) THEN
      RAISE EXCEPTION 'Categoria pai fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- WITH CHECK org-consistency guard (Wave 9): the post-update organization_id must
    -- either be NULL (inherited from parent) or exactly equal the parent-resolved org.
    -- Any other value would create a cross-org visibility leak via the junction SELECT arm.
    IF NOT (p_organization_id IS NULL OR p_organization_id = v_post_parent_org) THEN
      RAISE EXCEPTION 'Organização da subcategoria diverge da categoria pai'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- ── UPDATE the subcategory (identical column set to the FE update payload) ─
  UPDATE public.product_categories
  SET name            = p_name,
      description     = nullif(p_description, ''),
      sort_order      = COALESCE(p_sort_order, 0),
      parent_id       = p_parent_id,
      organization_id = p_organization_id
  WHERE id = p_id
  RETURNING * INTO v_subcat;

  -- ── Build the diff (only fields that actually changed) ────────────────────
  v_cat_diff := '{}'::jsonb;
  IF v_before.name IS DISTINCT FROM v_subcat.name THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('name',
      jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_subcat.name)));
  END IF;
  IF v_before.description IS DISTINCT FROM v_subcat.description THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('description',
      jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_subcat.description)));
  END IF;
  IF v_before.sort_order IS DISTINCT FROM v_subcat.sort_order THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('sort_order',
      jsonb_build_object('old', to_jsonb(v_before.sort_order), 'new', to_jsonb(v_subcat.sort_order)));
  END IF;
  IF v_before.parent_id IS DISTINCT FROM v_subcat.parent_id THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('parent_id',
      jsonb_build_object('old', to_jsonb(v_before.parent_id), 'new', to_jsonb(v_subcat.parent_id)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_subcat.organization_id THEN
    v_cat_diff := v_cat_diff || jsonb_build_object('organization_id',
      jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_subcat.organization_id)));
  END IF;

  v_diff := '{}'::jsonb;
  IF v_cat_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('product_categories', v_cat_diff);
  END IF;

  -- Attribute the audit row under the post-update parent-resolved org (mirrors the
  -- subcategory audit trigger); fall back to the row's own org, then the sentinel.
  v_audit_org := COALESCE(
    public.get_product_category_org_id(v_subcat.id),
    v_subcat.organization_id,
    k_system_sentinel
  );

  -- Emit a single UPDATE log row only when something meaningful changed,
  -- matching the "skip when nothing changed" behaviour of the trigger.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'product_categories', p_id, v_audit_org, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_subcat;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_service(p_id uuid, p_sku text, p_name text, p_slug text, p_long_desc text, p_service_type text, p_is_active boolean, p_organization_id uuid, p_category_id uuid, p_subcategory_id uuid, p_org_ids uuid[], p_touch_orgs boolean, p_touch_prices boolean, p_purchase numeric, p_retail numeric, p_currency text, p_vat_rate numeric)
 RETURNS services
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor       uuid;
  v_uid         uuid := (SELECT auth.uid());
  v_admin       boolean;
  v_before      public.services;
  v_row         public.services;
  v_org         uuid;
  v_added_orgs  uuid[] := ARRAY[]::uuid[];
  v_old_orgs    uuid[];
  v_diff        jsonb  := '{}'::jsonb;
  v_svc         jsonb  := '{}'::jsonb;
  v_price_diff  jsonb  := '{}'::jsonb;
  v_existing    uuid;
  v_old_price   numeric;
  v_ptype       text;
  v_pvalue      numeric;
  v_ptypes      text[] := ARRAY['purchase', 'retail'];
  i             integer;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user(v_uid);

  -- ── Authorization parity with services_update (no admin OR-branch on services) ──
  IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- USING: pre-update org must be visible.
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
    RAISE EXCEPTION 'Serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- WITH CHECK: post-update org must also be visible.
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
    RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the service (identical column set to handleSubmit) ─────────────
  UPDATE public.services
  SET sku                    = p_sku,
      name                   = p_name,
      slug                   = p_slug,
      is_active              = COALESCE(p_is_active, v_before.is_active),
      organization_id        = p_organization_id,
      service_type           = p_service_type,
      long_desc              = nullif(p_long_desc, ''),
      service_category_id    = p_category_id,
      service_subcategory_id = p_subcategory_id
  WHERE id = p_id
  RETURNING * INTO v_row;

  -- ── Rewrite service_organizations (delete all + re-insert), only when asked ──
  IF COALESCE(p_touch_orgs, false) THEN
    SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
    INTO   v_old_orgs
    FROM   public.service_organizations
    WHERE  service_id = p_id;

    DELETE FROM public.service_organizations WHERE service_id = p_id;

    IF p_org_ids IS NOT NULL AND array_length(p_org_ids, 1) > 0 THEN
      FOREACH v_org IN ARRAY p_org_ids LOOP
        IF NOT v_admin THEN
          IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
            RAISE EXCEPTION 'Sem permissão para associar empresas ao serviço'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
          IF NOT (v_org IN (SELECT public.get_user_permission_org_ids(v_uid, 'services.edit'))) THEN
            RAISE EXCEPTION 'Empresa associada fora do âmbito do utilizador'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
        END IF;

        INSERT INTO public.service_organizations (service_id, organization_id, created_by)
        VALUES (p_id, v_org, v_actor);
        v_added_orgs := v_added_orgs || v_org;
      END LOOP;
    END IF;

    -- Record only when the org set actually changed (order-insensitive).
    IF EXISTS (SELECT unnest(v_old_orgs) EXCEPT SELECT unnest(v_added_orgs))
       OR EXISTS (SELECT unnest(v_added_orgs) EXCEPT SELECT unnest(v_old_orgs)) THEN
      v_diff := v_diff || jsonb_build_object(
        'service_organizations', jsonb_build_object(
          'organization_id', jsonb_build_object(
            'old', to_jsonb(v_old_orgs), 'new', to_jsonb(v_added_orgs)
          )
        )
      );
    END IF;
  END IF;

  -- ── Upsert both price rows, only when asked ────────────────────────────────
  IF COALESCE(p_touch_prices, false) THEN
    FOR i IN 1..2 LOOP
      v_ptype  := v_ptypes[i];
      v_pvalue := COALESCE(CASE WHEN v_ptype = 'purchase' THEN p_purchase ELSE p_retail END, 0);

      SELECT id, price INTO v_existing, v_old_price
      FROM public.service_prices
      WHERE service_id = p_id AND price_type = v_ptype
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        UPDATE public.service_prices
        SET price = v_pvalue, currency = p_currency, vat_rate = p_vat_rate, created_by = v_actor
        WHERE id = v_existing;
        IF v_old_price IS DISTINCT FROM v_pvalue THEN
          v_price_diff := v_price_diff || jsonb_build_object(
            v_ptype, jsonb_build_object('old', to_jsonb(v_old_price), 'new', to_jsonb(v_pvalue))
          );
        END IF;
      ELSE
        INSERT INTO public.service_prices
          (service_id, price_type, price, currency, vat_rate, created_by)
        VALUES (p_id, v_ptype, v_pvalue, p_currency, p_vat_rate, v_actor);
        v_price_diff := v_price_diff || jsonb_build_object(
          v_ptype, jsonb_build_object('old', NULL, 'new', to_jsonb(v_pvalue))
        );
      END IF;
    END LOOP;

    IF v_price_diff <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('service_prices', v_price_diff);
    END IF;
  END IF;

  -- ── Build the services diff (only changed columns) ─────────────────────────
  IF v_before.sku IS DISTINCT FROM v_row.sku THEN
    v_svc := v_svc || jsonb_build_object('sku', jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_row.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_row.name THEN
    v_svc := v_svc || jsonb_build_object('name', jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_row.name)));
  END IF;
  IF v_before.slug IS DISTINCT FROM v_row.slug THEN
    v_svc := v_svc || jsonb_build_object('slug', jsonb_build_object('old', to_jsonb(v_before.slug), 'new', to_jsonb(v_row.slug)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_row.is_active THEN
    v_svc := v_svc || jsonb_build_object('is_active', jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_row.is_active)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_row.organization_id THEN
    v_svc := v_svc || jsonb_build_object('organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_row.organization_id)));
  END IF;
  IF v_before.service_type IS DISTINCT FROM v_row.service_type THEN
    v_svc := v_svc || jsonb_build_object('service_type', jsonb_build_object('old', to_jsonb(v_before.service_type), 'new', to_jsonb(v_row.service_type)));
  END IF;
  IF v_before.long_desc IS DISTINCT FROM v_row.long_desc THEN
    v_svc := v_svc || jsonb_build_object('long_desc', jsonb_build_object('old', to_jsonb(v_before.long_desc), 'new', to_jsonb(v_row.long_desc)));
  END IF;
  IF v_before.service_category_id IS DISTINCT FROM v_row.service_category_id THEN
    v_svc := v_svc || jsonb_build_object('service_category_id', jsonb_build_object('old', to_jsonb(v_before.service_category_id), 'new', to_jsonb(v_row.service_category_id)));
  END IF;
  IF v_before.service_subcategory_id IS DISTINCT FROM v_row.service_subcategory_id THEN
    v_svc := v_svc || jsonb_build_object('service_subcategory_id', jsonb_build_object('old', to_jsonb(v_before.service_subcategory_id), 'new', to_jsonb(v_row.service_subcategory_id)));
  END IF;

  IF v_svc <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('services', v_svc);
  END IF;

  -- Emit a single UPDATE row only when something meaningful changed (matches the
  -- trigger's "skip when nothing changed"). Route under the post-update org.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'services', p_id, v_row.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_row;
END;
$function$;
