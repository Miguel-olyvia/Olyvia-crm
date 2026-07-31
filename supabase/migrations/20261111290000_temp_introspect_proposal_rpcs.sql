-- TEMPORARY, introspection-only: lets us read the live source of
-- rpc_create_proposal/rpc_update_proposal before editing them, per the
-- project rule to confirm real DB state (not migration history) before any
-- change. Removed by a follow-up migration once used.
CREATE OR REPLACE FUNCTION public.temp_debug_get_functiondef(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pg_get_functiondef(p_name::regproc);
$$;

GRANT EXECUTE ON FUNCTION public.temp_debug_get_functiondef(text) TO service_role;
