-- URGENT follow-up to 20261110140000/150000/160000: those migrations correctly
-- dropped misnamed-and-unrestricted "System admins full access ..." policies
-- (org-visibility-only, no actual admin check despite the name) on
-- schedule_items, schedule_boards, and schedule_resources. But independent
-- review found this was a real regression, not just a security tightening:
-- has_scheduling_permission() is a pure passthrough to has_anew_permission(),
-- which has NO special-casing for system_admin — confirmed live, the
-- system_admin role (4 real active memberships) holds 0 scheduling.*
-- permission grants. Those dropped policies were the ONLY access path these
-- 4 real accounts had to these tables. Removing them without replacement
-- locked system_admin out of Scheduling entirely (read AND write).
--
-- Fix: re-add a genuine admin-bypass policy per table, this time using the
-- correct mechanism already used correctly elsewhere in this same table
-- family — schedule_item_assignees."System admins full access assignees"
-- (FOR ALL, USING (is_system_admin(auth.uid()))) — instead of an org-only
-- check. is_system_admin(uuid) checks the literal 'system_admin' role code,
-- not organization membership, so no organization_id clause is needed or
-- correct here.
--
-- Also fixes one additional instance of the exact same permission-blind
-- pattern found by the same review sweep:
-- schedule_item_assignees."Users access organization item assignees"
-- (SELECT, org-visibility only, no permission check) — missed by every prior
-- round. Its sibling "System admins full access assignees" on the same table
-- is the correct pattern being replicated above, so it is left untouched.

CREATE POLICY "System admins full access boards" ON public.schedule_boards
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()));

CREATE POLICY "System admins full access resources" ON public.schedule_resources
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()));

CREATE POLICY "System admins full access service areas" ON public.resource_service_areas
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()));

CREATE POLICY "System admins full access items" ON public.schedule_items
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()));

DROP POLICY IF EXISTS "Users access organization item assignees" ON public.schedule_item_assignees;
