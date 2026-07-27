-- Fix: quote_template_items has NO audit trigger at all, so entity_audit_log
-- never sees INSERT/UPDATE/DELETE activity on quote template line items.
--
-- PROBLEM (confirmed live against the linked remote DB, not just code reading):
--   `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--    WHERE tgrelid = 'public.quote_template_items'::regclass AND NOT tgisinternal`
--   returns ZERO rows — not even an updated_at maintenance trigger (the table
--   has no updated_at column).
--
--   `SELECT count(*) FROM entity_audit_log WHERE table_name = 'quote_template_items'`
--   returns 0, confirming the tester's report: every insert/update/delete of a
--   quote template's line items (product/service/bundle rows configured via
--   src/components/QuoteTemplateEditor.tsx and src/pages/QuoteModels.tsx) is
--   completely unaudited, unlike its sibling table quote_templates, which
--   IS correctly audited via trg_audit_quote_templates
--   (20261110420000_quote_templates_audit_trigger.sql).
--
-- SCOPE CHECK — other line-item-style tables suspected of the same gap:
--   Queried pg_trigger live for proposal_manual_items and deal_need_items —
--   BOTH already have a working audit trigger:
--     trg_audit_proposal_manual_items -> fn_audit_proposal_child()
--     trg_audit_deal_need_items       -> fn_audit_deal_child()
--   So this migration fixes ONLY quote_template_items; proposal_manual_items
--   and deal_need_items are NOT gaps (confirmed live, not assumed).
--
-- WHY THIS IS A "CHILD TABLE" (Group B), unlike quote_templates:
--   information_schema.columns for quote_template_items (confirmed live):
--     id, template_id, product_id, default_qt, required, ordem, created_at,
--     service_id, item_type, default_attributes, bundle_id
--   There is no organization_id and no entity_id column on this table — the
--   org must be resolved via template_id -> quote_templates.organization_id,
--   exactly the same shape as quote_lines (child of quotes) and
--   deal_need_items (child of deal_needs -> deals). The existing generic
--   trigger public.fn_generic_entity_audit() only knows Strategy A (direct
--   organization_id column) and Strategy B/C (via anew_entity_roles /
--   anew_leads/contacts/clients through entity_id) — none of which apply
--   here, so a bespoke child-audit function is required, following the exact
--   pattern of public.fn_audit_quote_child() (20260627100000) and
--   public.fn_audit_deal_child() (20260626200000 / 20261110070000).
--
--   quote_templates itself has no entity_id column either; its own audit rows
--   (confirmed live) carry entity_id = the template's own id (the generic
--   trigger's fallback: "entity_id := NEW.id when NEW.entity_id is NULL").
--   To stay consistent with that observed behavior, this function sets
--   entity_id = template_id (the parent template's own id) rather than NULL,
--   mirroring what quote_templates' own audit rows already look like.
--
-- FIX:
--   1. Define public.fn_audit_quote_template_item(), a bespoke child-audit
--      trigger function that resolves organization_id (and entity_id, per
--      the note above) via template_id -> quote_templates, following the
--      same bypass guard / actor / source / changed_fields / noise-column
--      structure as fn_audit_quote_child() and fn_audit_deal_child().
--   2. Attach it to quote_template_items via a simple
--      AFTER INSERT OR UPDATE OR DELETE trigger, using the same
--      DROP TRIGGER IF EXISTS + CREATE TRIGGER idiom used throughout this
--      repo's audit migrations.

CREATE OR REPLACE FUNCTION public.fn_audit_quote_template_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_template_id    uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- Same guard used by every other generic/child audit trigger in this repo
  -- (fn_generic_entity_audit, fn_audit_quote_child, fn_audit_deal_child,
  -- fn_audit_proposal_child): when a business RPC has already written a
  -- single consolidated audit row via fn_manual_audit_log(), it sets
  -- app.audit_bypass='on' (SET LOCAL) so this trigger writes nothing.
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

  -- ── Resolve template_id from whichever side is available ────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_template_id := COALESCE(
    (to_jsonb(NEW) ->> 'template_id')::uuid,
    (to_jsonb(OLD) ->> 'template_id')::uuid
  );

  -- ── Resolve organization_id via parent quote_templates ───────────────────
  -- quote_templates has no entity_id column; use its own id as entity_id,
  -- matching what quote_templates' own audit rows already record
  -- (confirmed live: entity_id = record_id = the template's id).
  IF v_template_id IS NOT NULL THEN
    SELECT qt.organization_id, qt.id
    INTO   v_org_id, v_entity_id
    FROM   public.quote_templates qt
    WHERE  qt.id = v_template_id
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
$function$;

DROP TRIGGER IF EXISTS trg_audit_quote_template_items ON public.quote_template_items;
CREATE TRIGGER trg_audit_quote_template_items
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_template_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_quote_template_item();

-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. After this migration, inserting/updating/deleting a quote_template_items
--    row (via QuoteTemplateEditor.tsx or QuoteModels.tsx, or the
--    duplicate_quote_template() RPC's bulk INSERT ... SELECT FROM
--    quote_template_items) should produce one INSERT/UPDATE/DELETE row in
--    entity_audit_log with table_name = 'quote_template_items',
--    organization_id populated from the parent template's organization_id,
--    and entity_id/record_id populated (record_id = the item's own id,
--    entity_id = the parent template's id).
-- 2. `SELECT * FROM pg_trigger WHERE tgrelid = 'quote_template_items'::regclass
--     AND NOT tgisinternal` should now return exactly one row:
--     trg_audit_quote_template_items -> fn_audit_quote_template_item().
-- 3. Deleting a quote template (which cascades to quote_template_items via
--    ON DELETE CASCADE) will fire this trigger once per cascaded item row,
--    same as any other child-table audit trigger in this schema.
