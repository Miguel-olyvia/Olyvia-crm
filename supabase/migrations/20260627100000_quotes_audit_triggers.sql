-- Quotes Audit Triggers — Phase 3 extension
-- Forward-only migration. Do not fold into the baseline.
--
-- Sections:
--   1. fn_audit_quote_child()   — covers quote_lines and quote_fees
--   2. fn_audit_quote_send()    — covers quote_sends (sensitive cols masked)
--   3. Triggers on all four tables
--   4. DELETE-ALL + RE-INSERT workaround comment block
--
-- All functions follow the exact same conventions as fn_generic_entity_audit()
-- (20260625010000_entity_audit_log.sql) and fn_audit_deal_child()
-- (20260626200000_deals_audit_triggers.sql):
--   • SECURITY DEFINER + pinned search_path = public, pg_temp
--   • Actor resolved via app.audit_user_id GUC, fallback to current_business_user_id()
--   • UPDATE rows skipped when only noise columns changed
--   • Any exception is swallowed so the audit trigger NEVER blocks originating DML
--   • changed_fields shape: { "col": { "old": <v>, "new": <v> } } for UPDATE
--                           NULL for INSERT/DELETE (full_record carries the row)
--
-- KNOWN LIMITATION — delete-all + re-insert pattern:
--   QuoteBuilder.tsx unconditionally deletes ALL quote_lines and ALL quote_fees
--   on every save of an existing quote, then re-inserts the full in-memory set as
--   new rows with new UUIDs. The AI-assistant replaceQuoteFees() helper does the
--   same for fees. This means:
--     • Every save produces one DELETE audit batch + one INSERT audit batch.
--     • Row-level identity is destroyed on each save — it is impossible to diff
--       which individual line changed vs. stayed the same.
--   Recommended future fix: replace the delete-all + re-insert with a true MERGE
--   (INSERT … ON CONFLICT DO UPDATE / DELETE WHERE id NOT IN (…)) inside a
--   dedicated RPC, then the audit log will reflect meaningful line-level diffs.
--   See: QuoteBuilder.tsx handleSave(), ai-assistant/tools/quotes.ts replaceQuoteFees()

-- ============================================================
-- 1. fn_audit_quote_child()
-- ============================================================
-- Handles: quote_lines, quote_fees
--
-- Neither table carries organization_id or entity_id directly.
-- Both are resolved via: JOIN public.quotes q ON q.id = NEW.quote_id / OLD.quote_id
--
-- Noise columns excluded from UPDATE diff (no semantic meaning for change-tracking):
--   'updated_at', 'created_at'

CREATE OR REPLACE FUNCTION public.fn_audit_quote_child()
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
  v_quote_id       uuid;
