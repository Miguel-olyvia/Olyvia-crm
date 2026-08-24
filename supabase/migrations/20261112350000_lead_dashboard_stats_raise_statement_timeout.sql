-- Fix: "Erro ao carregar dashboard / canceling statement due to statement
-- timeout" on the Leads dashboard when no date filter is applied ("Todos").
--
-- Root cause (confirmed via EXPLAIN ANALYZE against production data, org
-- Grupo BMLar, 5532 leads, 2026-08-19): of ~4.1s total execution time for
-- get_lead_dashboard_stats_scoped(), 3.72s (90%) is spent in a single node —
-- the CTE Scan on snapshot_resolved_stage_join, which calls
-- compute_lead_stage_v2() (itself calling evaluate_lead_signals_v2(), 13
-- LATERAL joins) once per lead in scope. This is a pre-existing N+1-in-SQL
-- pattern, not something changed in this session. It only started timing
-- out now because a separate, already-shipped fix (dashboard "Todos" no
-- longer silently applying a hidden last-30-days default) means "Todos"
-- now legitimately scans the full lead set instead of a small recent
-- subset — pushing real execution time (~4.1s) uncomfortably close to the
-- `authenticated` role's statement_timeout (8s, see `ALTER ROLE
-- authenticated SET statement_timeout = '8s'`), and over it under real
-- production latency/load.
--
-- This migration does NOT touch compute_lead_stage_v2/evaluate_lead_signals_v2
-- or any business logic — rewriting that per-row computation to be set-based
-- would be the proper long-term fix, but is too invasive to do under time
-- pressure for a function used across the whole Leads module (stage
-- resolution, automation triggers, etc.), not just this dashboard. Recommended
-- as a follow-up, separately reviewed and tested.
--
-- Immediate, zero-behavior-risk mitigation: raise statement_timeout only for
-- this specific function (via a function-level GUC override, ALTER FUNCTION
-- ... SET), leaving the `authenticated` role's 8s default untouched for every
-- other query. 25s gives ~6x headroom over the observed 4.1s.

ALTER FUNCTION public.get_lead_dashboard_stats_scoped(
  uuid, boolean, text, uuid, uuid, text, uuid, uuid, boolean, text, boolean,
  text, boolean, text, timestamp with time zone, timestamp with time zone, boolean
) SET statement_timeout TO '25s';
