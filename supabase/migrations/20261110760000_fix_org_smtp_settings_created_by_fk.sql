-- organization_smtp_settings.created_by referenced auth.users(id), same
-- pre-existing bug pattern already found and fixed on api_keys this
-- session — every other created_by/assigned_to column in the schema uses
-- anew_users.id (the app's documented business-identity convention, see
-- src/lib/identity/resolveBusinessUserId.ts), which is exactly what the new
-- rpc_upsert_org_smtp_settings RPC (20261110750000) passes. Confirmed live:
-- inserting through the RPC failed with "Key (created_by)=(...) is not
-- present in table users" because the FK expected an auth.users.id.
--
-- Unlike api_keys (zero existing rows), this table had 1 real row whose
-- created_by was an auth.users.id — migrated to the matching anew_users.id
-- (confirmed live: resolves to exactly one row) before switching the FK.

ALTER TABLE public.organization_smtp_settings DROP CONSTRAINT company_smtp_settings_created_by_fkey;

UPDATE public.organization_smtp_settings o
SET created_by = au.id
FROM public.anew_users au
WHERE au.auth_user_id = o.created_by;

ALTER TABLE public.organization_smtp_settings
  ADD CONSTRAINT organization_smtp_settings_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL;
