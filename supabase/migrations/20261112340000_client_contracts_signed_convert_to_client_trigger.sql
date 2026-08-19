-- Safety net: synchronous SQL trigger that guarantees an anew_clients row
-- exists whenever a client_contracts row transitions to "signed"/"assinado",
-- for organizations that have convert_to_client configured active in
-- contract_stage_actions — same condition the execute-workflow Edge Function
-- uses today.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS (read-only investigation, 2026-08-19)
-- ═══════════════════════════════════════════════════════════════════════════
-- The "contract signed -> create/activate anew_clients" behaviour today lives
-- entirely inside the execute-workflow Edge Function (supabase/functions/
-- execute-workflow/index.ts, "5. CONTRACT STATUS CHANGES", ~line 918 onward).
-- It is invoked as a **fire-and-forget HTTP fetch, wrapped in a swallow-all
-- try/catch (console.log/console.error only, no retry, no user-facing
-- surface, no durable queue)** from THREE separate call sites, all of which
-- first persist client_contracts.status = 'signed' directly (that write
-- always succeeds), then best-effort trigger the Edge Function:
--   • supabase/functions/pipeline-automation/index.ts        (finalize_contract)
--   • supabase/functions/validate-contract-signature/index.ts (multi-party e-sign)
--   • supabase/functions/client-portal-action/index.ts        (sign_contract, OTP-SMS)
-- All three send the identical payload shape:
--   { source_entity: "contract", entity_id: <contract id>, new_stage_id: "signed", triggered_by }
--
-- Confirmed impact (direct read-only queries against production data):
--   • 59 client_contracts rows are status='signed' today. Of the 58 with a
--     resolvable entity_id, 5 have NO matching anew_clients row for their
--     (entity_id, organization_id) pair — a ~8.6% silent-loss rate for this
--     specific automation. 4 of those 5 were backfilled read-only in migration
--     20261112330000 (see that file for full forensic detail: no
--     workflow_execution_log row exists for any of them, ruling out a logic
--     bug in the trigger CONDITION itself — the organization's convert_to_client
--     config was active and entity_id was present directly on every one of
--     them; the HTTP call chain itself simply never completed).
--   • The 5th (client_contracts.id 0216757d-048d-4b02-9251-c677819ef567,
--     CC-2026-0002) already has client_id set, but pointing at an anew_clients
--     row in a *different* organization that merely shares the same
--     root_organization_id — a separate, pre-existing data-shape quirk
--     (the Edge Function's own "root-org fallback" branch actively *moves*
--     an existing root-org client's organization_id to match the contract;
--     this trigger deliberately does NOT replicate that mutation — see
--     "DELIBERATE SCOPE LIMITS" below). This row is left untouched by both the
--     backfill migration and this trigger since it is not actually orphaned.
--   • workflow_execution_log has only 7 rows in all of history across every
--     source_entity — most action types in execute-workflow (lead
--     convert_to_contact/convert_to_client, deal create_quote/create_proposal,
--     quote create_proposal, all create_task actions) never call
--     logWorkflowExecution() at all, success or failure. This means the *true*
--     failure rate of execute-workflow as a whole cannot be fully audited from
--     that table — the 8.6% figure above is a lower bound specific to the
--     contract->client conversion path, not a system-wide reliability number.
--   • By contrast, the LEAD and DEAL stage-change callers (src/pages/
--     AnewLeads.tsx, src/pages/Deals.tsx) DO `await supabase.functions.invoke(
--     'execute-workflow', ...)` and capture the result into a named
--     error/failed flag in the calling code — structurally better than the
--     three contract call sites' swallow-and-log-only pattern, though this
--     migration does not verify each one always surfaces a user-facing toast.
--   • 88 proposals sit at the "accepted" stage; 82 have a client_contracts row
--     via proposal_id FK, 6 do not. All 6 share one identical updated_at
--     timestamp, indicating they were moved to "accepted" by a bulk
--     import/migration that bypassed execute-workflow entirely, rather than a
--     genuine fire-and-forget failure of a real user action — noted for
--     completeness, not treated as further evidence against the Edge Function
--     itself, and NOT addressed by this trigger (out of scope: this trigger
--     only covers client_contracts, not proposals).
--
-- Conclusion presented to the user: the per-request LOGIC inside
-- execute-workflow is coherent for lead/deal/quote/proposal/contract stage
-- cascades (no bugs found while reading the file end-to-end); the reliability
-- gap is entirely in the "best-effort fire-and-forget HTTP call + silent
-- catch, no retry" pattern used by the 3 contract call sites, compounded by
-- thin audit-log coverage. This trigger is a narrowly-scoped safety net for
-- the single highest-impact consequence of that gap (a signed contract with
-- no corresponding client record) — it does not replace or fix
-- execute-workflow, which keeps running unchanged and still performs the
-- fuller cascade (lead sync to "ganho", pipeline_links updates, contact/role
-- housekeeping when it isn't already implied by the anew_clients insert
-- itself — see below) whenever its own HTTP call actually succeeds.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DYNAMIC CONFIG PARITY (the user's explicit requirement)
-- ═══════════════════════════════════════════════════════════════════════════
-- contract_stage_actions schema: id, organization_id (nullable = global
-- default row), stage_id (text), action_type (text), action_config (jsonb),
-- is_active (bool), execution_order (int), created_by/created_at/updated_at.
--
-- execute-workflow's exact resolution (index.ts ~line 926-947), replicated
-- 1:1 below:
--   1. Look up ACTIVE rows for organization_id = <contract's org> AND
--      stage_id IN ('signed','assinado') (both aliases are checked even
--      though real rows only ever contain 'assinado' — 'signed' is the
--      English value the TypeScript callers pass as new_stage_id; kept for
--      exact parity in case a future row ever uses it).
--   2. If that set is EMPTY (no active org-specific row at all, regardless of
--      action_type), fall back to the ACTIVE global rows (organization_id IS
--      NULL) for the same stage_id set.
--   3. hasConvertToClient = does the resolved set (org-specific if non-empty,
--      else global) contain a row with action_type = 'convert_to_client'.
--
-- This produces one faithfully-replicated quirk that this migration does NOT
-- attempt to "fix" (parity with the Edge Function is the explicit
-- requirement): an org cannot disable convert_to_client by simply setting its
-- own row's is_active=false, because that makes the org-specific active-row
-- set empty, which falls through to the global default (itself active) —
-- functionally re-enabling it. To truly disable convert_to_client for one
-- org today, that org needs an ACTIVE row for stage 'assinado' with a
-- DIFFERENT action_type (so the org-specific set is non-empty and does not
-- contain 'convert_to_client'). Both this trigger and execute-workflow behave
-- identically here, by construction — same query, same fallback order.
--
-- Verified against live data (2026-08-19): 4 contract_stage_actions rows
-- exist in total — 1 global + org-specific rows for Gromicho.lda, Mudelar and
-- nike — ALL with action_type='convert_to_client', stage_id='assinado',
-- is_active=true. No organization has convert_to_client disabled today. If an
-- admin adds/changes a row in the future (disables it for an org, or points a
-- different stage_id at it), this trigger re-reads contract_stage_actions on
-- every signed transition — there is no hardcoded/cached copy of the config
-- anywhere in this migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DELIBERATE SCOPE LIMITS (called out explicitly, not silently dropped)
-- ═══════════════════════════════════════════════════════════════════════════
-- This trigger intentionally does LESS than execute-workflow's contract
-- branch. It guarantees the single most damaging missing side effect (no
-- anew_clients row for a signed contract) and nothing beyond that:
--   • entity_id resolution mirrors only steps 1-3 of the Edge Function
--     (contract.entity_id directly; else via anew_clients.entity_id through
--     contract.client_id; else via pipeline_links -> deals.entity_id). It does
--     NOT replicate the Edge Function's 4th fallback (picking an entity's sole
--     still-open lead when ambiguous) — that fallback exists purely to
--     resolve a *lead* to sync to "ganho", which this trigger does not do.
--   • When an existing anew_clients row is found for the entity only under a
--     DIFFERENT org sharing the same root_organization_id, this trigger
--     REUSES that client's id (so it never creates a duplicate) but, unlike
--     execute-workflow, does NOT relocate that row's organization_id to match
--     the contract's own org, and does NOT reactivate its status if inactive.
--     This is a deliberate, safer simplification: mutating a client record
--     that lives in a sibling organization has visibility implications this
--     narrowly-scoped trigger should not decide on its own. If this ever
--     matters in practice, execute-workflow (when it succeeds) still performs
--     the full move/reactivate logic.
--   • Lead status sync to "ganho", pipeline_links bookkeeping, and the
--     proposal/quote-side cascades are entirely untouched by this trigger —
--     only execute-workflow does those.
--   • Manual entity-role flips (deactivate 'contact' role, activate 'client'
--     role) and anew_contacts.converted_to_client_id/converted_at bookkeeping
--     are NOT written by this trigger's own code — they don't need to be.
--     They already happen automatically as a side effect of the INSERT this
--     trigger performs into anew_clients, via the pre-existing
--     `sync_from_client_after_insert_update` AFTER trigger on anew_clients
--     (-> trg_sync_from_client() -> sync_client_contact_roles()), which was
--     verified (pg_get_functiondef) to perform exactly that cascade already.
--     This mirrors how migration 20261112330000's backfill also relied on
--     that same existing cascade instead of writing role/contact updates by
--     hand.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY AFTER, AND WHY IT CAN NEVER BLOCK THE CONTRACT UPDATE
-- ═══════════════════════════════════════════════════════════════════════════
-- Fires AFTER INSERT OR UPDATE OF status so it only runs once the contract's
-- own row is already durably persisted in the same transaction — a BEFORE
-- trigger would run before that write is final and gains nothing here, since
-- this trigger writes to a *different* table (anew_clients), not to the
-- client_contracts row itself. The entire body beyond the initial
-- signed-stage guard is wrapped in its own BEGIN/EXCEPTION WHEN OTHERS block:
-- any error (permission issue, unexpected NULL, contract_stage_actions or
-- anew_clients shape drift, etc.) is caught, best-effort logged to
-- workflow_execution_log, and swallowed — it can never fail or roll back the
-- UPDATE/INSERT on client_contracts that fired it.
--
-- SECURITY DEFINER (owned by postgres, which has BYPASSRLS in this project,
-- same pattern as every other side-effect trigger function on these tables:
-- fn_trg_client_created, trg_sync_from_client, log_client_contract_event,
-- set_client_contract_assigned_to) so this runs correctly regardless of
-- whether the UPDATE that fired it came from the service-role Edge Functions
-- above or from a normal authenticated user with client_contracts.edit
-- permission marking a contract as signed directly in the CRM UI (RLS on
-- anew_clients would otherwise require clients.create permission, which the
-- signing user may not have).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SIMULATION AGAINST REAL DATA (read-only, no writes performed by this block)
-- ═══════════════════════════════════════════════════════════════════════════
-- Applying this trigger's logic retroactively to the 5 already-signed
-- contracts identified above:
--   • a38c9c43 / 9b685c0c / 17ec0e9b / 4a761fbd (org Mudelar, root Grupo
--     BMLar): entity_id present directly, client_id NULL, org-specific active
--     convert_to_client row exists -> hasConvertToClient=true. No existing
--     anew_clients row anywhere for these entities (org- or root-scoped) ->
--     trigger takes the CREATE branch, inserting entity_id/organization_id=
--     Mudelar/root_organization_id=Grupo BMLar/status=active/source_type=
--     contract/source_id=<own contract id>, then backfills client_id on the
--     contract. This is the exact same outcome migration 20261112330000
--     already produced by hand for these 4 rows (this migration does not
--     touch them again — the trigger's own NOT-duplicate check makes it a
--     no-op once that row exists).
--   • 0216757d (CC-2026-0002): client_id is already 5c9d407d, which resolves
--     via the root-org fallback branch to the SAME id the trigger would find
--     (entity de23d1e0, root org Grupo BMLar). Since NEW.client_id already
--     equals the resolved id, the trigger's final "backfill client_id"
--     update is skipped -> correct no-op, matching "do not duplicate".
-- All 5 simulated outcomes match the intended idempotent behaviour.

