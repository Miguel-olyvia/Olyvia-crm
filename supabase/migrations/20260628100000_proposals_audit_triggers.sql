-- Proposals Audit Triggers — Phase 4 extension
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   0. fn_audit_proposals_safe()        — covers proposals (security tokens stripped)
--   1. fn_audit_proposal_child()        — covers proposal_items, proposal_manual_items
--   2. fn_audit_proposal_send()         — covers proposal_sends (PII masked, noise excluded)
--   3. fn_audit_proposal_verification() — covers proposal_verification_codes (code/destination masked)
--   4. Triggers on all five tables
--   5. DELETE-ALL + RE-INSERT workaround comment block
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql), fn_audit_deal_child()
-- (20260626200000_deals_audit_triggers.sql), and fn_audit_quote_child()
-- (20260627100000_quotes_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- KNOWN LIMITATION — delete-all + re-insert pattern:
--   Proposal line items (proposal_items, proposal_manual_items) may be fully
--   replaced on each save of a proposal rather than diff-merged. When this
--   pattern is used:
--     • Every save produces one DELETE audit batch + one INSERT audit batch.
--     • Row-level identity is destroyed on each save — it is impossible to diff
--       which individual item changed vs. stayed the same.
--   Recommended future fix: replace the delete-all + re-insert with a true MERGE
--   (INSERT … ON CONFLICT DO UPDATE / DELETE WHERE id NOT IN (…)) inside a
--   dedicated RPC, then the audit log will reflect meaningful line-level diffs.

-- ============================================================
-- 0. fn_audit_proposals_safe()
-- ============================================================
-- Handles: proposals
--
-- proposals carries organization_id and entity_id directly, so org/entity
-- resolution is trivial. However two columns must be stripped from every
-- audit payload because they grant unauthenticated access to the document:
--
--   public_token    — URL token used by the "Public can view proposals by token"
--                     RLS policy (anon role). Leaking it into entity_audit_log
--                     (org-readable by all authenticated users) would allow any
--                     org member to construct the public link for any proposal.
--   tracking_token  — UUID used by the pixel-beacon / view-tracker to write
--                     view_count and last_viewed_at back to proposals without
--                     authentication. Same confidentiality concern.
--
-- Both tokens are stripped using jsonb - operator (full removal) rather than
-- '[REDACTED]' substitution so they leave no trace in the log.
--
-- Noise columns excluded from UPDATE diff (no semantic meaning for change-tracking):
--   'updated_at'        — timestamp maintenance column
--   'last_viewed_at'    — beacon increment, written on every proposal view
--   'view_count'        — beacon increment, written on every proposal view
--
-- The baseline migration (20260625010000_entity_audit_log.sql) registered
-- trg_audit_proposals using fn_generic_entity_audit(). Section 4 below replaces
-- that trigger with one pointing at this token-safe variant.

CREATE OR REPLACE FUNCTION public.fn_audit_proposals_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'last_viewed_at', 'view_count'];
  v_token_cols     text[] := ARRAY['public_token', 'tracking_token'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── organization_id and entity_id are direct on the row ─────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'entity_id')::uuid,
    (to_jsonb(OLD) ->> 'entity_id')::uuid
  );

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Strip security token columns entirely from the full_record snapshot.
    v_record := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(v_token_cols)
    LOOP
      v_record := v_record - v_key;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Strip security token columns entirely from the full_record snapshot.
    v_record := to_jsonb(OLD);
    FOR v_key IN SELECT unnest(v_token_cols)
    LOOP
      v_record := v_record - v_key;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      -- Skip noise columns and security token columns entirely.
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      CONTINUE WHEN v_key = ANY(v_token_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    -- Skip write when nothing meaningful changed.
    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_proposals_safe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_proposals_safe()
  TO service_role;

-- ============================================================
-- 1. fn_audit_proposal_child()
-- ============================================================
-- Handles: proposal_items, proposal_manual_items
--
-- Neither table carries organization_id or entity_id directly.
-- Both are resolved via: JOIN public.proposals p ON p.id = NEW.proposal_id / OLD.proposal_id
--
-- Noise columns excluded from UPDATE diff (no semantic meaning for change-tracking):
--   'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['updated_at', 'created_at'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_proposal_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve proposal_id from whichever side is available ────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_proposal_id := COALESCE(
    (to_jsonb(NEW) ->> 'proposal_id')::uuid,
    (to_jsonb(OLD) ->> 'proposal_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent proposal ────────────
  IF v_proposal_id IS NOT NULL THEN
    SELECT p.organization_id, p.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.proposals p
    WHERE  p.id = v_proposal_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently to avoid polluting the log.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_record         := to_jsonb(NEW);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    v_record         := to_jsonb(OLD);
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    -- Skip write when nothing meaningful changed.
    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_proposal_child() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_proposal_child()
  TO service_role;

-- ============================================================
-- 2. fn_audit_proposal_send()
-- ============================================================
-- Handles: proposal_sends
--
-- proposal_sends carries organization_id directly but has no entity_id column.
-- entity_id is resolved via: JOIN public.proposals p ON p.id = NEW.proposal_id / OLD.proposal_id
--
-- SENSITIVE COLUMN MASKING:
--   proposal_sends stores network and location PII belonging to the recipient
--   (client/contact) that must not appear verbatim in the audit log:
--     ip_address         — network PII
--     location_country   — location PII
--     location_city      — location PII
--   These three columns are replaced with the sentinel string '[REDACTED]' in
--   the full_record snapshot (INSERT/DELETE). On UPDATE they are also masked
--   in changed_fields (old → new both show '[REDACTED]') so that the fact a
--   change occurred is observable without exposing the raw value.
--
-- Noise columns excluded from UPDATE diff:
--   'updated_at', 'created_at', 'open_count', 'last_opened_at',
--   'first_opened_at', 'total_view_time_seconds'
-- These are high-frequency tracking increments written by the pixel-beacon
-- and view-time collectors; logging every increment would flood the audit log.

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY[
    'updated_at', 'created_at',
    'open_count', 'last_opened_at', 'first_opened_at', 'total_view_time_seconds'
  ];
  v_pii_cols       text[] := ARRAY[
    'ip_address', 'location_country', 'location_city'
  ];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_proposal_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── organization_id is direct on the row ─────────────────────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── entity_id resolved via parent proposal ───────────────────────────────
  v_proposal_id := COALESCE(
    (to_jsonb(NEW) ->> 'proposal_id')::uuid,
    (to_jsonb(OLD) ->> 'proposal_id')::uuid
  );

  IF v_proposal_id IS NOT NULL THEN
    SELECT p.entity_id
    INTO   v_entity_id
    FROM   public.proposals p
    WHERE  p.id = v_proposal_id
    LIMIT  1;
  END IF;
  -- entity_id may be NULL if the parent proposal has no entity_id set yet
  -- (e.g. a proposal created without a contact/client). The audit row is still
  -- written — org context is sufficient.

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Mask PII columns in the full_record snapshot.
    v_record := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(v_pii_cols)
    LOOP
      IF v_record ? v_key THEN
        v_record := jsonb_set(v_record, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Mask PII columns in the full_record snapshot.
    v_record := to_jsonb(OLD);
    FOR v_key IN SELECT unnest(v_pii_cols)
    LOOP
      IF v_record ? v_key THEN
        v_record := jsonb_set(v_record, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        -- PII columns are recorded in changed_fields as diff (old→new) but
        -- the values themselves are replaced with '[REDACTED]'.
        IF v_key = ANY(v_pii_cols) THEN
          v_changed_fields := v_changed_fields || jsonb_build_object(
            v_key,
            jsonb_build_object('old', '"[REDACTED]"'::jsonb, 'new', '"[REDACTED]"'::jsonb)
          );
        ELSE
          v_changed_fields := v_changed_fields || jsonb_build_object(
            v_key,
            jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
          );
        END IF;
      END IF;
    END LOOP;

    -- Skip write when nothing meaningful changed.
    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_proposal_send() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_proposal_send()
  TO service_role;

-- ============================================================
-- 3. fn_audit_proposal_verification()
-- ============================================================
-- Handles: proposal_verification_codes
--
-- proposal_verification_codes carries no organization_id or entity_id directly.
-- Both are resolved via: JOIN public.proposals p ON p.id = NEW.proposal_id / OLD.proposal_id
--
-- SENSITIVE COLUMN MASKING:
--   proposal_verification_codes stores one-time codes and delivery destinations
--   used for the proposal acceptance/rejection verification flow. These must
--   never appear verbatim in the audit log:
--     code        — the OTP/verification code; leaking it would allow any org
--                   member with audit access to accept or reject a proposal on
--                   behalf of a client within the code TTL window
--     destination — the email address or phone number the code was sent to;
--                   this is PII belonging to the client/contact
--   Both columns are replaced with '[REDACTED]' in full_record (INSERT/DELETE).
--   On UPDATE they are omitted from changed_fields entirely — the operational
--   transition (verified_at going NULL → timestamptz) is sufficient to reconstruct
--   the acceptance/rejection event without the raw values.
--
-- Noise columns excluded from UPDATE diff:
--   'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record         jsonb;
  v_changed_fields jsonb;
  v_user_id        uuid;
  v_source         text;
  v_noise_cols     text[] := ARRAY['created_at'];
  v_secret_cols    text[] := ARRAY['code', 'destination'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_proposal_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve proposal_id from whichever side is available ────────────────
  v_proposal_id := COALESCE(
    (to_jsonb(NEW) ->> 'proposal_id')::uuid,
    (to_jsonb(OLD) ->> 'proposal_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent proposal ────────────
  IF v_proposal_id IS NOT NULL THEN
    SELECT p.organization_id, p.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.proposals p
    WHERE  p.id = v_proposal_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently to avoid polluting the log.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Mask secret columns in the full_record snapshot.
    v_record := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(v_secret_cols)
    LOOP
      IF v_record ? v_key THEN
        v_record := jsonb_set(v_record, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Mask secret columns in the full_record snapshot.
    v_record := to_jsonb(OLD);
    FOR v_key IN SELECT unnest(v_secret_cols)
    LOOP
      IF v_record ? v_key THEN
        v_record := jsonb_set(v_record, ARRAY[v_key], '"[REDACTED]"'::jsonb);
      END IF;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      -- Skip noise columns and secret columns entirely from changed_fields.
      -- The meaningful signal is the verified_at transition (NULL → timestamptz);
      -- the raw code and destination are never needed in the diff.
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      CONTINUE WHEN v_key = ANY(v_secret_cols);
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_changed_fields := v_changed_fields || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;

    -- Skip write when nothing meaningful changed.
    IF v_changed_fields = '{}'::jsonb OR v_changed_fields IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ── Write audit row ──────────────────────────────────────────────────────
  BEGIN
    INSERT INTO public.entity_audit_log
      (organization_id, entity_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       TG_TABLE_NAME,
       TG_OP,
       v_changed_fields,
       v_record,
       COALESCE(v_user_id, public.current_business_user_id()),
       v_source,
       now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- Audit trigger must never block originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_proposal_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_proposal_verification()
  TO service_role;

-- ============================================================
-- 4. Triggers
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE is the idempotent pattern used throughout this repo.

-- ── proposals — organization_id and entity_id are direct on the row ──────
-- fn_audit_proposals_safe() is used instead of fn_generic_entity_audit()
-- because proposals.public_token and proposals.tracking_token must be stripped
-- from the audit payload (they grant unauthenticated access to the proposal).
-- Noise cols: updated_at, last_viewed_at, view_count (beacon increments).
-- The baseline migration (20260625010000_entity_audit_log.sql) registered
-- trg_audit_proposals using fn_generic_entity_audit(). This DROP + CREATE
-- replaces it with the token-safe variant.
DROP TRIGGER IF EXISTS trg_audit_proposals ON public.proposals;
CREATE TRIGGER trg_audit_proposals
  AFTER INSERT OR UPDATE OR DELETE ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_proposals_safe();

-- ── proposal_items — org/entity resolved via proposal_id → proposals ────
-- NOTE: Due to potential delete-all + re-insert patterns in the proposal editor,
-- every save of an existing proposal may produce a DELETE batch followed by an
-- INSERT batch here. Row UUIDs change on every such save cycle.
-- Use proposal_id + sort_order + description as logical identity when replaying
-- the audit log, not the row id.
DROP TRIGGER IF EXISTS trg_audit_proposal_items ON public.proposal_items;
CREATE TRIGGER trg_audit_proposal_items
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_proposal_child();

-- ── proposal_manual_items — org/entity resolved via proposal_id → proposals
-- NOTE: Same delete-all + re-insert pattern may apply. Use proposal_id +
-- sort_order + description as logical identity when replaying.
DROP TRIGGER IF EXISTS trg_audit_proposal_manual_items ON public.proposal_manual_items;
CREATE TRIGGER trg_audit_proposal_manual_items
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_manual_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_proposal_child();

-- ── proposal_sends — org direct, entity via proposal_id → proposals, PII masked
-- Tracking increments (open_count, last_opened_at, first_opened_at,
-- total_view_time_seconds) are excluded from the diff to prevent pixel-beacon
-- noise in the audit log. ip_address, location_country, location_city are
-- replaced with '[REDACTED]' in all audit payloads.
DROP TRIGGER IF EXISTS trg_audit_proposal_sends ON public.proposal_sends;
CREATE TRIGGER trg_audit_proposal_sends
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_sends
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_proposal_send();

-- ── proposal_verification_codes — org/entity via proposal_id → proposals ─
-- code and destination are masked to '[REDACTED]' in INSERT/DELETE snapshots
-- and omitted entirely from UPDATE changed_fields. The meaningful signal is
-- the verified_at transition (NULL → timestamptz) signalling acceptance or
-- rejection.
DROP TRIGGER IF EXISTS trg_audit_proposal_verification_codes ON public.proposal_verification_codes;
CREATE TRIGGER trg_audit_proposal_verification_codes
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_verification_codes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_proposal_verification();

-- ============================================================
-- 5. DELETE-ALL + RE-INSERT WORKAROUND — context and guidance
-- ============================================================
--
-- PROBLEM:
--   Proposal line items may be managed via a delete-all + re-insert pattern
--   in the proposal editor (analogous to the QuoteBuilder.tsx pattern confirmed
--   for quote_lines and quote_fees in 20260627100000_quotes_audit_triggers.sql).
--   When this occurs:
--
--   A. proposal_items:
--      On every edit of an existing proposal the client may:
--        1. DELETE FROM proposal_items WHERE proposal_id = $1
--        2. INSERT INTO proposal_items (…) VALUES (…), (…), …   ← new UUIDs
--      The trigger above logs the DELETE batch as individual DELETE rows and
--      the INSERT batch as individual INSERT rows. There is no UPDATE row for
--      items that did not change. A reader replaying the log must correlate by
--      (proposal_id, sort_order, description) to reconstruct which items changed.
--
--   B. proposal_manual_items:
--      Same pattern applies. Use (proposal_id, sort_order, description) as
--      the correlation key.
--
-- RECOMMENDED FIX (future migration):
--   Replace both cycles with a dedicated RPC function, e.g.:
--
--     CREATE OR REPLACE FUNCTION public.save_proposal_items(
--       p_proposal_id uuid,
--       p_items       jsonb   -- array of item objects with optional "id"
--     ) RETURNS void ...
--
--   Inside the RPC:
--     • UPDATE existing rows by id when the id is present in p_items
--     • INSERT rows that have no id (new items)
--     • DELETE rows whose id is absent from p_items (removed items)
--   This produces true INSERT / UPDATE / DELETE audit events with stable row
--   identities and makes the audit diff meaningful without any trigger changes.
--
-- INTERIM GUIDANCE:
--   Until the RPC is implemented, consumers of entity_audit_log for
--   proposal_items and proposal_manual_items should:
--     • Treat consecutive DELETE + INSERT batches with the same proposal_id and
--       timestamp window (< 5 seconds) as a single logical "save" event.
--     • Compare the deleted full_record set against the inserted full_record set
--       to reconstruct what actually changed within that save.
--     • Do NOT rely on row id stability across save cycles.
