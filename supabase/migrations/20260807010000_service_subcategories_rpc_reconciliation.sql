-- Subcategorias (Serviços) — single-log RPC reconciliation (NO new function bodies)
-- 2026-08-07 | Module: Subcategorias (Serviços) / serv_subcategorias
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Why this migration exists (and why it defines no new RPC bodies)
-- ----------------------------------------------------------------
-- Subcategorias (Serviços) and Categorias (Serviços) share ONE physical table,
-- public.service_categories, where a root category has parent_id IS NULL and a subcategory
-- has parent_id IS NOT NULL. Because the two surfaces are the same table, the completed
-- Categorias (Serviços) migration
--
--   20260804010000_service_categories_audit_bypass_and_rpcs.sql
--
-- already created — field-for-field, condition-for-condition — every RPC that
-- src/pages/ServiceSubcategories.tsx invokes today:
--
--   FE call (ServiceSubcategories.tsx)                 RPC (defined in 20260804010000)
--   --------------------------------------------------  --------------------------------
--   handleSubmit → create branch                        rpc_create_service_subcategory  (§2c)
--     supabase.rpc("rpc_create_service_subcategory")      (name, slug, path, description,
--                                                          parent_id, sort_order) → org inherited
--                                                          from parent; 1 INSERT log row
--   handleSubmit → update branch                        rpc_update_service_subcategory  (§2d)
--     supabase.rpc("rpc_update_service_subcategory")      (id, name, slug, path, description,
--                                                          parent_id, sort_order) → org re-inherited
--                                                          from parent; 1 UPDATE log row
--   handleDelete (2 calls today)                        rpc_delete_service_category     (§2e)
--     supabase.rpc("rpc_delete_service_category")         (id) → clears
--                                                          services.service_subcategory_id on
--                                                          soft-deleted rows + DELETE, in ONE
--                                                          transaction, 1 combined DELETE log row
--
-- The two "separate Supabase calls" that the survey flagged for this module are the delete
-- flow's historical UPDATE services + DELETE service_categories. Those are already consolidated
-- inside rpc_delete_service_category (§2e) — a single transaction that sets
-- app.audit_bypass='on', clears the FK on soft-deleted services only, deletes the subcategory,
-- and calls fn_manual_audit_log() exactly ONCE with a combined
-- {service_categories:{...}, services:{...}} diff. The FE (handleDelete) already calls that one
-- RPC, so the N-log-rows-per-action problem is resolved for this module.
--
-- The audit-bypass foundation (app.audit_bypass GUC guard on fn_generic_entity_audit() +
-- fn_manual_audit_log(), plus the guard on the satellite fn_audit_service_category()) already
-- exists — created by 20260719010000_roles_audit_bypass_and_rpcs.sql and, for the satellite
-- trigger, 20260804010000 §1. This migration recreates NONE of it.
--
-- Recreating the three RPC bodies here (CREATE OR REPLACE with identical signatures) would
-- duplicate already-reviewed logic across two files and invite silent drift the next time
-- either file is touched — a maintenance hazard, not a fix. So this migration adds NO new
-- function bodies. Instead it performs a defensive, idempotent RECONCILIATION: it asserts that
-- the three RPCs the serv_subcategorias surface depends on are present with the exact
-- signatures the frontend calls, and fails loudly at apply time if the prerequisite migration
-- has not landed. This gives the module its own forward-only checkpoint in schema_migrations
-- without re-declaring shared code.
--
-- If a future review decides the subcategory RPCs must live in their own dedicated functions
-- (e.g. rpc_delete_service_subcategory as a distinct name), that is a deliberate refactor to be
-- done in a later, clearly-scoped migration — not silently forked here.
--
-- Prerequisites (must already be applied):
--   20260625010000_entity_audit_log.sql             — entity_audit_log + fn_generic_entity_audit()
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass guard + fn_manual_audit_log()
--   20260804010000_service_categories_audit_bypass_and_rpcs.sql
--                                                    — fn_audit_service_category() bypass guard +
--                                                      rpc_create_service_subcategory,
--                                                      rpc_update_service_subcategory,
--                                                      rpc_delete_service_category

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  -- ── 1. rpc_create_service_subcategory(text, text, text, text, uuid, integer) ──────────────
  -- FE: supabase.rpc("rpc_create_service_subcategory",
  --       { p_name, p_slug, p_path, p_description, p_parent_id, p_sort_order })
  IF to_regprocedure(
       'public.rpc_create_service_subcategory(text, text, text, text, uuid, integer)'
     ) IS NULL THEN
    v_missing := v_missing || 'rpc_create_service_subcategory(text,text,text,text,uuid,integer)';
  END IF;

  -- ── 2. rpc_update_service_subcategory(uuid, text, text, text, text, uuid, integer) ─────────
  -- FE: supabase.rpc("rpc_update_service_subcategory",
  --       { p_id, p_name, p_slug, p_path, p_description, p_parent_id, p_sort_order })
  IF to_regprocedure(
       'public.rpc_update_service_subcategory(uuid, text, text, text, text, uuid, integer)'
     ) IS NULL THEN
    v_missing := v_missing || 'rpc_update_service_subcategory(uuid,text,text,text,text,uuid,integer)';
  END IF;

  -- ── 3. rpc_delete_service_category(uuid) ───────────────────────────────────────────────────
  -- FE: supabase.rpc("rpc_delete_service_category", { p_id })
  -- Handles the subcategory delete flow (clears services.service_subcategory_id on soft-deleted
  -- rows + DELETE) in a single transaction with one combined audit log row.
  IF to_regprocedure('public.rpc_delete_service_category(uuid)') IS NULL THEN
    v_missing := v_missing || 'rpc_delete_service_category(uuid)';
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'serv_subcategorias reconciliation failed: prerequisite RPC(s) missing: %. Apply 20260804010000_service_categories_audit_bypass_and_rpcs.sql (which defines the shared service_categories/subcategory RPCs) before this migration.',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'undefined_function';
  END IF;
END;
$$;

-- ── Grant reconciliation (idempotent) ────────────────────────────────────────────────────────
-- Re-assert the exact privilege posture the module relies on, in case a prior partial apply or
-- manual intervention left it inconsistent. These are no-ops when already correct.
REVOKE ALL ON FUNCTION
  public.rpc_create_service_subcategory(text, text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_create_service_subcategory(text, text, text, text, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION
  public.rpc_update_service_subcategory(uuid, text, text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_update_service_subcategory(uuid, text, text, text, text, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION
  public.rpc_delete_service_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.rpc_delete_service_category(uuid) TO authenticated;

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. All three subcategory RPCs resolve to a single function with the FE signatures:
--   SELECT to_regprocedure('public.rpc_create_service_subcategory(text,text,text,text,uuid,integer)'),
--          to_regprocedure('public.rpc_update_service_subcategory(uuid,text,text,text,text,uuid,integer)'),
--          to_regprocedure('public.rpc_delete_service_category(uuid)');
--   -- Expected: three non-null rows.
--
-- 2. Deleting a subcategory that has 2 soft-deleted services referencing it produces exactly
--    ONE entity_audit_log row (combined service_categories + services diff), proving the
--    2-calls-today flow is consolidated (behaviour owned by 20260804010000 §2e):
--   SELECT public.rpc_delete_service_category('<subcategory-uuid>');
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE entity_id = '<subcategory-uuid>' AND operation = 'DELETE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1.
--
-- 3. create/update on a subcategory yields exactly ONE row with organization_id equal to the
--    parent's org (never a caller-supplied value) — see 20260804010000 verification note 3b.
