-- ============================================================
-- Fix: 'organizations.manage' permission mismatch
-- ============================================================
-- Confirmed via live E2E testing (org Nike) that ALL organization
-- mutations (create, update, delete, create-with-hierarchy) are
-- completely broken for EVERY role, including Super Admin.
--
-- Root cause: rpc_create_organization, rpc_update_organization,
-- rpc_delete_organization, rpc_create_organization_with_hierarchy,
-- and 3 RLS policies on anew_organizations all check
-- has_anew_permission(auth.uid(), 'organizations.manage'). That
-- permission code was NEVER seeded into anew_permissions and NEVER
-- granted to any role (confirmed: only organizations.create/edit/
-- delete/view exist and are granted to super_admin). This is a
-- naming mismatch between the RLS/RPC layer and the actual
-- permission catalog, not a missing grant.
--
-- SAFE PATCH METHOD: rather than hand-retype these function bodies
-- (risking a transcription error against signatures not fully re-read
-- — an earlier draft of this exact migration did exactly that and was
-- rejected by Postgres for a return-type mismatch before anything was
-- written), fetch each function's CURRENT live definition and reapply
-- it with only the permission-code string corrected. Zero risk of
-- silently dropping a parameter or changing a contract.

DROP POLICY IF EXISTS authenticated_update_anew_organizations ON public.anew_organizations;
CREATE POLICY authenticated_update_anew_organizations
  ON public.anew_organizations
  FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND public.has_anew_permission(auth.uid(), 'organizations.edit')
  );

DROP POLICY IF EXISTS authenticated_delete_anew_organizations ON public.anew_organizations;
CREATE POLICY authenticated_delete_anew_organizations
  ON public.anew_organizations
  FOR DELETE
  TO authenticated
  USING (
    id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    AND public.has_anew_permission(auth.uid(), 'organizations.delete')
  );

DROP POLICY IF EXISTS authenticated_insert_anew_organizations ON public.anew_organizations;
CREATE POLICY authenticated_insert_anew_organizations
  ON public.anew_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_anew_permission(auth.uid(), 'organizations.create')
    OR EXISTS (
      SELECT 1 FROM public.anew_users au
      WHERE au.auth_user_id = auth.uid()
        AND au.registration_origin = 'self_registration'
    )
  );

DO $$
DECLARE
  v_fn text;
  v_src text;
  v_fixed text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'rpc_create_organization',
    'rpc_update_organization',
    'rpc_delete_organization',
    'rpc_create_organization_with_hierarchy'
  ]
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% not found — cannot patch', v_fn;
    END IF;

    IF v_src NOT LIKE '%organizations.manage%' THEN
      RAISE NOTICE '% does not reference organizations.manage — skipping (already fixed or different check)', v_fn;
      CONTINUE;
    END IF;

    IF v_fn IN ('rpc_create_organization', 'rpc_create_organization_with_hierarchy') THEN
      v_fixed := replace(v_src, 'organizations.manage', 'organizations.create');
    ELSIF v_fn = 'rpc_update_organization' THEN
      v_fixed := replace(v_src, 'organizations.manage', 'organizations.edit');
    ELSIF v_fn = 'rpc_delete_organization' THEN
      v_fixed := replace(v_src, 'organizations.manage', 'organizations.delete');
    END IF;

    EXECUTE v_fixed;
    RAISE NOTICE 'Patched %', v_fn;
  END LOOP;
END;
$$;
