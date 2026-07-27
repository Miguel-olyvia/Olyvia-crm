-- org_smtp_update/org_smtp_delete only checked org membership, no permission
-- check — inconsistent with the SELECT fix (20261110740000, requires
-- settings.update) and the new write RPC (20261110750000's
-- rpc_upsert_org_smtp_settings, which already requires settings.update for
-- INSERT/UPDATE). Without this, a user with no SMTP permission could still
-- toggle-active/set-default/delete the org's SMTP config directly via
-- SmtpManagement.tsx's handleToggleActive/handleSetDefault/handleDelete,
-- which write straight to the table rather than through the new RPC.
-- Aligning all write paths to the same settings.update gate.

DROP POLICY IF EXISTS "org_smtp_update" ON public.organization_smtp_settings;
CREATE POLICY "org_smtp_update" ON public.organization_smtp_settings
  FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );

DROP POLICY IF EXISTS "org_smtp_delete" ON public.organization_smtp_settings;
CREATE POLICY "org_smtp_delete" ON public.organization_smtp_settings
  FOR DELETE
  USING (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );
