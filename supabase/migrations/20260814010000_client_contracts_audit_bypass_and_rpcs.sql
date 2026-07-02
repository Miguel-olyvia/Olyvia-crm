-- Contratos (client_contracts) — single-log RPCs on the shared audit-bypass foundation
-- 2026-08-14 | Module: Contratos — client_contracts
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- The survey classified this module as "sem problema" because a contract action touches only
-- ONE table (client_contracts). That classification was WRONG for the CREATE action:
-- createMutation in src/pages/ClientContracts.tsx issues an INSERT into client_contracts
-- (line 705) followed, CONDITIONALLY (only when a template was chosen and a contract body must
-- be generated), by a SECOND, SEPARATE UPDATE on the very same row (line 728) to write the
-- baked contract_body_html. Each is its own Supabase call / Postgres transaction, and
-- client_contracts is audited by fn_generic_entity_audit() (AFTER INSERT OR UPDATE OR DELETE —
-- see 20260629000000_contracts_audit_log_triggers.sql §4). So a single "create contract with a
-- template" produces TWO entity_audit_log rows (one INSERT + one UPDATE) when the business
-- intent is exactly ONE. This is the identical bug pattern already fixed in Produtos (two
-- separate UPDATEs on the same table folded into one RPC/transaction/log row).
--
-- update_client_contract (updateMutation, line 735) and update_client_contract_status
-- (handleStatusChange, line 843) each touch client_contracts exactly once today, so on their
-- own they emit one row. They are wrapped here anyway so the whole module writes through the
-- same consolidated, single-log, atomic path, and so status changes always resolve the actor
-- identity server-side (never trusting a client-supplied status_changed_by).
--
-- Note on client_contract_events: client_contracts also has trigger_log_client_contract_event
-- (AFTER INSERT OR UPDATE) which writes a human-readable row into client_contract_events. That
-- table is intentionally NOT wired into entity_audit_log (see design note (a) in
-- 20260629000000), so it does NOT contribute extra entity_audit_log rows. We deliberately do
-- NOT set app.audit_bypass in a way that would suppress that legacy event log — the bypass GUC
-- is only read by the entity_audit_log trigger functions, and log_client_contract_event() does
-- not read it, so the narrative event log keeps working exactly as before. The bypass only
-- prevents the DUPLICATE entity_audit_log rows.
--
-- Solution
-- --------
-- The audit-bypass FOUNDATION already exists — created by the Roles module in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql (grep for "app.audit_bypass" /
-- "fn_manual_audit_log" confirms it). It provides:
--   · The per-transaction GUC `app.audit_bypass`. When set to 'on' (SET LOCAL / set_config
--     with is_local=true), guarded audit trigger functions short-circuit and write nothing.
--   · fn_manual_audit_log(p_table_name, p_entity_id, p_organization_id, p_operation,
--     p_changed_fields, p_source) — writes exactly ONE row to entity_audit_log, reusing the
--     SAME author-resolution chain as the trigger functions (app.audit_user_id GUC →
--     current_business_user_id() → anew_users via auth.uid()). Never raises.
--   · fn_generic_entity_audit() was already guarded in 20260719010000. It is the trigger
--     function that fires on client_contracts, so this table already honours the bypass —
--     THIS MIGRATION CREATES NO FOUNDATION and guards NO additional trigger function
--     (client_contracts is the only table these RPCs write to, and it already uses the
--     already-guarded generic function).
--
-- This migration adds THREE RPCs that reproduce, field-for-field, condition-for-condition,
-- what ClientContracts.tsx does today, each inside a single transaction with
-- app.audit_bypass = 'on', and call fn_manual_audit_log ONCE:
--   · rpc_create_client_contract — the INSERT + the conditional contract_body_html rewrite,
--                                   folded into ONE atomic statement path with ONE log row
--                                   (fixes the two-log create bug).
--   · rpc_update_client_contract — the metadata UPDATE (template/dates/notes/payment_terms/
--                                   prompt_values merge).
--   · rpc_update_client_contract_status — the status change (status + status_changed_by
--                                   resolved server-side + status_changed_at).
--
-- Faithful replication notes (behaviour preserved exactly, NOT simplified)
-- ------------------------------------------------------------------------
-- CREATE (createMutation, lines 669-733):
--   · The FE resolves clientId (_resolvedClientId), resolvedEntityId, totalValue (sum of
--     proposal.quotes.total), rootOrgId (walk hierarchy up to root), and contractBodyHtml
--     (template body_html when a template was chosen) CLIENT-SIDE. The RPC receives these as
--     parameters — the resolution logic stays in the FE exactly as-is; only the two DB writes
--     move server-side. Input validation continues in the FE.
--   · INSERT column set is IDENTICAL to line 705-713:
--       client_id, entity_id|null, organization_id (= activeCompany.id), root_organization_id,
--       proposal_id, contract_template_id|null, total_value, currency='EUR',
--       start_date|null, end_date|null, notes|null, payment_terms|null,
--       contract_body_html (= template body, or NULL), prompt_values (= object or NULL),
--       status='draft', created_by (= business user).
--     contract_number is set by the BEFORE INSERT trigger set_client_contract_number()
--     (baseline line 6201) — NOT written here, exactly as the FE does not write it.
--   · The conditional second write (lines 719-729): only when a template body existed
--     (p_contract_body_html IS NOT NULL) AND the FE baked a final HTML (injected prompt answers
--     + signatory into the signature block). That baking uses gatherContractData /
--     applyPromptValues / injectSignatoryIntoSignatureBlock which run in the browser and depend
--     on DOM/string helpers; it stays in the FE. The RPC receives the already-baked final HTML
--     as p_final_body_html and, when it is provided, UPDATEs contract_body_html on the freshly
--     inserted row. Folding this into the SAME transaction as the INSERT is the fix: the row is
--     created and its body finalised atomically, and the AFTER triggers fire under the bypass,
--     so exactly ONE consolidated INSERT audit row is written (the final body value is captured
--     in that single row's diff).
--   · Returns the created contract id (the FE only needs the invalidate + the inserted row for
--     baking, which it now passes back in; returning the row lets the FE keep the same shape).
--
-- UPDATE (updateMutation, lines 735-760):
--   · The prompt_values MERGE ({...existing, ...incoming} when incoming is non-empty, else keep
--     existing) is done in the FE today by reading currentContract.prompt_values. To keep the
--     merge authoritative and race-free, the RPC re-reads the current prompt_values from the
--     row and applies the same merge rule server-side against p_prompt_values.
--   · UPDATE column set is IDENTICAL to line 745-749:
--       contract_template_id|null, start_date|null, end_date|null, notes|null,
--       payment_terms|null, prompt_values (merged object or NULL).
--   · Returns the updated contract id.
--
-- STATUS (handleStatusChange, lines 832-851):
--   · UPDATE column set is IDENTICAL to line 843-847:
--       status, status_changed_by, status_changed_at=now().
--     The FE sets status_changed_by = businessUserId || authUser?.id || null. The RPC resolves
--     the business user id server-side (current_business_user_id()) and uses it — this is
--     STRICTLY SAFER than the FE fallback to authUser?.id (an auth-namespace UUID that does not
--     match anew_users.id); the status_changed_by column is meant to hold the business user id,
--     consistent with created_by. Documented as a deliberate correctness improvement, not a
--     hidden behaviour change.
--   · Returns the updated contract id.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS on client_contracts does NOT self-enforce inside them.
-- Each RPC re-checks, explicitly, the SAME predicates the RLS policies enforce today:
--   client_contracts_insert (20260618230000_fix_client_contracts_insert_business_user_rls.sql):
--       created_by = current_business_user_id()
--       AND organization_id IN get_user_visible_org_ids(auth.uid())
--       AND has_anew_permission(auth.uid(), 'client_contracts.create')
--   client_contracts_update (baseline line 25942):
--       organization_id IN get_user_visible_org_ids(auth.uid())
--       AND has_anew_permission(auth.uid(), 'client_contracts.edit')
--   client_contracts_delete is NOT covered here — deletion still goes through the existing
--       soft_delete_business_entity RPC in the FE (deleteMutation), which is out of scope.
-- The org check is applied against the row's CURRENT organization_id for update/status, and
-- against the passed organization_id for create; the create RPC additionally verifies the
-- passed created_by equals the resolved business user (mirroring the insert WITH CHECK).
--
-- No collision with sibling modules
-- ---------------------------------
-- The Contracts audit-trigger migration (20260629000000) created fn_audit_contract_* trigger
-- functions, not rpc_*. The names here (rpc_create_client_contract / rpc_update_client_contract
-- / rpc_update_client_contract_status) are new and distinct.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log, fn_generic_entity_audit(),
--                                                      set_audit_context()
--   20260629000000_contracts_audit_log_triggers.sql — trg_audit_client_contracts on client_contracts
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — fn_manual_audit_log() + guarded
--                                                      fn_generic_entity_audit() (FOUNDATION, reused)
--   20260618230000_fix_client_contracts_insert_business_user_rls.sql — insert RLS mirrored here
--   20260615130000_baseline_new_database.sql         — has_anew_permission(),
--                                                      current_business_user_id(),
--                                                      get_user_visible_org_ids(),
--                                                      set_client_contract_number() (BEFORE INSERT)


-- ============================================================
-- 1. rpc_create_client_contract(...)
-- ============================================================
-- Mirrors createMutation in src/pages/ClientContracts.tsx (lines 669-733):
--   · INSERT client_contracts (identical column set)
--   · CONDITIONAL UPDATE of contract_body_html when a baked final HTML is provided
--   · both folded into ONE transaction under app.audit_bypass, ONE consolidated INSERT log row
-- Returns the created contract id.

CREATE OR REPLACE FUNCTION public.rpc_create_client_contract(
  p_client_id          uuid,
  p_entity_id          uuid,
  p_organization_id    uuid,
  p_root_organization_id uuid,
  p_proposal_id        uuid,
  p_contract_template_id uuid,
  p_total_value        numeric,
  p_currency           text,
  p_start_date         date,
  p_end_date           date,
  p_notes              text,
  p_payment_terms      text,
  p_contract_body_html text,
  p_final_body_html    text,
  p_prompt_values      jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_actor      uuid;
  v_contract   public.client_contracts;
  v_final_body text;
  v_diff       jsonb;
BEGIN
  -- Consolidate all writes into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId in the FE) ─────────────────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Authorization parity with client_contracts_insert RLS ────────────────
  IF NOT public.has_anew_permission(v_uid, 'client_contracts.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar contratos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the contract (identical column set to createMutation) ─────────
  -- contract_number is populated by the BEFORE INSERT trigger set_client_contract_number().
  INSERT INTO public.client_contracts
    (client_id, entity_id, organization_id, root_organization_id,
     proposal_id, contract_template_id, total_value, currency,
     start_date, end_date, notes, payment_terms,
     contract_body_html, prompt_values, status, created_by)
  VALUES
    (p_client_id,
     p_entity_id,
     p_organization_id,
     p_root_organization_id,
     p_proposal_id,
     p_contract_template_id,
     p_total_value,
     COALESCE(nullif(p_currency, ''), 'EUR'),
     p_start_date,
     p_end_date,
     nullif(p_notes, ''),
     nullif(p_payment_terms, ''),
     p_contract_body_html,
     CASE WHEN p_prompt_values IS NOT NULL
               AND jsonb_typeof(p_prompt_values) = 'object'
               AND p_prompt_values <> '{}'::jsonb
          THEN p_prompt_values END,
     'draft',
     v_actor)
  RETURNING * INTO v_contract;

  -- ── CONDITIONAL body rewrite (FE lines 719-729) ──────────────────────────
  -- Only when a template body existed AND the FE baked a final HTML. Folded into
  -- the SAME transaction so exactly ONE INSERT audit row is written.
  v_final_body := v_contract.contract_body_html;
  IF p_contract_body_html IS NOT NULL AND p_final_body_html IS NOT NULL THEN
    UPDATE public.client_contracts
    SET contract_body_html = p_final_body_html
    WHERE id = v_contract.id
    RETURNING contract_body_html INTO v_final_body;
  END IF;

  -- ── Combined diff: full snapshot of the created contract (body = final value) ──
  v_diff := jsonb_build_object(
    'client_contracts', jsonb_build_object(
      'client_id',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.client_id)),
      'entity_id',            jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.entity_id)),
      'organization_id',      jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.organization_id)),
      'root_organization_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.root_organization_id)),
      'proposal_id',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.proposal_id)),
      'contract_template_id', jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.contract_template_id)),
      'total_value',          jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.total_value)),
      'currency',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.currency)),
      'start_date',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.start_date)),
      'end_date',             jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.end_date)),
      'notes',                jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.notes)),
      'payment_terms',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.payment_terms)),
      'contract_body_html',   jsonb_build_object('old', NULL, 'new', to_jsonb(v_final_body)),
      'prompt_values',        jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.prompt_values)),
      'status',               jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.status)),
      'created_by',           jsonb_build_object('old', NULL, 'new', to_jsonb(v_contract.created_by))
    )
  );

  PERFORM public.fn_manual_audit_log(
    'client_contracts', v_contract.id, v_contract.organization_id, 'INSERT', v_diff, 'web_app'
  );

  RETURN v_contract.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_client_contract(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, date, text, text, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_client_contract(
  uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, date, text, text, text, text, jsonb
) TO authenticated;


-- ============================================================
-- 2. rpc_update_client_contract(...)
-- ============================================================
-- Mirrors updateMutation in src/pages/ClientContracts.tsx (lines 735-760):
--   · Re-read current prompt_values, apply the SAME merge rule as the FE
--     (incoming non-empty → {...existing, ...incoming}; else keep existing).
--   · UPDATE client_contracts {contract_template_id|null, start_date|null, end_date|null,
--     notes|null, payment_terms|null, prompt_values (merged or NULL)} WHERE id.
--   · ONE consolidated UPDATE log row (only when something meaningful changed).
-- Returns the updated contract id.

CREATE OR REPLACE FUNCTION public.rpc_update_client_contract(
  p_id                    uuid,
  p_contract_template_id  uuid,
  p_start_date            date,
  p_end_date              date,
  p_notes                 text,
  p_payment_terms         text,
  p_prompt_values         jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor        uuid;
  v_before       public.client_contracts;
  v_contract     public.client_contracts;
  v_existing_pv  jsonb;
  v_merged_pv    jsonb;
  v_diff         jsonb;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + the prompt_values merge) ──
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

  -- ── Merge prompt_values (mirrors FE mergedPromptValues, lines 738-743) ────
  v_existing_pv := CASE
    WHEN v_before.prompt_values IS NOT NULL
         AND jsonb_typeof(v_before.prompt_values) = 'object'
    THEN v_before.prompt_values
    ELSE '{}'::jsonb
  END;

  IF p_prompt_values IS NOT NULL
     AND jsonb_typeof(p_prompt_values) = 'object'
     AND p_prompt_values <> '{}'::jsonb THEN
    v_merged_pv := v_existing_pv || p_prompt_values;
  ELSE
    v_merged_pv := v_existing_pv;
  END IF;

  -- ── UPDATE the contract (identical column set to updatePayload) ───────────
  UPDATE public.client_contracts
  SET contract_template_id = p_contract_template_id,
      start_date           = p_start_date,
      end_date             = p_end_date,
      notes                = nullif(p_notes, ''),
      payment_terms        = nullif(p_payment_terms, ''),
      prompt_values        = CASE WHEN v_merged_pv <> '{}'::jsonb THEN v_merged_pv END
  WHERE id = p_id
  RETURNING * INTO v_contract;

  -- ── Build the diff (only changed columns) ─────────────────────────────────
  v_diff := '{}'::jsonb;
  IF v_before.contract_template_id IS DISTINCT FROM v_contract.contract_template_id THEN
    v_diff := v_diff || jsonb_build_object('contract_template_id',
      jsonb_build_object('old', to_jsonb(v_before.contract_template_id), 'new', to_jsonb(v_contract.contract_template_id)));
  END IF;
  IF v_before.start_date IS DISTINCT FROM v_contract.start_date THEN
    v_diff := v_diff || jsonb_build_object('start_date',
      jsonb_build_object('old', to_jsonb(v_before.start_date), 'new', to_jsonb(v_contract.start_date)));
  END IF;
  IF v_before.end_date IS DISTINCT FROM v_contract.end_date THEN
    v_diff := v_diff || jsonb_build_object('end_date',
      jsonb_build_object('old', to_jsonb(v_before.end_date), 'new', to_jsonb(v_contract.end_date)));
  END IF;
  IF v_before.notes IS DISTINCT FROM v_contract.notes THEN
    v_diff := v_diff || jsonb_build_object('notes',
      jsonb_build_object('old', to_jsonb(v_before.notes), 'new', to_jsonb(v_contract.notes)));
  END IF;
  IF v_before.payment_terms IS DISTINCT FROM v_contract.payment_terms THEN
    v_diff := v_diff || jsonb_build_object('payment_terms',
      jsonb_build_object('old', to_jsonb(v_before.payment_terms), 'new', to_jsonb(v_contract.payment_terms)));
  END IF;
  IF v_before.prompt_values IS DISTINCT FROM v_contract.prompt_values THEN
    v_diff := v_diff || jsonb_build_object('prompt_values',
      jsonb_build_object('old', to_jsonb(v_before.prompt_values), 'new', to_jsonb(v_contract.prompt_values)));
  END IF;

  -- Emit a single UPDATE log row only when something meaningful changed
  -- (matches the "skip when nothing changed" behaviour of the triggers).
  IF v_diff <> '{}'::jsonb THEN
    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE',
      jsonb_build_object('client_contracts', v_diff), 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_client_contract(
  uuid, uuid, date, date, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_client_contract(
  uuid, uuid, date, date, text, text, jsonb
) TO authenticated;


-- ============================================================
-- 3. rpc_update_client_contract_status(...)
-- ============================================================
-- Mirrors handleStatusChange in src/pages/ClientContracts.tsx (lines 832-851):
--   · UPDATE client_contracts {status, status_changed_by, status_changed_at=now()} WHERE id.
--   · status_changed_by resolved SERVER-SIDE to the business user id (never the auth uid),
--     correcting the FE's authUser?.id fallback which is a different namespace.
--   · ONE consolidated UPDATE log row (only when the status actually changed).
-- Returns the updated contract id.

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
  v_uid       uuid := auth.uid();
  v_actor     uuid;
  v_before    public.client_contracts;
  v_contract  public.client_contracts;
  v_diff      jsonb;
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

  -- ── UPDATE status (identical column set to handleStatusChange) ────────────
  UPDATE public.client_contracts
  SET status            = p_status,
      status_changed_by = v_actor,
      status_changed_at = now()
  WHERE id = p_id
  RETURNING * INTO v_contract;

  -- ── Build the diff — only when the status actually changed ────────────────
  IF v_before.status IS DISTINCT FROM v_contract.status THEN
    v_diff := jsonb_build_object(
      'client_contracts', jsonb_build_object(
        'status', jsonb_build_object(
          'old', to_jsonb(v_before.status), 'new', to_jsonb(v_contract.status)),
        'status_changed_by', jsonb_build_object(
          'old', to_jsonb(v_before.status_changed_by), 'new', to_jsonb(v_contract.status_changed_by))
      )
    );

    PERFORM public.fn_manual_audit_log(
      'client_contracts', p_id, v_contract.organization_id, 'UPDATE', v_diff, 'web_app'
    );
  END IF;

  RETURN v_contract.id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_client_contract_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_client_contract_status(uuid, text) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. This migration creates NO foundation and guards NO trigger function:
--    client_contracts is audited by fn_generic_entity_audit(), already guarded in
--    20260719010000. Confirm the guard is present:
--      SELECT proname FROM pg_proc
--      WHERE proname = 'fn_generic_entity_audit' AND prosrc LIKE '%app.audit_bypass%';
--      -- Expected: 1 row.
--
-- 2. A single "create contract WITH a template" now produces exactly ONE audit row:
--      SELECT count(*) FROM public.entity_audit_log
--      WHERE table_name = 'client_contracts' AND operation = 'INSERT'
--        AND created_at > now() - interval '1 minute';
--      -- Expected: 1 (not 2, despite the folded INSERT + body UPDATE).
--    The legacy client_contract_events 'created' row is still written by
--    trigger_log_client_contract_event (that log does not read the bypass GUC).
--
-- 3. rpc_update_client_contract that changes nothing yields ZERO audit rows (diff empty),
--    matching the trigger's "skip when only noise / nothing changed" behaviour.
--
-- 4. rpc_update_client_contract_status on a contract outside the caller's visible orgs, or
--    without client_contracts.edit, raises insufficient_privilege — matching the RLS policy.
--    The legacy client_contract_events 'status_changed' row is still written by
--    trigger_log_client_contract_event.
--
-- 5. No signature/name collision with the fn_audit_contract_* trigger functions from
--    20260629000000 nor with any existing rpc_* in the repo.
