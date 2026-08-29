-- rpc_update_client_contract_status: enforce OWNED/TEAM ownership, not just
-- org visibility.
-- 2026-11-15 | Module: Contratos — client_contracts
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration (20261115100000 in particular — this migration
-- only adds a REPLACE on top of it).
--
-- Problem this migration solves — confirmed live in production
-- --------------------------------------------------------------
-- rpc_update_client_contract_status (created 20260814010000, extended by
-- 20261115100000) authorizes a caller with exactly two checks:
--   1. has_anew_permission(v_uid, 'client_contracts.edit')
--   2. the contract's organization_id is in get_user_visible_org_ids(v_uid)
-- Neither checks WHO created the contract. Confirmed against a live browser
-- session with a user restricted to OWNED scope (role with only
-- client_contracts.view + .edit, no admin role, no scope override — the
-- exact shape of the existing "QA E2E Contract Signer" fixture in nike,
-- role qa_e2e_contract_signer_owned_scope): the CRM list correctly hides
-- colleagues' contracts (client-side canEditContract/canActOnEntity in
-- ClientContracts.tsx + applyScopeFilter in usePermissionScope.ts, scope
-- resolved by getPermissionScope('client_contracts.edit')), but calling
-- rpc_update_client_contract_status directly with a colleague's contract id
-- succeeded and recorded that user as the signer. This is a write with legal
-- weight (contract signature), not merely an over-broad read.
--
-- Measured exposure: 58 active people hold client_contracts.edit across the
-- four organizations that have the permission at all (19 Mudelar, 8 Grupo
-- BMLar, 7 BMGest, 7 nike). Any of them, restricted to OWNED/TEAM scope in
-- the UI, could still sign or cancel any contract in their organization via
-- a direct RPC call.
--
-- The rule this migration applies — discovered, not invented
-- ------------------------------------------------------------
-- The gate this RPC must mirror is exactly the one ClientContracts.tsx
-- already applies to every other mutation on this same entity
-- (handleEdit/handleFinalize/handleDialogSave/handleStatusChange), all of
-- which guard on the SAME predicate:
--
--   const editScope = isSystemAdmin ? "ORG" : getPermissionScope("client_contracts.edit");
--   const canEditContract = (c) => isSystemAdmin || canActOnEntity(editScope, c, scopeAnewUserId, null, teamMemberIds);
--
-- canActOnEntity (src/hooks/usePermissionScope.ts) resolves, by scope level:
--   NONE  -> reject
--   ORG   -> allow
--   TEAM  -> allow iff entity.created_by = caller OR entity.created_by IN teamMemberIds
--   OWNED -> allow iff entity.created_by = caller
--
-- Note this is `client_contracts.edit` scope, keyed by `created_by` alone --
-- NOT the created_by-OR-assigned_to union src/lib/contracts/scope.ts applies
-- to the LIST's `client_contracts.view` scope. client_contracts has no
-- assigned_to column (confirmed against the schema and against
-- rpc_reassign_client_contract's own comment: "created_by is the
-- ownership/'assigned to' column"); the edit gate never applies a second
-- predicate, view and edit simply key off two different permission codes.
-- This migration replicates the .edit gate exactly, not the .view one.
--
-- team_member_ids and the scope level itself come from
-- get_permission_scope_context (20261112490000) -- reused here rather than
-- re-querying anew_memberships/anew_role_permissions/anew_membership_
-- permission_scopes/organization_team_members directly, exactly as that
-- migration's header asks callers to do. That function is a data collector
-- (SECURITY INVOKER on purpose) -- the scope DECISION (override lookup,
-- role-permission fallback, binary-vs-OWNED distinction) is reproduced here
-- in SQL to mirror usePermissionScope.ts's getPermissionScope() precisely,
-- because no server-side decision helper exists yet and duplicating query
-- shape (not decision logic) was rejected as unsafe: this RPC is
-- SECURITY DEFINER and must not trust a client-supplied scope.
--
-- client_contracts.edit carries NO alias in src/lib/permissionAliases.ts, so
-- the alias-expansion branch of getPermissionScope is intentionally not
-- reproduced -- there is nothing for it to match here, and adding a no-op
-- branch would be speculative generality (YAGNI).
--
-- Scope is resolved against v_before.organization_id (the CONTRACT's own
-- org), not the caller's "active company" -- the RPC has no notion of active
-- company, and the contract's own org is what the existing org-visibility
-- check already keys off. In the UI these coincide, since the contracts list
-- is always loaded scoped to the active company.
--
-- Prerequisites:
--   20260814010000_client_contracts_audit_bypass_and_rpcs.sql — creates
--     rpc_update_client_contract_status.
--   20261115100000_client_contract_crm_signature_audit.sql — most recent
--     prior REPLACE of this function (signature-audit columns).
--   20261112490000_get_permission_scope_context_rpc.sql — scope data
--     collector reused here.

CREATE OR REPLACE FUNCTION public._client_contracts_effective_edit_scope(
  _organization_id uuid
)
RETURNS TABLE(scope_level text, team_member_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ctx        jsonb;
  v_full       boolean;
  v_override   text;
  v_role_has   boolean;
  v_binary     boolean;
BEGIN
  v_ctx := public.get_permission_scope_context(_organization_id);

  IF v_ctx IS NULL OR (v_ctx ->> 'anew_user_id') IS NULL THEN
    RETURN QUERY SELECT 'NONE'::text, ARRAY[]::uuid[];
    RETURN;
  END IF;

  -- Mirrors usePermissionScope.ts: is_global_system_admin short-circuits to
  -- full access, and so does an active membership with role_code
  -- super_admin/system_admin (hasFullAccess in the hook).
  IF (v_ctx ->> 'is_global_system_admin')::boolean THEN
    RETURN QUERY SELECT 'ORG'::text, ARRAY[]::uuid[];
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_ctx -> 'memberships', '[]'::jsonb)) m
    WHERE (m ->> 'role_code') IN ('super_admin', 'system_admin')
  ) INTO v_full;

  IF v_full THEN
    RETURN QUERY SELECT 'ORG'::text, ARRAY[]::uuid[];
    RETURN;
  END IF;

  -- Scope override for THIS permission code, from memberships in the active
  -- organization only (scope_rows already carries organization_id for this
  -- filter — see get_permission_scope_context's own header on why that
  -- filtering happens client-side today; reproduced here identically).
  -- Highest override wins, exactly like the hook's overrideMap reduction.
  SELECT row ->> 'scope_level'
  INTO v_override
  FROM jsonb_array_elements(COALESCE(v_ctx -> 'scope_rows', '[]'::jsonb)) row
  WHERE row ->> 'organization_id' = _organization_id::text
    AND row ->> 'permission_code' = 'client_contracts.edit'
  ORDER BY CASE row ->> 'scope_level'
    WHEN 'ORG' THEN 3 WHEN 'TEAM' THEN 2 WHEN 'OWNED' THEN 1 ELSE 0 END DESC
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    IF v_override = 'TEAM' THEN
      RETURN QUERY SELECT 'TEAM'::text, COALESCE((
        SELECT array_agg((elem)::uuid)
        FROM jsonb_array_elements_text(COALESCE(v_ctx -> 'team_member_ids', '[]'::jsonb)) elem
      ), ARRAY[]::uuid[]);
    ELSE
      RETURN QUERY SELECT v_override, ARRAY[]::uuid[];
    END IF;
    RETURN;
  END IF;

  -- No override: role_permissions fallback, exactly like getPermissionScope's
  -- final branch — present but not "binary" (supports_scope) => OWNED;
  -- binary => ORG; absent => NONE.
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_ctx -> 'role_permissions', '[]'::jsonb)) p
    WHERE p = 'client_contracts.edit'
  ) INTO v_role_has;

  IF NOT v_role_has THEN
    RETURN QUERY SELECT 'NONE'::text, ARRAY[]::uuid[];
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(v_ctx -> 'binary_permission_codes', '[]'::jsonb)) p
    WHERE p = 'client_contracts.edit'
  ) INTO v_binary;

  IF v_binary THEN
    RETURN QUERY SELECT 'ORG'::text, ARRAY[]::uuid[];
  ELSE
    RETURN QUERY SELECT 'OWNED'::text, ARRAY[]::uuid[];
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._client_contracts_effective_edit_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._client_contracts_effective_edit_scope(uuid) TO authenticated;