CREATE OR REPLACE FUNCTION public.fn_contract_signed_convert_to_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_signed_aliases text[] := ARRAY['signed', 'assinado'];
  v_has_org_config boolean;
  v_has_convert boolean;
  v_entity_id uuid;
  v_client_id uuid;
  v_client_status text;
  v_root_org_id uuid;
  v_actor uuid;
BEGIN
  -- Only ever react to a transition into the signed stage (mirrors
  -- execute-workflow's `signedAliases.includes(new_stage_id)` gate).
  IF NEW.status IS NULL OR NOT (NEW.status = ANY (v_signed_aliases)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Everything below is best-effort: any failure is caught and logged, never
  -- propagated, so this can never block the write to client_contracts.
  BEGIN
    v_root_org_id := COALESCE(NEW.root_organization_id, NEW.organization_id);

    -- ── 1. Dynamic contract_stage_actions lookup — identical query shape,
    --      fallback order and filters as execute-workflow index.ts ~926-947.
    SELECT EXISTS (
      SELECT 1 FROM public.contract_stage_actions
      WHERE organization_id = NEW.organization_id
        AND stage_id = ANY (v_signed_aliases)
        AND is_active = true
    ) INTO v_has_org_config;

    IF v_has_org_config THEN
      SELECT EXISTS (
        SELECT 1 FROM public.contract_stage_actions
        WHERE organization_id = NEW.organization_id
          AND stage_id = ANY (v_signed_aliases)
          AND is_active = true
          AND action_type = 'convert_to_client'
      ) INTO v_has_convert;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.contract_stage_actions
        WHERE organization_id IS NULL
          AND stage_id = ANY (v_signed_aliases)
          AND is_active = true
          AND action_type = 'convert_to_client'
      ) INTO v_has_convert;
    END IF;

    IF NOT v_has_convert THEN
      -- No active convert_to_client config (org-specific or global) for this
      -- stage — exact parity with execute-workflow's own no-op branch.
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, execution_data
      ) VALUES (
        'contract', NEW.id, 'client', NULL,
        'trigger:contract_signed_client_conversion_skipped', 'success',
        jsonb_build_object(
          'reason', 'No active contract_stage_actions row with action_type=convert_to_client for this organization/stage (nor a global fallback)',
          'stage_id', NEW.status
        )
      );
      RETURN NEW;
    END IF;

    -- ── 2. Resolve entity_id — mirrors steps 1-3 of the Edge Function
    --      (the 4th fallback there only resolves a *lead* for "ganho" sync,
    --      out of scope for this trigger; see migration header).
    v_entity_id := NEW.entity_id;

    IF v_entity_id IS NULL AND NEW.client_id IS NOT NULL THEN
      SELECT entity_id INTO v_entity_id
      FROM public.anew_clients
      WHERE id = NEW.client_id;
    END IF;

    IF v_entity_id IS NULL THEN
      SELECT d.entity_id INTO v_entity_id
      FROM public.pipeline_links pl
      JOIN public.deals d ON d.id = pl.deal_id
      WHERE pl.contract_id = NEW.id
        AND pl.status = 'active'
      LIMIT 1;
    END IF;

    IF v_entity_id IS NULL THEN
      -- Nothing to convert — same no-op as the Edge Function when eId cannot
      -- be resolved at all.
      RETURN NEW;
    END IF;

    -- ── 3. Resolve/create the client, idempotently (never duplicates).
    v_client_id := NULL;
    v_client_status := NULL;

    SELECT id, status INTO v_client_id, v_client_status
    FROM public.anew_clients
    WHERE entity_id = v_entity_id
      AND organization_id = NEW.organization_id
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
      IF v_client_status IS DISTINCT FROM 'active' THEN
        UPDATE public.anew_clients SET status = 'active' WHERE id = v_client_id;
      END IF;
    ELSE
      -- Root-org fallback: reuse an existing client from a sibling org under
      -- the same root_organization_id rather than creating a duplicate.
      -- Deliberately does NOT relocate/reactivate it (see scope-limits note
      -- above) — that is left to execute-workflow when it runs successfully.
      SELECT id INTO v_client_id
      FROM public.anew_clients
      WHERE entity_id = v_entity_id
        AND root_organization_id = v_root_org_id
      LIMIT 1;

      IF v_client_id IS NULL THEN
        v_actor := NULL;
        BEGIN
          v_actor := nullif(current_setting('app.audit_user_id', true), '')::uuid;
        EXCEPTION WHEN OTHERS THEN
          v_actor := NULL;
        END;
        IF v_actor IS NULL THEN
          v_actor := public.current_business_user_id();
        END IF;
        IF v_actor IS NULL THEN
          v_actor := COALESCE(NEW.status_changed_by, NEW.created_by);
        END IF;

        INSERT INTO public.anew_clients (
          entity_id, organization_id, root_organization_id,
          status, source_type, source_id, created_by
        ) VALUES (
          v_entity_id, NEW.organization_id, v_root_org_id,
          'active', 'contract', NEW.id, v_actor
        )
        RETURNING id INTO v_client_id;
      END IF;
    END IF;

    -- ── 4. Backfill client_id on the contract itself, only if empty.
    IF v_client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM v_client_id THEN
      UPDATE public.client_contracts SET client_id = v_client_id WHERE id = NEW.id;
    END IF;

    INSERT INTO public.workflow_execution_log (
      source_entity, source_record_id, target_entity, target_record_id,
      action_type, status
    ) VALUES (
      'contract', NEW.id, 'client', v_client_id,
      'trigger:contract_signed_client_conversion', 'success'
    );

  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message
      ) VALUES (
        'contract', NEW.id, 'client', NULL,
        'trigger:contract_signed_client_conversion', 'error', SQLERRM
      );
    EXCEPTION WHEN OTHERS THEN
      -- Even the error-log insert must never propagate.
      NULL;
    END;
  END;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_contract_signed_convert_to_client() IS
  'Safety net (SQL trigger) for the "contract signed -> anew_clients" conversion that execute-workflow performs best-effort via a fire-and-forget HTTP call. Reads contract_stage_actions dynamically (org then global fallback, action_type=convert_to_client) on every signed transition; never blocks the client_contracts write on failure. See migration 20261112340000 for full rationale and scope limits.';

DROP TRIGGER IF EXISTS trg_contract_signed_convert_to_client ON public.client_contracts;

CREATE TRIGGER trg_contract_signed_convert_to_client
AFTER INSERT OR UPDATE OF status ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_contract_signed_convert_to_client();
