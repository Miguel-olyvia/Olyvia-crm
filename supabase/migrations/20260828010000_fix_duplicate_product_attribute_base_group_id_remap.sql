-- ============================================================
-- Fix: rpc_duplicate_product_attribute must remap
-- category_attribute_palettes.base_group_id to the NEWLY cloned
-- attribute_option_groups row, not copy the source group id verbatim.
-- ============================================================
-- Context: category_attribute_palettes.base_group_id has a real FK to
-- attribute_option_groups(id) (ON DELETE SET NULL) and is consumed by
-- get_category_attribute_options() to pull option values for
-- pricing/filtering display. The original version of this function
-- (20260810010000_product_attributes_audit_bypass_and_rpcs.sql) cloned
-- attribute_option_groups with a per-row FK remap for
-- attribute_option_group_values.group_id, but the later
-- category_attribute_palettes clone copied base_group_id unchanged from
-- the source row. That left the duplicated attribute's palette config
-- pointing at the SOURCE attribute's option group instead of its own
-- cloned group: not an orphan/FK violation (the old group id is still
-- valid), but a stale cross-attribute reference that silently shows the
-- wrong option values for the duplicated attribute's category palette.
--
-- Fix: build an old_group_id -> new_group_id map while looping through
-- attribute_option_groups (using a plpgsql array-based map keyed by
-- position, since group ids are already collected into ordered arrays),
-- then look up base_group_id in that map when inserting
-- category_attribute_palettes, falling back to NULL when the source
-- row's base_group_id has no corresponding clone (e.g. it referenced a
-- group belonging to a different attribute than v_src — the previous
-- code did not defend against that case either, so NULL is the safe
-- default rather than propagating a foreign/stale id).
--
-- This is a forward-only correction. The prior migration
-- (20260810010000) is already applied and is not edited in place.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_duplicate_product_attribute(
  p_id              uuid,
  p_organization_id uuid
)
RETURNS public.product_attributes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
       OR NOT (v_src.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
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
$$;

REVOKE ALL ON FUNCTION public.rpc_duplicate_product_attribute(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_duplicate_product_attribute(uuid, uuid) TO authenticated;
