-- Fix: rpc_update_bundle_component (20261022010000) built its audit diff only from
-- quantity/pricing_mode/custom_price/is_optional, even though the UPDATE statement in the same
-- function also writes custom_discount_percent and custom_discount_fixed. An edit that changes
-- only one of those two discount fields (exactly what the UI sends via
-- handleUpdateComponent(comp.id, { custom_discount_percent: ... }) when Pricing Mode is set to a
-- discount mode) left v_diff at '{}'::jsonb, so the `IF v_diff <> '{}'::jsonb` guard skipped
-- fn_manual_audit_log entirely — a silent audit-trail gap for exactly the fields most likely to be
-- edited standalone, and a regression versus the pre-fix raw-table UPDATE (whose generic trigger
-- diffed the whole row automatically before app.audit_bypass existed for this path).
--
-- Fix (forward-only; 20261022010000 is not edited): add the two missing IS DISTINCT FROM checks.
-- CREATE OR REPLACE with the full known body is safe here (not a live-source dynamic patch) because
-- this function was authored from scratch in 20261022010000 earlier in this same work session —
-- there is no drift risk of silently reverting an unrelated older fix, unlike the org-creation RPCs
-- patched earlier this session via pg_get_functiondef.

CREATE OR REPLACE FUNCTION public.rpc_update_bundle_component(
  p_id        uuid,
  p_bundle_id uuid,
  p_updates   jsonb
)
RETURNS public.bundle_components
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bundle  public.bundles;
  v_actor   uuid;
  v_before  public.bundle_components;
  v_comp    public.bundle_components;
  v_diff    jsonb := '{}'::jsonb;
BEGIN
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_bundle := public._bundle_children_authorize(p_bundle_id);

  SELECT * INTO v_before FROM public.bundle_components WHERE id = p_id AND bundle_id = p_bundle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Componente não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  UPDATE public.bundle_components
  SET quantity                 = COALESCE((p_updates ->> 'quantity')::numeric, quantity),
      pricing_mode             = COALESCE((p_updates ->> 'pricing_mode')::public.component_pricing_mode, pricing_mode),
      custom_price             = CASE WHEN p_updates ? 'custom_price' THEN nullif(p_updates ->> 'custom_price', '')::numeric ELSE custom_price END,
      custom_discount_percent  = CASE WHEN p_updates ? 'custom_discount_percent' THEN nullif(p_updates ->> 'custom_discount_percent', '')::numeric ELSE custom_discount_percent END,
      custom_discount_fixed    = CASE WHEN p_updates ? 'custom_discount_fixed' THEN nullif(p_updates ->> 'custom_discount_fixed', '')::numeric ELSE custom_discount_fixed END,
      is_optional              = COALESCE((p_updates ->> 'is_optional')::boolean, is_optional)
  WHERE id = p_id AND bundle_id = p_bundle_id
  RETURNING * INTO v_comp;

  IF v_before.quantity IS DISTINCT FROM v_comp.quantity THEN
    v_diff := v_diff || jsonb_build_object('quantity', jsonb_build_object('old', to_jsonb(v_before.quantity), 'new', to_jsonb(v_comp.quantity)));
  END IF;
  IF v_before.pricing_mode IS DISTINCT FROM v_comp.pricing_mode THEN
    v_diff := v_diff || jsonb_build_object('pricing_mode', jsonb_build_object('old', to_jsonb(v_before.pricing_mode), 'new', to_jsonb(v_comp.pricing_mode)));
  END IF;
  IF v_before.custom_price IS DISTINCT FROM v_comp.custom_price THEN
    v_diff := v_diff || jsonb_build_object('custom_price', jsonb_build_object('old', to_jsonb(v_before.custom_price), 'new', to_jsonb(v_comp.custom_price)));
  END IF;
  IF v_before.custom_discount_percent IS DISTINCT FROM v_comp.custom_discount_percent THEN
    v_diff := v_diff || jsonb_build_object('custom_discount_percent', jsonb_build_object('old', to_jsonb(v_before.custom_discount_percent), 'new', to_jsonb(v_comp.custom_discount_percent)));
  END IF;
  IF v_before.custom_discount_fixed IS DISTINCT FROM v_comp.custom_discount_fixed THEN
    v_diff := v_diff || jsonb_build_object('custom_discount_fixed', jsonb_build_object('old', to_jsonb(v_before.custom_discount_fixed), 'new', to_jsonb(v_comp.custom_discount_fixed)));
  END IF;
  IF v_before.is_optional IS DISTINCT FROM v_comp.is_optional THEN
    v_diff := v_diff || jsonb_build_object('is_optional', jsonb_build_object('old', to_jsonb(v_before.is_optional), 'new', to_jsonb(v_comp.is_optional)));
  END IF;

  IF v_diff <> '{}'::jsonb AND v_bundle.organization_id IS NOT NULL THEN
    PERFORM public.fn_manual_audit_log(
      'bundle_components', p_bundle_id, v_bundle.organization_id, 'UPDATE',
      jsonb_build_object('bundle_components', v_diff), 'web_app'
    );
  END IF;

  RETURN v_comp;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_bundle_component(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_bundle_component(uuid, uuid, jsonb) TO authenticated;
