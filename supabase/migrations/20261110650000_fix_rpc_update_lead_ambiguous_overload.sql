-- rpc_update_lead had two overloads: an 11-arg one (pre-qualification-tracking)
-- and a 13-arg one adding p_qualification_type/p_qualification_changed with
-- DEFAULT NULL/false. Since AnewLeadEditDialog.tsx always calls with exactly
-- the 11 original named args, PostgREST cannot disambiguate between "the
-- 11-arg function" and "the 13-arg function with its 2 defaulted params
-- omitted" — every call fails with PGRST203 (300 Multiple Choices),
-- confirmed live: this blocked ALL lead edits app-wide, independently
-- reproduced by 3 separate live scope-audit test personas (ORG, TEAM leader,
-- TEAM member) against the real Nike org data.
--
-- The 13-arg version is a strict superset — confirmed via pg_get_functiondef
-- that it correctly preserves existing qualification_type/qualified_at/
-- qualification_set_by when p_qualification_changed is false (the default),
-- so dropping the older 11-arg overload changes no behavior for existing
-- callers that only pass the first 11 args.

DROP FUNCTION IF EXISTS public.rpc_update_lead(
  uuid, jsonb, text, text, text, uuid, boolean, uuid, text, text, text
);
