-- anew_hierarchy INSERT/DELETE RLS policies checked has_anew_permission(..., 'organizations.manage'),
-- a permission code that was never added to the anew_permissions catalog. Confirmed live: with
-- no catalog row, has_anew_permission() returns false unconditionally, for every role including
-- super_admin (the old role-code admin bypass was removed by
-- 20260622114000_system_admin_least_privilege.sql). Net effect: INSERT/DELETE on anew_hierarchy
-- was permanently blocked for every non-service-role caller — DELETE fails silently (0 rows
-- affected, no error raised, so the app showed a false-positive success toast), INSERT would raise
-- an explicit RLS violation.
--
-- Fix: point both policies at 'organizations.edit', the real permission code already used
-- everywhere else in the app for this exact capability (see src/pages/OrganizationDetail.tsx,
-- src/components/organizations/OrganizationMembersDialog.tsx and MemberEditDialog.tsx, all fixed
-- to check hasPermission("organizations.edit") in the same change that surfaced this RLS bug).

DROP POLICY IF EXISTS "authenticated_delete_anew_hierarchy" ON "public"."anew_hierarchy";
CREATE POLICY "authenticated_delete_anew_hierarchy" ON "public"."anew_hierarchy" FOR DELETE TO "authenticated" USING ((("parent_org_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids")) AND "public"."has_anew_permission"("auth"."uid"(), 'organizations.edit'::"text")));

DROP POLICY IF EXISTS "authenticated_insert_anew_hierarchy" ON "public"."anew_hierarchy";
CREATE POLICY "authenticated_insert_anew_hierarchy" ON "public"."anew_hierarchy" FOR INSERT TO "authenticated" WITH CHECK ((("parent_org_id" IN ( SELECT "public"."get_user_visible_org_ids"("auth"."uid"()) AS "get_user_visible_org_ids")) AND "public"."has_anew_permission"("auth"."uid"(), 'organizations.edit'::"text")));

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. A caller whose role grants 'organizations.edit' (but not a nonexistent
--    'organizations.manage') can now INSERT and DELETE rows in
--    anew_hierarchy for organizations within their visible org scope.
-- 2. A caller outside that org scope, or without 'organizations.edit',
--    still gets 0 rows affected / RLS violation as before — no scope
--    widening beyond substituting the permission code.