BEGIN

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve quote_id from whichever side is available ───────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_quote_id := COALESCE(
    (to_jsonb(NEW) ->> 'quote_id')::uuid,
    (to_jsonb(OLD) ->> 'quote_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent quote ───────────────
  IF v_quote_id IS NOT NULL THEN
    SELECT q.organization_id, q.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.quotes q
    WHERE  q.id = v_quote_id
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

REVOKE ALL ON FUNCTION public.fn_audit_quote_child() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_quote_child()
  TO service_role;

-- ============================================================
-- 2. fn_audit_quote_send()
-- ============================================================
-- Handles: quote_sends
--
-- quote_sends carries organization_id directly but has no entity_id column.
-- entity_id is resolved via: JOIN public.quotes q ON q.id = NEW.quote_id / OLD.quote_id
--
-- SENSITIVE COLUMN MASKING:
--   quote_sends stores network and location PII belonging to the recipient
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

CREATE OR REPLACE FUNCTION public.fn_audit_quote_send()
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
  v_quote_id       uuid;
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

  -- ── entity_id resolved via parent quote ──────────────────────────────────
  v_quote_id := COALESCE(
    (to_jsonb(NEW) ->> 'quote_id')::uuid,
    (to_jsonb(OLD) ->> 'quote_id')::uuid
  );

  IF v_quote_id IS NOT NULL THEN
    SELECT q.entity_id
    INTO   v_entity_id
    FROM   public.quotes q
    WHERE  q.id = v_quote_id
    LIMIT  1;
  END IF;
  -- entity_id may be NULL if the parent quote has no entity_id set yet
  -- (e.g. a quote created without a contact/client). The audit row is still
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

REVOKE ALL ON FUNCTION public.fn_audit_quote_send() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_quote_send()
  TO service_role;

-- ============================================================
-- 3. Triggers
-- ============================================================
-- All triggers fire AFTER the DML so they see the committed row state.
-- DROP IF EXISTS + CREATE is the idempotent pattern used throughout this repo.

-- ── quotes — organization_id and entity_id are direct on the row ─────────
-- fn_generic_entity_audit() handles Strategy A (direct org_id) out of the box.
-- Noise cols in fn_generic_entity_audit include 'updated_at' already.
-- The trigger fires on all status transitions (estado), value changes,
-- assignment changes, soft-deletes (deleted_at/deleted_by), and creation.
DROP TRIGGER IF EXISTS trg_audit_quotes ON public.quotes;
CREATE TRIGGER trg_audit_quotes
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_generic_entity_audit();

-- ── quote_lines — org/entity resolved via quote_id → quotes ─────────────
-- NOTE: Due to the delete-all + re-insert pattern in QuoteBuilder.tsx and the
-- AI assistant, every save of an existing quote will produce a DELETE batch
-- followed by an INSERT batch here. Row UUIDs change on every save cycle.
-- Use quote_id + ordem + descricao_snapshot as logical identity when replaying
-- the audit log, not the row id.
DROP TRIGGER IF EXISTS trg_audit_quote_lines ON public.quote_lines;
CREATE TRIGGER trg_audit_quote_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_quote_child();

-- ── quote_fees — org/entity resolved via quote_id → quotes ──────────────
-- NOTE: Same delete-all + re-insert pattern applies via QuoteBuilder.tsx
-- (edit mode) and ai-assistant replaceQuoteFees(). Every fee change appears
-- as DELETE + INSERT pairs, not UPDATE rows. Use quote_id + fee_type_id as
-- logical identity when replaying.
DROP TRIGGER IF EXISTS trg_audit_quote_fees ON public.quote_fees;
CREATE TRIGGER trg_audit_quote_fees
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_fees
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_quote_child();

-- ── quote_sends — org direct, entity via quote_id → quotes, PII masked ──
-- Tracking increments (open_count, last_opened_at, first_opened_at,
-- total_view_time_seconds) are excluded from the diff to prevent pixel-beacon
-- noise in the audit log. All other state transitions are captured.
DROP TRIGGER IF EXISTS trg_audit_quote_sends ON public.quote_sends;
CREATE TRIGGER trg_audit_quote_sends
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_sends
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_quote_send();

-- ============================================================
-- 4. DELETE-ALL + RE-INSERT WORKAROUND — context and guidance
-- ============================================================
--
-- PROBLEM:
--   Two confirmed non-atomic delete-all + re-insert cycles exist in the Quotes
--   module. They cannot be made meaningful at the trigger level alone:
--
--   A. quote_lines — QuoteBuilder.tsx handleSave() (lines 1874, 1932):
--      On every edit of an existing quote, the client:
--        1. DELETE FROM quote_lines WHERE quote_id = $1
--        2. INSERT INTO quote_lines (…) VALUES (…), (…), …   ← new UUIDs
--      The trigger above logs the DELETE batch as individual DELETE rows and
--      the INSERT batch as individual INSERT rows. There is no UPDATE row for
--      lines that did not change. A reader replaying the log must correlate by
--      (quote_id, ordem, catalog_item_id) to reconstruct which lines changed.
--
--   B. quote_fees — QuoteBuilder.tsx (lines 1941, 1959) and
--      ai-assistant replaceQuoteFees() (lines 1775, 1780):
--      Same pattern. Use (quote_id, fee_type_id) as correlation key.
--
-- RECOMMENDED FIX (future migration):
--   Replace both cycles with a dedicated RPC function, e.g.:
--
--     CREATE OR REPLACE FUNCTION public.save_quote_lines(
--       p_quote_id  uuid,
--       p_lines     jsonb          -- array of line objects with optional "id"
--     ) RETURNS void ...
--
--   Inside the RPC:
--     • UPDATE existing rows by id when the id is present in p_lines
--     • INSERT rows that have no id (new lines)
--     • DELETE rows whose id is absent from p_lines (removed lines)
--   This produces true INSERT / UPDATE / DELETE audit events with stable row
--   identities and makes the audit diff meaningful without any trigger changes.
--
-- INTERIM GUIDANCE:
--   Until the RPC is implemented, consumers of entity_audit_log for quote_lines
--   and quote_fees should:
--     • Treat consecutive DELETE + INSERT batches with the same quote_id and
--       timestamp window (< 5 seconds) as a single logical "save" event.
--     • Compare the deleted full_record set against the inserted full_record set
--       to reconstruct what actually changed within that save.
--     • Do NOT rely on row id stability across save cycles.
