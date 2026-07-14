-- Fix restore_business_entity: same "ANY (array)" bug already fixed for the
-- soft-delete counterpart, still present in the restore path
-- 2026-11-08 | Module: Deals / Quotes / Proposals / Contracts (Trash)
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- 20260915010000_fix_soft_delete_business_entity_impl_any_array_bug.sql fixed
-- _soft_delete_business_entity_impl's authorization check:
--   v_target_org = ANY (public.get_user_visible_org_ids(p_auth_uid))
-- which is invalid — get_user_visible_org_ids() RETURNS SETOF uuid, not
-- uuid[], so it cannot be the direct right-hand operand of ANY (array).
-- That migration's header explicitly lists the other call sites that needed
-- (or already got) the same fix: unlink_organization_node,
-- move_organization_node, delete_organization_subtree.
--
-- restore_business_entity(p_kind, p_id) (20260818010000) has the exact same
-- bug and was missed:
--   IF NOT (v_target_org = ANY (public.get_user_visible_org_ids(v_actor))) THEN
-- Found live while verifying 20261108020000 (rpc_bulk_delete_deal soft-delete
-- fix): restoring a bulk-deleted deal via src/pages/Trash.tsx (which calls
-- restore_business_entity for kind IN ('deal','quote','proposal','contract'))
-- fails with Postgres error 42809 "op ANY/ALL (array) requires array on right
-- side" for every one of those four entity kinds — a pre-existing, unrelated
-- but currently-live bug in the Trash restore path, not introduced by this
-- session's other migrations.
--
-- Solution
-- --------
-- Same fix pattern as 20260915010000: replace `= ANY (...)` with
-- `IN (SELECT ...)`, which works correctly against a SETOF-returning function.
--
-- Prerequisites:
--   20260818010000_fix_anon_exposed_destructive_functions_record.sql — restore_business_entity (being fixed)
--   20260915010000_fix_soft_delete_business_entity_impl_any_array_bug.sql — same fix, sibling function

CREATE OR REPLACE FUNCTION public.restore_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_target_org uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT organization_id INTO v_target_org FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT organization_id INTO v_target_org FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT organization_id INTO v_target_org FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT organization_id INTO v_target_org FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_target_org IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_target_org IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'deal' THEN
    UPDATE public.deals SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'quote' THEN
    UPDATE public.quotes SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSIF p_kind = 'proposal' THEN
    UPDATE public.proposals SET deleted_at = NULL, deleted_by = NULL, is_deleted = false
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  ELSE
    UPDATE public.client_contracts SET deleted_at = NULL, deleted_by = NULL
      WHERE id = p_id AND deleted_at IS NOT NULL
      RETURNING entity_id, organization_id INTO v_entity_id, v_org_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'restored', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_business_entity(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_business_entity(text, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Restoring a soft-deleted deal/quote/proposal/contract via
--    src/pages/Trash.tsx no longer raises "op ANY/ALL (array) requires array
--    on right side" (Postgres 42809).
--
-- 2. A caller whose visible orgs do not include the target row's
--    organization_id still raises insufficient_privilege (authorization
--    behavior unchanged — only the broken operator was fixed).
