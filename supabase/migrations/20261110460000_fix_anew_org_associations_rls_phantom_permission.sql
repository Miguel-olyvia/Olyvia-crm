-- Bug: saving "Cross Associations" on an organization (Organizations -> Organization Chart ->
-- kebab menu -> Cross Associations -> check a company -> Save) fails with "new row violates
-- row-level security policy for table anew_org_associations". Network capture showed the save
-- flow first DELETEs the org's existing associations (succeeds, but silently affects 0 rows) then
-- INSERTs the new association, which raises an explicit 42501 RLS violation.
--
-- Confirmed live against the remote database (pg_policy / pg_get_expr, plus anew_permissions and
-- anew_role_permissions):
--   - The only INSERT/UPDATE/DELETE ("FOR ALL") policy on anew_org_associations, "Admins can
--     manage associations", gated on:
--       has_anew_permission(auth.uid(), 'organizations.manage')
--   - 'organizations.manage' has ZERO rows in anew_permissions and ZERO rows in
--     anew_role_permissions (confirmed by direct query) -- it is a phantom permission code that
--     was never seeded. This is the exact same dead-code-path bug already fixed for
--     'organizations.manage' on anew_organizations/anew_hierarchy in 20260905010000,
--     20261017010000, 20261108100000 and 20261110330000 (fix_anew_hierarchy_rls_phantom_permission),
--     just never applied to this table's own RLS policy.
--   - has_anew_permission() no longer has a role-code admin bypass (removed by
--     20260622114000_system_admin_least_privilege.sql) -- it strictly checks
--     anew_role_permissions, so a nonexistent permission code is unconditionally false for every
--     role, including super_admin and org_admin.
--   - Net effect: INSERT/UPDATE/DELETE on anew_org_associations was permanently blocked for every
--     non-service-role caller. DELETE fails silently (0 rows affected, no error, so the UI's
--     "delete existing associations" step looked fine); INSERT raises the explicit RLS violation
--     the user saw.
--
-- Fix: point the policy at 'organizations.edit', the real, seeded permission code already used
-- for this exact organization-editing capability everywhere else in the app and in the sibling
-- fix for anew_hierarchy (20261110330000). Confirmed live that super_admin, org_admin and
-- org_editor all hold 'organizations.edit' in anew_role_permissions, so this restores access for
-- exactly the roles that should have it, without widening scope for anyone else (org visibility
-- is unaffected -- this table has no org-scope predicate in either policy, matching its prior
-- behavior).
--
-- Only this one policy is touched. "Users can view associations in their scope" (SELECT) is
-- unrelated and untouched.

DROP POLICY IF EXISTS "Admins can manage associations" ON "public"."anew_org_associations";

CREATE POLICY "Admins can manage associations" ON "public"."anew_org_associations"
  TO "authenticated"
  USING ("public"."has_anew_permission"("auth"."uid"(), 'organizations.edit'::"text"))
  WITH CHECK ("public"."has_anew_permission"("auth"."uid"(), 'organizations.edit'::"text"));

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. A caller whose role grants 'organizations.edit' (super_admin, org_admin, org_editor -- all
--    confirmed live) can now INSERT/UPDATE/DELETE rows in anew_org_associations, so the Cross
--    Associations save flow (DELETE existing + INSERT selected) completes without the 42501
--    error.
-- 2. A caller without 'organizations.edit' still gets 0 rows affected / an RLS violation, exactly
--    as before -- no scope widening beyond substituting the permission code.
