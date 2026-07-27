-- Right to Erasure (RGPD Art. 17) — request/approval/execution pipeline.
-- Forward-only migration. Do not fold into the baseline.
--
-- Design (see vault/ficheiros/infraestrutura-seguranca/rgpd-seguranca-apresentacao.html,
-- slide-rgpd-erasure, for the audit finding that motivated this):
--
--   1. A business user files a request against one anew_entities.id (a person:
--      lead/contact/client). Append-only, auditable, mirrors support_access_log.
--   2. An org super_admin (or system_admin) explicitly approves or rejects it.
--      The requester can never approve their own request (storage-level check,
--      like support_access_log_no_self_approval).
--   3. Only on approval does a SECURITY DEFINER RPC — callable exclusively by
--      service_role via the decide-data-erasure Edge Function — execute the
--      erasure. It decides DELETE vs ANONYMIZE per entity:
--        - DELETE: entity has zero rows in anew_leads / anew_contacts /
--          anew_clients / deals / quotes / proposals / client_contracts /
--          client_portal_users. Nothing fiscally or contractually relevant
--          depends on it, so the entity and its satellite PII rows are removed.
--        - ANONYMIZE: entity has at least one such row. Those rows (and the
--          fiscal/contractual retention they represent) are left completely
--          untouched. Only the identification fields on anew_entities and its
--          contact-channel satellites (emails, phones, addresses, fiscal link)
--          are scrubbed; the transactional/fiscal record itself survives.
--
-- No table other than anew_entities and its direct satellites is ever written
-- by this migration's functions. Proposals, quotes, deals and client_contracts
-- are read-only inputs to the decision and are never mutated or deleted.

-- ============================================================
-- 1. data_erasure_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS public.data_erasure_requests (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  entity_id         uuid,                  -- anew_entities.id (subject of the request); nulled once hard-deleted
  entity_snapshot   jsonb       NOT NULL DEFAULT '{}'::jsonb, -- display_name/type at request time, kept even after deletion
  organization_id   uuid        NOT NULL,   -- resolved server-side from the entity's org link, never client-supplied
  requested_by      uuid        NOT NULL,   -- anew_users.id of the filer
  reason            text        NOT NULL CHECK (length(reason) >= 10),
  status            text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
  decision_mode     text        CHECK (decision_mode IN ('deleted', 'anonymized')),
  requested_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid,                   -- anew_users.id of the approving/rejecting super_admin
  rejection_reason  text,
  executed_at       timestamptz,
  result            jsonb,                  -- row counts touched, never the PII values themselves
  error_message     text,

  CONSTRAINT data_erasure_requests_pkey PRIMARY KEY (id),
  CONSTRAINT data_erasure_requests_entity_fk
    FOREIGN KEY (entity_id) REFERENCES public.anew_entities (id) ON DELETE SET NULL,
  CONSTRAINT data_erasure_requests_org_fk
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id),
  CONSTRAINT data_erasure_requests_requested_by_fk
    FOREIGN KEY (requested_by) REFERENCES public.anew_users (id),
  CONSTRAINT data_erasure_requests_reviewed_by_fk
    FOREIGN KEY (reviewed_by) REFERENCES public.anew_users (id),

  -- Reviewed fields must be set iff a decision was made.
  CONSTRAINT data_erasure_requests_review_consistency CHECK (
    (status IN ('approved', 'rejected', 'completed', 'failed') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
    OR status = 'pending'
  ),
  -- Execution fields must be set iff the request reached a terminal execution state.
  CONSTRAINT data_erasure_requests_execution_consistency CHECK (
    (status IN ('completed', 'failed') AND executed_at IS NOT NULL)
    OR status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT data_erasure_requests_completed_has_mode CHECK (
    (status = 'completed' AND decision_mode IS NOT NULL) OR status <> 'completed'
  ),
  -- No self-approval, ever.
  CONSTRAINT data_erasure_requests_no_self_review CHECK (
    reviewed_by IS NULL OR reviewed_by <> requested_by
  )
);

CREATE INDEX IF NOT EXISTS idx_data_erasure_requests_entity
  ON public.data_erasure_requests (entity_id);

CREATE INDEX IF NOT EXISTS idx_data_erasure_requests_org_status
  ON public.data_erasure_requests (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_data_erasure_requests_requested_by
  ON public.data_erasure_requests (requested_by);

-- Partial unique index: only one open (pending/approved) request per entity at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_erasure_requests_one_open_per_entity
  ON public.data_erasure_requests (entity_id)
  WHERE status IN ('pending', 'approved');

ALTER TABLE public.data_erasure_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.data_erasure_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.data_erasure_requests TO authenticated;
GRANT ALL ON TABLE public.data_erasure_requests TO service_role;

-- SELECT: system_admin sees all; everyone else limited to their visible orgs.
DROP POLICY IF EXISTS data_erasure_requests_select ON public.data_erasure_requests;
CREATE POLICY data_erasure_requests_select
  ON public.data_erasure_requests
  FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin((SELECT auth.uid()))
    OR organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
  );

-- INSERT: caller must be able to see the entity's org, status must start
-- 'pending', requested_by must match the caller's own anew_users row, and the
-- reviewed/executed columns must all be untouched.
DROP POLICY IF EXISTS data_erasure_requests_insert ON public.data_erasure_requests;
CREATE POLICY data_erasure_requests_insert
  ON public.data_erasure_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND requested_by IN (
      SELECT id FROM public.anew_users WHERE auth_user_id = (SELECT auth.uid())
    )
    AND organization_id IN (
      SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
    )
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
    AND executed_at IS NULL
    AND decision_mode IS NULL
  );

