-- The 20260618030000 migration left two overloads of get_lead_status_counts:
-- a 13-param legacy wrapper and the canonical 15-param implementation.
-- PostgREST cannot disambiguate which overload to call whenever the frontend
-- omits p_source/p_source_is_null (the default case), so supabase.rpc(...)
-- fails and the dashboard/status cards silently render as zero.
-- Dropping the legacy overload leaves a single unambiguous signature.

DROP FUNCTION IF EXISTS public.get_lead_status_counts(
  uuid, boolean, text, uuid, uuid, uuid, uuid, boolean, text, boolean,
  timestamptz, timestamptz, text
);
