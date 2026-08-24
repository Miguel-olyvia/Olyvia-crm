-- Orçamentos (Quotes) — add p_lost_reason to rpc_bulk_status_quote
-- 2026-11-12 | Module: Orçamentos
-- Forward-only migration. Does not edit the already-applied 20260817020000 file.
--
-- Problem
-- -------
-- rpc_bulk_status_quote (20260817020000_quotes_bulk_rpcs.sql) lets the bulk "change status"
-- action set estado to 'perdido' (or, in principle, 'rejeitado') without ever recording WHY —
-- unlike the individual "Marcar como Perdido" row action (Quotes.tsx handleMarkAsLost, ~L1224),
-- which always writes quotes.lost_reason alongside estado = 'perdido'. quotes.lost_reason exists
-- since 20261112100000_quotes_add_lost_reason.sql.
--
-- Solution
-- --------
-- CREATE OR REPLACE the SAME function, copying its current body verbatim, adding one new
-- parameter `p_lost_reason text DEFAULT NULL` and setting `lost_reason = COALESCE(p_lost_reason,
-- lost_reason)` in the UPDATE — so quotes not moving to perdido/rejeitado (or bulk calls that omit
-- the new param) keep their existing lost_reason untouched, exactly like today. Everything else
-- (dedup, org-scope check, permission gate, per-row audit) is unchanged.
--
-- The audit diff now also includes lost_reason old→new when it actually changes, mirroring how
-- estado's old→new is recorded, so the audit trail stays truthful for bulk moves to perdido/rejeitado.
--
-- Prerequisites:
--   20260817020000_quotes_bulk_rpcs.sql        — rpc_bulk_status_quote (function replaced here)
--   20261112100000_quotes_add_lost_reason.sql  — quotes.lost_reason column

CREATE OR REPLACE FUNCTION public.rpc_bulk_status_quote(
  p_ids             uuid[],
  p_organization_id uuid,
  p_estado          text,
  p_lost_reason     text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor       uuid;
  v_ids         uuid[];
  v_rec         record;
  v_count       integer := 0;
BEGIN
  -- Consolidate the whole batch into per-entity single audit rows (no trigger fan-out).
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organizationId obrigatório para alteração de estado em massa'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The FE only fires when bulkNewStatus is set (defaults to a real status).
  IF nullif(p_estado, '') IS NULL THEN
    RAISE EXCEPTION 'Estado de destino obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  -- ── Dedup ids ─────────────────────────────────────────────────────────────
  IF p_ids IS NULL THEN
    v_ids := ARRAY[]::uuid[];
  ELSE
    SELECT COALESCE(array_agg(DISTINCT o), ARRAY[]::uuid[])
    INTO   v_ids
    FROM   unnest(p_ids) AS u(o)
    WHERE  o IS NOT NULL;
  END IF;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN 0;
  END IF;

  -- ── Authorization parity with quotes_update_policy (org in caller's scope) ──
  IF NOT public.fn_deal_org_in_scope(p_organization_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Defense-in-depth: server-side write permission (see 20260817020000 header) ──
  IF NOT public.has_anew_permission(auth.uid(), 'quotes.manage') THEN
    RAISE EXCEPTION 'Sem permissão para alterar estado de orçamentos'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE + per-entity consolidated audit row ────────────────────────────
  -- Only rows whose estado actually changes are audited (mirrors trigger skip-on-no-change).
  -- lost_reason is only overwritten when the caller passes one (COALESCE keeps the existing
  -- value otherwise), so bulk moves to rascunho/enviado/aceite behave exactly as before this
  -- migration — no p_lost_reason means no change to lost_reason.
  FOR v_rec IN
    WITH pre AS (
      SELECT id, organization_id, estado AS old_estado, lost_reason AS old_lost_reason
      FROM   public.quotes
      WHERE  id = ANY (v_ids)
        AND  organization_id = p_organization_id
        AND  deleted_at IS NULL
        AND  (estado IS DISTINCT FROM p_estado
              OR (p_lost_reason IS NOT NULL AND lost_reason IS DISTINCT FROM p_lost_reason))
      FOR UPDATE
    ),
    upd AS (
      UPDATE public.quotes q
      SET estado      = p_estado,
          lost_reason = COALESCE(p_lost_reason, q.lost_reason)
      FROM pre
      WHERE q.id = pre.id
      RETURNING q.id, q.organization_id, pre.old_estado, q.estado AS new_estado,
                pre.old_lost_reason, q.lost_reason AS new_lost_reason
    )
    SELECT * FROM upd
  LOOP
    PERFORM public.fn_manual_audit_log(
      'quotes',
      v_rec.id,
      v_rec.organization_id,
      'UPDATE',
      jsonb_build_object('quotes',
        jsonb_build_object('estado', jsonb_build_object('old', to_jsonb(v_rec.old_estado), 'new', to_jsonb(v_rec.new_estado)))
        ||
        CASE
          WHEN v_rec.old_lost_reason IS DISTINCT FROM v_rec.new_lost_reason
          THEN jsonb_build_object('lost_reason', jsonb_build_object('old', to_jsonb(v_rec.old_lost_reason), 'new', to_jsonb(v_rec.new_lost_reason)))
          ELSE '{}'::jsonb
        END
      ),
      'web_app'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_status_quote(uuid[], uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_status_quote(uuid[], uuid, text, text) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Signature grew a 4th, defaulted param — existing callers passing only 3 named args keep working:
--      SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'rpc_bulk_status_quote';
--
-- 2. Bulk move to 'perdido' with p_lost_reason set persists lost_reason on every affected row and
--    logs an UPDATE audit row containing both estado and lost_reason old→new:
--      SELECT id, estado, lost_reason FROM public.quotes WHERE id = ANY(<selected>);
--
-- 3. Bulk move to 'rascunho'/'enviado'/'aceite' (p_lost_reason omitted/NULL) leaves lost_reason
--    untouched — COALESCE(p_lost_reason, lost_reason) is a no-op when p_lost_reason IS NULL.
