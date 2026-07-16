-- Fix confirmed-live gaps from the 10th audit round of the Scheduling module:
--
-- 1. schedule_boards has TWO permissive SELECT policies OR'd together:
--    "Users can view schedule boards" (correct: permission + org check) and
--    "Users access organization boards" (org check ONLY, no permission code
--    at all). Since RLS permissive policies are OR'd, scheduling.boards.view
--    is not actually enforced for reads — any org member can SELECT every
--    board regardless of permission. Fix: drop the permission-blind policy.
--
-- 2. schedule_resources has the same problem, doubled: "System admins full
--    access resources" (FOR ALL — SELECT/INSERT/UPDATE/DELETE — org check
--    only, no admin check despite its name, same misnamed-and-unrestricted
--    shape already found and fixed on schedule_items in
--    20261110140000/fix_scheduling_audit_gaps_and_permission_bugs) and
--    "Users access organization resources" (SELECT, org check only). Fix:
--    drop both, matching the exact treatment schedule_items already got.
--    Write access for legitimate admins is unaffected — it continues to flow
--    through the granular has_scheduling_permission-gated INSERT/UPDATE/
--    DELETE policies (which already bypass for system_admin via
--    has_anew_permission).
--
-- 3. resource_service_areas has FOUR policies (SELECT/INSERT/UPDATE/DELETE)
--    that check ONLY "resource_id belongs to a resource in a visible org" —
--    zero permission-code check anywhere. Any org member can read or modify
--    any resource's service areas regardless of scheduling permissions. Fix:
--    add has_scheduling_permission checks — scheduling.resources.view for
--    SELECT, scheduling.resources.edit for INSERT/UPDATE/DELETE (service
--    areas are configured from within the resource edit dialog in the UI,
--    so they're logically part of "editing a resource", not a separate
--    permission).

DROP POLICY IF EXISTS "Users access organization boards" ON public.schedule_boards;

DROP POLICY IF EXISTS "System admins full access resources" ON public.schedule_resources;
DROP POLICY IF EXISTS "Users access organization resources" ON public.schedule_resources;

DROP POLICY IF EXISTS "auth_select_resource_service_areas" ON public.resource_service_areas;
CREATE POLICY "auth_select_resource_service_areas" ON public.resource_service_areas
FOR SELECT TO authenticated
USING (
  public.has_scheduling_permission(auth.uid(), 'scheduling.resources.view')
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "auth_insert_resource_service_areas" ON public.resource_service_areas;
CREATE POLICY "auth_insert_resource_service_areas" ON public.resource_service_areas
FOR INSERT TO authenticated
WITH CHECK (
  public.has_scheduling_permission(auth.uid(), 'scheduling.resources.edit')
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "auth_update_resource_service_areas" ON public.resource_service_areas;
CREATE POLICY "auth_update_resource_service_areas" ON public.resource_service_areas
FOR UPDATE TO authenticated
USING (
  public.has_scheduling_permission(auth.uid(), 'scheduling.resources.edit')
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);

DROP POLICY IF EXISTS "auth_delete_resource_service_areas" ON public.resource_service_areas;
CREATE POLICY "auth_delete_resource_service_areas" ON public.resource_service_areas
FOR DELETE TO authenticated
USING (
  public.has_scheduling_permission(auth.uid(), 'scheduling.resources.edit')
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);
