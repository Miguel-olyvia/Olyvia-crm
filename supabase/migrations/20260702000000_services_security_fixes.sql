-- Services Security Fixes — Wave 0
-- 2026-07-02 | Module: Services | Wave: 0 (security & schema prerequisites)
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. entity_audit_log SELECT policy — widen to include services.view
--   2. service_price_history — replace SELECT policy + add RESTRICTIVE write-deny policies
--   3. service_prices        — replace all four policies (has_permission → has_anew_permission,
--                              remove unchecked OR-branch on writes)
--   4. service_fee_types     — replace all four policies (has_permission → has_anew_permission,
--                              add WITH CHECK to UPDATE)
--   5. service_organizations — add FKs + indexes + tighten write policies
--   6. log_service_price_change() — fix actor resolution (GUC-first fallback chain)
--
-- Prerequisites: 20260625010000_entity_audit_log.sql (entity_audit_log table + RLS baseline)
--               20260627110000_proposals_security_fixes.sql (entity_audit_log_select widened)
--
-- Notes:
--   • service_price_history RESTRICTIVE deny-write policies do NOT block
--     log_service_price_change() because that trigger is SECURITY DEFINER and
--     runs as the function owner, bypassing RLS entirely. Pattern mirrors
--     entity_audit_log_no_update / entity_audit_log_no_delete from the baseline.
--   • service_organizations FKs use IF NOT EXISTS guards (idempotent).
--   • All (SELECT auth.uid()) subquery pattern is used throughout for
--     consistent per-query evaluation, matching the convention established in
--     20260623150000_fix_rls_auth_uid_correlated_subquery.sql.


-- ============================================================
-- 1. entity_audit_log SELECT policy — add services.view
-- ============================================================
-- The policy set in 20260627110000 requires quotes.manage OR proposals.manage.
-- Service managers who hold only services.view cannot read the services audit
-- trail. Widen to accept services.view as a third qualifying permission.

DROP POLICY IF EXISTS entity_audit_log_select ON public.entity_audit_log;

CREATE POLICY entity_audit_log_select
  ON public.entity_audit_log
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
    AND (
      public.has_anew_permission((SELECT auth.uid()), 'quotes.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'proposals.manage')
      OR public.has_anew_permission((SELECT auth.uid()), 'services.view')
    )
  );


-- ============================================================
-- 2. service_price_history — RLS hardening
-- ============================================================
-- Baseline state: one SELECT policy using has_permission (legacy, no org-scope).
-- No INSERT/UPDATE/DELETE policies — any authenticated user with table access
-- could write directly.
--
-- New state:
--   SELECT  — org-scoped via service_id → services.organization_id +
--             has_anew_permission / is_system_admin_user guard
--   INSERT  — RESTRICTIVE deny (app-layer must never INSERT directly;
--             log_service_price_change() SECURITY DEFINER bypasses this)
--   UPDATE  — RESTRICTIVE deny (append-only functional history table)
--   DELETE  — RESTRICTIVE deny (append-only functional history table)

DROP POLICY IF EXISTS "Users can view service price history" ON public.service_price_history;

CREATE POLICY service_price_history_select
  ON public.service_price_history
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.view')
      AND (
        EXISTS (
          SELECT 1
          FROM   public.services s
          WHERE  s.id = service_price_history.service_id
            AND  s.organization_id IN (
                   SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
                 )
        )
      )
    )
  );

-- Deny direct INSERT from application layer (trigger writes bypass via SECURITY DEFINER).
CREATE POLICY service_price_history_no_direct_insert
  ON public.service_price_history
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Append-only — deny UPDATE.
CREATE POLICY service_price_history_no_update
  ON public.service_price_history
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Append-only — deny DELETE.
CREATE POLICY service_price_history_no_delete
  ON public.service_price_history
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);


-- ============================================================
-- 3. service_prices — replace all four RLS policies
-- ============================================================
-- Baseline problems:
--   a) All four policies use has_permission() (legacy).
--   b) SELECT/UPDATE/DELETE have an unchecked OR-branch that allows any org
--      member to read/write prices without an explicit services.* permission.
--   c) UPDATE policy has USING + WITH CHECK but both bodies are identical —
--      preserved, now using has_anew_permission throughout.
--
-- Fix: require explicit has_anew_permission for every write path in addition
-- to org-visibility. The SELECT policy retains the org-scoped OR-branch
-- (visibility implies read access) but removes the permissive fallback for
-- write operations.

DROP POLICY IF EXISTS service_prices_select ON public.service_prices;
DROP POLICY IF EXISTS service_prices_insert ON public.service_prices;
DROP POLICY IF EXISTS service_prices_update ON public.service_prices;
DROP POLICY IF EXISTS service_prices_delete ON public.service_prices;

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
    OR (
      EXISTS (
        SELECT 1
        FROM   public.services s
        WHERE  s.id = service_prices.service_id
          AND  s.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  );

CREATE POLICY service_prices_insert
  ON public.service_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = public.current_business_user_id()
    AND (
      public.is_system_admin_user((SELECT auth.uid()))
      OR (
        (
          public.has_anew_permission((SELECT auth.uid()), 'services.create')
          OR public.has_anew_permission((SELECT auth.uid()), 'services.edit')
        )
        AND EXISTS (
          SELECT 1
          FROM   public.services s
          WHERE  s.id = service_prices.service_id
            AND  s.organization_id IN (
                   SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
                 )
        )
      )
    )
  );

