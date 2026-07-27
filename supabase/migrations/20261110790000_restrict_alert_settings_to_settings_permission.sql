-- alert_settings INSERT/UPDATE/DELETE only checked org membership
-- (get_user_visible_org_ids), no permission check at all — confirmed live
-- by 3 independent test personas (including the most restricted role in
-- this audit, an OWNED-scope user with no team) that any authenticated org
-- member can freely reconfigure org-wide alert/notification thresholds and
-- toggles, which apply uniformly to every user in the organization
-- (alert_settings.organization_id is NOT NULL, there is no user_id column
-- at all — this is not a per-user preference, it's a shared org config).
-- AlertSettings.tsx also had zero client-side permission gating.
--
-- Matches the same fix already applied to api_keys/organization_smtp_settings
-- this session: require has_anew_permission(auth.uid(), 'settings.update')
-- in addition to org visibility.

DROP POLICY IF EXISTS "Users can insert alert_settings for visible orgs" ON public.alert_settings;
CREATE POLICY "Users can insert alert_settings for visible orgs" ON public.alert_settings
  FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );

DROP POLICY IF EXISTS "Users can update alert_settings for visible orgs" ON public.alert_settings;
CREATE POLICY "Users can update alert_settings for visible orgs" ON public.alert_settings
  FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );

DROP POLICY IF EXISTS "Users can delete alert_settings for visible orgs" ON public.alert_settings;
CREATE POLICY "Users can delete alert_settings for visible orgs" ON public.alert_settings
  FOR DELETE
  USING (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );
