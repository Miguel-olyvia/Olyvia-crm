-- Break-Glass Support Access: audit log table, helper function, and RESTRICTIVE
-- policy adjustment so an approved support session unlocks PII for that org.
--
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. support_access_log table + indexes + RLS
--   2. has_active_support_access() helper
--   3. Rebuild system_admin_pii_default_deny on every PII table to honour an
--      active support session (mirrors the group structure of
--      20260622170000_fix_system_admin_pii_org_scoped_access.sql but adds the
--      has_active_support_access() escape hatch).

-- ============================================================
-- 1. support_access_log
-- ============================================================

CREATE TABLE IF NOT EXISTS public.support_access_log (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id    uuid        NOT NULL,   -- anew_users.id of the requesting sysadmin
  target_org_id    uuid        NOT NULL,   -- anew_organizations.id being accessed
  reason           text        NOT NULL CHECK (length(reason) >= 10),
  duration_hours   int         NOT NULL CHECK (duration_hours BETWEEN 1 AND 8),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected','expired')),
  requested_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      uuid,                  -- anew_users.id of the approving super_admin
  expires_at       timestamptz,           -- populated on approval: reviewed_at + duration_hours

  CONSTRAINT support_access_log_pkey PRIMARY KEY (id),
  CONSTRAINT support_access_log_admin_user_fk
    FOREIGN KEY (admin_user_id) REFERENCES public.anew_users (id),
  CONSTRAINT support_access_log_target_org_fk
    FOREIGN KEY (target_org_id) REFERENCES public.anew_organizations (id),
  CONSTRAINT support_access_log_reviewed_by_fk
    FOREIGN KEY (reviewed_by) REFERENCES public.anew_users (id),

  -- Enforce audit-trail integrity: reviewed fields must be set iff decided.
  CONSTRAINT support_access_log_review_consistency CHECK (
    (status IN ('approved','rejected') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    OR status NOT IN ('approved','rejected')
  ),
  -- Enforce that approved sessions always have an expiry.
  CONSTRAINT support_access_log_expires_consistency CHECK (
    (status = 'approved' AND expires_at IS NOT NULL)
    OR status <> 'approved'
  )
);

-- Indexes on the main filter axes including reviewed_by for audit queries.
CREATE INDEX IF NOT EXISTS support_access_log_admin_status_idx
  ON public.support_access_log (admin_user_id, status);

CREATE INDEX IF NOT EXISTS support_access_log_org_status_idx
  ON public.support_access_log (target_org_id, status);

CREATE INDEX IF NOT EXISTS support_access_log_reviewed_by_idx
  ON public.support_access_log (reviewed_by);

ALTER TABLE public.support_access_log ENABLE ROW LEVEL SECURITY;

-- sysadmin can see all rows (platform-level oversight).
-- super_admin can see only rows that target their own org(s).
CREATE POLICY support_access_log_select
  ON public.support_access_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin((SELECT auth.uid()))
    OR target_org_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT restricted: only system_admins can file requests, status must be
-- 'pending', and admin_user_id must match the calling user's anew_users row.
-- Approvals/rejections go through service_role (Edge Function) only.
CREATE POLICY support_access_log_insert
  ON public.support_access_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND public.is_system_admin((SELECT auth.uid()))
    AND admin_user_id IN (
      SELECT id FROM public.anew_users
      WHERE auth_user_id = (SELECT auth.uid())
    )
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND expires_at  IS NULL
  );

-- Explicitly deny UPDATE and DELETE for authenticated users — append-only.
-- Approvals are written exclusively by the service_role Edge Function.
CREATE POLICY support_access_log_no_update
  ON public.support_access_log
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY support_access_log_no_delete
  ON public.support_access_log
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- 2. has_active_support_access(p_org_id uuid)
-- ============================================================
-- Returns true when auth.uid() has an approved, non-expired support session
-- for p_org_id.  Called inside RESTRICTIVE USING clauses, so it must be STABLE
-- SECURITY DEFINER and resolve auth.uid() once at call time.

CREATE OR REPLACE FUNCTION public.has_active_support_access(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_access_log sal
    JOIN public.anew_users au
      ON au.id = sal.admin_user_id
    WHERE au.auth_user_id = (SELECT auth.uid())
      AND sal.target_org_id = p_org_id
      AND sal.status        = 'approved'
      AND sal.expires_at    > now()
  )
$$;

REVOKE ALL ON FUNCTION public.has_active_support_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_support_access(uuid)
  TO authenticated, service_role;

-- ============================================================
-- 3. Rebuild system_admin_pii_default_deny on all PII tables
--
-- Pattern: the existing USING clause from 20260622170000 is preserved
-- verbatim but a new OR branch is added at the end:
--
--   OR (
--     public.is_system_admin((SELECT auth.uid()))
--     AND public.has_active_support_access(<org expression>)
--   )
--
-- WITH CHECK is kept identical to USING (same semantics as before — no writes
-- via the support channel; the policy only opens SELECT for sysadmins).
-- ============================================================

-- ── Group 1: direct organization_id + root_organization_id ─────────────────
-- Tables: anew_leads, anew_contacts, anew_clients, deals, quotes,
--         proposals, client_contracts, entity_interactions
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'anew_leads', 'anew_contacts', 'anew_clients', 'deals', 'quotes',
    'proposals', 'client_contracts', 'entity_interactions'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format(
        $pol$
        DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%1$I;
        CREATE POLICY system_admin_pii_default_deny ON public.%1$I
          AS RESTRICTIVE FOR ALL TO authenticated
          USING (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            OR (
              public.is_system_admin((SELECT auth.uid()))
              AND (
                public.has_active_support_access(organization_id)
                OR public.has_active_support_access(root_organization_id)
              )
            )
          )
          WITH CHECK (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
          )
        $pol$,
        t
      );
    END IF;
  END LOOP;
END $$;

-- ── Group 2: only organization_id (no root_organization_id) ────────────────
-- Tables: contract_documents, lead_contact_history, anew_entity_roles
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_documents', 'lead_contact_history', 'anew_entity_roles']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format(
        $pol$
        DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%1$I;
        CREATE POLICY system_admin_pii_default_deny ON public.%1$I
          AS RESTRICTIVE FOR ALL TO authenticated
          USING (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            OR (
              public.is_system_admin((SELECT auth.uid()))
              AND public.has_active_support_access(organization_id)
            )
          )
          WITH CHECK (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
          )
        $pol$,
        t
      );
    END IF;
  END LOOP;
END $$;

-- ── Group 3: anew_entity_relationships — only root_organization_id ──────────
DO $$
BEGIN
  IF to_regclass('public.anew_entity_relationships') IS NOT NULL THEN
    DROP POLICY IF EXISTS system_admin_pii_default_deny
      ON public.anew_entity_relationships;
    CREATE POLICY system_admin_pii_default_deny
      ON public.anew_entity_relationships
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
        OR (
          public.is_system_admin((SELECT auth.uid()))
          AND public.has_active_support_access(root_organization_id)
        )
      )
      WITH CHECK (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      );
  END IF;
END $$;

-- ── Group 4: entity-detail tables — org via anew_entity_roles JOIN ──────────
-- Tables: anew_entity_addresses, anew_entity_emails,
--         anew_entity_history, anew_entity_phones
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'anew_entity_addresses', 'anew_entity_emails',
    'anew_entity_history', 'anew_entity_phones'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format(
        $pol$
        DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%1$I;
        CREATE POLICY system_admin_pii_default_deny ON public.%1$I
          AS RESTRICTIVE FOR ALL TO authenticated
          USING (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR EXISTS (
              SELECT 1
              FROM public.anew_entity_roles er
              WHERE er.entity_id   = %1$I.entity_id
                AND er.deleted_at  IS NULL
                AND er.organization_id IN (
                  SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
                )
            )
            OR (
              public.is_system_admin((SELECT auth.uid()))
              AND EXISTS (
                SELECT 1
                FROM public.anew_entity_roles er
                WHERE er.entity_id  = %1$I.entity_id
                  AND er.deleted_at IS NULL
                  AND public.has_active_support_access(er.organization_id)
              )
            )
          )
          WITH CHECK (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR EXISTS (
              SELECT 1
              FROM public.anew_entity_roles er
              WHERE er.entity_id   = %1$I.entity_id
                AND er.deleted_at  IS NULL
                AND er.organization_id IN (
                  SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
                )
            )
          )
        $pol$,
        t
      );
    END IF;
  END LOOP;
END $$;

-- ── Group 5: anew_entities — org via anew_entity_roles (id = entity) ────────
DO $$
BEGIN
  IF to_regclass('public.anew_entities') IS NOT NULL THEN
    DROP POLICY IF EXISTS system_admin_pii_default_deny
      ON public.anew_entities;
    CREATE POLICY system_admin_pii_default_deny
      ON public.anew_entities
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.anew_entity_roles er
          WHERE er.entity_id   = anew_entities.id
            AND er.deleted_at  IS NULL
            AND er.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
        )
        OR (
          public.is_system_admin((SELECT auth.uid()))
          AND EXISTS (
            SELECT 1
            FROM public.anew_entity_roles er
            WHERE er.entity_id  = anew_entities.id
              AND er.deleted_at IS NULL
              AND public.has_active_support_access(er.organization_id)
          )
        )
      )
      WITH CHECK (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.anew_entity_roles er
          WHERE er.entity_id   = anew_entities.id
            AND er.deleted_at  IS NULL
            AND er.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
        )
      );
  END IF;