CREATE POLICY service_prices_update
  ON public.service_prices
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND EXISTS (
        SELECT 1
        FROM   public.services s
        WHERE  s.id = service_prices.service_id
          AND  s.organization_id IN (
                 SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
               )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.edit')
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

CREATE POLICY service_prices_delete
  ON public.service_prices
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.delete')
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
-- 4. service_fee_types — replace all four RLS policies
-- ============================================================
-- Baseline problems:
--   a) All four policies use has_permission() (legacy) instead of
--      has_anew_permission(), inconsistent with every other services table.
--   b) UPDATE policy has no WITH CHECK clause.
--
-- Fix: has_permission → has_anew_permission throughout; add WITH CHECK to UPDATE.
-- SELECT retains the organization_id IS NULL branch (global/shared fee types
-- must remain readable to all permission-holders regardless of org scope).

DROP POLICY IF EXISTS service_fee_types_select ON public.service_fee_types;
DROP POLICY IF EXISTS service_fee_types_insert ON public.service_fee_types;
DROP POLICY IF EXISTS service_fee_types_update ON public.service_fee_types;
DROP POLICY IF EXISTS service_fee_types_delete ON public.service_fee_types;

CREATE POLICY service_fee_types_select
  ON public.service_fee_types
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'service_fees.view')
      AND (
        organization_id IS NULL
        OR organization_id IN (
          SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
        )
      )
    )
  );

CREATE POLICY service_fee_types_insert
  ON public.service_fee_types
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'service_fees.create')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY service_fee_types_update
  ON public.service_fee_types
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'service_fees.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'service_fees.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY service_fee_types_delete
  ON public.service_fee_types
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'service_fees.delete')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 5. service_organizations — add FKs, indexes, tighten write policies
-- ============================================================
-- Baseline state: service_id and organization_id are NOT NULL but have no FK
-- constraints and no indexes. The only FK is on created_by → anew_users(id).
--
-- Fixes:
--   a) FK service_id → services(id) ON DELETE CASCADE (orphaned associations
--      must not survive service deletion).
--   b) FK organization_id → anew_organizations(id) (referential integrity).
--   c) Index on service_id (mandatory for every FK column; used by audit trigger
--      Strategy A org lookup and by RLS EXISTS joins on related tables).
--   d) Index on organization_id (used by all four RLS policies on this table).
--   e) Write policies tightened: add has_anew_permission('services.edit') gate
--      in front of the existing org-visibility check, so any org member cannot
--      add/remove service-org associations without the explicit permission.
--      SELECT policy left unchanged (visibility implies read access).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_organizations_service_id_fkey'
      AND conrelid = 'public.service_organizations'::regclass
  ) THEN
    ALTER TABLE public.service_organizations
      ADD CONSTRAINT service_organizations_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_organizations_organization_id_fkey'
      AND conrelid = 'public.service_organizations'::regclass
  ) THEN
    ALTER TABLE public.service_organizations
      ADD CONSTRAINT service_organizations_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.anew_organizations(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_organizations_service_id
  ON public.service_organizations (service_id);

CREATE INDEX IF NOT EXISTS idx_service_organizations_organization_id
  ON public.service_organizations (organization_id);

-- Tighten write policies: add explicit permission gate.
-- SELECT policy is intentionally left unchanged.

DROP POLICY IF EXISTS authenticated_insert_service_organizations ON public.service_organizations;
DROP POLICY IF EXISTS authenticated_update_service_organizations ON public.service_organizations;
DROP POLICY IF EXISTS authenticated_delete_service_organizations ON public.service_organizations;

CREATE POLICY authenticated_insert_service_organizations
  ON public.service_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY authenticated_update_service_organizations
  ON public.service_organizations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );

CREATE POLICY authenticated_delete_service_organizations
  ON public.service_organizations
  FOR DELETE
  TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'services.edit')
      AND organization_id IN (
        SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
      )
    )
  );


-- ============================================================
-- 6. log_service_price_change() — fix actor resolution
-- ============================================================
-- Baseline bug: actor resolved exclusively via auth.uid(). Returns NULL in
-- service_role / import / background-RPC contexts where auth.uid() is NULL.
--
-- Fix: COALESCE(app.audit_user_id GUC, anew_users lookup via auth.uid()).
-- GUC-first guarantees the correct actor in flows where set_audit_context()
-- was called (e.g. CSV import via servicesExportImport.ts).
-- auth.uid() fallback preserves correct behaviour for direct UI sessions.
--
-- Everything else in the function body is preserved exactly:
--   • Same trigger condition: OLD.price IS DISTINCT FROM NEW.price
--   • Same INSERT columns and values into service_price_history
--   • SECURITY DEFINER + search_path = public (unchanged)
--
-- The existing service_price_change_trigger registration is NOT touched —
-- only the function body is replaced.

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
    v_business_user_id := COALESCE(
      nullif(current_setting('app.audit_user_id', true), '')::uuid,
      (
        SELECT id
        FROM   public.anew_users
        WHERE  auth_user_id = auth.uid()
        LIMIT  1
      )
    );

    INSERT INTO public.service_price_history (
      service_id, price_type, old_price, new_price, currency, changed_by
    ) VALUES (
      NEW.service_id, NEW.price_type, OLD.price, NEW.price, NEW.currency, v_business_user_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Revoke broad grants from baseline (anon, authenticated had GRANT ALL).
-- service_role needs EXECUTE to fire the trigger.
REVOKE ALL ON FUNCTION public.log_service_price_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_service_price_change() TO service_role;