-- Append-only for authenticated users: approvals/rejections/execution are
-- written exclusively by service_role via the decide-data-erasure Edge Function.
DROP POLICY IF EXISTS data_erasure_requests_no_update ON public.data_erasure_requests;
CREATE POLICY data_erasure_requests_no_update
  ON public.data_erasure_requests
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS data_erasure_requests_no_delete ON public.data_erasure_requests;
CREATE POLICY data_erasure_requests_no_delete
  ON public.data_erasure_requests
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);

COMMENT ON TABLE public.data_erasure_requests IS
  'Auditable RGPD Art. 17 (right to erasure) request/approval/execution log. '
  'Append-only from the client; decisions and execution are written only by '
  'service_role through the decide-data-erasure Edge Function.';

-- ============================================================
-- 2. preview_entity_erasure(p_entity_id) — read-only decision preview
-- ============================================================
-- Returns counts of rows that reference this entity across every table whose
-- FK to anew_entities is either RESTRICT (anew_leads/anew_contacts/anew_clients)
-- or would otherwise represent a fiscal/contractual record we must not delete
-- (deals/quotes/proposals/client_contracts/client_portal_users). Any non-zero
-- count forces the ANONYMIZE path instead of DELETE. Visibility is checked
-- with the same public.can_see_entity() predicate used everywhere else in the
-- app, so this cannot be used to probe entities outside the caller's scope.

