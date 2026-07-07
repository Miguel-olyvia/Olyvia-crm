-- ============================================================
-- Preventive fix: fn_audit_proposal_send and fn_audit_proposal_verification
-- (triggers on proposal_sends / proposal_verification_codes) were missing
-- the standard app.audit_bypass guard present in their sibling
-- fn_audit_proposal_child (fixed in 20260815010000). No live business RPC
-- currently writes to these two tables under app.audit_bypass=on, so this
-- gap was dormant (confirmed via E2E testing of the Propostas module),
-- but is fixed defensively so a future atomic RPC cannot leak extra rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_send()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row. This
  -- guard was missing here (unlike its sibling fn_audit_proposal_child), added
  -- defensively so a future atomic RPC touching this table cannot leak rows.
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row. This
  -- guard was missing here (unlike its sibling fn_audit_proposal_child), added
  -- defensively so a future atomic RPC touching this table cannot leak rows.
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
$function$
;
