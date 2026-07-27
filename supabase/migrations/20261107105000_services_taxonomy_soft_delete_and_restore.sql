-- Serviços + taxonomia (Categorias/Subcategorias/Taxas) — replace hard DELETE with
-- recoverable soft-delete, following the same pattern already applied across the app
-- (Leads/Contactos/Clientes/Deals/Propostas/Orçamentos/Contratos/Utilizadores).
-- 2026-11-07 | Module: Serviços / Categorias (Serviços) / Subcategorias (Serviços) / Taxas de Serviço
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Three delete surfaces in this module still run irreversible hard DELETEs, breaking the
-- product-wide "nothing is ever really gone" invariant:
--   1. rpc_delete_service          — DELETE FROM services (20260808010000 §2c). The table
--      ALREADY has is_deleted/deleted_at/deleted_by columns (baseline 20260615130000) that
--      are simply never written by this RPC — rpc_import_service_csv (§2f, same migration)
--      already reads `is_deleted = false` when matching by SKU, so the column was clearly
--      meant to be the live delete flag from day one.
--   2. rpc_delete_service_category — DELETE FROM service_categories (20260804010000 §2e),
--      reused for BOTH root categories and subcategories (same physical table, distinguished
--      by parent_id). This table has NO is_deleted/deleted_at/deleted_by columns yet.
--   3. ServiceFees.tsx (handleDelete) — calls `.from("service_fee_types").delete()` directly
--      from the frontend, no RPC at all. This table also has no soft-delete columns yet.
--
-- Design
-- ------
-- · services: no schema change needed (columns already exist). rpc_delete_service now does
--   `UPDATE services SET is_deleted=true, deleted_at=now(), deleted_by=actor` instead of
--   DELETE. Because the row is never removed, service_organizations / service_prices are
--   left completely untouched — the previous "snapshot former org associations before the
--   cascade" logic is dropped entirely (there is no cascade anymore). A new
--   rpc_restore_service(p_id) is the exact inverse. Both keep the single-audit-row pattern
--   (app.audit_bypass + fn_manual_audit_log), with the diff scoped to the two columns that
--   actually change (matches the anew_users soft-deactivation precedent in 20261107090000).
--
-- · service_categories: gains is_deleted boolean DEFAULT false NOT NULL / deleted_at
--   timestamptz / deleted_by uuid (same column shape as services). rpc_delete_service_category
--   now soft-deletes the row (root OR subcategory — same authorization split as before) instead
--   of DELETE. Because the row is never removed, the previous "clear
--   services.service_subcategory_id FK on soft-deleted services, then DELETE" dance is no
--   longer needed at all — the FK stays valid because the referenced row still exists. This
--   also means a subcategory still referenced by LIVE services can now be soft-deleted (no more
--   23503 "cannotDelete" block on that path): those services keep pointing at a category flagged
--   is_deleted=true until an operator either restores the category or repoints the services.
--   That is a deliberate behavviour change inherent to moving from hard to soft delete — no data
--   is lost either way, and the category remains fully recoverable via rpc_restore_service_category.
--   A new rpc_restore_service_category(p_id) is the exact inverse, reusing the same
--   root/subcategory authorization split.
--
-- · service_fee_types: gains the same three soft-delete columns. Two new RPCs —
--   rpc_delete_service_fee_type(p_id) and rpc_restore_service_fee_type(p_id) — replace the
--   frontend's direct `.delete()` call. Authorization mirrors the existing
--   service_fee_types_delete RLS policy exactly (admin OR service_fees.delete + organization_id
--   IN visible_orgs — note the delete policy has NO organization_id IS NULL branch, unlike
--   SELECT, so a non-admin cannot touch a global/org-less fee type; the RPC preserves that).
--   fn_generic_entity_audit() already carries the app.audit_bypass guard (established broadly by
--   20260719010000) and already covers service_fee_types (Strategy B, org_id nullable, per
--   20260702010000_services_audit_triggers.sql), so no additional trigger-guard migration is
--   needed here — only the two RPCs.
--
-- Permission choice (all three restores)
-- ---------------------------------------
-- Each restore RPC reuses the matching *.delete permission rather than introducing a new
-- *.restore permission code, exactly like rpc_restore_user (20261107090000): restoring is the
-- direct inverse of the same action and is only ever reachable from the same admin surface
-- already gated behind *.delete. Adding a parallel restore permission per entity would only
-- fragment role configuration for zero practical benefit (YAGNI).
--
-- Explicitly OUT of scope for this migration (flagged, not fixed here)
-- ----------------------------------------------------------------------
-- rpc_bulk_delete_service (20260808010000 §2e, invoked by Services.tsx's useBulkActions with
-- softDelete:false) still performs a real bulk hard DELETE. It was not in the reviewed scope of
-- this fix and touching it would require also reworking useBulkActions' RPC-vs-direct-soft-delete
-- branching (it only calls a bulk RPC when softDelete is false today). Left untouched pending a
-- dedicated follow-up.
--
-- Prerequisites:
--   20260615130000_baseline_new_database.sql        — services.is_deleted/deleted_at/deleted_by,
--                                                      has_anew_permission(), get_user_visible_org_ids(),
--                                                      is_system_admin_user(), get_service_category_org_id()
--   20260702000000_services_security_fixes.sql      — service_fee_types RLS (has_anew_permission)
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass GUC + fn_manual_audit_log()
--   20260804010000_service_categories_audit_bypass_and_rpcs.sql — fn_audit_service_category() bypass
--                                                      guard + original rpc_delete_service_category
--   20260808010000_services_audit_bypass_and_rpcs.sql — fn_audit_service_prices() bypass guard +
--                                                      original rpc_delete_service (+ rpc_import_service_csv,
--                                                      which already reads is_deleted=false)
--   20261107090000_rpc_delete_user_soft_delete_and_restore.sql — the soft-delete/restore pattern
--                                                      this migration replicates