CREATE OR REPLACE FUNCTION public.preview_entity_erasure(p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_leads            integer;
  v_contacts         integer;
  v_clients          integer;
  v_deals            integer;
  v_quotes           integer;
  v_proposals        integer;
  v_client_contracts integer;
  v_portal_users     integer;
  v_total            integer;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'p_entity_id is required';
  END IF;

  IF NOT public.is_system_admin((SELECT auth.uid()))
     AND NOT public.can_see_entity(p_entity_id, (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Entity not visible to caller' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_leads            FROM public.anew_leads            WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_contacts         FROM public.anew_contacts         WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_clients          FROM public.anew_clients          WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_deals            FROM public.deals                 WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_quotes           FROM public.quotes                WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_proposals        FROM public.proposals             WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_client_contracts FROM public.client_contracts      WHERE entity_id = p_entity_id;
  SELECT count(*) INTO v_portal_users     FROM public.client_portal_users   WHERE entity_id = p_entity_id;

  v_total := v_leads + v_contacts + v_clients + v_deals + v_quotes
           + v_proposals + v_client_contracts + v_portal_users;

  RETURN jsonb_build_object(
    'entity_id',           p_entity_id,
    'leads',               v_leads,
    'contacts',            v_contacts,
    'clients',             v_clients,
    'deals',               v_deals,
    'quotes',              v_quotes,
    'proposals',           v_proposals,
    'client_contracts',    v_client_contracts,
    'client_portal_users', v_portal_users,
    'blocking_total',      v_total,
    'mode',                CASE WHEN v_total = 0 THEN 'delete' ELSE 'anonymize' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_entity_erasure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_entity_erasure(uuid) TO authenticated, service_role;

-- ============================================================
-- 3. execute_entity_erasure(p_request_id) — service_role only
-- ============================================================
-- Performs the actual DELETE or ANONYMIZE for an approved request. Never
-- callable by authenticated users directly — the decide-data-erasure Edge
-- Function is the only caller, and only after verifying an org super_admin
-- (or system_admin) other than the requester approved the request.

CREATE OR REPLACE FUNCTION public.execute_entity_erasure(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request               public.data_erasure_requests%ROWTYPE;
  v_blocking_total         integer;
  v_preview                jsonb;
  v_mode                   text;
  v_address_ids            uuid[];
  v_fiscal_ids             uuid[];
  v_emails_deleted         integer := 0;
  v_phones_deleted         integer := 0;
  v_addr_links_deleted     integer := 0;
  v_addr_rows_deleted      integer := 0;
  v_fiscal_links_deleted   integer := 0;
  v_fiscal_rows_deleted    integer := 0;
  v_history_deleted        integer := 0;
  v_relationships_deleted  integer := 0;
  v_roles_deleted          integer := 0;
  v_org_links_deleted      integer := 0;
  v_entity_deleted         boolean := false;
BEGIN
  SELECT * INTO v_request
  FROM public.data_erasure_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Erasure request % not found', p_request_id;
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Erasure request % is not in approved state (current: %)', p_request_id, v_request.status;
  END IF;

  IF v_request.entity_id IS NULL THEN
    RAISE EXCEPTION 'Erasure request % has no entity to act on', p_request_id;
  END IF;

  SELECT
    (SELECT count(*) FROM public.anew_leads          WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.anew_contacts       WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.anew_clients        WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.deals               WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.quotes              WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.proposals           WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.client_contracts    WHERE entity_id = v_request.entity_id) +
    (SELECT count(*) FROM public.client_portal_users WHERE entity_id = v_request.entity_id)
  INTO v_blocking_total;

  v_preview := jsonb_build_object('blocking_total', v_blocking_total);
  v_mode := CASE WHEN v_blocking_total = 0 THEN 'delete' ELSE 'anonymize' END;

  -- ── Contact-channel satellites: always scrubbed regardless of mode ───────
  WITH deleted AS (
    DELETE FROM public.anew_entity_emails WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_emails_deleted FROM deleted;

  WITH deleted AS (
    DELETE FROM public.anew_entity_phones WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_phones_deleted FROM deleted;

  SELECT array_agg(address_id) INTO v_address_ids
  FROM public.anew_entity_addresses WHERE entity_id = v_request.entity_id;

  WITH deleted AS (
    DELETE FROM public.anew_entity_addresses WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_addr_links_deleted FROM deleted;

  IF v_address_ids IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.anew_addresses a
      WHERE a.id = ANY (v_address_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.address_id = a.id
        )
      RETURNING 1
    ) SELECT count(*) INTO v_addr_rows_deleted FROM deleted;
  END IF;

  SELECT array_agg(fiscal_entity_id) INTO v_fiscal_ids
  FROM public.anew_entity_fiscal_entities WHERE entity_id = v_request.entity_id;

  WITH deleted AS (
    DELETE FROM public.anew_entity_fiscal_entities WHERE entity_id = v_request.entity_id RETURNING 1
  ) SELECT count(*) INTO v_fiscal_links_deleted FROM deleted;

  IF v_fiscal_ids IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.fiscal_entities fe
      WHERE fe.id = ANY (v_fiscal_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.anew_entity_fiscal_entities efe WHERE efe.fiscal_entity_id = fe.id
        )
      RETURNING 1
    ) SELECT count(*) INTO v_fiscal_rows_deleted FROM deleted;
  END IF;

  IF v_mode = 'delete' THEN
    -- No lead/contact/client/deal/quote/proposal/contract/portal-user row
    -- references this entity — safe to remove it entirely.

    WITH deleted AS (
      DELETE FROM public.anew_entity_history WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_history_deleted FROM deleted;

    WITH deleted AS (
      DELETE FROM public.anew_entity_relationships
      WHERE from_entity_id = v_request.entity_id OR to_entity_id = v_request.entity_id
      RETURNING 1
    ) SELECT count(*) INTO v_relationships_deleted FROM deleted;

    WITH deleted AS (
      DELETE FROM public.anew_entity_roles WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_roles_deleted FROM deleted;

    WITH deleted AS (
      DELETE FROM public.anew_entity_org_links WHERE entity_id = v_request.entity_id RETURNING 1
    ) SELECT count(*) INTO v_org_links_deleted FROM deleted;

    -- contact_tags and entity_interactions cascade automatically (ON DELETE CASCADE).
    DELETE FROM public.anew_entities WHERE id = v_request.entity_id;
    v_entity_deleted := true;

  ELSE
    -- At least one fiscal/contractual record depends on this entity — the
    -- entity row itself, and every proposal/quote/deal/contract/lead/contact/
    -- client row pointing at it, are left completely untouched. Only the
    -- identification fields are scrubbed.
    UPDATE public.anew_entities
    SET display_name = 'Titular de Dados Anonimizado',
        first_name   = NULL,
        last_name    = NULL,
        status       = 'anonymized',
        updated_at   = now()
    WHERE id = v_request.entity_id;
  END IF;

  UPDATE public.data_erasure_requests
  SET status        = 'completed',
      decision_mode = CASE WHEN v_mode = 'delete' THEN 'deleted' ELSE 'anonymized' END,
      executed_at   = now(),
      result        = jsonb_build_object(
        'preview',                v_preview,
        'emails_deleted',         v_emails_deleted,
        'phones_deleted',         v_phones_deleted,
        'address_links_deleted',  v_addr_links_deleted,
        'address_rows_deleted',   v_addr_rows_deleted,
        'fiscal_links_deleted',   v_fiscal_links_deleted,
        'fiscal_rows_deleted',    v_fiscal_rows_deleted,
        'history_deleted',        v_history_deleted,
        'relationships_deleted',  v_relationships_deleted,
        'roles_deleted',          v_roles_deleted,
        'org_links_deleted',      v_org_links_deleted,
        'entity_deleted',         v_entity_deleted
      ),
      error_message = NULL
  WHERE id = p_request_id;

  RETURN (SELECT result FROM public.data_erasure_requests WHERE id = p_request_id);

EXCEPTION WHEN OTHERS THEN
  UPDATE public.data_erasure_requests
  SET status        = 'failed',
      executed_at   = now(),
      error_message = SQLERRM
  WHERE id = p_request_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_entity_erasure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_entity_erasure(uuid) TO service_role;

COMMENT ON FUNCTION public.execute_entity_erasure(uuid) IS
  'Executes an approved RGPD Art. 17 erasure request. Only callable by '
  'service_role via the decide-data-erasure Edge Function, never directly '
  'by authenticated users.';
