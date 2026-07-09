-- Restore app.audit_bypass guard dropped by the record_id migration
-- 2026-10-15 | Module: Deals / Orçamentos / Propostas (Auditoria)
-- Forward-only migration. Do not fold into or edit any prior migration.
--
-- Problem this migration solves
-- ------------------------------
-- 20261009010000_entity_audit_log_add_record_id.sql re-declared SEVEN audit
-- trigger functions via CREATE OR REPLACE, adding record_id resolution. It did
-- so from the WRONG baseline for all seven: the pre-bypass-guard bodies (the
-- versions from 20260625010000 / 20260627100000 / 20260628100000), not the
-- bypass-guarded versions that were actually live in the database at the time
-- (added by 20260719010000, 20260813010000, 20260815010000, 20260916010000 and
-- 20260917010000). Net effect: the `app.audit_bypass` short-circuit at the top
-- of each function was silently dropped for all seven functions.
--
--   · fn_generic_entity_audit()          guard added in 20260719010000
--   · fn_audit_quote_child()             guard added in 20260813010000
--   · fn_audit_proposal_child()          guard added in 20260815010000
--   · fn_audit_proposals_safe()          guard added in 20260813010000
--   · fn_audit_proposal_send()           guard added in 20260916010000
--   · fn_audit_proposal_verification()   guard added in 20260916010000
--   · fn_audit_quote_send()              guard added in 20260917010000
--
-- Symptom: any RPC that sets app.audit_bypass='on' and then writes to a table
-- wired to one of these (now-unguarded) triggers gets BOTH the trigger's own
-- audit row (record_id populated, full_record snapshot, changed_fields NULL)
-- AND the RPC's single consolidated fn_manual_audit_log(...) row — 2 rows for
-- 1 business action. Confirmed live for rpc_create_deal() (deals). The same
-- gap is latent for every other RPC in this set (rpc_save_quote, rpc_duplicate_
-- deal, rpc_create_proposal, rpc_update_proposal, etc.) that bypasses onto one
-- of these seven functions.
--
-- Fix
-- ---
-- CREATE OR REPLACE each of the seven functions using their CURRENT body
-- (verbatim, including record_id resolution and PII/token masking added by
-- 20261009010000), with the bypass guard reinserted as the first statement
-- inside BEGIN. No trigger DDL changes — the triggers already point at these
-- function names and keep doing so.
--
-- Guard-rail note: the previously-proposed pgTAP check ("assert prosrc LIKE
-- '%app.audit_bypass%'") is a text-matching check on function source, which is
-- exactly the kind of brittle, non-behavioral test the project's testing rule
-- forbids for migration SQL. The real regression test belongs at the
-- integration level: exercise rpc_create_deal() (and the other bypassing RPCs)
-- against a local Supabase instance and assert exactly ONE entity_audit_log
-- row per business action. Not added here — tracked separately per the
-- project's pgTAP/integration-test requirement.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql                    — fn_generic_entity_audit()
--   20260627100000_quotes_audit_triggers.sql                — fn_audit_quote_child(), fn_audit_quote_send()
--   20260628100000_proposals_audit_triggers.sql              — fn_audit_proposals_safe(), fn_audit_proposal_child(), fn_audit_proposal_send(), fn_audit_proposal_verification()
--   20260719010000_roles_audit_bypass_and_rpcs.sql           — app.audit_bypass guard + fn_manual_audit_log()
--   20260813010000_quotes_audit_bypass_child_trigger_fix.sql — guard on fn_audit_quote_child() / fn_audit_proposals_safe()
--   20260815010000_proposals_audit_bypass_and_rpcs.sql       — guard on fn_audit_proposal_child()
--   20260916010000_fix_proposal_send_verification_bypass.sql — guard on fn_audit_proposal_send() / fn_audit_proposal_verification()
--   20260917010000_fix_quote_send_bypass.sql                 — guard on fn_audit_quote_send()
--   20261009010000_entity_audit_log_add_record_id.sql        — record_id resolution (regressed the guards above)

-- ============================================================
-- 1. fn_generic_entity_audit()
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_generic_entity_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed_by    uuid;
  v_source        text;
  v_org_id        uuid;
  v_entity_id     uuid;
  v_record_id     uuid;
  v_old           jsonb;
  v_new           jsonb;
  v_changed       jsonb;
  v_full          jsonb;
  v_key           text;
  -- Columns that carry no semantic meaning for change-tracking
  v_noise_cols    text[] := ARRAY[
    'updated_at', 'search_text', 'contact_attempts', 'last_activity_at'
  ];
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000 (rebuilt from the pre-guard baseline).
  -- Originally added by 20260719010000. When a business RPC has already
  -- written a single consolidated audit row via fn_manual_audit_log(), it
  -- sets app.audit_bypass='on' (SET LOCAL) so this trigger writes nothing and
  -- the action produces exactly one log row.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_changed_by := (current_setting('app.audit_user_id', true))::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_changed_by := NULL;
  END;

  IF v_changed_by IS NULL THEN
    v_changed_by := COALESCE(
      public.current_business_user_id(),
      (
        SELECT au.id
        FROM public.anew_users au
        WHERE au.auth_user_id = (SELECT auth.uid())
        LIMIT 1
      )
    );
  END IF;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := current_setting('app.audit_source', true);
  IF v_source = '' THEN
    v_source := NULL;
  END IF;

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  IF TG_OP = 'DELETE' THEN
    v_record_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_record_id := (to_jsonb(NEW) ->> 'id')::uuid;
  END IF;

  -- ── Resolve entity_id ────────────────────────────────────────────────────
  -- Satellite tables use COALESCE(NEW.entity_id, OLD.entity_id) to handle
  -- DELETE where NEW is NULL.
  IF TG_OP = 'DELETE' THEN
    v_entity_id := (to_jsonb(OLD) ->> 'entity_id')::uuid;
    -- For tables whose PK *is* the entity (anew_entities), fall back to id.
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(OLD) ->> 'id')::uuid;
    END IF;
  ELSE
    v_entity_id := (to_jsonb(NEW) ->> 'entity_id')::uuid;
    IF v_entity_id IS NULL THEN
      v_entity_id := (to_jsonb(NEW) ->> 'id')::uuid;
    END IF;
  END IF;

  -- ── Resolve organization_id ──────────────────────────────────────────────
  -- Strategy A: table carries organization_id directly.
  IF TG_OP = 'DELETE' THEN
    v_org_id := (to_jsonb(OLD) ->> 'organization_id')::uuid;
  ELSE
    v_org_id := (to_jsonb(NEW) ->> 'organization_id')::uuid;
  END IF;

  -- Strategy B: no direct organization_id — look up via role tables.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT er.organization_id
    INTO   v_org_id
    FROM   public.anew_entity_roles er
    WHERE  er.entity_id  = v_entity_id
      AND  er.deleted_at IS NULL
    ORDER BY er.created_at DESC
    LIMIT 1;
  END IF;

  -- Strategy C: satellite tables joined through their parent lead/contact/client.
  IF v_org_id IS NULL AND v_entity_id IS NOT NULL THEN
    SELECT COALESCE(l.organization_id, c.organization_id, cl.organization_id)
    INTO   v_org_id
    FROM   (SELECT NULL::uuid) dummy
    LEFT JOIN public.anew_leads    l  ON l.entity_id  = v_entity_id AND l.deleted_at IS NULL
    LEFT JOIN public.anew_contacts c  ON c.entity_id  = v_entity_id AND c.deleted_at IS NULL
    LEFT JOIN public.anew_clients  cl ON cl.entity_id = v_entity_id AND cl.deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- Cannot determine org — skip silently to avoid polluting the log.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── Build changed_fields / full_record ───────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    v_changed := NULL;
    v_full    := to_jsonb(NEW);

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'INSERT',
         v_changed, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new) AS t(key)
    LOOP
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        v_changed := v_changed || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      END IF;
    END LOOP;

    -- Only write a row when something meaningful actually changed.
    IF v_changed = '{}'::jsonb OR v_changed IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'UPDATE',
         v_changed, NULL, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    v_full := to_jsonb(OLD);

    BEGIN
      INSERT INTO public.entity_audit_log
        (organization_id, entity_id, record_id, table_name, operation,
         changed_fields, full_record, changed_by, source)
      VALUES
        (v_org_id, v_entity_id, v_record_id, TG_TABLE_NAME, 'DELETE',
         NULL, v_full, v_changed_by, v_source);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN OLD;
  END IF;

  -- Fallback — should never reach here.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;