END $$;

-- ── Group 6: anew_addresses — org via entity_addresses → entity_roles ────────
DO $$
BEGIN
  IF to_regclass('public.anew_addresses') IS NOT NULL THEN
    DROP POLICY IF EXISTS system_admin_pii_default_deny
      ON public.anew_addresses;
    CREATE POLICY system_admin_pii_default_deny
      ON public.anew_addresses
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.anew_entity_addresses ea
          JOIN public.anew_entity_roles er ON er.entity_id = ea.entity_id
          WHERE ea.address_id  = anew_addresses.id
            AND er.deleted_at  IS NULL
            AND er.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
        )
        OR (
          public.is_system_admin((SELECT auth.uid()))
          AND EXISTS (
            SELECT 1
            FROM public.anew_entity_addresses ea
            JOIN public.anew_entity_roles er ON er.entity_id = ea.entity_id
            WHERE ea.address_id = anew_addresses.id
              AND er.deleted_at IS NULL
              AND public.has_active_support_access(er.organization_id)
          )
        )
      )
      WITH CHECK (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.anew_entity_addresses ea
          JOIN public.anew_entity_roles er ON er.entity_id = ea.entity_id
          WHERE ea.address_id  = anew_addresses.id
            AND er.deleted_at  IS NULL
            AND er.organization_id IN (
              SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
            )
        )
      );
  END IF;
END $$;

-- ── Group 7: client_contract_parties — org via client_contracts ─────────────
DO $$
BEGIN
  IF to_regclass('public.client_contract_parties') IS NOT NULL THEN
    DROP POLICY IF EXISTS system_admin_pii_default_deny
      ON public.client_contract_parties;
    CREATE POLICY system_admin_pii_default_deny
      ON public.client_contract_parties
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.client_contracts cc
          WHERE cc.id = client_contract_parties.contract_id
            AND (
              cc.organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              OR cc.root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            )
        )
        OR (
          public.is_system_admin((SELECT auth.uid()))
          AND EXISTS (
            SELECT 1
            FROM public.client_contracts cc
            WHERE cc.id = client_contract_parties.contract_id
              AND (
                public.has_active_support_access(cc.organization_id)
                OR public.has_active_support_access(cc.root_organization_id)
              )
          )
        )
      )
      WITH CHECK (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.client_contracts cc
          WHERE cc.id = client_contract_parties.contract_id
            AND (
              cc.organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              OR cc.root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            )
        )
      );
  END IF;
END $$;

-- ── Group 8: proposal_items — org via proposals ──────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.proposal_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS system_admin_pii_default_deny
      ON public.proposal_items;
    CREATE POLICY system_admin_pii_default_deny
      ON public.proposal_items
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.proposals p
          WHERE p.id = proposal_items.proposal_id
            AND (
              p.organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              OR p.root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            )
        )
        OR (
          public.is_system_admin((SELECT auth.uid()))
          AND EXISTS (
            SELECT 1
            FROM public.proposals p
            WHERE p.id = proposal_items.proposal_id
              AND (
                public.has_active_support_access(p.organization_id)
                OR public.has_active_support_access(p.root_organization_id)
              )
          )
        )
      )
      WITH CHECK (
        NOT public.is_system_admin((SELECT auth.uid()))
        OR EXISTS (
          SELECT 1
          FROM public.proposals p
          WHERE p.id = proposal_items.proposal_id
            AND (
              p.organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              OR p.root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            )
        )
      );
  END IF;
END $$;

-- ── Group 9: quote_lines, quote_fees — org via quotes ───────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_lines', 'quote_fees']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format(
        $pol$
        DROP POLICY IF EXISTS system_admin_pii_default_deny ON public.%1$I;
        CREATE POLICY system_admin_pii_default_deny ON public.%1$I
          AS RESTRICTIVE FOR ALL TO authenticated
          USING (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR EXISTS (
              SELECT 1
              FROM public.quotes q
              WHERE q.id = %1$I.quote_id
                AND (
                  q.organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
                  OR q.root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
                )
            )
            OR (
              public.is_system_admin((SELECT auth.uid()))
              AND EXISTS (
                SELECT 1
                FROM public.quotes q
                WHERE q.id = %1$I.quote_id
                  AND (
                    public.has_active_support_access(q.organization_id)
                    OR public.has_active_support_access(q.root_organization_id)
                  )
              )
            )
          )
          WITH CHECK (
            NOT public.is_system_admin((SELECT auth.uid()))
            OR EXISTS (
              SELECT 1
              FROM public.quotes q
              WHERE q.id = %1$I.quote_id
                AND (
                  q.organization_id      IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
                  OR q.root_organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
                )
            )
          )
        $pol$,
        t
      );
    END IF;
  END LOOP;
END $$;
