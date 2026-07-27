-- Services RLS Fixes — Security Review Wave
-- 2026-06-29 | Module: Services | Wave: security-review gap closure
-- Forward-only migration. Do not fold into the baseline.
--
-- This migration closes four security gaps identified in a post-Wave-1 review:
--
--   Fix 1 — service_prices SELECT: remove bare OR-branch that allowed any org
--            member to read all prices without a permission check. The Wave 0
--            migration (20260702000000) inadvertently preserved this branch.
--            New policy requires has_anew_permission('services.view') for every
--            SELECT path, matching the gate on every other services-module table.
--
--   Fix 2 — service_categories UPDATE: the baseline policy has USING but no
--            WITH CHECK clause, meaning a row that satisfies USING can be moved
--            to any organization after the fact. Add WITH CHECK (same condition)
--            to prevent lateral-move attacks.
--
--   Fix 3 — services SELECT: the baseline policy has no has_anew_permission()
--            gate. Any org member could enumerate all services. Replace with a
--            policy consistent with service_prices, service_fee_types, etc.
--
--   Fix 4 — service_prices dual-trigger ordering: service_price_change_trigger
--            fires before trg_audit_service_prices (alphabetically). If
--            log_service_price_change() raises, the audit row (entity_audit_log)
--            is silently lost. Fix by wrapping the function body in
--            EXCEPTION WHEN OTHERS THEN NULL so it can never block downstream
--            triggers or the originating DML.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql
--   20260702000000_services_security_fixes.sql  (Wave 0)
--   20260702010000_services_audit_triggers.sql  (Wave 1)
--
-- Conventions (matching the rest of the services module):
--   • has_anew_permission((SELECT auth.uid()), 'permission') — correlated-subquery
--     pattern from 20260623150000_fix_rls_auth_uid_correlated_subquery.sql
--   • is_system_admin_user((SELECT auth.uid())) — system-admin bypass on every policy
--   • SECURITY DEFINER + SET search_path = public on all trigger functions
--   • IF EXISTS / IF NOT EXISTS guards throughout for idempotence


-- ============================================================
-- Fix 1 — service_prices SELECT: remove bare OR-branch
-- ============================================================
-- Wave 0 (20260702000000) replaced the legacy has_permission() policies but
-- preserved a third OR-branch in the SELECT body (lines 155–164 of that file)
-- that allowed any org-visible user to read prices without 'services.view':
--
--   OR (
--     EXISTS (
--       SELECT 1 FROM public.services s
--       WHERE s.id = service_prices.service_id
--         AND s.organization_id IN (
--                SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
--              )
--     )
--   )
--
-- Remove that branch. SELECT now requires either is_system_admin_user OR
-- (has_anew_permission('services.view') AND org-visibility), consistent with
-- service_price_history_select, service_fee_types_select, etc.

DROP POLICY IF EXISTS service_prices_select ON public.service_prices;

CREATE POLICY service_prices_select
  ON public.service_prices
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.view')
      AND EXISTS (
        SELECT 1
        FROM   public.services s
        WHERE  s.id = service_prices.service_id
          AND  s.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );


-- ============================================================
-- Fix 2 — service_categories UPDATE: add WITH CHECK clause
-- ============================================================
-- Baseline policy (20260615130000, line 27762) has USING but no WITH CHECK.
-- Without WITH CHECK an org member with service_categories.edit could UPDATE
-- a row's organization_id to move a category into a different org that they
-- also have visibility over (lateral-move attack).
-- The WITH CHECK condition is identical to USING — no functional change for
-- legitimate edits, closes the lateral-move gap.
--
-- The policy name matches the baseline name exactly for a clean DROP + CREATE.

DROP POLICY IF EXISTS service_categories_update ON public.service_categories;
DROP POLICY IF EXISTS "service_categories_update" ON public.service_categories;

CREATE POLICY service_categories_update
  ON public.service_categories
  FOR UPDATE
  TO authenticated
  USING (
    (
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit')
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    (
      (parent_id IS NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_categories.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
    OR (
      (parent_id IS NOT NULL)
      AND public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.edit')
      AND public.get_service_category_org_id(parent_id) IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- Fix 3 — services SELECT: add permission gate
-- ============================================================
-- Baseline policy (20260615130000, line 27879) allows any org member to SELECT
-- all services with no permission check:
--
--   USING (organization_id IN (SELECT get_user_visible_org_ids(auth.uid())))
--
-- Replace with a policy that requires has_anew_permission('services.view'),
-- matching the guard on service_prices_select, service_price_history_select,
-- service_fee_types_select, and all other services-module read policies.
--
-- is_system_admin_user bypass added for consistency with module-wide pattern.

DROP POLICY IF EXISTS services_select ON public.services;
DROP POLICY IF EXISTS "services_select" ON public.services;

CREATE POLICY services_select
  ON public.services
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.view')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- Fix 4 — service_prices dual-trigger ordering: swallow exceptions
--          in log_service_price_change() so audit row is never lost
-- ============================================================
-- service_price_change_trigger fires before trg_audit_service_prices because
-- Postgres fires AFTER triggers in name order and 's' < 't' alphabetically.
-- If log_service_price_change() raises an unhandled exception, PostgreSQL
-- aborts the statement before fn_audit_service_prices() can run, silently
-- losing the entity_audit_log row for that UPDATE.
--
-- Fix: wrap the INSERT (and any subsidiary logic) in EXCEPTION WHEN OTHERS
-- THEN NULL — the same pattern used in fn_audit_service_prices() and every
-- other audit trigger in this codebase.
--
-- All other behaviour is preserved exactly:
--   • Fires only when OLD.price IS DISTINCT FROM NEW.price
--   • Same INSERT columns and values into service_price_history
--   • GUC-first actor resolution (introduced in Wave 0) retained
--   • SECURITY DEFINER + search_path = public (unchanged)
--   • GRANT / REVOKE pattern (unchanged)

REVOKE ALL ON FUNCTION public.log_service_price_change() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.log_service_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_user_id uuid;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.price IS DISTINCT FROM NEW.price) THEN

    -- GUC-first: honours set_audit_context() called from app-layer (import flows,
    -- service_role RPCs). Falls back to anew_users lookup via auth.uid() for
    -- direct UI sessions where the GUC is not set.
    BEGIN
      v_business_user_id := COALESCE(
        nullif(current_setting('app.audit_user_id', true), '')::uuid,
        (
          SELECT id
          FROM   public.anew_users
          WHERE  auth_user_id = auth.uid()
          LIMIT  1
        )
      );
    EXCEPTION WHEN OTHERS THEN
      v_business_user_id := NULL;
    END;

    BEGIN
      INSERT INTO public.service_price_history (
        service_id, price_type, old_price, new_price, currency, changed_by
      ) VALUES (
        NEW.service_id, NEW.price_type, OLD.price, NEW.price, NEW.currency, v_business_user_id
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log to service_price_history must never block originating DML or prevent
      -- downstream triggers (trg_audit_service_prices → entity_audit_log) from
      -- running. Swallow silently — matches the exception-handling convention of
      -- every audit trigger function in this codebase.
      NULL;
    END;

  END IF;
  RETURN NEW;
END;
$$;

-- Re-apply minimal grants: service_role needs EXECUTE to fire the trigger.
-- Broad grants from the baseline (anon, authenticated) stay revoked per Wave 0.
REVOKE ALL ON FUNCTION public.log_service_price_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_service_price_change() TO service_role;
