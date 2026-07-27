-- Migration: users_roles_update_with_check
--
-- Fixes two UPDATE policies that had USING but no WITH CHECK, allowing
-- a row to be written to a state that the USING clause would never expose.
-- Both policies are replaced in full; the USING expression is kept identical
-- to the baseline so row visibility is unchanged.


-- ============================================================
-- 1. anew_roles — enforce org boundary on the post-update row
-- ============================================================
-- Without WITH CHECK a user with roles.edit could flip organization_id
-- to any org they can see, silently moving the role out of scope.

DROP POLICY IF EXISTS anew_roles_update ON anew_roles;

CREATE POLICY anew_roles_update ON anew_roles
  FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'roles.edit'::text)
  )
  WITH CHECK (
    -- Post-update row must still belong to a visible org and require the same permission.
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'roles.edit'::text)
  );


-- ============================================================
-- 2. anew_users — enforce org boundary on the post-update row
-- ============================================================
-- anew_users has no direct organization_id; org scope is resolved through
-- anew_memberships. Without WITH CHECK a user with users.edit could edit
-- any authenticated user regardless of org membership.
-- WITH CHECK allows:
--   (a) a user editing their own record (auth_user_id = auth.uid()), or
--   (b) an admin with users.edit, but only when the target user has an
--       active membership in an org the editor can see.

DROP POLICY IF EXISTS anew_users_update ON anew_users;

CREATE POLICY anew_users_update ON anew_users
  FOR UPDATE
  TO authenticated
  USING (
    (auth_user_id = auth.uid())
    OR has_anew_permission(auth.uid(), 'users.edit'::text)
  )
  WITH CHECK (
    (auth_user_id = auth.uid())
    OR (
      has_anew_permission(auth.uid(), 'users.edit'::text)
      AND id IN (
        SELECT m.user_id
        FROM anew_memberships m
        WHERE m.organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
      )
    )
  );
