-- organization_smtp_settings.smtp_password is a plaintext text column
-- (no encryption at rest), and its SELECT policy allowed ANY active member
-- of the organization to read it — no permission check, just membership.
-- Confirmed live: 1 org (not Nike) already has a real, non-empty SMTP
-- password exposed this way to every member of that org, regardless of role.
--
-- This is unnecessary: the only client-side reader of this column is
-- SmtpManagement.tsx (the settings/config UI). The actual email-sending path
-- (supabase/functions/send-email/index.ts) never relies on this RLS — it
-- authenticates the caller via JWT, verifies active org membership itself,
-- then resolves the SMTP config using the SERVICE_ROLE key (which bypasses
-- RLS entirely). So restricting SELECT here does not affect anyone's
-- ability to send email; it only stops non-admin org members from reading
-- the org's SMTP password in plaintext via the API/UI.
--
-- Matches the same fix already applied to api_keys/contact_custom_fields:
-- gate on has_anew_permission(auth.uid(), 'settings.update').

DROP POLICY IF EXISTS "org_smtp_select" ON public.organization_smtp_settings;
CREATE POLICY "org_smtp_select" ON public.organization_smtp_settings
  FOR SELECT
  USING (
    organization_id IN (SELECT get_user_visible_org_ids(auth.uid()))
    AND has_anew_permission(auth.uid(), 'settings.update')
  );
