-- Follow-up to 20261110150000: that migration fixed schedule_resources and
-- resource_service_areas but missed schedule_boards' own copy of the same
-- defect (truncated out of the query output used to design the fix).
--
-- "System admins full access boards" (FOR ALL — SELECT/INSERT/UPDATE/DELETE)
-- checks ONLY organization visibility, with NO actual is_system_admin()/role
-- check despite its name — identical shape to "System admins full access
-- items" (fixed on schedule_items in 20261110140000) and "System admins full
-- access resources" (fixed on schedule_resources in 20261110150000). Since
-- RLS permissive policies are OR'd, this alone grants every org member
-- unrestricted access to schedule_boards regardless of permission or scope.
--
-- Dropped as redundant and unsafe: legitimate system_admin/super_admin users
-- already get full ORG-scope visibility via the correctly permission-gated
-- "Users can view schedule boards" policy (has_scheduling_permission bypasses
-- for system_admin via has_anew_permission), and write access continues to
-- flow through the granular has_scheduling_permission-gated INSERT/UPDATE/
-- DELETE policies, unaffected by this drop.

DROP POLICY IF EXISTS "System admins full access boards" ON public.schedule_boards;
