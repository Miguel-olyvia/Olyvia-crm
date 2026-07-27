-- ============================================================
-- rpc_bulk_import_bundles(p_org_id uuid, p_bundles jsonb)
-- ============================================================
-- FIX: src/pages/Bundles.tsx handleImport() (CSV bulk bundle import) currently
-- performs, per whole import batch: ONE bulk `bundles.insert(bundlesToInsert)`
-- call for all new bundles, followed by a LOOP that issues ONE
-- `bundles.update(...).eq("id", id)` call PER existing bundle being updated.
-- Both paths are wrapped in withAuditContext, so each write still fires the
-- bundles AFTER trigger (fn_generic_entity_audit) per affected row — that part
-- (N bundles imported -> N audit rows) is fine on its own. The actual defect
-- this RPC closes is architectural: the import path is two disjoint
-- unscoped multi-row/multi-call client operations (one bulk INSERT statement +
-- an unbounded UPDATE loop) instead of ONE server-side transaction, so:
--   · a mid-loop failure (e.g. row 37 of 100 updates) leaves the batch
--     PARTIALLY applied — some bundles created/updated, others not — with no
--     atomicity guarantee and no single point of rollback;
--   · every update in the loop is a separate network round-trip / Postgres
--     transaction, each independently subject to trigger timing, RLS
--     re-evaluation, and partial-failure ordering;
--   · there is no server-side authorization check on organization scope for
--     the target rows beyond ordinary RLS, so parity with the module's other
--     RPCs (rpc_create_bundle / rpc_update_bundle) is missing here.
-- This mirrors the exact problem rpc_bulk_import_products solved for Products
-- (20260826010000_rpc_bulk_import_products.sql) — same shape, same fix.
--
-- This RPC accepts the exact rows already parsed client-side by
-- parseBundlesCSV() (src/utils/bundlesExportImport.ts) as a jsonb array and,
-- for EACH bundle, does the insert-or-update inside the SAME server-side
-- transaction as the whole call (all-or-nothing batch), emitting exactly ONE
-- fn_manual_audit_log call per bundle (INSERT for new bundles, UPDATE for
-- existing ones — matching rpc_create_bundle / rpc_update_bundle semantics).
-- audit_bypass is enabled once for the whole batch so the bundles trigger
-- never fires; fn_manual_audit_log is the only audit writer.
--
-- Input shape (p_bundles), one jsonb object per CSV row, mirroring
-- ParsedBundlesResult from bundlesExportImport.ts (bundlesToInsert /
-- bundlesToUpdate merged into one array with an explicit "mode"):
--   {
--     "mode": "insert" | "update",
--     "id": uuid | null,                 -- required when mode = "update";
--                                          ignored (server generates) on insert
--     "sku": text,
--     "name": text,
--     "description": text | null,
--     "status": text,                     -- 'draft' | 'active' | 'discontinued'
--     "pricing_type": text,                -- cast to bundle_pricing_type
--     "fixed_price": numeric | null,
--     "discount_percent": numeric | null,
--     "discount_fixed": numeric | null,
--     "valid_from": text | null,
--     "valid_to": text | null,
--     "organization_id": uuid | null       -- resolvedCompanyId (row's target org)
--   }
--
-- p_org_id is the active company (organization_id) the import was launched
-- from; used for authorization parity with bundles_insert/update RLS. Each
-- row's own organization_id (resolvedCompanyId from the CSV) is still what
-- gets written, matching the FE's per-row company resolution — but write
-- authorization for a NON-admin caller is checked against p_org_id (the
-- launch-time active company), since that's the org the "products.manage"
-- permission is evaluated against for this action, exactly like
-- rpc_bulk_import_products checks p_org_id rather than each row's org.
--
-- Behavior per row:
--   · mode = 'insert': INSERT into bundles (created_by = caller's business
--     user id, server-generated id — the FE's client-side crypto.randomUUID()
--     is NOT used; Postgres generates the id via the column default). One
--     audit row, action 'INSERT'. Skipped children: CSV import does not carry
--     bundle_components / bundle_choice_groups, matching the current FE
--     behavior (those are added afterward via BundleFormDialog's child tabs).
--   · mode = 'update': UPDATE bundles by id (scoped to organization_id =
--     p_org_id AND deleted_at IS NULL, matching bundles_update RLS and the
--     module's org-isolation pattern from rpc_update_bundle). One audit row,
--     action 'UPDATE' — only emitted if something changed.
--
-- Returns: jsonb array of { input_index, bundle_id, action } so the FE can
-- reconcile its report counters (newCount/updateCount) without needing to
-- re-derive them from two separate client-side arrays.
--
-- Round-trips: OLD approach = 1 (bundles bulk insert) + N (per-updated-bundle
-- bundles.update loop), each its own transaction and each firing the bundles
-- audit trigger independently, with NO all-or-nothing guarantee across the
-- batch. NEW approach = 1 single RPC call for the entire batch (one Postgres
-- transaction), with exactly one audit row PER BUNDLE server-side and the
-- whole import succeeding or failing atomically.
--
-- Authorization / RLS parity
-- --------------------------
-- SECURITY DEFINER bypasses RLS on bundles, so this RPC re-checks the SAME
-- predicate the bundles_insert / bundles_update policies enforce
-- (20260704000000_bundles_security_fixes.sql), evaluated once against p_org_id
-- for the whole batch (mirrors rpc_bulk_import_products):
--   is_system_admin_user(uid)
--   OR ( has_anew_permission(uid,'products.create')
--        AND p_org_id IN get_user_visible_org_ids(uid) )
-- 'products.create' is used (not 'products.manage') because CSV import is
-- gated by the same products.create permission the FE's import-trigger UI
-- uses for Bundles (see PermissionGate around the Importar button in
-- Bundles.tsx) — consistent with rpc_bulk_import_products's choice of
-- 'products.create' for the analogous Products import action.
--
-- Sentinel / NULL org
-- -------------------
-- bundles uses fn_generic_entity_audit(), which SKIPS SILENTLY when
-- organization_id IS NULL. This RPC defensively skips the manual audit write
-- per-row when the resolved organization_id is NULL, exactly matching the
-- trigger's silent-skip behavior (same as rpc_create_bundle / rpc_update_bundle
-- / rpc_bulk_status_bundle / rpc_bulk_delete_bundle).
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log + fn_generic_entity_audit()
--   20260704000000_bundles_security_fixes.sql        — the RLS policies mirrored here
--   20260719010000_roles_audit_bypass_and_rpcs.sql   — fn_manual_audit_log() + guarded
--                                                      fn_generic_entity_audit() (FOUNDATION, reused)
--   20260809010000_bundles_audit_bypass_and_rpcs.sql — rpc_create_bundle / rpc_update_bundle /
--                                                      rpc_delete_bundle (pattern reused here)
--   20260816030000_bundles_bulk_rpcs.sql             — rpc_bulk_status_bundle / rpc_bulk_delete_bundle
--   20260826010000_rpc_bulk_import_products.sql      — the analogous Products import RPC this mirrors
--   20260615130000_baseline_new_database.sql          — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      is_system_admin_user()
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_bulk_import_bundles(
  p_org_id   uuid,
  p_bundles  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_is_admin   boolean;
  v_row        jsonb;
  v_row_idx    int := -1;
  v_mode       text;
  v_row_org    uuid;
  v_bundle_id  uuid;
  v_bundle     public.bundles;
  v_before     public.bundles;
  v_diff       jsonb;
  v_bundle_diff jsonb;
  v_results    jsonb := '[]'::jsonb;
  v_is_active  boolean;
BEGIN
  -- Consolidate all writes (whole batch) into one audit row per bundle.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := public.is_system_admin_user(v_uid);
  IF NOT v_is_admin THEN
    IF NOT public.has_anew_permission(v_uid, 'products.create') THEN
      RAISE EXCEPTION 'Sem permissão para importar bundles' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF p_bundles IS NULL OR jsonb_typeof(p_bundles) <> 'array' THEN
    RAISE EXCEPTION 'p_bundles deve ser um array jsonb' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_bundles) LOOP
    v_row_idx := v_row_idx + 1;
    v_mode    := v_row ->> 'mode';
    v_row_org := NULLIF(v_row ->> 'organization_id', '')::uuid;

    IF NOT v_is_admin AND v_row_org IS NOT NULL
       AND NOT (v_row_org IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Organização fora do âmbito do utilizador (linha %)', v_row_idx
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_is_active := (COALESCE(v_row ->> 'status', 'draft') = 'active');

    IF v_mode = 'insert' THEN
      -- ── INSERT bundle (server-generated id; ignore any client-side id) ────
      INSERT INTO public.bundles
        (organization_id, sku, name, description, pricing_type,
         fixed_price, discount_percent, discount_fixed,
         status, valid_from, valid_to, is_active, created_by)
      VALUES
        (v_row_org,
         btrim(v_row ->> 'sku'),
         btrim(v_row ->> 'name'),
         NULLIF(btrim(COALESCE(v_row ->> 'description', '')), ''),
         COALESCE(v_row ->> 'pricing_type', 'custom')::public.bundle_pricing_type,
         CASE WHEN (v_row ->> 'pricing_type') = 'fixed_price'
              THEN (v_row ->> 'fixed_price')::numeric ELSE NULL END,
         CASE WHEN (v_row ->> 'pricing_type') = 'percentage_discount'
              THEN (v_row ->> 'discount_percent')::numeric ELSE NULL END,
         CASE WHEN (v_row ->> 'pricing_type') = 'fixed_discount'
              THEN (v_row ->> 'discount_fixed')::numeric ELSE NULL END,
         COALESCE(v_row ->> 'status', 'draft'),
         NULLIF(v_row ->> 'valid_from', '')::timestamptz,
         NULLIF(v_row ->> 'valid_to', '')::timestamptz,
         v_is_active,
         v_actor)
      RETURNING * INTO v_bundle;

      v_diff := jsonb_build_object(
        'bundles', jsonb_build_object(
          'sku',              jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.sku)),
          'name',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.name)),
          'description',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.description)),
          'pricing_type',     jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.pricing_type)),
          'fixed_price',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.fixed_price)),
          'discount_percent', jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_percent)),
          'discount_fixed',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.discount_fixed)),
          'status',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.status)),
          'valid_from',       jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_from)),
          'valid_to',         jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.valid_to)),
          'is_active',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.is_active)),
          'organization_id',  jsonb_build_object('old', NULL, 'new', to_jsonb(v_bundle.organization_id))
        ),
        'source', 'bulk_import'
      );

      IF v_bundle.organization_id IS NOT NULL THEN
        PERFORM public.fn_manual_audit_log(
          'bundles', v_bundle.id, v_bundle.organization_id, 'INSERT', v_diff, 'web_app'
        );
      END IF;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx, 'bundle_id', v_bundle.id, 'action', 'insert'
      );

    ELSIF v_mode = 'update' THEN
      -- ── UPDATE bundle (scoped like rpc_update_bundle: org + non-deleted) ──
      v_bundle_id := NULLIF(v_row ->> 'id', '')::uuid;
      IF v_bundle_id IS NULL THEN
        RAISE EXCEPTION 'mode=update requer id (linha %)', v_row_idx USING ERRCODE = 'invalid_parameter_value';
      END IF;

      SELECT * INTO v_before FROM public.bundles
        WHERE id = v_bundle_id AND organization_id = p_org_id AND deleted_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Bundle não encontrado nesta organização (linha %)', v_row_idx
          USING ERRCODE = 'no_data_found';
      END IF;

      UPDATE public.bundles SET
        sku              = btrim(v_row ->> 'sku'),
        name             = btrim(v_row ->> 'name'),
        description      = NULLIF(btrim(COALESCE(v_row ->> 'description', '')), ''),
        pricing_type     = COALESCE(v_row ->> 'pricing_type', 'custom')::public.bundle_pricing_type,
        fixed_price      = CASE WHEN (v_row ->> 'pricing_type') = 'fixed_price'
                                 THEN (v_row ->> 'fixed_price')::numeric ELSE NULL END,
        discount_percent = CASE WHEN (v_row ->> 'pricing_type') = 'percentage_discount'
                                 THEN (v_row ->> 'discount_percent')::numeric ELSE NULL END,
        discount_fixed   = CASE WHEN (v_row ->> 'pricing_type') = 'fixed_discount'
                                 THEN (v_row ->> 'discount_fixed')::numeric ELSE NULL END,
        status           = COALESCE(v_row ->> 'status', 'draft'),
        valid_from       = NULLIF(v_row ->> 'valid_from', '')::timestamptz,
        valid_to         = NULLIF(v_row ->> 'valid_to', '')::timestamptz,
        is_active        = v_is_active
      WHERE id = v_bundle_id AND organization_id = p_org_id AND deleted_at IS NULL
      RETURNING * INTO v_bundle;

      v_bundle_diff := '{}'::jsonb;
      IF v_before.sku IS DISTINCT FROM v_bundle.sku THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('sku',
          jsonb_build_object('old', to_jsonb(v_before.sku), 'new', to_jsonb(v_bundle.sku)));
      END IF;
      IF v_before.name IS DISTINCT FROM v_bundle.name THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('name',
          jsonb_build_object('old', to_jsonb(v_before.name), 'new', to_jsonb(v_bundle.name)));
      END IF;
      IF v_before.description IS DISTINCT FROM v_bundle.description THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('description',
          jsonb_build_object('old', to_jsonb(v_before.description), 'new', to_jsonb(v_bundle.description)));
      END IF;
      IF v_before.pricing_type IS DISTINCT FROM v_bundle.pricing_type THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('pricing_type',
          jsonb_build_object('old', to_jsonb(v_before.pricing_type), 'new', to_jsonb(v_bundle.pricing_type)));
      END IF;
      IF v_before.fixed_price IS DISTINCT FROM v_bundle.fixed_price THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('fixed_price',
          jsonb_build_object('old', to_jsonb(v_before.fixed_price), 'new', to_jsonb(v_bundle.fixed_price)));
      END IF;
      IF v_before.discount_percent IS DISTINCT FROM v_bundle.discount_percent THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_percent',
          jsonb_build_object('old', to_jsonb(v_before.discount_percent), 'new', to_jsonb(v_bundle.discount_percent)));
      END IF;
      IF v_before.discount_fixed IS DISTINCT FROM v_bundle.discount_fixed THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('discount_fixed',
          jsonb_build_object('old', to_jsonb(v_before.discount_fixed), 'new', to_jsonb(v_bundle.discount_fixed)));
      END IF;
      IF v_before.status IS DISTINCT FROM v_bundle.status THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('status',
          jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_bundle.status)));
      END IF;
      IF v_before.valid_from IS DISTINCT FROM v_bundle.valid_from THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_from',
          jsonb_build_object('old', to_jsonb(v_before.valid_from), 'new', to_jsonb(v_bundle.valid_from)));
      END IF;
      IF v_before.valid_to IS DISTINCT FROM v_bundle.valid_to THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('valid_to',
          jsonb_build_object('old', to_jsonb(v_before.valid_to), 'new', to_jsonb(v_bundle.valid_to)));
      END IF;
      IF v_before.is_active IS DISTINCT FROM v_bundle.is_active THEN
        v_bundle_diff := v_bundle_diff || jsonb_build_object('is_active',
          jsonb_build_object('old', to_jsonb(v_before.is_active), 'new', to_jsonb(v_bundle.is_active)));
      END IF;

      v_diff := '{}'::jsonb;
      IF v_bundle_diff <> '{}'::jsonb THEN
        v_diff := v_diff || jsonb_build_object('bundles', v_bundle_diff) || jsonb_build_object('source', 'bulk_import');
      END IF;

      IF v_diff <> '{}'::jsonb AND v_bundle.organization_id IS NOT NULL THEN
        PERFORM public.fn_manual_audit_log(
          'bundles', v_bundle.id, v_bundle.organization_id, 'UPDATE', v_diff, 'web_app'
        );
      END IF;

      v_results := v_results || jsonb_build_object(
        'input_index', v_row_idx, 'bundle_id', v_bundle.id, 'action', 'update'
      );

    ELSE
      RAISE EXCEPTION 'mode inválido "%": deve ser insert ou update (linha %)', v_mode, v_row_idx
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_import_bundles(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_import_bundles(uuid, jsonb) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Function exists, SECURITY DEFINER, fixed search_path:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'rpc_bulk_import_bundles';
--   -- Expected: 1 row, prosecdef = true.
--
-- 2. Importing a CSV batch of N new bundles produces exactly N audit rows
--    (one INSERT per bundle), all inside one transaction:
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'bundles' AND operation = 'INSERT'
--     AND diff -> 'source' = '"bulk_import"'
--     AND created_at > now() - interval '1 minute';
--
-- 3. A batch mixing inserts and updates where one update row fails
--    (e.g. id not found in org) rolls back the ENTIRE batch — no partial
--    bundles are left inserted from earlier rows in the same call.
--
-- 4. A caller without products.create on p_org_id, or p_org_id outside their
--    visible orgs, is rejected with insufficient_privilege before any row is
--    processed.
