-- Cleanup: drop the temporary introspection helper from 20261111290000, now
-- that it has served its purpose (reading rpc_create_proposal/
-- rpc_update_proposal's real bodies before patching the former).
DROP FUNCTION IF EXISTS public.temp_debug_get_functiondef(text);