COMMENT ON FUNCTION public._client_contracts_effective_edit_scope(uuid) IS
  'Server-side mirror of usePermissionScope.ts getPermissionScope(''client_contracts.edit''), '
  'built on top of get_permission_scope_context. Used by rpc_update_client_contract_status '
  '(and any future client_contracts write RPC) to enforce the SAME OWNED/TEAM/ORG gate the '
  'UI already applies, so a caller cannot bypass their scope by calling the RPC directly.';

CREATE OR REPLACE FUNCTION public.rpc_update_client_contract_status(
  p_id     uuid,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid                    uuid := auth.uid();
  v_actor                  uuid;
  v_actor_name             text;
  v_before                 public.client_contracts;
  v_contract               public.client_contracts;
  v_diff                   jsonb;
  v_client_already_signed  boolean;
  v_record_company_signature boolean;
  v_scope                  text;
  v_team_ids               uuid[];
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_before FROM public.client_contracts WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with client_contracts_update RLS ────────────────
  IF NOT public.has_anew_permission(v_uid, 'client_contracts.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_before.organization_id IS NULL
     OR NOT (v_before.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Ownership gate — mirrors canEditContract/canActOnEntity exactly ──────
  -- (usePermissionScope.ts). ORG: no further restriction. TEAM/OWNED: the
  -- contract must have been created by the caller (TEAM: or by one of the
  -- teams the caller leads). NONE cannot reach here (has_anew_permission
  -- above already rejects it in practice, but is treated explicitly for
  -- clarity and defense-in-depth).
  SELECT scope_level, team_member_ids
  INTO v_scope, v_team_ids
  FROM public._client_contracts_effective_edit_scope(v_before.organization_id);

  IF v_scope = 'NONE' THEN
    RAISE EXCEPTION 'Sem permissão para editar contratos' USING ERRCODE = 'insufficient_privilege';
  ELSIF v_scope = 'OWNED' THEN
    IF v_before.created_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_scope = 'TEAM' THEN
    IF v_before.created_by IS DISTINCT FROM v_actor
       AND NOT (v_before.created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Contrato fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  -- ORG: allowed, no additional restriction.

  -- ── Decide whether this transition counts as an internal (CRM) acceptance ──
  -- Only when entering signed/active, and only when the client has not
  -- already signed (client proof columns all null). Never overwrite an
  -- existing client signature or an existing internal-acceptance record.
  v_client_already_signed := (
    v_before.signature_ip IS NOT NULL
    OR v_before.signature_date IS NOT NULL
    OR v_before.signed_by_name IS NOT NULL
  );
  v_record_company_signature :=
    p_status IN ('signed', 'active')
    AND NOT v_client_already_signed;

  IF v_record_company_signature THEN
    SELECT name INTO v_actor_name FROM public.anew_users WHERE id = v_actor;

    UPDATE public.client_contracts
    SET status                  = p_status,
        status_changed_by       = v_actor,
        status_changed_at       = now(),
        company_signature_date  = now(),
        company_signed_by_name  = COALESCE(v_actor_name, 'Utilizador'),
        company_signed_by_id    = v_actor
    WHERE id = p_id
    RETURNING * INTO v_contract;
  ELSE
    -- ── UPDATE status (identical column set to the original handleStatusChange) ──
    UPDATE public.client_contracts
    SET status            = p_status,
        status_changed_by = v_actor,
        status_changed_at = now()
    WHERE id = p_id
    RETURNING * INTO v_contract;
  END IF;

  -- ── Build the diff — only for columns that actually changed ───────────────
  v_diff := '{}'::jsonb;
  IF v_before.status IS DISTINCT FROM v_contract.status THEN
    v_diff := v_diff || jsonb_build_object('status',
      jsonb_build_object('old', to_jsonb(v_before.status), 'new', to_jsonb(v_contract.status)));
    v_diff := v_diff || jsonb_build_object('status_changed_by',
      jsonb_build_object('old', to_jsonb(v_before.status_changed_by), 'new', to_jsonb(v_contract.status_changed_by)));
  END IF;
  IF v_before.company_signed_by_id IS DISTINCT FROM v_contract.company_signed_by_id THEN
    v_diff := v_diff || jsonb_build_object('company_signed_by_id',
      jsonb_build_object('old', to_jsonb(v_before.company_signed_by_id), 'new', to_jsonb(v_contract.company_signed_by_id)));
    v_diff := v_diff || jsonb_build_object('company_signature_date',
      jsonb_build_object('old', to_jsonb(v_before.company_signature_date), 'new', to_jsonb(v_contract.company_signature_date)));
    v_diff := v_diff || jsonb_build_object('company_signed_by_name',
      jsonb_build_object('old', to_jsonb(v_before.company_signed_by_name), 'new', to_jsonb(v_contract.company_signed_by_name)));
  END IF;

  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE', jsonb_build_object('client_contracts', v_diff), 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;

-- Signature is unchanged (p_id uuid, p_status text) — grants already in place
-- from 20260814010000 are preserved by CREATE OR REPLACE; no re-grant needed.

-- ============================================================
-- NOT fixed by this migration (out of scope, flagged for follow-up)
-- ============================================================
-- rpc_reassign_client_contract (20261015020000) has the exact same gap: it
-- checks has_anew_permission('client_contracts.edit') + org visibility, but
-- never checks ownership, and its own header explicitly (and, per this
-- migration, incorrectly) assumes "scope enforcement ... is already applied
-- client-side ... it does not need to duplicate the FE's OWNED/TEAM scope
-- narrowing". The same live reproduction that motivated this migration
-- would apply to it: an OWNED/TEAM-scoped user could reassign a colleague's
-- contract by calling this RPC directly. Left untouched here because the
-- task this migration answers is scoped to status transitions
-- (rpc_update_client_contract_status) only.
