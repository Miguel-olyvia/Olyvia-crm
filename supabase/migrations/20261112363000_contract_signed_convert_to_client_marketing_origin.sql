-- ============================================================
-- Persist the entity's marketing origin (source/source_id/campaign_id) onto
-- anew_clients when fn_contract_signed_convert_to_client() (the safety-net
-- trigger added in 20261112340000_client_contracts_signed_convert_to_client_
-- trigger.sql) creates or reuses a client as a signed-contract side effect.
--
-- Byte-identical to that version except:
--   • Right after v_entity_id is resolved (and confirmed not null), the
--     marketing origin is resolved via the shared
--     fn_resolve_client_marketing_origin() helper (added in 20261112360000),
--     scoped to NEW.organization_id.
--   • Reuse branches (an anew_clients row already exists for this entity,
--     either in the contract's own org or via the root-org fallback) now
--     also COALESCE-update the 3 origin_* columns, only filling them when
--     still empty — never overwriting an origin already recorded.
--   • The CREATE branch (brand-new anew_clients row) now writes
--     origin_source, origin_source_id, origin_campaign_id with the resolved
--     values.
-- The entire body remains wrapped in the same outer BEGIN/EXCEPTION WHEN
-- OTHERS block, so none of these additions can ever fail or roll back the
-- UPDATE/INSERT on client_contracts that fired this trigger. Trigger
-- definition itself is unchanged.
-- ============================================================

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
  v_origin_source text;
  v_origin_source_id uuid;
  v_origin_campaign_id uuid;
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

    -- ── 2b. Resolve the entity's marketing origin (best-effort; NULLs are
    --       fine — the COALESCE guards below and the INSERT simply persist
    --       whatever comes back, including all-NULL).
    SELECT origin_source, origin_source_id, origin_campaign_id
    INTO v_origin_source, v_origin_source_id, v_origin_campaign_id
    FROM public.fn_resolve_client_marketing_origin(v_entity_id, NEW.organization_id);

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
      UPDATE public.anew_clients
      SET origin_source = COALESCE(origin_source, v_origin_source),
          origin_source_id = COALESCE(origin_source_id, v_origin_source_id),
          origin_campaign_id = COALESCE(origin_campaign_id, v_origin_campaign_id)
      WHERE id = v_client_id;
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

      IF v_client_id IS NOT NULL THEN
        UPDATE public.anew_clients
        SET origin_source = COALESCE(origin_source, v_origin_source),
            origin_source_id = COALESCE(origin_source_id, v_origin_source_id),
            origin_campaign_id = COALESCE(origin_campaign_id, v_origin_campaign_id)
        WHERE id = v_client_id;
      ELSE
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
          status, source_type, source_id, created_by,
          origin_source, origin_source_id, origin_campaign_id
        ) VALUES (
          v_entity_id, NEW.organization_id, v_root_org_id,
          'active', 'contract', NEW.id, v_actor,
          v_origin_source, v_origin_source_id, v_origin_campaign_id
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
  'Safety net (SQL trigger) for the "contract signed -> anew_clients" conversion that execute-workflow performs best-effort via a fire-and-forget HTTP call. Reads contract_stage_actions dynamically (org then global fallback, action_type=convert_to_client) on every signed transition; never blocks the client_contracts write on failure. Also persists the entity''s resolved marketing origin (origin_source/origin_source_id/origin_campaign_id) onto the created/reused anew_clients row via fn_resolve_client_marketing_origin(), best-effort and without overwriting an origin already recorded. See migration 20261112340000 for full rationale and scope limits, and 20261112363000 for the marketing-origin addition.';

-- Trigger definition is unchanged (DROP/CREATE kept only for idempotent
-- re-application; CREATE OR REPLACE FUNCTION above already updates the
-- trigger's underlying function body in place without needing this).
DROP TRIGGER IF EXISTS trg_contract_signed_convert_to_client ON public.client_contracts;

CREATE TRIGGER trg_contract_signed_convert_to_client
AFTER INSERT OR UPDATE OF status ON public.client_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_contract_signed_convert_to_client();
