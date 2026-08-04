-- anew_memberships had a duplicate (user_id, organization_id) pair: one
-- legitimate row from org creation (role Super Admin, join_method
-- 'created_org') and one spurious row (role Client, no join_method/created_by)
-- for the same user in the same organization. Because nothing enforced
-- uniqueness, code that queries "the membership" for a user+org
-- (e.g. send-email's org-scope check) could get either row depending on
-- Postgres's arbitrary row order, non-deterministically flipping the
-- effective permission level. Confirmed live: only this one pair was
-- duplicated across the whole table.
DELETE FROM public.anew_memberships
WHERE id = '8040cef0-f736-4394-a95b-6fb76081ed92';

ALTER TABLE public.anew_memberships
  ADD CONSTRAINT anew_memberships_user_org_unique UNIQUE (user_id, organization_id);
