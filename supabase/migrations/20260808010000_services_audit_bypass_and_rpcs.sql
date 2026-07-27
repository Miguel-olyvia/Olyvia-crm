-- Serviços — single-log RPCs (reuses the audit-bypass foundation)
-- 2026-08-08 | Module: Serviços / servicos
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Today one user action on a service is issued from the frontend as SEVERAL independent
-- Supabase calls, each its own Postgres transaction (src/pages/Services.tsx):
--   · handleSubmit (create)  → INSERT services + INSERT service_organizations
--                              + per price_type: SELECT + INSERT/UPDATE service_prices  (5 calls)
--   · handleSubmit (update)  → UPDATE services + DELETE service_organizations
--                              + INSERT service_organizations
--                              + per price_type: SELECT + INSERT/UPDATE service_prices
--   · handleDeleteConfirm    → DELETE services (service_organizations cascades)
--   · saveInlineEdit         → UPDATE services (single field)
--   · useBulkActions.handleBulkStatusChange → UPDATE services (is_active) over a set
--   · useBulkActions.handleBulkDelete       → DELETE services over a set
--   · parseServicesCSV (import) → per row: INSERT/UPDATE services + DELETE/INSERT
--                                 service_prices + INSERT service_organizations
-- Every touched table (services, service_prices, service_organizations) has an AFTER
-- trigger writing to entity_audit_log, so one "save service" produces N audit rows when
-- the business intent is exactly 1.
--
-- Solution
-- --------
-- The audit-bypass foundation already exists — grep for "app.audit_bypass" /
-- "fn_manual_audit_log" returns 20260719010000_roles_audit_bypass_and_rpcs.sql, which
-- created:
--   · the per-transaction GUC `app.audit_bypass` (SET LOCAL 'on' short-circuits the audit
--     triggers), guarded at the top of fn_generic_entity_audit()  ← already covers
--     `services`, `service_organizations` (both wired to fn_generic_entity_audit per
--     20260702010000_services_audit_triggers.sql §3)
--   · the reusable public.fn_manual_audit_log(text,uuid,uuid,text,jsonb,text) writer
-- This migration REUSES both and does NOT recreate them.
--
-- The ONLY foundation piece still missing for this module is the bypass guard on
-- fn_audit_service_prices() — the SATELLITE trigger that fires on service_prices (that
-- table is NOT wired to the generic function; it has its own function per
-- 20260702010000 §2/§3). It was defined WITHOUT the guard, so a consolidating RPC that
-- sets app.audit_bypass='on' would still get a duplicate row from it. We add the guard
-- here with CREATE OR REPLACE — body byte-identical to 20260702010000 §2 except for the
-- new guard as the first statement. The trigger itself is NOT touched. (Note:
-- service_price_change_trigger → log_service_price_change() writes to service_price_history,
-- a DIFFERENT functional-history table, NOT entity_audit_log; it is intentionally left
-- firing and is unrelated to the audit-log duplication this migration removes.)
--
-- Then six RPCs reproduce, field-for-field, condition-for-condition, what Services.tsx and
-- its helpers do today, each inside a single transaction with app.audit_bypass='on',
-- accumulating a combined diff ({table:{col:{old,new}}}) and calling fn_manual_audit_log
-- ONCE (per row, for the CSV import — source='csv_import'):
--   · rpc_create_service        — Services.tsx handleSubmit (create branch)
--   · rpc_update_service        — Services.tsx handleSubmit (update branch) + saveInlineEdit
--   · rpc_delete_service        — Services.tsx handleDeleteConfirm
--   · rpc_bulk_status_service   — useBulkActions.handleBulkStatusChange (is_active)
--   · rpc_bulk_delete_service   — useBulkActions.handleBulkDelete (hard delete)
--   · rpc_import_service_csv    — parseServicesCSV per-row upsert (source='csv_import')
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on services / service_prices / service_organizations
-- does NOT self-enforce inside them. Each RPC re-checks, explicitly, the SAME predicates the
-- RLS policies enforce today (baseline 20260615130000 + 20260702000000_services_security_fixes):
--   services_insert  : created_by = current_business_user_id()
--                      AND organization_id IS NOT NULL
--                      AND organization_id IN visible_orgs
--                      AND has_anew_permission(uid,'services.create')
--   services_update  : organization_id IN visible_orgs
--                      AND has_anew_permission(uid,'services.edit')   (USING + WITH CHECK)
--   services_delete  : organization_id IN visible_orgs
--                      AND has_anew_permission(uid,'services.delete')
--   service_prices_insert : created_by = current_business_user_id()
--                      AND (is_system_admin_user(uid)
--                           OR ((services.create OR services.edit)
--                               AND parent service.org IN visible_orgs))
--   service_prices_update : is_system_admin_user(uid)
--                           OR (services.edit AND parent service.org IN visible_orgs)
--   service_prices_delete : is_system_admin_user(uid)
--                           OR (services.delete AND parent service.org IN visible_orgs)
--   service_organizations_insert/delete : is_system_admin_user(uid)
--                           OR (services.edit AND organization_id IN visible_orgs)
-- is_system_admin_user(uid) bypasses the permission/visibility gate on each table exactly
-- like the RLS policies. The `services` policies themselves have NO admin OR-branch in the
-- baseline; the RPCs mirror that precisely (no admin shortcut on the services table).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql            — entity_audit_log + fn_generic_entity_audit()
--   20260702010000_services_audit_triggers.sql     — fn_audit_service_prices() (+ generic wiring)
--   20260719010000_roles_audit_bypass_and_rpcs.sql — app.audit_bypass guard on
--                                                     fn_generic_entity_audit() + fn_manual_audit_log()
--   20260702000000_services_security_fixes.sql     — service_prices / service_organizations RLS
--   20260615130000_baseline_new_database.sql        — services RLS, has_anew_permission(),
--                                                     current_business_user_id(), get_user_visible_org_ids(),
--                                                     is_system_admin_user()


