-- Per-file size limits already exist on storage.buckets (documents=20MB,
-- company-logos=5MB, media=100MB). This adds the missing protection: a
-- burst/aggregate limit so a script cannot exhaust storage by repeating many
-- small uploads in a short window. Enforced with a trigger on
-- storage.objects (server-side, ahead of the row being written) rather than
-- in the frontend or an Edge Function, because uploads to these buckets go
-- directly from the client to Supabase Storage with no Edge Function in the
-- path today.
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
    AND bucket_id IN ('documents', 'company-logos', 'media')
    AND created_at > now() - v_window;

  IF v_recent_count + 1 > v_max_objects OR v_recent_bytes + v_new_size > v_max_bytes THEN
    RAISE EXCEPTION 'upload_burst_rate_limit_exceeded: max % uploads or % bytes per % per user'
      , v_max_objects, v_max_bytes, v_window
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_upload_burst_rate_limit ON storage.objects;
CREATE TRIGGER enforce_upload_burst_rate_limit
BEFORE INSERT ON storage.objects
FOR EACH ROW
WHEN (NEW.bucket_id IN ('documents', 'company-logos', 'media'))
EXECUTE FUNCTION public.enforce_upload_burst_rate_limit();
