-- The multi-file upload feature in DocumentsTab.tsx allows batches of up to
-- 10 files at MAX_UPLOAD_SIZE_BYTES (20MB) each, i.e. up to 200MB per batch.
-- The previous 100MB/minute byte ceiling would reject a legitimate full batch
-- partway through. Raise it to 250MB to comfortably cover that batch with
-- margin, while the 20-objects/minute ceiling (unchanged) remains the primary
-- defense against abuse (two full 10-file batches per minute at most).
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
  v_max_bytes bigint := 262144000; -- 250MB per user per window, across the limited buckets
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
