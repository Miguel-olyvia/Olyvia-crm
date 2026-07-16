-- Corrects a mistake in 20261110170000_restore_system_admin_scheduling_access.sql
-- and fixes 4 pre-existing instances of the same defect.
--
-- The user flagged the correct model directly: system_admin should only get
-- full access via REAL org membership (like any other member); when they
-- have no membership in an org, they may only get READ-ONLY access through
-- the existing, audited, approval-gated break-glass mechanism
-- (has_active_support_access, supabase/migrations/20260624110000_support_access_log.sql),
-- never an unconditional bypass. This is the exact model already codified
-- elsewhere in the codebase via the system_admin_pii_default_deny
-- (RESTRICTIVE) + system_admin_support_access (PERMISSIVE, SELECT-only)
-- policy pair on anew_leads/deals/quotes/etc.
--
-- 20261110170000 (applied earlier this session) added 4 NEW policies shaped
-- as bare `USING (is_system_admin(auth.uid()))` with no organization_id
-- check and no support-access gating at all — an unconditional, unaudited,
-- cross-org read+write bypass for anyone holding the system_admin role.
-- That migration's own comment justified this by pointing at an existing
-- "correct" reference pattern (schedule_item_assignees' admin policy) — but
-- investigation found that reference is itself the SAME pre-existing bug,
-- predating the break-glass system (baseline 20260615 vs. break-glass
-- introduced 20260624), never migrated to the two-policy pattern the way
-- anew_leads/deals/quotes/purchase_orders etc. were.
--
-- Fix, applied uniformly to all 8 affected tables (the 4 just introduced +
-- the 4 pre-existing): replace the single unconditional policy with two
-- policies mirroring system_admin_pii_default_deny/system_admin_support_access:
--   1. FOR ALL — system_admin + REAL membership in that org (full CRUD,
--      same as any other member with the role).
--   2. FOR SELECT only — system_admin + an active, approved support-access
--      grant for that specific org (read-only break-glass, audited).

-- schedule_boards
DROP POLICY IF EXISTS "System admins full access boards" ON public.schedule_boards;
CREATE POLICY "System admins org access boards" ON public.schedule_boards
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()) AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));
CREATE POLICY "System admins support access boards" ON public.schedule_boards
FOR SELECT TO authenticated
USING (public.is_system_admin(auth.uid()) AND public.has_active_support_access(organization_id));

-- schedule_resources
DROP POLICY IF EXISTS "System admins full access resources" ON public.schedule_resources;
CREATE POLICY "System admins org access resources" ON public.schedule_resources
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()) AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));
CREATE POLICY "System admins support access resources" ON public.schedule_resources
FOR SELECT TO authenticated
USING (public.is_system_admin(auth.uid()) AND public.has_active_support_access(organization_id));

-- resource_service_areas (no organization_id column of its own — resolve via schedule_resources)
DROP POLICY IF EXISTS "System admins full access service areas" ON public.resource_service_areas;
CREATE POLICY "System admins org access service areas" ON public.resource_service_areas
FOR ALL TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);
CREATE POLICY "System admins support access service areas" ON public.resource_service_areas
FOR SELECT TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE public.has_active_support_access(organization_id)
  )
);

-- schedule_items
DROP POLICY IF EXISTS "System admins full access items" ON public.schedule_items;
CREATE POLICY "System admins org access items" ON public.schedule_items
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()) AND organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid())));
CREATE POLICY "System admins support access items" ON public.schedule_items
FOR SELECT TO authenticated
USING (public.is_system_admin(auth.uid()) AND public.has_active_support_access(organization_id));

-- schedule_item_assignees (pre-existing bug — resolve org via schedule_items)
DROP POLICY IF EXISTS "System admins full access assignees" ON public.schedule_item_assignees;
CREATE POLICY "System admins org access assignees" ON public.schedule_item_assignees
FOR ALL TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND item_id IN (
    SELECT id FROM public.schedule_items
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);
CREATE POLICY "System admins support access assignees" ON public.schedule_item_assignees
FOR SELECT TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND item_id IN (
    SELECT id FROM public.schedule_items
    WHERE public.has_active_support_access(organization_id)
  )
);

-- schedule_fields is NOT part of the org-scoping fix below: it's a global
-- field-TYPE catalog (id, name, label, field_type, options, ...), not
-- customer/tenant data — it has no organization_id, no item_id, no
-- resource_id, and none of ITS OWN existing policies (Users can view/create/
-- update/delete schedule fields) apply any org filter either; it relates to
-- boards only indirectly via the separate board_schedule_fields junction
-- table. There is no org to scope a break-glass grant to, and nothing
-- GDPR-sensitive here (no client/contact/deal data), so the original bare
-- admin bypass is left as-is — re-created unchanged after the DROP, purely
-- so this migration doesn't leave system_admin locked out of a table that
-- was never part of the org-isolation model in the first place.
DROP POLICY IF EXISTS "System admins full access fields" ON public.schedule_fields;
CREATE POLICY "System admins full access fields" ON public.schedule_fields
FOR ALL TO authenticated
USING (public.is_system_admin(auth.uid()));

-- resource_time_off (pre-existing bug — resolve org via schedule_resources)
DROP POLICY IF EXISTS "System admins full access timeoff" ON public.resource_time_off;
CREATE POLICY "System admins org access timeoff" ON public.resource_time_off
FOR ALL TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);
CREATE POLICY "System admins support access timeoff" ON public.resource_time_off
FOR SELECT TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND resource_id IN (
    SELECT id FROM public.schedule_resources
    WHERE public.has_active_support_access(organization_id)
  )
);

-- schedule_item_events (pre-existing bug — resolve org via schedule_items)
DROP POLICY IF EXISTS "System admins full access events" ON public.schedule_item_events;
CREATE POLICY "System admins org access events" ON public.schedule_item_events
FOR ALL TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND item_id IN (
    SELECT id FROM public.schedule_items
    WHERE organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  )
);
CREATE POLICY "System admins support access events" ON public.schedule_item_events
FOR SELECT TO authenticated
USING (
  public.is_system_admin(auth.uid())
  AND item_id IN (
    SELECT id FROM public.schedule_items
    WHERE public.has_active_support_access(organization_id)
  )
);
