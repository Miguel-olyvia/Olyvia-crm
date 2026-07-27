-- Fix: restore_entity_facet was missed by the earlier
-- 20260818010000_fix_anon_exposed_destructive_functions_record.sql cleanup.
--
-- Bug (confirmed live): restore_entity_facet only checked that the caller was
-- authenticated (via resolve_business_user_id(auth.uid())). It never verified
-- that the lead/contact/client being restored belongs to an organization the
-- caller can see. Any authenticated user could restore ANY org's deleted
-- lead/contact/client from the Trash screen (src/pages/Trash.tsx), fully
-- bypassing multi-tenant isolation. This mirrors the same class of bug fixed
-- for purge_entity_facet and restore_business_entity in
-- 20260818010000_fix_anon_exposed_destructive_functions_record.sql — this
-- migration applies the identical org-visibility guard pattern to the one
-- function that was left out.
--
-- Fix: after resolving the target row's organization_id (BEFORE any write),
-- verify v_org_id = ANY (get_user_visible_org_ids(auth.uid())), raising
-- 'Sem permissao' (ERRCODE insufficient_privilege) otherwise — same check and
-- same error used by restore_business_entity. Also revoke the anon/PUBLIC
-- grants the baseline left in place for this function.

CREATE OR REPLACE FUNCTION "public"."restore_entity_facet"("p_kind" "text", "p_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_auth       uuid := auth.uid();
  v_actor      uuid := public.resolve_business_user_id(auth.uid());
  v_table      text;
  v_entity_id  uuid;
  v_org_id     uuid;
  v_deleted_at timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'restore_entity_facet: actor not resolved for auth.uid=%', auth.uid()
      USING ERRCODE = 'P0001';
  END IF;

  v_table := CASE p_kind
    WHEN 'lead'    THEN 'anew_leads'
    WHEN 'contact' THEN 'anew_contacts'
    WHEN 'client'  THEN 'anew_clients'
    ELSE NULL END;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  EXECUTE format(
    'SELECT entity_id, organization_id, deleted_at FROM public.%I WHERE id = $1', v_table)
  INTO v_entity_id, v_org_id, v_deleted_at
  USING p_id;

  IF v_deleted_at IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Determine organization of the target row BEFORE acting: reject cross-org
  -- restore attempts (same check as restore_business_entity).
  IF NOT (v_org_id = ANY (public.get_user_visible_org_ids(v_auth))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', v_table)
  USING p_id;

  UPDATE public.anew_entity_roles
     SET status          = COALESCE(previous_status, 'active'),
         previous_status = NULL,
         deleted_at      = NULL,
         deleted_by      = NULL
   WHERE entity_id = v_entity_id
     AND organization_id = v_org_id
     AND role = p_kind
     AND status = 'deleted'
     AND deleted_at = v_deleted_at;

  UPDATE public.deals SET deleted_at = NULL, deleted_by = NULL
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  UPDATE public.quotes SET deleted_at = NULL, deleted_by = NULL
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  UPDATE public.client_contracts SET deleted_at = NULL, deleted_by = NULL
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  UPDATE public.proposals SET deleted_at = NULL, deleted_by = NULL, is_deleted = FALSE
   WHERE entity_id = v_entity_id AND organization_id = v_org_id AND deleted_at = v_deleted_at;

  BEGIN
    INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
    VALUES (v_entity_id, 'restored', p_kind, p_id::text, NULL, v_actor,
            jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id,
                               'deleted_at', v_deleted_at));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN TRUE;
END;
$_$;

REVOKE ALL ON FUNCTION "public"."restore_entity_facet"("p_kind" "text", "p_id" "uuid") FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "public"."restore_entity_facet"("p_kind" "text", "p_id" "uuid") TO authenticated, service_role;
