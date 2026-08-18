-- rpc_update_lead ended up with two live overloads again: a 13-arg one
-- (p_qualification_type/p_qualification_changed, from 20261110480000) and a
-- 14-arg one adding p_lost_reason DEFAULT NULL (from
-- 20261112200000_rpc_update_lead_add_lost_reason.sql, a CREATE OR REPLACE
-- that changed the parameter list and therefore created a NEW overload
-- instead of replacing the old one — same class of bug already fixed once
-- in 20261110650000_fix_rpc_update_lead_ambiguous_overload.sql for the
-- 11-arg vs 13-arg case).
--
-- AnewLeadEditDialog.tsx calls with the 11 base args plus, conditionally,
-- p_qualification_type/p_qualification_changed and/or p_lost_reason. Any
-- call that omits BOTH optional groups (the common case: editing a lead
-- without touching qualification or marking it "Perdida") is ambiguous
-- between the 13-arg and 14-arg overloads — PostgREST returns PGRST203
-- (300 Multiple Choices), surfaced to the user as "Não foi possível
-- guardar as alterações." This blocked ALL non-qualification, non-lost
-- lead edits app-wide.
--
-- The 14-arg version (20261112200000) is a strict superset: identical body
-- except p_lost_reason is appended as a new, defaulted last parameter and
-- lost_reason is written via COALESCE(p_lost_reason, lost_reason), which
-- never clears an existing reason when the param is omitted. Dropping the
-- older 13-arg overload changes no behavior for any existing caller.

DROP FUNCTION IF EXISTS public.rpc_update_lead(
  uuid, jsonb, text, text, text, uuid, boolean, uuid, text, text, text, text, boolean
);