EXCEPTION WHEN OTHERS THEN
  -- The audit trigger must never block the originating DML.
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generic_entity_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_generic_entity_audit()
  TO service_role;

-- ============================================================
-- 2. fn_audit_quote_child() — quote_lines, quote_fees
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_quote_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000. Originally added by 20260813010000.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
-- 3. fn_audit_quote_send() — quote_sends
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_quote_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000. Originally added by 20260917010000.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
-- 4. fn_audit_proposals_safe() — proposals
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_proposals_safe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000. Originally added by 20260813010000.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
-- 5. fn_audit_proposal_child() — proposal_items, proposal_manual_items
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000. Originally added by 20260815010000.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
-- 6. fn_audit_proposal_send() — proposal_sends
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_send()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000. Originally added by 20260916010000.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
  -- (e.g. a proposal created without a contact/client). The audit row is
  -- still written — org context is sufficient.

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
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
-- 7. fn_audit_proposal_verification() — proposal_verification_codes
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id         uuid;
  v_entity_id      uuid;
  v_record_id      uuid;
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Restored: dropped by 20261009010000. Originally added by 20260916010000.
  IF current_setting('app.audit_bypass', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── Resolve actor ────────────────────────────────────────────────────────
  BEGIN
    v_user_id := nullif(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- ── Resolve source ───────────────────────────────────────────────────────
  v_source := nullif(current_setting('app.audit_source', true), '');

  -- ── Resolve record_id (the audited row's own PK) ────────────────────────
  v_record_id := COALESCE(
    (to_jsonb(NEW) ->> 'id')::uuid,
    (to_jsonb(OLD) ->> 'id')::uuid
  );

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
      (organization_id, entity_id, record_id, table_name, operation,
       changed_fields, full_record, changed_by, source, created_at)
    VALUES
      (v_org_id,
       v_entity_id,
       v_record_id,
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
-- Verification notes (not executed)
-- ============================================================
-- 1. Guard present again on all seven functions:
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_generic_entity_audit', 'fn_audit_quote_child',
--                      'fn_audit_quote_send', 'fn_audit_proposals_safe',
--                      'fn_audit_proposal_child', 'fn_audit_proposal_send',
--                      'fn_audit_proposal_verification')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: all seven rows.
--
-- 2. rpc_create_deal(...) now produces exactly ONE entity_audit_log row for
--    table_name = 'deals', operation = 'INSERT' per call (previously 2).
--
-- 3. No behavior change for plain (non-bypassed) DML on deals/quotes/
--    quote_lines/quote_fees/proposals/proposal_items/proposal_manual_items/
--    proposal_sends/proposal_verification_codes — record_id resolution, PII
--    masking and token stripping added by 20261009010000 are preserved
--    verbatim.
