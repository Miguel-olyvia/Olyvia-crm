-- api_keys.created_by referenced auth.users(id), but every write path in the
-- app (ApiKeys.tsx, via resolveCurrentBusinessUserId()) passes the business
-- identity (anew_users.id), per the app-wide identity-boundary convention
-- documented in src/lib/identity/resolveBusinessUserId.ts ("anew_users.id:
-- business identity. Canonical for business columns like created_by,
-- assigned_to, user_id, ownership relations"). Every other created_by/
-- assigned_to FK in the schema points to anew_users, not auth.users —
-- api_keys was the sole exception.
--
-- Confirmed live: after fixing the RLS permission-code bug (see
-- 20261110710000), a real insert with created_by = anew_users.id still
-- failed with "insert or update on table api_keys violates foreign key
-- constraint api_keys_created_by_fkey" / "Key is not present in table
-- users" — because the FK required an auth.users.id, not the business id
-- the app actually sends. Only one row existed in api_keys at fix time (a
-- throwaway verification row, created with the auth_user_id as a workaround
-- and deleted immediately after), so no data migration was needed.

DELETE FROM public.api_keys WHERE key_name = 'AUDIT-VERIFY-DELETE-ME';

ALTER TABLE public.api_keys DROP CONSTRAINT api_keys_created_by_fkey;
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.anew_users(id) ON DELETE SET NULL;
