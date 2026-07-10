-- Introduces an upload quarantine flow. Clients stop uploading directly to the
-- final buckets and instead upload to private "-quarantine" buckets. An Edge
-- Function running with the service role validates the real binary signature
-- (magic bytes) and only then moves the object into the final bucket. Quarantine
-- buckets mirror the final buckets' file_size_limit and allowed_mime_types so
-- the size/type ceilings cannot be bypassed by routing through quarantine.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'documents-quarantine',
    'documents-quarantine',
    false,
    20971520,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp'
    ]
  ),
  (
    'company-logos-quarantine',
    'company-logos-quarantine',
    false,
    5242880,
    ARRAY[
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  ),
  (
    'media-quarantine',
    'media-quarantine',
    false,
    104857600,
    ARRAY[
      'image/*',
      'video/*',
      'audio/*',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
  )
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may only INSERT (upload) into the quarantine buckets.
-- No SELECT/UPDATE/DELETE is granted here, so only the service role (which
-- bypasses RLS) can read, move, or delete quarantined objects from the Edge
-- Function. Business-level authorization (per organization) is enforced by the
-- RLS on the business tables, not here.
DROP POLICY IF EXISTS "authenticated_can_upload_to_documents_quarantine" ON storage.objects;
CREATE POLICY "authenticated_can_upload_to_documents_quarantine"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents-quarantine');

DROP POLICY IF EXISTS "authenticated_can_upload_to_company_logos_quarantine" ON storage.objects;
CREATE POLICY "authenticated_can_upload_to_company_logos_quarantine"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-logos-quarantine');

DROP POLICY IF EXISTS "authenticated_can_upload_to_media_quarantine" ON storage.objects;
CREATE POLICY "authenticated_can_upload_to_media_quarantine"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media-quarantine');

-- No migration ever defined an explicit INSERT policy on storage.objects for the
-- final buckets; direct client uploads worked via Supabase's default/dashboard
-- storage configuration. These RESTRICTIVE policies close that path: only the
-- service role (RLS-exempt), invoked by the validation Edge Function, may write
-- to the final buckets from now on. RESTRICTIVE (not permissive) is required so
-- the block holds even if a permissive upload policy exists outside migrations,
-- since restrictive policies are AND-combined. SELECT/UPDATE/DELETE are left
-- untouched, so existing read policies (e.g. portal_users_can_read_documents)
-- keep working.
DROP POLICY IF EXISTS "block_direct_client_insert_documents" ON storage.objects;
CREATE POLICY "block_direct_client_insert_documents"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (bucket_id <> 'documents');

DROP POLICY IF EXISTS "block_direct_client_insert_company_logos" ON storage.objects;
CREATE POLICY "block_direct_client_insert_company_logos"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (bucket_id <> 'company-logos');

DROP POLICY IF EXISTS "block_direct_client_insert_media" ON storage.objects;
CREATE POLICY "block_direct_client_insert_media"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (bucket_id <> 'media');

-- Client uploads now land in the quarantine buckets, so the burst rate limit
-- must fire there instead of on the final buckets (writes to which are now
-- service-role-only and should not be throttled). The function body also
-- counted against the final buckets internally; without this it would
-- undercount/never throttle once uploads move to the quarantine buckets.
CREATE OR REPLACE FUNCTION public.enforce_upload_burst_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_window interval := interval '1 minute';
  v_max_objects integer := 20;
  v_max_bytes bigint := 104857600; -- 100MB per user per window, across the limited buckets
  v_recent_count integer;
  v_recent_bytes bigint;
  v_new_size bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_size := COALESCE((NEW.metadata->>'size')::bigint, 0);

  SELECT count(*), COALESCE(sum((metadata->>'size')::bigint), 0)
  INTO v_recent_count, v_recent_bytes
  FROM storage.objects
  WHERE owner = v_uid
    AND bucket_id IN ('documents-quarantine', 'company-logos-quarantine', 'media-quarantine')
    AND created_at > now() - v_window;

  IF v_recent_count + 1 > v_max_objects OR v_recent_bytes + v_new_size > v_max_bytes THEN
    RAISE EXCEPTION 'upload_burst_rate_limit_exceeded: max % uploads or % bytes per % per user'
      , v_max_objects, v_max_bytes, v_window
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Postgres has no ALTER TRIGGER ... WHEN, so the trigger is recreated over the
-- function above with an updated WHEN clause pointing at the quarantine buckets.
DROP TRIGGER IF EXISTS enforce_upload_burst_rate_limit ON storage.objects;
CREATE TRIGGER enforce_upload_burst_rate_limit
BEFORE INSERT ON storage.objects
FOR EACH ROW
WHEN (NEW.bucket_id IN ('documents-quarantine', 'company-logos-quarantine', 'media-quarantine'))
EXECUTE FUNCTION public.enforce_upload_burst_rate_limit();

-- Rows predating the quarantine flow are already trusted, hence DEFAULT
-- 'validated'. The Edge Function will insert new rows as 'pending' and promote
-- them to 'validated' once the binary signature check passes.
ALTER TABLE public.documents
  ADD COLUMN validation_status text NOT NULL DEFAULT 'validated'
    CHECK (validation_status IN ('pending', 'validated', 'rejected'));

ALTER TABLE public.media_assets
  ADD COLUMN validation_status text NOT NULL DEFAULT 'validated'
    CHECK (validation_status IN ('pending', 'validated', 'rejected'));