-- ============================================================
-- Schema: service_categories soft-delete columns
-- ============================================================

ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.service_categories.is_deleted IS
  'Set true by rpc_delete_service_category; the row (root category or subcategory) is never '
  'removed. Reversible via rpc_restore_service_category.';

CREATE INDEX IF NOT EXISTS idx_service_categories_is_deleted
  ON public.service_categories USING btree (is_deleted);


-- ============================================================
-- Schema: service_fee_types soft-delete columns
-- ============================================================

ALTER TABLE public.service_fee_types
  ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

COMMENT ON COLUMN public.service_fee_types.is_deleted IS
  'Set true by rpc_delete_service_fee_type; the row is never removed. Reversible via '
  'rpc_restore_service_fee_type.';

CREATE INDEX IF NOT EXISTS idx_service_fee_types_is_deleted
  ON public.service_fee_types USING btree (is_deleted);


-- ============================================================
-- 1a. rpc_delete_service(p_id) — soft-delete (was: hard DELETE)
-- ============================================================
-- Authorization unchanged (parity with services_delete RLS). Body replaced: the row is
-- flagged is_deleted/deleted_at/deleted_by instead of being removed; service_organizations
-- and service_prices are left completely untouched (there is no cascade anymore).

CREATE OR REPLACE FUNCTION public.rpc_delete_service(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid;
  v_uid     uuid := (SELECT auth.uid());
  v_before  public.services;
  v_diff    jsonb;
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

  -- Idempotency guard: nothing to do (and nothing new to audit) if already soft-deleted.
  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Serviço já está eliminado' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.services
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_actor
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
    )
  );

  PERFORM public.fn_manual_audit_log(
    'services', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_service(uuid) TO authenticated;


-- ============================================================
-- 1b. rpc_restore_service(p_id) — reverse a soft-delete
-- ============================================================
-- Reuses `services.delete` (restoring is the direct inverse of deleting — see migration
-- header "Permission choice" note).

CREATE OR REPLACE FUNCTION public.rpc_restore_service(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid;
  v_uid     uuid := (SELECT auth.uid());
  v_before  public.services;
  v_diff    jsonb;
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

  IF NOT public.has_anew_permission(v_uid, 'services.delete') THEN
    RAISE EXCEPTION 'Sem permissão para restaurar serviços' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Serviço já está ativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.services
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'services', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )
  );

  PERFORM public.fn_manual_audit_log(
    'services', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_service(uuid) TO authenticated;


-- ============================================================
-- 2a. rpc_delete_service_category(p_id) — soft-delete (was: hard DELETE)
-- ============================================================
-- Handles BOTH root categories and subcategories (same table, parent_id distinguishes them),
-- exactly like the function it replaces. Authorization unchanged (root arm:
-- service_categories.delete; subcategory arm: service_subcategories.delete; both + org
-- visibility via the resolved org). The previous "clear services.service_subcategory_id FK on
-- soft-deleted services, then DELETE" logic is REMOVED — the row is never removed, so the FK
-- stays valid on its own; see migration header note on the resulting behaviour change.

CREATE OR REPLACE FUNCTION public.rpc_delete_service_category(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.service_categories;
  v_org_id uuid;
  v_diff   jsonb;
  v_admin  boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Categoria já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user((SELECT auth.uid()));

  -- Resolve the effective org for this row exactly as the RLS delete policy does:
  --   root        → organization_id column
  --   subcategory → get_service_category_org_id(parent_id) walk
  IF v_before.parent_id IS NULL THEN
    v_org_id := v_before.organization_id;
  ELSE
    v_org_id := COALESCE(
      v_before.organization_id,
      public.get_service_category_org_id(v_before.parent_id)
    );
  END IF;

  -- ── Authorization parity with service_categories_delete (root/subcat arms) ─
  IF NOT v_admin THEN
    IF v_before.parent_id IS NULL THEN
      IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_categories.delete') THEN
        RAISE EXCEPTION 'Sem permissão para eliminar categorias de serviços'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.delete') THEN
        RAISE EXCEPTION 'Sem permissão para eliminar subcategorias de serviços'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF v_org_id IS NULL
       OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.service_categories
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_actor
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'service_categories', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(true)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
    )
  );

  PERFORM public.fn_manual_audit_log(
    'service_categories', p_id, v_org_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_service_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_service_category(uuid) TO authenticated;


-- ============================================================
-- 2b. rpc_restore_service_category(p_id) — reverse a soft-delete
-- ============================================================
-- Reuses the same root/subcategory authorization split as the delete RPC (restoring is the
-- direct inverse of deleting — see migration header "Permission choice" note).

CREATE OR REPLACE FUNCTION public.rpc_restore_service_category(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_before public.service_categories;
  v_org_id uuid;
  v_diff   jsonb;
  v_admin  boolean;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Categoria já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := public.is_system_admin_user((SELECT auth.uid()));

  IF v_before.parent_id IS NULL THEN
    v_org_id := v_before.organization_id;
  ELSE
    v_org_id := COALESCE(
      v_before.organization_id,
      public.get_service_category_org_id(v_before.parent_id)
    );
  END IF;

  IF NOT v_admin THEN
    IF v_before.parent_id IS NULL THEN
      IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_categories.delete') THEN
        RAISE EXCEPTION 'Sem permissão para restaurar categorias de serviços'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      IF NOT public.has_anew_permission((SELECT auth.uid()), 'service_subcategories.delete') THEN
        RAISE EXCEPTION 'Sem permissão para restaurar subcategorias de serviços'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    IF v_org_id IS NULL
       OR NOT (v_org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))) THEN
      RAISE EXCEPTION 'Categoria fora do âmbito do utilizador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE public.service_categories
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'service_categories', jsonb_build_object(
      'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(false)),
      'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
    )
  );

  PERFORM public.fn_manual_audit_log(
    'service_categories', p_id, v_org_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_service_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_service_category(uuid) TO authenticated;


-- ============================================================
-- 3a. rpc_delete_service_fee_type(p_id) — new RPC (was: direct frontend .delete())
-- ============================================================
-- Authorization mirrors service_fee_types_delete RLS exactly: admin OR (service_fees.delete
-- AND organization_id IN visible_orgs). Note: unlike SELECT, the delete policy has NO
-- organization_id IS NULL branch, so a non-admin cannot delete a global/org-less fee type —
-- preserved here on purpose.

CREATE OR REPLACE FUNCTION public.rpc_delete_service_fee_type(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_before public.service_fee_types;
  v_diff   jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_fee_types WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taxa de serviço não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with service_fee_types_delete ───────────────────
  IF NOT public.is_system_admin_user(v_uid) THEN
    IF NOT public.has_anew_permission(v_uid, 'service_fees.delete') THEN
      RAISE EXCEPTION 'Sem permissão para eliminar taxas de serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Taxa de serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_before.is_deleted THEN
    RAISE EXCEPTION 'Taxa de serviço já está eliminada' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.service_fee_types
  SET is_deleted = true,
      deleted_at = now(),
      deleted_by = v_actor,
      updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(true)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', to_jsonb(now()))
  );

  PERFORM public.fn_manual_audit_log(
    'service_fee_types', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_service_fee_type(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_service_fee_type(uuid) TO authenticated;


-- ============================================================
-- 3b. rpc_restore_service_fee_type(p_id) — reverse a soft-delete
-- ============================================================
-- Reuses `service_fees.delete` (restoring is the direct inverse of deleting — see migration
-- header "Permission choice" note).

CREATE OR REPLACE FUNCTION public.rpc_restore_service_fee_type(
  p_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid;
  v_uid    uuid := (SELECT auth.uid());
  v_before public.service_fee_types;
  v_diff   jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.service_fee_types WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Taxa de serviço não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_system_admin_user(v_uid) THEN
    IF NOT public.has_anew_permission(v_uid, 'service_fees.delete') THEN
      RAISE EXCEPTION 'Sem permissão para restaurar taxas de serviço' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_before.organization_id IS NULL
       OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
      RAISE EXCEPTION 'Taxa de serviço fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_before.is_deleted THEN
    RAISE EXCEPTION 'Taxa de serviço já está ativa' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.service_fee_types
  SET is_deleted = false,
      deleted_at = NULL,
      deleted_by = NULL,
      updated_at = now()
  WHERE id = p_id;

  v_diff := jsonb_build_object(
    'is_deleted', jsonb_build_object('old', to_jsonb(v_before.is_deleted), 'new', to_jsonb(false)),
    'deleted_at', jsonb_build_object('old', to_jsonb(v_before.deleted_at), 'new', NULL)
  );

  PERFORM public.fn_manual_audit_log(
    'service_fee_types', p_id, v_before.organization_id, 'UPDATE', v_diff, 'web_app'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_restore_service_fee_type(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_restore_service_fee_type(uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Deleting a service no longer removes the row; it flags is_deleted/deleted_at/deleted_by
--    and produces exactly ONE entity_audit_log row (operation='UPDATE', source='web_app'):
--   SELECT public.rpc_delete_service('<service-uuid>');
--   SELECT is_deleted, deleted_at FROM public.services WHERE id = '<service-uuid>';
--   -- Expected: is_deleted = true, deleted_at set, row still present.
--   SELECT count(*) FROM public.entity_audit_log
--   WHERE table_name = 'services' AND entity_id = '<service-uuid>' AND operation = 'UPDATE'
--     AND created_at > now() - interval '1 minute';
--   -- Expected: 1.
--
-- 2. rpc_restore_service reverses is_deleted/deleted_at and appends a second audit row.
--    Calling either RPC twice in a row (delete-delete or restore-restore) raises
--    no_data_found ("já está eliminado"/"já está ativo") — idempotency guard.
--
-- 3. Same pattern for rpc_delete_service_category / rpc_restore_service_category (root AND
--    subcategory), and rpc_delete_service_fee_type / rpc_restore_service_fee_type.
--
-- 4. A subcategory that is soft-deleted while still referenced by a LIVE service no longer
--    raises 23503 — the FK stays satisfied because the category row is never removed
--    (deliberate behaviour change from the hard-delete original, see migration header).
--
-- 5. A caller without the matching *.delete permission — or targeting an org outside their
--    visible set — raises insufficient_privilege on all six RPCs; system_admin bypasses.
--
-- 6. A non-admin cannot delete/restore a service_fee_types row with organization_id IS NULL
--    (global fee type), matching the existing service_fee_types_delete RLS policy exactly.
