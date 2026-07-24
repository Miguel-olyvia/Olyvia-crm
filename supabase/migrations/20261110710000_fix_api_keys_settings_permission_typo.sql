-- api_keys and contact_custom_fields both had a write RLS policy checking
-- has_anew_permission(auth.uid(), 'settings.manage') — a permission code that
-- does not exist anywhere in anew_permissions and has never been granted to
-- any role (confirmed live: zero rows in anew_permissions and zero rows in
-- anew_role_permissions for that code). This made API key creation
-- completely broken for every user in every organization, including
-- Super Admin — reproduced live and independently by 4 test personas
-- (ORG/Super Admin, TEAM leader, TEAM member, OWNED-outside-team) all
-- hitting the identical "new row violates row-level security policy for
-- table api_keys" error in the Nike org.
--
-- The rest of the app (e.g. TechnicalSettings.tsx) checks
-- hasPermission('settings.manage') || hasPermission('settings.update') —
-- 'settings.update' is the real, correctly-seeded permission code (granted
-- to super_admin, system_admin, org_admin and others, confirmed live).
-- 'settings.manage' looks like a pre-rename code that these two RLS
-- policies were never updated to follow. Fixing both to use the real code.

DROP POLICY IF EXISTS "Admins can manage API keys" ON public.api_keys;
CREATE POLICY "Admins can manage API keys" ON public.api_keys
  TO authenticated
  USING (
    (organization_id IN (
      SELECT m.organization_id
      FROM anew_memberships m
      JOIN anew_users u ON u.id = m.user_id
      WHERE u.auth_user_id = auth.uid() AND m.status = 'active'
    ))
    AND has_anew_permission(auth.uid(), 'settings.update')
  )
  WITH CHECK (
    (organization_id IN (
      SELECT m.organization_id
      FROM anew_memberships m
      JOIN anew_users u ON u.id = m.user_id
      WHERE u.auth_user_id = auth.uid() AND m.status = 'active'
    ))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );

DROP POLICY IF EXISTS "Admins can manage custom fields" ON public.contact_custom_fields;
CREATE POLICY "Admins can manage custom fields" ON public.contact_custom_fields
  TO authenticated
  USING (has_anew_permission(auth.uid(), 'settings.update'))
  WITH CHECK (has_anew_permission(auth.uid(), 'settings.update'));
