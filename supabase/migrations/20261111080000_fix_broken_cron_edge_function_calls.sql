-- 4 pg_cron jobs (process-scheduled-emails, auto-schedule,
-- generate-notifications, pipeline-automation) were created outside this
-- migration history with literal, never-filled-in placeholders
-- ("<PROJECT_REF>", "<SERVICE_ROLE_KEY>") in their net.http_post command —
-- confirmed via cron.job_run_details that every single run since creation
-- failed with "invalid URL ... Bad hostname". The service_role key must
-- never be committed to a migration file, so it's read at call time from
-- Supabase Vault (secret 'cron_service_role_key', created live, out-of-band,
-- via the Supabase CLI/SQL editor — never checked into git) instead of being
-- inlined here.
DO $$
DECLARE
  v_url_base text := 'https://tzbfgwpckrfbqcolqxtm.supabase.co/functions/v1/';
  v_fn text;
  v_schedule text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['process-scheduled-emails', 'auto-schedule', 'generate-notifications', 'pipeline-automation']
  LOOP
    SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = v_fn;
    IF v_schedule IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM cron.unschedule(v_fn);
    PERFORM cron.schedule(
      v_fn,
      v_schedule,
      format(
        $cmd$
        SELECT net.http_post(
          url:='%s%s',
          headers:=jsonb_build_object(
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key'),
            'Content-Type', 'application/json'
          )
        );
        $cmd$,
        v_url_base, v_fn
      )
    );
  END LOOP;
END $$;
