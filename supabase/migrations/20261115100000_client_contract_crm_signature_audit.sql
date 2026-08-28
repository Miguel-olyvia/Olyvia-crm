-- rpc_update_client_contract_status: record WHO signed and WHEN when the CRM
-- marks a contract as signed.
-- 2026-11-15 | Module: Contratos — client_contracts
-- Forward-only migration. Do not fold into the baseline. Do not edit an
-- already-applied migration.
--
-- Problem this migration solves
-- ------------------------------
-- Two paths mark a client_contracts row as "signed":
--   1. The client portal (sign_contract / client-portal-action) — records full
--      legal proof: real server-detected IP, timestamp, name and signature
--      image, into signature_ip / signature_date / signature_image /
--      signed_by_name.
--   2. The CRM "mark as signed" button — src/pages/ClientContracts.tsx:1286
--      (handleStatusChange) calls rpc_update_client_contract_status(p_id,
--      p_status), which (as created in 20260814010000) only ever wrote
--      status / status_changed_by / status_changed_at. It recorded NOTHING
--      about who accepted internally on behalf of the company, or when.
-- Measured against the database: 10 contracts say "signed" with no IP, no
-- name, no date, no image (all in Mudelar, 2026-05-29 .. 2026-07-24).
--
-- Solution
-- --------
-- When rpc_update_client_contract_status transitions a contract INTO
-- 'signed' or 'active' AND the client has not already signed it (i.e. none
-- of signature_ip / signature_date / signed_by_name is set), the RPC now
-- also fills the three columns already used for the CRM's own SMS-OTP
-- signature path (ContractBodyTab.tsx:307-311 — handleCompanySignAfterOtp):
--   company_signature_date = now()
--   company_signed_by_name = (anew_users.name of the resolved business actor)
--   company_signed_by_id   = the resolved business actor (SERVER-SIDE,
--                             current_business_user_id() — never a
--                             client-supplied parameter)
-- This is deliberately NOT the same thing as a client signature: it records
-- "accepted internally by <person>", not "signed by the client". The client
-- columns (signature_ip, signature_date, signature_image, signed_by_name)
-- are left untouched — filling them would misrepresent that the client
-- signed when they did not.
--
-- If the client HAS already signed (any of the three client columns is
-- non-null) the company_* columns are intentionally left alone: the CRM did
-- not "accept" a contract the client already signed themselves, and this
-- transition must not overwrite an existing internal-acceptance record.
--
-- Existing 10 affected contracts are NOT touched by this migration — there
-- is no way to retroactively manufacture proof that was never captured.
-- (Recommendation for those 10 rows is documented in the task report, not
-- executed here.)
--
-- Prerequisites:
--   20260814010000_client_contracts_audit_bypass_and_rpcs.sql — creates
--     rpc_update_client_contract_status with the original status-only body.
--   20260615130000_baseline_new_database.sql — client_contracts columns
--     company_signature_date/company_signed_by_name/company_signed_by_id
--     (already exist, already used by the SMS-OTP company-sign path).

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
-- Verification notes (not executed)
-- ============================================================
-- 1. Transition to 'signed' on a contract with no prior client signature:
--      company_signature_date/company_signed_by_name/company_signed_by_id
--      are filled with now() / the caller's anew_users.name / the caller's
--      business user id — never a client-supplied value (no such parameter
--      exists on this RPC).
--      signature_ip/signature_date/signature_image/signed_by_name (client
--      columns) remain NULL.
-- 2. Transition to 'draft' / 'pending_signature' / 'cancelled' never touches
--      any of the six proof columns.
-- 3. Transition to 'signed' on a contract that already has a client
--      signature (any of signature_ip/signature_date/signed_by_name set)
--      leaves company_* untouched and does not alter the client columns.
-- 4. Existing 10 affected Mudelar contracts (2026-05-29..2026-07-24) are
--      NOT modified by this migration.
