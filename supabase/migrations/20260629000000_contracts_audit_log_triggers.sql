-- Contracts Audit Triggers — Phase 5 extension
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   0. fn_audit_contract_party()       — client_contract_parties (PII masked)
--   1. fn_audit_contract_sig_request() — client_contract_signature_requests
--   2. fn_audit_contract_sig_token()   — client_contract_signature_tokens (token_hash stripped)
--   3. fn_audit_contract_send()        — contract_sends (PII masked, noise excluded)
--   4. Triggers on all six contract tables
--   5. Fix log_client_contract_event() — replace auth.uid() with business-user resolution
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql), fn_audit_deal_child()
-- (20260626200000_deals_audit_triggers.sql), fn_audit_quote_child()
-- (20260627100000_quotes_audit_triggers.sql), and fn_audit_proposal_send()
-- (20260628100000_proposals_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- Tables covered and their organisation-resolution strategy:
--
--   client_contracts                  — organization_id NOT NULL (direct); uses fn_generic_entity_audit()
--   contract_documents                — organization_id NOT NULL (direct); uses fn_generic_entity_audit()
--   client_contract_parties           — no org column; 1-JOIN via contract_id → client_contracts
--   client_contract_signature_requests — no org column; 1-JOIN via contract_id → client_contracts
--   client_contract_signature_tokens  — no org column; 2-JOIN chain:
--                                        signature_request_id → client_contract_signature_requests
--                                        → client_contracts
--   contract_sends                    — organization_id nullable; prefer direct, fall back to
--                                        contract_id JOIN; skip if both resolve to NULL
--
-- KNOWN LIMITATION / DESIGN NOTES:
--
--   (a) client_contract_events dual-log coexistence:
--       client_contract_events is a pre-existing application-level event log written by
--       trigger_log_client_contract_event on client_contracts. It is intentionally NOT
--       wired into entity_audit_log. Adding an entity_audit_log trigger on
--       client_contract_events would produce a log-of-a-log: every status change would
--       generate one event row (in client_contract_events) and then a second audit row
--       (in entity_audit_log) recording that the event row was inserted. This doubles
--       storage with zero additional signal. The two systems coexist; consumers should
--       query entity_audit_log for field-level diffs on client_contracts and
--       client_contract_events for human-readable status-change narrative.
--
--   (b) client_contract_templates exclusion:
--       client_contract_templates.organization_id is nullable (no NOT NULL constraint,
--       no FK constraint) and the column semantics are ambiguous — a NULL value
--       intentionally means a system-wide global template visible to all organisations.
--       Auditing global templates requires special handling: writing an audit row with
--       NULL organization_id would violate entity_audit_log.organization_id NOT NULL and
--       be silently swallowed, producing misleading coverage gaps. A dedicated follow-up
--       migration should resolve the organisation identity for template changes via the
--       GUC-set audit_user_id (organisation known from the writer's session) before
--       adding audit coverage here.
--
--   (c) Satellite tables: orphan-row tolerance:
--       client_contract_parties, client_contract_signature_requests, and
--       client_contract_signature_tokens carry no organization_id. Each resolves org
--       via a JOIN to the parent client_contracts row. If the parent contract has
--       already been deleted (cascade-delete scenario) or the foreign-key chain is
--       broken, the JOIN returns no row and v_org_id remains NULL. In that case the
--       audit trigger returns COALESCE(NEW, OLD) immediately without writing to
--       entity_audit_log. The originating DML still succeeds. This is the correct
--       behaviour: there is no meaningful org context in which to record the event.
--
--   (d) Predecessor migrations cross-reference:
--       20260625010000_entity_audit_log.sql       — base table + fn_generic_entity_audit()
--       20260626200000_deals_audit_triggers.sql   — Phase 3 (deals)
--       20260627100000_quotes_audit_triggers.sql  — Phase 4 (quotes)
--       20260628100000_proposals_audit_triggers.sql — Phase 4 (proposals)
--
--   (e) Shared invariants (all audit trigger functions in this repo):
--       1. SECURITY DEFINER — function owner bypasses RLS on entity_audit_log
--       2. SET search_path = public, pg_temp — prevents search-path injection
--       3. Actor resolution: GUC app.audit_user_id → current_business_user_id() → NULL
--          Never auth.uid() directly — auth UIDs are a different namespace from
--          anew_users.id and are NULL under service_role sessions.
--       4. Exception immunity: all INSERT attempts are wrapped in BEGIN … EXCEPTION
--          WHEN OTHERS THEN NULL; the outer function body has a second EXCEPTION
--          WHEN OTHERS handler that returns NEW/OLD. Audit failures never surface.
--       5. Noise-column filtering: UPDATE events are dropped when only non-semantic
--          maintenance columns changed, to prevent high-frequency beacon writes from
--          flooding the log.

-- ============================================================
-- 0. fn_audit_contract_party()
-- ============================================================
-- Handles: client_contract_parties
--
-- client_contract_parties has no organization_id or entity_id column.
-- Both are resolved via: JOIN public.client_contracts ON id = contract_id
-- (handles INSERT via NEW.contract_id and DELETE via OLD.contract_id).
--
-- SENSITIVE COLUMN MASKING:
--   client_contract_parties stores signing contact information and network
--   forensics that must not appear verbatim in the audit log:
--     signing_email       — email address of the contract signatory (PII)
--     signature_ip        — IP address captured at signing time (network PII)
--     signature_user_agent — browser/device string captured at signing time (PII)
--   These three columns are replaced with the sentinel string '[REDACTED]' in
--   the full_record snapshot (INSERT/DELETE). On UPDATE they are also masked
--   in changed_fields (old → new both show '[REDACTED]') so the fact a value
--   changed is observable without exposing the raw content.
--
-- Noise columns excluded from UPDATE diff:
--   'created_at' — insert-time timestamp, never changes

CREATE OR REPLACE FUNCTION public.fn_audit_contract_party()
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
  v_pii_cols       text[] := ARRAY['signing_email', 'signature_ip', 'signature_user_agent'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_contract_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve contract_id from whichever side is available ─────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_contract_id := COALESCE(
    (to_jsonb(NEW) ->> 'contract_id')::uuid,
    (to_jsonb(OLD) ->> 'contract_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent contract ────────────
  IF v_contract_id IS NOT NULL THEN
    SELECT cc.organization_id, cc.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.client_contracts cc
    WHERE  cc.id = v_contract_id
    LIMIT  1;
  END IF;

  -- Cannot determine org (orphan row or broken FK chain) — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

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
        -- PII columns: record that a change occurred but mask the raw values.
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

REVOKE ALL ON FUNCTION public.fn_audit_contract_party() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_contract_party()
  TO service_role;

-- ============================================================
-- 1. fn_audit_contract_sig_request()
-- ============================================================
-- Handles: client_contract_signature_requests
--
-- client_contract_signature_requests has no organization_id or entity_id column.
-- Both are resolved via: JOIN public.client_contracts ON id = contract_id
--
-- No masking required — this table stores operational metadata (provider,
-- status, expiry) with no PII beyond contract_id linkage.
--
-- Noise columns excluded from UPDATE diff:
--   'created_at' — insert-time timestamp, never changes

CREATE OR REPLACE FUNCTION public.fn_audit_contract_sig_request()
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
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_contract_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve contract_id from whichever side is available ─────────────────
  v_contract_id := COALESCE(
    (to_jsonb(NEW) ->> 'contract_id')::uuid,
    (to_jsonb(OLD) ->> 'contract_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent contract ────────────
  IF v_contract_id IS NOT NULL THEN
    SELECT cc.organization_id, cc.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.client_contracts cc
    WHERE  cc.id = v_contract_id
    LIMIT  1;
  END IF;

  -- Cannot determine org (orphan row or broken FK chain) — skip silently.
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

REVOKE ALL ON FUNCTION public.fn_audit_contract_sig_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_contract_sig_request()
  TO service_role;

-- ============================================================
-- 2. fn_audit_contract_sig_token()
-- ============================================================
-- Handles: client_contract_signature_tokens
--
-- client_contract_signature_tokens has no organization_id or entity_id column.
-- This is a 3rd-level satellite: the resolution requires TWO JOINs:
--
--   client_contract_signature_tokens
--     → client_contract_signature_requests  (via signature_request_id)
--     → client_contracts                    (via client_contract_signature_requests.contract_id)
--
-- On DELETE, NEW is NULL — COALESCE(NEW.signature_request_id, OLD.signature_request_id)
-- handles this. If the parent signature_request has already been deleted (e.g. cascade),
-- the JOIN returns no row and the orphan-skip rule applies (see design note (c) above).
--
-- SECURITY — token_hash MUST BE STRIPPED (not redacted):
--   token_hash is a bcrypt/HMAC hash of the one-time URL token used by the portal
--   to authenticate a signatory without requiring a Supabase login. Writing even the
--   hash to entity_audit_log (readable by all authenticated org members) would allow
--   a malicious org member to attempt offline brute-force of the token within its
--   validity window. The column is therefore STRIPPED using the jsonb - operator
--   rather than replaced with '[REDACTED]': it leaves no trace in the log at all.
--   '[REDACTED]' substitution is NOT used here because it still reveals that a token
--   exists, enabling timing-correlation attacks.
--
-- Noise columns excluded from UPDATE diff:
--   'created_at' — insert-time timestamp, never changes
--   'attempts'   — incremented on every verification attempt; logging every
--                  increment would flood the audit log with low-signal rows

CREATE OR REPLACE FUNCTION public.fn_audit_contract_sig_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id            uuid;
  v_entity_id         uuid;
  v_record            jsonb;
  v_changed_fields    jsonb;
  v_user_id           uuid;
  v_source            text;
  v_noise_cols        text[] := ARRAY['created_at', 'attempts'];
  v_strip_cols        text[] := ARRAY['token_hash'];
  v_key               text;
  v_old_json          jsonb;
  v_new_json          jsonb;
  v_sig_request_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve signature_request_id from whichever side is available ────────
  -- On DELETE, NEW is NULL; use OLD. On INSERT, OLD is NULL; use NEW.
  v_sig_request_id := COALESCE(
    (to_jsonb(NEW) ->> 'signature_request_id')::uuid,
    (to_jsonb(OLD) ->> 'signature_request_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via 2-JOIN chain ───────────────
  --   token → signature_request → contract
  IF v_sig_request_id IS NOT NULL THEN
    SELECT cc.organization_id, cc.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.client_contract_signature_requests sr
    JOIN   public.client_contracts cc ON cc.id = sr.contract_id
    WHERE  sr.id = v_sig_request_id
    LIMIT  1;
  END IF;

  -- Cannot determine org (orphan row, broken chain, or cascade-deleted parent).
  -- Skip silently — originating DML must still succeed.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Strip token_hash entirely — never write it to the audit log.
    v_record := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(v_strip_cols)
    LOOP
      v_record := v_record - v_key;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Strip token_hash entirely from the DELETE snapshot.
    v_record := to_jsonb(OLD);
    FOR v_key IN SELECT unnest(v_strip_cols)
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
      -- Skip noise columns and strip columns entirely from changed_fields.
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      CONTINUE WHEN v_key = ANY(v_strip_cols);
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

REVOKE ALL ON FUNCTION public.fn_audit_contract_sig_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_contract_sig_token()
  TO service_role;

-- ============================================================
-- 3. fn_audit_contract_send()
-- ============================================================
-- Handles: contract_sends
--
-- Mirrors fn_audit_proposal_send() (20260628100000_proposals_audit_triggers.sql).
--
-- contract_sends carries organization_id directly but the column is nullable
-- (unlike proposal_sends where it is NOT NULL). Resolution strategy:
--   1. Prefer the direct organization_id on the row.
--   2. If NULL, fall back to JOIN via contract_id → client_contracts.organization_id.
--   3. If both resolve to NULL (no contract_id or orphan contract), skip silently.
--
-- entity_id is not stored on contract_sends. It is resolved as a best-effort
-- lookup via contract_id → client_contracts.entity_id. The audit row is still
-- written when entity_id is NULL — org context is sufficient for the log.
--
-- SENSITIVE COLUMN MASKING:
--   contract_sends stores network and location PII belonging to the recipient
--   (client/contact) that must not appear verbatim in the audit log:
--     ip_address         — network PII
--     location_country   — location PII
--     location_city      — location PII
--   These three columns are replaced with the sentinel string '[REDACTED]' in
--   the full_record snapshot (INSERT/DELETE). On UPDATE they are also masked
--   in changed_fields (old → new both show '[REDACTED]').
--
-- Noise columns excluded from UPDATE diff (high-frequency beacon/tracker writes):
--   'created_at', 'open_count', 'last_opened_at', 'first_opened_at',
--   'total_view_time_seconds', 'first_link_clicked_at'

CREATE OR REPLACE FUNCTION public.fn_audit_contract_send()
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
    'created_at',
    'open_count', 'last_opened_at', 'first_opened_at',
    'total_view_time_seconds', 'first_link_clicked_at'
  ];
  v_pii_cols       text[] := ARRAY[
    'ip_address', 'location_country', 'location_city'
  ];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
  v_contract_id    uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve organization_id — prefer direct, fall back via contract_id ───
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  IF v_org_id IS NULL THEN
    -- Fall back: resolve via the parent contract.
    v_contract_id := COALESCE(
      (to_jsonb(NEW) ->> 'contract_id')::uuid,
      (to_jsonb(OLD) ->> 'contract_id')::uuid
    );

    IF v_contract_id IS NOT NULL THEN
      SELECT cc.organization_id, cc.entity_id
      INTO   v_org_id, v_entity_id
      FROM   public.client_contracts cc
      WHERE  cc.id = v_contract_id
      LIMIT  1;
    END IF;
  ELSE
    -- Org resolved directly; still attempt entity_id via contract_id.
    v_contract_id := COALESCE(
      (to_jsonb(NEW) ->> 'contract_id')::uuid,
      (to_jsonb(OLD) ->> 'contract_id')::uuid
    );

    IF v_contract_id IS NOT NULL THEN
      SELECT cc.entity_id
      INTO   v_entity_id
      FROM   public.client_contracts cc
      WHERE  cc.id = v_contract_id
      LIMIT  1;
    END IF;
  END IF;

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

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
        -- PII columns: record that a change occurred but mask the raw values.
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

REVOKE ALL ON FUNCTION public.fn_audit_contract_send() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_contract_send()
  TO service_role;

-- ============================================================
-- 4. Triggers
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE is the idempotent pattern used throughout this repo.

-- ── client_contracts — organization_id NOT NULL, entity_id nullable (direct) ──
-- fn_generic_entity_audit() is used directly: organization_id is NOT NULL on
-- this table, so Strategy A (direct column read) in fn_generic_entity_audit()
-- resolves org without any JOIN. entity_id falls through to the id column
-- fallback inside that function.
--
-- Noise cols (from fn_generic_entity_audit default):
--   'updated_at', 'search_text', 'contact_attempts', 'last_activity_at'
-- The following columns are NOT noise: signature_date, status_changed_at —
-- both are semantically meaningful change events.
--
-- Trigger order note: trigger_log_client_contract_event (legacy event log, fires
-- AFTER INSERT OR UPDATE) and trg_audit_client_contracts (this trigger, fires
-- AFTER INSERT OR UPDATE OR DELETE) both fire AFTER on the same table.
-- 'trg_audit_*' sorts after 'trigger_log_*' alphabetically, so the legacy event
-- is written first, then the entity_audit_log row. Neither trigger mutates the
-- row, so relative order is non-load-bearing.
DROP TRIGGER IF EXISTS trg_audit_client_contracts ON public.client_contracts;
CREATE TRIGGER trg_audit_client_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ── contract_documents — organization_id NOT NULL (direct) ──────────────────
-- fn_generic_entity_audit() is used directly: organization_id NOT NULL, FK to
-- anew_organizations. No masking required (documents store file metadata, not
-- PII content). No updated_at column on this table — noise filtering uses the
-- default set which includes updated_at (no-op when the column is absent).
DROP TRIGGER IF EXISTS trg_audit_contract_documents ON public.contract_documents;
CREATE TRIGGER trg_audit_contract_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ── client_contract_parties — org resolved via contract_id → client_contracts ─
-- PII columns (signing_email, signature_ip, signature_user_agent) are replaced
-- with '[REDACTED]' in all audit payloads. See fn_audit_contract_party() above.
DROP TRIGGER IF EXISTS trg_audit_client_contract_parties ON public.client_contract_parties;
CREATE TRIGGER trg_audit_client_contract_parties
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contract_parties
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_contract_party();

-- ── client_contract_signature_requests — org via contract_id → client_contracts ─
-- Operational metadata only; no masking required.
DROP TRIGGER IF EXISTS trg_audit_client_contract_sig_requests ON public.client_contract_signature_requests;
CREATE TRIGGER trg_audit_client_contract_sig_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contract_signature_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_contract_sig_request();

-- ── client_contract_signature_tokens — org via 2-JOIN chain ──────────────────
-- token_hash is STRIPPED (not redacted) from all audit payloads — see security
-- note in fn_audit_contract_sig_token() above. attempts increments are excluded
-- as noise to prevent verification-attempt floods in the log.
DROP TRIGGER IF EXISTS trg_audit_client_contract_sig_tokens ON public.client_contract_signature_tokens;
CREATE TRIGGER trg_audit_client_contract_sig_tokens
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contract_signature_tokens
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_contract_sig_token();

-- ── contract_sends — org direct (nullable) with contract_id fallback ─────────
-- PII columns (ip_address, location_country, location_city) replaced with
-- '[REDACTED]'. Beacon/tracker noise columns excluded from UPDATE diff.
DROP TRIGGER IF EXISTS trg_audit_contract_sends ON public.contract_sends;
CREATE TRIGGER trg_audit_contract_sends
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_sends
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_contract_send();

-- ============================================================
-- 5. Fix log_client_contract_event() — UPDATE branch actor bug
-- ============================================================
-- BUG (baseline line 4480):
--   The UPDATE branch of log_client_contract_event() writes auth.uid() into
--   client_contract_events.created_by when a status change occurs. auth.uid()
--   returns a value from the auth.users namespace (Supabase auth UUID), while
--   the rest of the system — including the INSERT branch of the same function —
--   stores anew_users.id (business-layer UUID) in that column. The two namespaces
--   are different; any query joining client_contract_events.created_by to
--   anew_users.id will return no match for status-change rows.
--
--   Worse: under service-role sessions (Edge Functions), auth.uid() returns NULL,
--   meaning every contract finalisation via pipeline-automation writes a NULL
--   created_by on the status-change event row — a silent audit gap.
--
-- FIX:
--   Replace auth.uid() with the same actor-resolution pattern used by all other
--   audit functions in this repo:
--     GUC app.audit_user_id → current_business_user_id() → NULL
--   This is consistent with the INSERT branch (which uses NEW.created_by, the
--   business user set at contract creation time) and with all entity_audit_log
--   trigger functions in migrations 20260625010000 through 20260628100000.
--
--   The function is recreated with CREATE OR REPLACE. The trigger
--   trigger_log_client_contract_event already points to this function and does
--   not need to be recreated.
--
-- NOTE: This fix does NOT add entity_audit_log coverage for client_contract_events
--   rows themselves (see design note (a) at the top of this migration). The fix is
--   scoped to correcting the created_by identity in the existing event log.

CREATE OR REPLACE FUNCTION public.log_client_contract_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  -- ── Resolve actor (consistent with entity_audit_log trigger functions) ───
  -- fix: was auth.uid(), now consistent with INSERT block and service-role safe
  BEGIN
    v_actor := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF v_actor IS NULL THEN
    v_actor := public.current_business_user_id();
  END IF;

  -- ── INSERT: full contract snapshot ───────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_contract_events
      (contract_id, event_type, description, new_values, created_by)
    VALUES
      (NEW.id, 'created', 'Contrato criado', to_jsonb(NEW), NEW.created_by);

  -- ── UPDATE: status changes only ──────────────────────────────────────────
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.client_contract_events
        (contract_id, event_type, description, old_values, new_values, created_by)
      VALUES
        (NEW.id,
         'status_changed',
         'Estado alterado de ' || OLD.status || ' para ' || NEW.status,
         jsonb_build_object('status', OLD.status),
         jsonb_build_object('status', NEW.status),
         v_actor);  -- fix: was auth.uid(), now consistent with INSERT block
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