-- ============================================================
-- 1. fn_audit_service_prices() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260702010000_services_audit_triggers.sql §2 except for the new
-- guard as the first statement. The guard runs BEFORE any other logic. The trigger
-- registration (trg_audit_service_prices) is NOT touched.

CREATE OR REPLACE FUNCTION public.fn_audit_service_prices()
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
  v_service_id     uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC has already written a single consolidated audit row via
  -- fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL) so this
  -- trigger writes nothing and the action produces exactly one log row.
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

  -- ── Resolve service_id from whichever side is available ─────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_service_id := COALESCE(
    (to_jsonb(NEW) ->> 'service_id')::uuid,
    (to_jsonb(OLD) ->> 'service_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent service ─────────────
  -- entity_id is set to the parent service's id so that audit rows for price
  -- changes group under the service entity timeline (not the price row itself).
  IF v_service_id IS NOT NULL THEN
    SELECT s.organization_id, s.id
    INTO   v_org_id, v_entity_id
    FROM   public.services s
    WHERE  s.id = v_service_id
    LIMIT  1;
  END IF;

  -- Cannot determine org — skip silently.
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

REVOKE ALL ON FUNCTION public.fn_audit_service_prices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_service_prices() TO service_role;


-- ============================================================
-- Shared helper: build the two service_prices rows exactly like handleSubmit
-- ============================================================
-- The frontend, for both create and update, always upserts BOTH price rows
-- (purchase + retail) with the SAME currency/vat_rate. We reproduce that upsert
-- (SELECT existing by (service_id, price_type); UPDATE if present else INSERT)
-- inline in the create/update RPCs below rather than in a separate function, to
-- keep the diff accumulation local.


-- ============================================================
-- 2a. rpc_create_service(...)
-- ============================================================
-- Mirrors Services.tsx handleSubmit (create branch):
--   serviceData = {sku, name, slug=lower(name w/ '-'), is_active=(status='active'),
--                  organization_id=primaryCompanyId, service_type,
--                  long_desc? (only if description), service_category_id? (only if set),
--                  service_subcategory_id? (only if set), created_by=businessUserId}
--   INSERT services → serviceId
--   for each orgId in allOrgIds: INSERT service_organizations {service_id, organization_id, created_by}
--   for price_type in (purchase, retail): upsert service_prices
--     {service_id, price_type, price=value||0, currency, vat_rate, created_by}
-- The FE derives slug in JS; we accept p_slug (already derived) to avoid casing drift.
-- p_org_ids is the multi-select company list (getAllOrgIds); may be empty (FE tolerates it).
-- Returns the created services row.
--
-- Authorization mirrors services_insert + service_organizations_insert + service_prices_insert.

CREATE OR REPLACE FUNCTION public.rpc_create_service(
  p_sku             text,
  p_name            text,
  p_slug            text,
  p_long_desc       text,
  p_service_type    text,
  p_is_active       boolean,
  p_organization_id uuid,
  p_category_id     uuid,
  p_subcategory_id  uuid,
  p_org_ids         uuid[],
  p_purchase        numeric,
  p_retail          numeric,
  p_currency        text,
  p_vat_rate        numeric
)
RETURNS public.services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_uid         uuid := (SELECT auth.uid());
  v_admin       boolean;
  v_row         public.services;
  v_org         uuid;
  v_added_orgs  uuid[] := ARRAY[]::uuid[];
  v_diff        jsonb;
  v_price_diff  jsonb := '{}'::jsonb;
  v_existing    uuid;
  v_ptype       text;
  v_pvalue      numeric;
  v_ptypes      text[] := ARRAY['purchase', 'retail'];
  i             integer;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user(v_uid);

  -- ── Authorization parity with services_insert (no admin OR-branch on services) ──
  IF NOT public.has_anew_permission(v_uid, 'services.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the service (identical conditional column set to handleSubmit) ──
  INSERT INTO public.services
    (sku, name, slug, is_active, organization_id, service_type,
     long_desc, service_category_id, service_subcategory_id, created_by)
  VALUES
    (p_sku,
     p_name,
     p_slug,
     COALESCE(p_is_active, true),
     p_organization_id,
     p_service_type,
     nullif(p_long_desc, ''),
     p_category_id,
     p_subcategory_id,
     v_actor)
  RETURNING * INTO v_row;

  -- ── INSERT service_organizations (only when the list is non-empty, like the FE) ──
  IF p_org_ids IS NOT NULL AND array_length(p_org_ids, 1) > 0 THEN
    FOREACH v_org IN ARRAY p_org_ids LOOP
      -- Authorization parity with service_organizations_insert per row.
      IF NOT v_admin THEN
        IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
          RAISE EXCEPTION 'Sem permissão para associar empresas ao serviço'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
          RAISE EXCEPTION 'Empresa associada fora do âmbito do utilizador'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;

      INSERT INTO public.service_organizations (service_id, organization_id, created_by)
      VALUES (v_row.id, v_org, v_actor);
      v_added_orgs := v_added_orgs || v_org;
    END LOOP;
  END IF;

  -- ── Upsert both price rows (purchase + retail), matching handleSubmit ──────
  FOR i IN 1..2 LOOP
    v_ptype  := v_ptypes[i];
    v_pvalue := COALESCE(CASE WHEN v_ptype = 'purchase' THEN p_purchase ELSE p_retail END, 0);

    SELECT id INTO v_existing
    FROM public.service_prices
    WHERE service_id = v_row.id AND price_type = v_ptype
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE public.service_prices
      SET price = v_pvalue, currency = p_currency, vat_rate = p_vat_rate, created_by = v_actor
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.service_prices
        (service_id, price_type, price, currency, vat_rate, created_by)
      VALUES (v_row.id, v_ptype, v_pvalue, p_currency, p_vat_rate, v_actor);
    END IF;

    v_price_diff := v_price_diff || jsonb_build_object(
      v_ptype, jsonb_build_object('old', NULL, 'new', to_jsonb(v_pvalue))
    );
  END LOOP;

  -- ── Combined diff: full snapshot of the created service + orgs + prices ────
  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'sku',                    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.sku)),
      'name',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
      'slug',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.slug)),
      'is_active',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active)),
      'organization_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.organization_id)),
      'service_type',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_type)),
      'long_desc',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.long_desc)),
      'service_category_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_category_id)),
      'service_subcategory_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_subcategory_id))
    ),
    'service_prices', v_price_diff
  );

  IF array_length(v_added_orgs, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'service_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_added_orgs))
      )
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'services', v_row.id, v_row.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_service(text, text, text, text, text, boolean, uuid, uuid, uuid, uuid[], numeric, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_service(text, text, text, text, text, boolean, uuid, uuid, uuid, uuid[], numeric, numeric, text, numeric) TO authenticated;


-- ============================================================
-- 2b. rpc_update_service(...)
-- ============================================================
-- Mirrors Services.tsx handleSubmit (update branch):
--   UPDATE services SET {sku, name, slug, is_active, organization_id, service_type,
--                        long_desc (nullif ''), service_category_id, service_subcategory_id}
--     WHERE id = editingService.id
--   DELETE service_organizations WHERE service_id = id
--   for each orgId in allOrgIds: INSERT service_organizations {service_id, organization_id, created_by}
--   for price_type in (purchase, retail): upsert service_prices
-- NOTE the FE keeps the SKU field disabled in edit mode; it still sends the same value, so
-- passing it through is a no-op change and produces no diff — behaviour preserved.
-- saveInlineEdit (single-field UPDATE of services) is ALSO served by this RPC: the caller
-- passes the full current values with only the edited field changed, p_org_ids = NULL
-- (sentinel: "do not touch service_organizations") and price params NULL (sentinel:
-- "do not touch service_prices"). This keeps inline edits to a single service UPDATE with
-- one audit row, exactly as the FE intends.
-- Returns the updated services row.
--
-- Authorization mirrors services_update (USING + WITH CHECK) + service_organizations_*
-- + service_prices_update/insert.

CREATE OR REPLACE FUNCTION public.rpc_update_service(
  p_id              uuid,
  p_sku             text,
  p_name            text,
  p_slug            text,
  p_long_desc       text,
  p_service_type    text,
  p_is_active       boolean,
  p_organization_id uuid,
  p_category_id     uuid,
  p_subcategory_id  uuid,
  p_org_ids         uuid[],
  p_touch_orgs      boolean,
  p_touch_prices    boolean,
  p_purchase        numeric,
  p_retail          numeric,
  p_currency        text,
  p_vat_rate        numeric
)
RETURNS public.services
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_uid         uuid := (SELECT auth.uid());
  v_admin       boolean;
  v_before      public.services;
  v_row         public.services;
  v_org         uuid;
  v_added_orgs  uuid[] := ARRAY[]::uuid[];
  v_old_orgs    uuid[];
  v_diff        jsonb  := '{}'::jsonb;
  v_svc         jsonb  := '{}'::jsonb;
  v_price_diff  jsonb  := '{}'::jsonb;
  v_existing    uuid;
  v_old_price   numeric;
  v_ptype       text;
  v_pvalue      numeric;
  v_ptypes      text[] := ARRAY['purchase', 'retail'];
  i             integer;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user(v_uid);

  -- ── Authorization parity with services_update (no admin OR-branch on services) ──
  IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- USING: pre-update org must be visible.
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- WITH CHECK: post-update org must also be visible.
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização de destino fora do âmbito do utilizador'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the service (identical column set to handleSubmit) ─────────────
  UPDATE public.services
  SET sku                    = p_sku,
      name                   = p_name,
      slug                   = p_slug,
      is_active              = COALESCE(p_is_active, v_before.is_active),
      organization_id        = p_organization_id,
      service_type           = p_service_type,
      long_desc              = nullif(p_long_desc, ''),
      service_category_id    = p_category_id,
      service_subcategory_id = p_subcategory_id
  WHERE id = p_id
  RETURNING * INTO v_row;

  -- ── Rewrite service_organizations (delete all + re-insert), only when asked ──
  IF COALESCE(p_touch_orgs, false) THEN
    SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
    INTO   v_old_orgs
    FROM   public.service_organizations
    WHERE  service_id = p_id;

    DELETE FROM public.service_organizations WHERE service_id = p_id;

    IF p_org_ids IS NOT NULL AND array_length(p_org_ids, 1) > 0 THEN
      FOREACH v_org IN ARRAY p_org_ids LOOP
        IF NOT v_admin THEN
          IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
            RAISE EXCEPTION 'Sem permissão para associar empresas ao serviço'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
          IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
            RAISE EXCEPTION 'Empresa associada fora do âmbito do utilizador'
              USING ERRCODE = 'insufficient_privilege';
          END IF;
        END IF;

        INSERT INTO public.service_organizations (service_id, organization_id, created_by)
        VALUES (p_id, v_org, v_actor);
        v_added_orgs := v_added_orgs || v_org;
      END LOOP;
    END IF;

    -- Record only when the org set actually changed (order-insensitive).
    IF EXISTS (SELECT unnest(v_old_orgs) EXCEPT SELECT unnest(v_added_orgs))
       OR EXISTS (SELECT unnest(v_added_orgs) EXCEPT SELECT unnest(v_old_orgs)) THEN
      v_diff := v_diff || jsonb_build_object(
        'service_organizations', jsonb_build_object(
          'organization_id', jsonb_build_object(
            'old', to_jsonb(v_old_orgs), 'new', to_jsonb(v_added_orgs)
          )
        )
      );
    END IF;
  END IF;

  -- ── Upsert both price rows, only when asked ────────────────────────────────
  IF COALESCE(p_touch_prices, false) THEN
    FOR i IN 1..2 LOOP
      v_ptype  := v_ptypes[i];
      v_pvalue := COALESCE(CASE WHEN v_ptype = 'purchase' THEN p_purchase ELSE p_retail END, 0);

      SELECT id, price INTO v_existing, v_old_price
      FROM public.service_prices
      WHERE service_id = p_id AND price_type = v_ptype
      LIMIT 1;

      IF v_existing IS NOT NULL THEN
        UPDATE public.service_prices
        SET price = v_pvalue, currency = p_currency, vat_rate = p_vat_rate, created_by = v_actor
        WHERE id = v_existing;
        IF v_old_price IS DISTINCT FROM v_pvalue THEN
          v_price_diff := v_price_diff || jsonb_build_object(
            v_ptype, jsonb_build_object('old', to_jsonb(v_old_price), 'new', to_jsonb(v_pvalue))
          );
        END IF;
      ELSE
        INSERT INTO public.service_prices
          (service_id, price_type, price, currency, vat_rate, created_by)
        VALUES (p_id, v_ptype, v_pvalue, p_currency, p_vat_rate, v_actor);
        v_price_diff := v_price_diff || jsonb_build_object(
          v_ptype, jsonb_build_object('old', NULL, 'new', to_jsonb(v_pvalue))
        );
      END IF;
    END LOOP;

    IF v_price_diff <> '{}'::jsonb THEN
      v_diff := v_diff || jsonb_build_object('service_prices', v_price_diff);
    END IF;
  END IF;

  -- ── Build the services diff (only changed columns) ─────────────────────────
  IF v_before.sku IS DISTINCT FROM v_row.sku THEN
    v_svc := v_svc || jsonb_build_object('sku', jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_row.sku)));
  END IF;
  IF v_before.name IS DISTINCT FROM v_row.name THEN
    v_svc := v_svc || jsonb_build_object('name', jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_row.name)));
  END IF;
  IF v_before.slug IS DISTINCT FROM v_row.slug THEN
    v_svc := v_svc || jsonb_build_object('slug', jsonb_build_object('old', to_jsonb(v_before.slug), 'new', to_jsonb(v_row.slug)));
  END IF;
  IF v_before.is_active IS DISTINCT FROM v_row.is_active THEN
    v_svc := v_svc || jsonb_build_object('is_active', jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_row.is_active)));
  END IF;
  IF v_before.organization_id IS DISTINCT FROM v_row.organization_id THEN
    v_svc := v_svc || jsonb_build_object('organization_id', jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', to_jsonb(v_row.organization_id)));
  END IF;
  IF v_before.service_type IS DISTINCT FROM v_row.service_type THEN
    v_svc := v_svc || jsonb_build_object('service_type', jsonb_build_object('old', to_jsonb(v_before.service_type), 'new', to_jsonb(v_row.service_type)));
  END IF;
  IF v_before.long_desc IS DISTINCT FROM v_row.long_desc THEN
    v_svc := v_svc || jsonb_build_object('long_desc', jsonb_build_object('old', to_jsonb(v_before.long_desc), 'new', to_jsonb(v_row.long_desc)));
  END IF;
  IF v_before.service_category_id IS DISTINCT FROM v_row.service_category_id THEN
    v_svc := v_svc || jsonb_build_object('service_category_id', jsonb_build_object('old', to_jsonb(v_before.service_category_id), 'new', to_jsonb(v_row.service_category_id)));
  END IF;
  IF v_before.service_subcategory_id IS DISTINCT FROM v_row.service_subcategory_id THEN
    v_svc := v_svc || jsonb_build_object('service_subcategory_id', jsonb_build_object('old', to_jsonb(v_before.service_subcategory_id), 'new', to_jsonb(v_row.service_subcategory_id)));
  END IF;

  IF v_svc <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('services', v_svc);
  END IF;

  -- Emit a single UPDATE row only when something meaningful changed (matches the
  -- trigger's "skip when nothing changed"). Route under the post-update org.
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'services', p_id, v_row.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_service(uuid, text, text, text, text, text, boolean, uuid, uuid, uuid, uuid[], boolean, boolean, numeric, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_service(uuid, text, text, text, text, text, boolean, uuid, uuid, uuid, uuid[], boolean, boolean, numeric, numeric, text, numeric) TO authenticated;


-- ============================================================
-- 2c. rpc_delete_service(...)
-- ============================================================
-- Mirrors Services.tsx handleDeleteConfirm:
--   DELETE FROM services WHERE id
-- service_organizations rows cascade via FK (ON DELETE CASCADE, added in
-- 20260702000000 §5), and service_prices cascade the same way — so the FE issues a single
-- delete. We reproduce exactly (one DELETE) and emit one DELETE audit row with a snapshot
-- of the removed service plus its former org associations for completeness.
-- Returns void.
--
-- Authorization mirrors services_delete.

CREATE OR REPLACE FUNCTION public.rpc_delete_service(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor     uuid;
  v_uid       uuid := (SELECT auth.uid());
  v_before    public.services;
  v_old_orgs  uuid[];
  v_diff      jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.services WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serviço não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with services_delete ────────────────────────────
  IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Snapshot former org associations before the cascade removes them.
  SELECT COALESCE(array_agg(organization_id ORDER BY organization_id), ARRAY[]::uuid[])
  INTO   v_old_orgs
  FROM   public.service_organizations
  WHERE  service_id = p_id;

  DELETE FROM public.services WHERE id = p_id;

  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'sku',                    jsonb_build_object('old', to_jsonb(v_before.sku), 'new', NULL),
      'name',                   jsonb_build_object('old', to_jsonb(v_before.name), 'new', NULL),
      'slug',                   jsonb_build_object('old', to_jsonb(v_before.slug), 'new', NULL),
      'is_active',              jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', NULL),
      'organization_id',        jsonb_build_object('old', to_jsonb(v_before.organization_id), 'new', NULL),
      'service_type',           jsonb_build_object('old', to_jsonb(v_before.service_type), 'new', NULL),
      'long_desc',              jsonb_build_object('old', to_jsonb(v_before.long_desc), 'new', NULL),
      'service_category_id',    jsonb_build_object('old', to_jsonb(v_before.service_category_id), 'new', NULL),
      'service_subcategory_id', jsonb_build_object('old', to_jsonb(v_before.service_subcategory_id), 'new', NULL)
    )
  );

  IF array_length(v_old_orgs, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'service_organizations', jsonb_build_object(
        'organization_id', jsonb_build_object('old', to_jsonb(v_old_orgs), 'new', NULL)
      )
    );
  END IF;

  PERFORM public.fn_manual_audit_log(
    'services', p_id, v_before.organization_id, 'DELETE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_service(uuid) TO authenticated;


-- ============================================================
-- 2d. rpc_bulk_status_service(...)
-- ============================================================
-- Mirrors useBulkActions.handleBulkStatusChange('is_active') for the services table:
--   UPDATE services SET is_active = (bulkNewStatus='active')
--     WHERE id IN (selectedIds) AND organization_id = organizationId
-- The hook always scopes bulk writes to a single organizationId (throws if absent). We
-- reproduce that exact scope. One consolidated UPDATE audit row is emitted per service
-- actually changed (so a status flip over N services produces N audit rows total, one per
-- entity — NOT N-per-table; each row already touches a single table). Returns the count.
--
-- Authorization mirrors services_update.

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_service(
  p_ids             uuid[],
  p_is_active       boolean,
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_rec    record;
  v_diff   jsonb;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with services_update ────────────────────────────
  IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Update only rows in the target org (same scope as the hook), one audit row each.
  FOR v_rec IN
    UPDATE public.services s
    SET is_active = COALESCE(p_is_active, s.is_active)
    WHERE s.id = ANY(p_ids)
      AND s.organization_id = p_organization_id
      AND s.is_active IS DISTINCT FROM COALESCE(p_is_active, s.is_active)
    RETURNING s.id, s.organization_id, (NOT p_is_active) AS old_active, p_is_active AS new_active
  LOOP
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'is_active', jsonb_build_object('old', to_jsonb(v_rec.old_active), 'new', to_jsonb(v_rec.new_active))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_rec.id, v_rec.organization_id, 'UPDATE', v_diff, 'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_service(uuid[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_service(uuid[], boolean, uuid) TO authenticated;


-- ============================================================
-- 2e. rpc_bulk_delete_service(...)
-- ============================================================
-- Mirrors useBulkActions.handleBulkDelete (Services passes softDelete:false → hard delete):
--   DELETE FROM services WHERE id IN (selectedIds) AND organization_id = organizationId
-- service_organizations / service_prices cascade. One DELETE audit row per removed service.
-- Returns the count.
--
-- Authorization mirrors services_delete.

CREATE OR REPLACE FUNCTION public.rpc_bulk_delete_service(
  p_ids             uuid[],
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_rec    record;
  v_diff   jsonb;
  v_count  integer := 0;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório' USING ERRCODE = 'not_null_violation';
  END IF;

  -- ── Authorization parity with services_delete ────────────────────────────
  IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
    RAISE EXCEPTION 'Sem permissão para eliminar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_rec IN
    DELETE FROM public.services s
    WHERE s.id = ANY(p_ids)
      AND s.organization_id = p_organization_id
    RETURNING s.id, s.organization_id, s.sku, s.name, s.slug, s.is_active,
              s.service_type, s.long_desc, s.service_category_id, s.service_subcategory_id
  LOOP
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'sku',                    jsonb_build_object('old', to_jsonb(v_rec.sku), 'new', NULL),
        'name',                   jsonb_build_object('old', to_jsonb(v_rec.name), 'new', NULL),
        'slug',                   jsonb_build_object('old', to_jsonb(v_rec.slug), 'new', NULL),
        'is_active',              jsonb_build_object('old', to_jsonb(v_rec.is_active), 'new', NULL),
        'organization_id',        jsonb_build_object('old', to_jsonb(v_rec.organization_id), 'new', NULL),
        'service_type',           jsonb_build_object('old', to_jsonb(v_rec.service_type), 'new', NULL),
        'long_desc',              jsonb_build_object('old', to_jsonb(v_rec.long_desc), 'new', NULL),
        'service_category_id',    jsonb_build_object('old', to_jsonb(v_rec.service_category_id), 'new', NULL),
        'service_subcategory_id', jsonb_build_object('old', to_jsonb(v_rec.service_subcategory_id), 'new', NULL)
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_rec.id, v_rec.organization_id, 'DELETE', v_diff, 'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_delete_service(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_delete_service(uuid[], uuid) TO authenticated;


-- ============================================================
-- 2f. rpc_import_service_csv(...)
-- ============================================================
-- Mirrors ONE ROW of parseServicesCSV (servicesExportImport.ts) — the caller invokes this
-- RPC once per CSV row. Per row the FE does today:
--   · optionally create category/subcategory rows in service_categories (kept in the FE,
--     since it caches created ids across rows and dedups by name; the RPC accepts the
--     already-resolved p_category_id / p_subcategory_id, matching how the FE resolves them
--     BEFORE the service upsert)
--   · upsert services by SKU (UPDATE if existing id else INSERT with created_by)
--   · DELETE all service_prices for the service, then INSERT purchase + retail
--   · ensure a service_organizations link for organizationId (SELECT; INSERT if missing)
--   · set_audit_context(user, 'csv_import') around the whole row
-- We reproduce all of that inside ONE transaction with app.audit_bypass='on' and emit a
-- SINGLE audit row for the row with source='csv_import'. Returns 'inserted' or 'updated'
-- so the caller can tally the ImportReport exactly as today.
--
-- Authorization mirrors services_insert/update + service_prices_delete/insert +
-- service_organizations_insert. Category/subcategory creation stays in the FE (unchanged).

CREATE OR REPLACE FUNCTION public.rpc_import_service_csv(
  p_organization_id text,
  p_sku             text,
  p_name            text,
  p_slug            text,
  p_long_desc       text,
  p_is_active       boolean,
  p_service_type    text,
  p_category_id     uuid,
  p_subcategory_id  uuid,
  p_purchase        numeric,
  p_retail          numeric,
  p_currency        text,
  p_vat_rate        numeric
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_uid         uuid := (SELECT auth.uid());
  v_admin       boolean;
  v_org         uuid := p_organization_id::uuid;
  v_existing    uuid;
  v_row         public.services;
  v_result      text;
  v_diff        jsonb;
  v_link        uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user(v_uid);

  -- ── Locate existing service by SKU within the org (matches the FE preload) ──
  SELECT id INTO v_existing
  FROM public.services
  WHERE organization_id = v_org
    AND sku = p_sku
    AND is_deleted = false
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- ── Authorization parity with services_update ──────────────────────────
    IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
      RAISE EXCEPTION 'Sem permissão para editar serviços' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.services
    SET sku                    = p_sku,
        name                   = p_name,
        slug                   = p_slug,
        long_desc              = nullif(p_long_desc, ''),
        is_active              = COALESCE(p_is_active, true),
        service_type           = p_service_type,
        organization_id        = v_org,
        service_category_id    = p_category_id,
        service_subcategory_id = p_subcategory_id
    WHERE id = v_existing
    RETURNING * INTO v_row;
    v_result := 'updated';
  ELSE
    -- ── Authorization parity with services_insert ──────────────────────────
    IF NOT public.has_anew_permission(v_uid, 'services.create') THEN
      RAISE EXCEPTION 'Sem permissão para criar serviços' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_org IS NULL OR NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO public.services
      (sku, name, slug, long_desc, is_active, service_type,
       organization_id, service_category_id, service_subcategory_id, created_by)
    VALUES
      (p_sku,
       p_name,
       p_slug,
       nullif(p_long_desc, ''),
       COALESCE(p_is_active, true),
       p_service_type,
       v_org,
       p_category_id,
       p_subcategory_id,
       v_actor)
    RETURNING * INTO v_row;
    v_result := 'inserted';
  END IF;

  -- ── Sync prices: delete existing then insert purchase + retail (like the FE) ──
  IF NOT v_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
      RAISE EXCEPTION 'Sem permissão para redefinir preços do serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  DELETE FROM public.service_prices WHERE service_id = v_row.id;

  INSERT INTO public.service_prices
    (service_id, price_type, price, currency, vat_rate, created_by)
  VALUES
    (v_row.id, 'purchase', COALESCE(p_purchase, 0), p_currency, p_vat_rate, v_actor),
    (v_row.id, 'retail',   COALESCE(p_retail, 0),   p_currency, p_vat_rate, v_actor);

  -- ── Ensure the service_organizations link exists ───────────────────────────
  SELECT id INTO v_link
  FROM public.service_organizations
  WHERE service_id = v_row.id AND organization_id = v_org
  LIMIT 1;

  IF v_link IS NULL THEN
    IF NOT v_admin THEN
      IF NOT public.has_anew_permission(v_uid, 'services.edit') THEN
        RAISE EXCEPTION 'Sem permissão para associar empresa ao serviço' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NOT (v_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
        RAISE EXCEPTION 'Empresa fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
    INSERT INTO public.service_organizations (service_id, organization_id, created_by)
    VALUES (v_row.id, v_org, v_actor);
  END IF;

  -- ── Single audit row per CSV row, source='csv_import' ──────────────────────
  IF v_result = 'inserted' THEN
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'sku',                    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.sku)),
        'name',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
        'is_active',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active)),
        'organization_id',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.organization_id)),
        'service_type',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_type)),
        'service_category_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_category_id)),
        'service_subcategory_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_subcategory_id))
      ),
      'service_prices', jsonb_build_object(
        'purchase', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_purchase, 0))),
        'retail',   jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_retail, 0)))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_row.id, v_row.organization_id, 'INSERT', v_diff, 'csv_import'
    );
  ELSE
    v_diff := jsonb_build_object(
      'services', jsonb_build_object(
        'name',                   jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.name)),
        'is_active',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.is_active)),
        'service_type',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_type)),
        'service_category_id',    jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_category_id)),
        'service_subcategory_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_row.service_subcategory_id))
      ),
      'service_prices', jsonb_build_object(
        'purchase', jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_purchase, 0))),
        'retail',   jsonb_build_object('old', NULL, 'new', to_jsonb(COALESCE(p_retail, 0)))
      )
    );
    PERFORM public.fn_manual_audit_log(
      'services', v_row.id, v_row.organization_id, 'UPDATE', v_diff, 'csv_import'
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_import_service_csv(text, text, text, text, text, boolean, text, uuid, uuid, numeric, numeric, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_import_service_csv(text, text, text, text, text, boolean, text, uuid, uuid, numeric, numeric, text, numeric) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard present at the top of the satellite service_prices trigger function
--    (the generic function — covering services + service_organizations — was already
--    guarded in 20260719010000):
--   SELECT proname FROM pg_proc
--   WHERE proname IN ('fn_audit_service_prices', 'fn_generic_entity_audit')
--     AND prosrc LIKE '%app.audit_bypass%';
--   -- Expected: both rows.
--
-- 2. A "create service with 2 companies + purchase & retail prices" produces exactly ONE
--    audit row (not the 5+ rows the FE would emit today across services +
--    service_organizations x2 + service_prices x2):
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'services' AND operation = 'INSERT'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1.
--
-- 3. An update that only rewrites prices still yields ONE row with a service_prices diff
--    and no services diff; an inline single-field edit (p_touch_orgs=false,
--    p_touch_prices=false) yields ONE row with only the changed services column.
--
-- 4. A bulk status flip / bulk delete over N services yields exactly N audit rows (one per
--    service entity), each touching a single table — not N-per-table.
--
-- 5. A CSV import row yields exactly ONE audit row with source='csv_import'.
--
-- 6. A caller without services.create/edit/delete — or targeting an org outside their
--    visible set — raises insufficient_privilege, matching the RLS policies. The services
--    table policies have no admin OR-branch, so admin does NOT bypass there; the
--    service_prices / service_organizations checks DO honour is_system_admin_user, mirroring
--    their policies.
