-- Propostas (Proposals) — audit-bypass guard fix for proposal_items trigger + single-log RPCs
-- 2026-08-15 | Module: Propostas
-- Forward-only migration. Do not fold into the baseline. Never edit an already-applied migration
-- (this is why proposal_items' missing guard lands here and NOT inside 20260628100000).
--
-- Problem this migration solves
-- -----------------------------
-- Today one user action (create/update a proposal) is issued from the frontend as several
-- independent Supabase calls (handleSubmit in src/pages/Proposals.tsx, and the same flow in
-- src/components/proposals/ProposalCreateDialog.tsx), each its own Postgres transaction:
--
--   1. INSERT/UPDATE proposals
--   2. UPDATE quotes SET proposal_id = null   (unlink stale)
--   3. UPDATE quotes SET proposal_id = <id>   (link selected)   — or a single unlink when none
--   4. INSERT quotes + INSERT quote_lines      (per inline quote)
--   5. DELETE proposal_items + INSERT proposal_items
--
-- Every touched table has an AFTER trigger that writes to entity_audit_log:
--   · proposals       → fn_audit_proposals_safe()   (guarded in 20260813010000)
--   · quotes          → fn_generic_entity_audit()    (guarded in 20260719010000)
--   · quote_lines     → fn_audit_quote_child()       (guarded in 20260813010000)
--   · proposal_items  → fn_audit_proposal_child()    (NOT YET GUARDED — fixed here, §1)
--
-- Result: a single "save proposal" produces N audit rows (1 per table touched, plus one per
-- quote_line and per proposal_item on delete/reinsert) when the business intent is exactly 1.
-- The survey identified 5 separate calls for a typical action.
--
-- Solution
-- --------
-- Reuse the EXISTING foundation (app.audit_bypass GUC + fn_manual_audit_log()), created in
-- 20260719010000_roles_audit_bypass_and_rpcs.sql and NOT recreated here. The three trigger
-- functions on proposals/quotes/quote_lines were already guarded in previous modules
-- (20260719 / 20260813). The ONE remaining gap is fn_audit_proposal_child() — it fires on
-- proposal_items (and proposal_manual_items) and never checked the bypass flag, so a proposal
-- save that rewrites its items still floods the log. §1 adds the guard there.
--
-- Then two RPCs reproduce, field-for-field, condition-for-condition, what the frontend does
-- today, all inside a single transaction with app.audit_bypass='on', accumulate a combined diff
-- across ALL touched tables ({table:{field:{old,new}}}), and call fn_manual_audit_log ONCE
-- (plus one extra INSERT row per inline quote created — an inline quote is a standalone quote,
-- mirroring the convention already used by rpc_save_quote in 20260812010000):
--   · rpc_create_proposal(...)  — INSERT proposals (+ link quotes + inline quotes + proposal_items)
--   · rpc_update_proposal(...)  — UPDATE proposals (+ relink quotes + inline quotes + proposal_items)
--
-- No pipeline_links collision
-- ---------------------------
-- The Deals and Orçamentos modules own pipeline_links writes (rpc_create_deal / rpc_update_deal /
-- rpc_save_quote). The Proposals create/update flow in the FE NEVER writes pipeline_links — it only
-- READS it in loadData() for display. These RPCs therefore do NOT touch pipeline_links, so there is
-- no overlap with the Deals/Orçamentos handling.
--
-- Authorization / RLS parity
-- --------------------------
-- The RPCs are SECURITY DEFINER, so RLS does NOT self-enforce inside them. Each RPC re-checks,
-- explicitly, the SAME predicates the RLS policies enforce today. The LIVE policies (confirmed
-- against pg_policy on the linked DB) are:
--
--   proposals INSERT ("Users with permission can create proposals", baseline 20260615130000):
--       created_by = current_business_user_id()
--       AND has_anew_permission(auth.uid(),'proposals.create')
--       AND (organization_id IS NULL OR organization_id IN get_user_visible_org_ids(auth.uid()))
--
--   proposals UPDATE ("Users with permission can update proposals",
--                     20260626110000_rls_performance_and_proposals_check.sql):
--       USING (
--         created_by = current_business_user_id()
--         OR (has_anew_permission(auth.uid(),'proposals.edit')
--             AND organization_id IN get_user_visible_org_ids(auth.uid()))
--       )
--       WITH CHECK (
--         has_anew_permission(auth.uid(),'proposals.edit')          -- UNCONDITIONAL, no OR with created_by
--         AND (organization_id IS NULL
--              OR organization_id IN get_user_visible_org_ids(auth.uid()))
--       )
--
--   CRITICAL: the UPDATE WITH CHECK requires proposals.edit UNCONDITIONALLY — even the
--   proposal's own creator cannot update it without proposals.edit (documented explicitly in
--   20260626110000: "The proposals WITH CHECK intentionally does NOT re-assert
--   created_by ... as a sufficient condition on its own"). rpc_update_proposal therefore
--   replicates BOTH gates sequentially (USING, then WITH CHECK) — see §4. Replicating only the
--   USING would let a user with proposals.create but NOT proposals.edit edit their own proposal,
--   a privilege escalation the live policy blocks.
--
--   quotes INSERT/UPDATE: created_by = current_business_user_id() (insert) AND org IN visible orgs.
--   quote_lines: parent quote's org IN visible orgs.
--   proposal_items INSERT/DELETE: parent proposal reachable under the proposals policies above.
-- The org-scope check on the resolved proposal org therefore covers quotes / quote_lines /
-- proposal_items transitively, exactly as the RLS chain does.
--
-- Prerequisites:
--   20260625010000_entity_audit_log.sql             — entity_audit_log + fn_generic_entity_audit()
--   20260628100000_proposals_audit_triggers.sql     — fn_audit_proposal_child() (guarded here)
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass guard + fn_manual_audit_log()
--   20260812010000_quotes_audit_bypass_and_rpcs.sql — rpc_save_quote convention reference
--   20260813010000_quotes_audit_bypass_child_trigger_fix.sql — quote/quote_lines/proposals triggers guarded
--   20260615130000_baseline_new_database.sql        — has_anew_permission(), current_business_user_id(),
--                                                      get_user_visible_org_ids()


-- ============================================================
-- 1. fn_audit_proposal_child() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260628100000_proposals_audit_triggers.sql §1 except for the new guard
-- as the FIRST statement. Handles proposal_items and proposal_manual_items. The trigger wiring
-- (trg_audit_proposal_items etc.) is NOT touched — same function OID, same attachment.

CREATE OR REPLACE FUNCTION public.fn_audit_proposal_child()
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
  v_proposal_id    uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC (rpc_create_proposal / rpc_update_proposal) has already
  -- written a single consolidated audit row via fn_manual_audit_log(), it sets
  -- app.audit_bypass='on' (SET LOCAL) so this trigger writes nothing and the save
  -- produces exactly one log row.
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

  -- ── Resolve proposal_id from whichever side is available ────────────────
  -- On DELETE, NEW is NULL; on INSERT, OLD is NULL.
  v_proposal_id := COALESCE(
    (to_jsonb(NEW) ->> 'proposal_id')::uuid,
    (to_jsonb(OLD) ->> 'proposal_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent proposal ────────────
  IF v_proposal_id IS NOT NULL THEN
    SELECT p.organization_id, p.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.proposals p
    WHERE  p.id = v_proposal_id
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

REVOKE ALL ON FUNCTION public.fn_audit_proposal_child() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_proposal_child() TO service_role;


-- ============================================================
-- 2. fn_proposals_persist_relations(...) — shared helper for both RPCs
-- ============================================================
-- Encapsulates the identical "relations" block that handleSubmit runs AFTER the
-- proposals row is written, for BOTH create and update paths:
--   a) relink selected quotes (unlink stale, link chosen) — steps 2/3 in the FE,
--   b) insert inline quotes + their lines (with FK sanitisation of product/service/
--      catalog ids, exactly like Proposals.tsx),
--   c) delete-all + reinsert proposal_items.
-- Returns the array of inline-quote ids created (for per-quote audit rows).
--
-- It writes under the SAME bypassed transaction (caller sets app.audit_bypass='on')
-- and re-derives every value from its arguments — never trusting an org it was not
-- given. DRY: create and update differ only in the proposals write itself.
--
-- Notes on parity with Proposals.tsx handleSubmit:
--   · quotes relink: when selected_quote_ids is non-empty, unlink every quote
--     currently on this proposal that is NOT in the selected set, then link the
--     selected set. When empty, unlink all quotes from this proposal. Scoped by
--     organization_id exactly like the FE (.eq("organization_id", ...)).
--   · inline quotes: each is a standalone finalized quote. FKs product_id/service_id/
--     catalog_item_id are sanitised (kept only if they still exist) — the FE does the
--     same via existence checks. Lines are already fully computed by the FE and passed
--     verbatim. categoria hardcoded to '' and section_name default 'Geral' as in the FE.
--   · proposal_items: delete-all then reinsert (proposal_items has NO organization_id
--     column — confirmed in baseline 20260615130000 — so the delete is scoped by
--     proposal_id only; the FE's redundant .eq("organization_id") on proposal_items is
--     a no-op there and intentionally dropped here).

CREATE OR REPLACE FUNCTION public.fn_proposals_persist_relations(
  p_proposal_id          uuid,
  p_organization_id      uuid,
  p_root_organization_id uuid,
  p_deal_id              uuid,
  p_entity_id            uuid,      -- proposals.entity_id (NULL when a deal is selected in the FE)
  p_actor                uuid,
  p_selected_quote_ids   uuid[],
  p_inline_quotes        jsonb,     -- [{ title, obra_notas, modelo_base, ..., lines:[{...}] }]
  p_proposal_items       jsonb,     -- [{ description, quantity, unit_price, vat_rate }]
  p_quote_entity_id      uuid       -- entity_id for the inline quotes. The FE computes this via a
                                    -- DIFFERENT cascade than proposals.entity_id (Proposals.tsx
                                    -- L1305: selectedDeal?.entity_id || selectedEntity?.entityId;
                                    -- ProposalCreateDialog.tsx L394: presetEntityId ||
                                    -- selectedDeal?.entity_id || selectedContact?.entity_id) and
                                    -- passes it explicitly. Do NOT fall back to p_entity_id here:
                                    -- p_entity_id is NULL whenever a deal is selected, which is
                                    -- exactly when the correct quote entity comes from the deal.
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_iq             jsonb;
  v_iq_line        jsonb;
  v_iq_id          uuid;
  v_iq_ids         uuid[] := ARRAY[]::uuid[];
  v_item           jsonb;
  v_idx            integer := 0;
  v_valid_lines    jsonb;
  v_subtotal       numeric;
  v_total          numeric;
  v_line_product   uuid;
  v_line_service   uuid;
  v_line_catalog   uuid;
  v_line_valid_p   uuid;
  v_line_valid_s   uuid;
  v_line_valid_c   uuid;
BEGIN
  -- ══════════════════════════════════════════════════════════════════════════
  -- a) Relink selected quotes (mirrors FE steps 2/3)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
    -- Unlink quotes previously on this proposal that are NOT in the selected set.
    UPDATE public.quotes
    SET proposal_id = NULL
    WHERE proposal_id     = p_proposal_id
      AND organization_id = p_organization_id
      AND id <> ALL (p_selected_quote_ids);

    -- Link the selected set to this proposal.
    UPDATE public.quotes
    SET proposal_id = p_proposal_id
    WHERE id = ANY (p_selected_quote_ids)
      AND organization_id = p_organization_id;
  ELSE
    -- No selection — unlink everything from this proposal.
    UPDATE public.quotes
    SET proposal_id = NULL
    WHERE proposal_id     = p_proposal_id
      AND organization_id = p_organization_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- b) Inline quotes: each is a standalone finalized quote + its lines
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
    FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
    LOOP
      -- FE skips inline quotes whose lines are all qt <= 0 (validLines empty).
      IF v_iq IS NULL
         OR jsonb_typeof(v_iq -> 'lines') <> 'array'
         OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
        CONTINUE;
      END IF;

      -- Keep only lines with qt > 0 (FE: validLines = lines.filter(l => l.qt > 0)).
      v_valid_lines := (
        SELECT COALESCE(jsonb_agg(l), '[]'::jsonb)
        FROM jsonb_array_elements(v_iq -> 'lines') AS l
        WHERE COALESCE((l ->> 'qt')::numeric, 0) > 0
      );
      IF jsonb_array_length(v_valid_lines) = 0 THEN
        CONTINUE;
      END IF;

      -- Compute quote totals from the (already fully-computed) line values, exactly
      -- as the FE does: subtotal = sum(total_sem_iva), total = sum(total_com_desconto).
      SELECT
        COALESCE(sum((l ->> 'total_sem_iva')::numeric), 0),
        COALESCE(sum((l ->> 'total_com_desconto')::numeric), 0)
      INTO v_subtotal, v_total
      FROM jsonb_array_elements(v_valid_lines) AS l;

      INSERT INTO public.quotes (
        deal_id, entity_id, organization_id, root_organization_id,
        title, obra_notas, modelo_base, desconto_global_percent, estado,
        validade_dias, iva_rate, client_notes, conditions, proposal_id,
        created_by, subtotal, total
      )
      VALUES (
        p_deal_id,
        p_quote_entity_id,   -- inline-quote entity from the FE cascade, NOT the proposal's entity_id
        p_organization_id,
        COALESCE(p_root_organization_id, p_organization_id),
        nullif(v_iq ->> 'title', ''),
        nullif(v_iq ->> 'obra_notas', ''),
        CASE WHEN nullif(v_iq ->> 'modelo_base', '') IS NOT NULL
                  AND (v_iq ->> 'modelo_base') <> '0'
             THEN v_iq ->> 'modelo_base'
             ELSE 'default'
        END,
        COALESCE((v_iq ->> 'desconto_global_percent')::numeric, 0),
        'finalizado',
        (v_iq ->> 'validade_dias')::integer,
        (v_iq ->> 'iva_rate')::numeric,
        nullif(v_iq ->> 'client_notes', ''),
        nullif(v_iq ->> 'conditions', ''),
        p_proposal_id,
        p_actor,
        v_subtotal,
        v_total
      )
      RETURNING id INTO v_iq_id;

      -- Insert the quote lines, sanitising FKs the way the FE does (drop ids that
      -- no longer exist in products/services/catalog_items).
      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_valid_lines)
      LOOP
        v_line_product := nullif(v_iq_line ->> 'product_id', '')::uuid;
        v_line_service := nullif(v_iq_line ->> 'service_id', '')::uuid;
        v_line_catalog := nullif(v_iq_line ->> 'catalog_item_id', '')::uuid;

        v_line_valid_p := NULL;
        v_line_valid_s := NULL;
        v_line_valid_c := NULL;

        IF v_line_product IS NOT NULL THEN
          SELECT id INTO v_line_valid_p FROM public.products WHERE id = v_line_product;
        END IF;
        IF v_line_service IS NOT NULL THEN
          SELECT id INTO v_line_valid_s FROM public.services WHERE id = v_line_service;
        END IF;
        IF v_line_catalog IS NOT NULL THEN
          SELECT id INTO v_line_valid_c FROM public.catalog_items WHERE id = v_line_catalog;
        END IF;

        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price
        )
        VALUES (
          v_iq_id,
          v_line_valid_c,
          v_line_valid_p,
          v_line_valid_s,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          '',
          v_iq_line ->> 'descricao_snapshot',
          (v_iq_line ->> 'qt')::numeric,
          (v_iq_line ->> 'custo_material_unit')::numeric,
          (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
          (v_iq_line ->> 'margem_percent')::numeric,
          (v_iq_line ->> 'iva_percent')::numeric,
          (v_iq_line ->> 'int_percent')::numeric,
          COALESCE((v_iq_line ->> 'discount_percent')::numeric, 0),
          (v_iq_line ->> 'total_sem_iva')::numeric,
          (v_iq_line ->> 'total_com_iva')::numeric,
          (v_iq_line ->> 'total_com_desconto')::numeric,
          (v_iq_line ->> 'ordem')::integer,
          COALESCE(nullif(v_iq_line ->> 'section_name', ''), 'Geral'),
          nullif(v_iq_line ->> 'unidade', ''),
          nullif(v_iq_line ->> 'item_description', ''),
          COALESCE((v_iq_line ->> 'cost_price')::numeric, 0)
        );
      END LOOP;

      v_iq_ids := v_iq_ids || v_iq_id;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- c) proposal_items: delete-all then reinsert (scoped by proposal_id only)
  -- ══════════════════════════════════════════════════════════════════════════
  DELETE FROM public.proposal_items WHERE proposal_id = p_proposal_id;

  IF p_proposal_items IS NOT NULL AND jsonb_typeof(p_proposal_items) = 'array' THEN
    v_idx := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_proposal_items)
    LOOP
      INSERT INTO public.proposal_items (
        proposal_id, description, quantity, unit_price, vat_rate, sort_order
      )
      VALUES (
        p_proposal_id,
        v_item ->> 'description',
        (v_item ->> 'quantity')::numeric,
        (v_item ->> 'unit_price')::numeric,
        (v_item ->> 'vat_rate')::numeric,
        v_idx
      );
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  RETURN v_iq_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_proposals_persist_relations(uuid, uuid, uuid, uuid, uuid, uuid, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_proposals_persist_relations(uuid, uuid, uuid, uuid, uuid, uuid, uuid[], jsonb, jsonb, uuid) TO authenticated, service_role;


-- ============================================================
-- 3. rpc_create_proposal(...)
-- ============================================================
-- Mirrors handleSubmit (create path) in src/pages/Proposals.tsx /
-- ProposalCreateDialog.tsx:
--   · INSERT proposals { title, description|null, value, probability, deal_id,
--       entity_id, valid_until, notes, stage_id, status, organization_id,
--       root_organization_id, template_id, assigned_to, created_by = business user }
--   · relink selected quotes + inline quotes + proposal_items (shared helper)
-- Returns the created proposals row.
--
-- Authorization mirrors the proposals INSERT RLS policy.

CREATE OR REPLACE FUNCTION public.rpc_create_proposal(
  p_proposal_data      jsonb,
  p_selected_quote_ids uuid[]  DEFAULT ARRAY[]::uuid[],
  p_inline_quotes      jsonb   DEFAULT '[]'::jsonb,
  p_proposal_items     jsonb   DEFAULT '[]'::jsonb,
  p_quote_entity_id    uuid    DEFAULT NULL   -- inline-quote entity from the FE cascade
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_org_id       uuid;
  v_root_org_id  uuid;
  v_entity_id    uuid;
  v_deal_id      uuid;
  v_proposal     public.proposals;
  v_iq_ids       uuid[];
  v_diff         jsonb := '{}'::jsonb;
  v_prop_diff    jsonb := '{}'::jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_diff_cols    text[] := ARRAY[
    'title','description','value','probability','deal_id','entity_id','valid_until',
    'notes','stage_id','status','organization_id','root_organization_id',
    'template_id','assigned_to'
  ];
  v_iq_id        uuid;
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id      := nullif(p_proposal_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_proposal_data ->> 'root_organization_id', '')::uuid;
  v_deal_id     := nullif(p_proposal_data ->> 'deal_id', '')::uuid;
  v_entity_id   := nullif(p_proposal_data ->> 'entity_id', '')::uuid;

  -- ── Authorization parity with proposals INSERT RLS ────────────────────────
  -- Policy: created_by = current_business_user_id()
  --         AND has proposals.create
  --         AND (organization_id IS NULL OR organization_id IN visible orgs).
  IF NOT public.has_anew_permission(auth.uid(), 'proposals.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar propostas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_org_id IS NOT NULL
     AND NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── INSERT the proposal (identical column set to proposalData in the FE) ──
  INSERT INTO public.proposals (
    title, description, value, probability, deal_id, entity_id, valid_until,
    notes, stage_id, status, organization_id, root_organization_id,
    template_id, assigned_to, created_by
  )
  VALUES (
    p_proposal_data ->> 'title',
    nullif(p_proposal_data ->> 'description', ''),
    COALESCE((p_proposal_data ->> 'value')::numeric, 0),
    COALESCE((p_proposal_data ->> 'probability')::numeric, 50),
    v_deal_id,
    v_entity_id,
    nullif(p_proposal_data ->> 'valid_until', '')::date,
    nullif(p_proposal_data ->> 'notes', ''),
    nullif(p_proposal_data ->> 'stage_id', '')::uuid,
    COALESCE(nullif(p_proposal_data ->> 'status', ''), 'draft'),
    v_org_id,
    COALESCE(v_root_org_id, v_org_id),
    nullif(p_proposal_data ->> 'template_id', '')::uuid,
    nullif(p_proposal_data ->> 'assigned_to', '')::uuid,
    v_actor
  )
  RETURNING * INTO v_proposal;

  -- ── Relations (quotes relink + inline quotes + proposal_items) ────────────
  v_iq_ids := public.fn_proposals_persist_relations(
    v_proposal.id,
    v_proposal.organization_id,
    COALESCE(v_root_org_id, v_proposal.organization_id),
    v_deal_id,
    v_proposal.entity_id,
    v_actor,
    p_selected_quote_ids,
    p_inline_quotes,
    p_proposal_items,
    p_quote_entity_id
  );

  -- ── Build the combined diff (INSERT snapshot of the tracked columns) ──────
  v_new_json := to_jsonb(v_proposal);
  FOREACH v_key IN ARRAY v_diff_cols LOOP
    v_prop_diff := v_prop_diff || jsonb_build_object(
      v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
    );
  END LOOP;
  v_diff := v_diff || jsonb_build_object('proposals', v_prop_diff);

  IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'quotes', jsonb_build_object('linked', to_jsonb(p_selected_quote_ids))
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  v_diff := v_diff || jsonb_build_object(
    'proposal_items', jsonb_build_object('new', COALESCE(p_proposal_items, '[]'::jsonb))
  );

  -- ── One consolidated audit row for the proposal ───────────────────────────
  PERFORM public.fn_manual_audit_log(
    'proposals',
    v_proposal.entity_id,
    v_proposal.organization_id,
    'INSERT',
    v_diff,
    'web_app'
  );

  -- Each inline quote is an independent creation — one INSERT row apiece.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_proposal.organization_id, 'INSERT',
        jsonb_build_object('inline_of_proposal', to_jsonb(v_proposal.id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_proposal;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_proposal(jsonb, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_proposal(jsonb, uuid[], jsonb, jsonb, uuid) TO authenticated;


-- ============================================================
-- 4. rpc_update_proposal(...)
-- ============================================================
-- Mirrors handleSubmit (edit path). UPDATE proposals + relink quotes + inline
-- quotes + proposal_items, all in ONE transaction, ONE audit row.
-- Returns the updated proposals row.
--
-- NOTE on execute-workflow: the FE, after a stage change, calls the execute-workflow
-- Edge Function client-side (supabase.functions.invoke). That is a side-effect OUTSIDE
-- the DML transaction and stays in the FE — this RPC only owns the atomic DB writes,
-- exactly as the Deals/Orçamentos RPCs left their post-save Edge calls in the FE.
--
-- Authorization mirrors the proposals UPDATE RLS policy — see the CRITICAL note in
-- the header and Gate 1 / Gate 2 below.

CREATE OR REPLACE FUNCTION public.rpc_update_proposal(
  p_id                 uuid,
  p_proposal_data      jsonb,
  p_selected_quote_ids uuid[]  DEFAULT ARRAY[]::uuid[],
  p_inline_quotes      jsonb   DEFAULT '[]'::jsonb,
  p_proposal_items     jsonb   DEFAULT '[]'::jsonb,
  p_quote_entity_id    uuid    DEFAULT NULL   -- inline-quote entity from the FE cascade
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_org_id       uuid;
  v_root_org_id  uuid;
  v_entity_id    uuid;
  v_deal_id      uuid;
  v_before       public.proposals;
  v_proposal     public.proposals;
  v_iq_ids       uuid[];
  v_diff         jsonb := '{}'::jsonb;
  v_prop_diff    jsonb := '{}'::jsonb;
  v_old_json     jsonb;
  v_new_json     jsonb;
  v_key          text;
  v_diff_cols    text[] := ARRAY[
    'title','description','value','probability','deal_id','entity_id','valid_until',
    'notes','stage_id','status','organization_id','root_organization_id',
    'template_id','assigned_to'
  ];
  v_iq_id        uuid;
BEGIN
  PERFORM set_config('app.audit_bypass', 'on', true);

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Load the current row (before-image for the diff + guards) ─────────────
  SELECT * INTO v_before FROM public.proposals WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  v_org_id      := nullif(p_proposal_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_proposal_data ->> 'root_organization_id', '')::uuid;
  v_deal_id     := nullif(p_proposal_data ->> 'deal_id', '')::uuid;
  v_entity_id   := nullif(p_proposal_data ->> 'entity_id', '')::uuid;

  -- ── Authorization parity with proposals UPDATE RLS ────────────────────────
  -- The real live policy (20260626110000_rls_performance_and_proposals_check.sql,
  -- confirmed against pg_policy on the live DB) enforces USING and WITH CHECK as
  -- TWO SEPARATE gates. This RPC is SECURITY DEFINER (RLS does not self-enforce),
  -- so BOTH gates are replicated sequentially, exactly as Postgres applies them:
  --
  --   USING (row must be visible to update):
  --       created_by = current_business_user_id()
  --       OR (has proposals.edit AND organization_id IN visible orgs)
  --
  --   WITH CHECK (write is only allowed at all):
  --       has proposals.edit                                  -- UNCONDITIONAL
  --       AND (organization_id IS NULL OR organization_id IN visible orgs)
  --
  -- The WITH CHECK intentionally does NOT re-assert created_by as a sufficient
  -- condition on its own — proposals.edit is required even for the creator
  -- (documented explicitly in 20260626110000). Replicating only the USING here
  -- would let a user with proposals.create but NOT proposals.edit update their
  -- own proposal — a privilege escalation the live policy blocks. Hence the two
  -- distinct checks below.

  -- Gate 1 — USING: evaluated against the EXISTING row (v_before).
  IF NOT (
       v_before.created_by = v_actor
       OR (
         public.has_anew_permission(auth.uid(), 'proposals.edit')
         AND v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       )
     ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 — WITH CHECK: proposals.edit is required UNCONDITIONALLY, even for the
  -- proposal's own creator. No OR with created_by, matching the live policy exactly.
  IF NOT public.has_anew_permission(auth.uid(), 'proposals.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 (org-scope half of WITH CHECK): the resulting organization_id must be
  -- NULL or within the caller's visible orgs. Applied to the INCOMING org.
  IF v_org_id IS NOT NULL
     AND NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── UPDATE the proposal (identical column set to proposalData in the FE) ──
  UPDATE public.proposals
  SET title                = p_proposal_data ->> 'title',
      description          = nullif(p_proposal_data ->> 'description', ''),
      value                = COALESCE((p_proposal_data ->> 'value')::numeric, 0),
      probability          = COALESCE((p_proposal_data ->> 'probability')::numeric, 50),
      deal_id              = v_deal_id,
      entity_id            = v_entity_id,
      valid_until          = nullif(p_proposal_data ->> 'valid_until', '')::date,
      notes                = nullif(p_proposal_data ->> 'notes', ''),
      stage_id             = nullif(p_proposal_data ->> 'stage_id', '')::uuid,
      status               = COALESCE(nullif(p_proposal_data ->> 'status', ''), 'draft'),
      organization_id      = v_org_id,
      root_organization_id = COALESCE(v_root_org_id, v_org_id),
      template_id          = nullif(p_proposal_data ->> 'template_id', '')::uuid,
      assigned_to          = nullif(p_proposal_data ->> 'assigned_to', '')::uuid
  WHERE id = p_id
  RETURNING * INTO v_proposal;

  -- ── Relations (quotes relink + inline quotes + proposal_items) ────────────
  v_iq_ids := public.fn_proposals_persist_relations(
    v_proposal.id,
    v_proposal.organization_id,
    COALESCE(v_root_org_id, v_proposal.organization_id),
    v_deal_id,
    v_proposal.entity_id,
    v_actor,
    p_selected_quote_ids,
    p_inline_quotes,
    p_proposal_items,
    p_quote_entity_id
  );

  -- ── Build the combined diff (only changed proposal columns) ───────────────
  v_old_json := to_jsonb(v_before);
  v_new_json := to_jsonb(v_proposal);
  FOREACH v_key IN ARRAY v_diff_cols LOOP
    IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
      v_prop_diff := v_prop_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
      );
    END IF;
  END LOOP;

  IF v_prop_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('proposals', v_prop_diff);
  END IF;

  IF p_selected_quote_ids IS NOT NULL AND array_length(p_selected_quote_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'quotes', jsonb_build_object('linked', to_jsonb(p_selected_quote_ids))
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  v_diff := v_diff || jsonb_build_object(
    'proposal_items', jsonb_build_object('new', COALESCE(p_proposal_items, '[]'::jsonb))
  );

  -- ── One consolidated audit row for the proposal ───────────────────────────
  PERFORM public.fn_manual_audit_log(
    'proposals',
    v_proposal.entity_id,
    v_proposal.organization_id,
    'UPDATE',
    v_diff,
    'web_app'
  );

  -- Each inline quote created during this save is an independent creation.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_proposal.organization_id, 'INSERT',
        jsonb_build_object('inline_of_proposal', to_jsonb(v_proposal.id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_proposal;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_proposal(uuid, jsonb, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_proposal(uuid, jsonb, uuid[], jsonb, jsonb, uuid) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
-- 1. Foundation reused, not recreated: no CREATE for fn_generic_entity_audit /
--    fn_manual_audit_log in this file.
--
-- 2. A create/update that touches proposals + N quote relinks + M inline quotes +
--    K proposal_items yields exactly ONE entity_audit_log row with
--    table_name='proposals' (+1 INSERT row per inline quote created):
--      SELECT count(*) FROM public.entity_audit_log
--      WHERE table_name='proposals' AND entity_id=<proposal-entity>
--        AND created_at > now() - interval '1 minute';   -- Expected: 1
--
-- 3. Authorization parity — UPDATE requires proposals.edit UNCONDITIONALLY (Gate 2),
--    matching the live WITH CHECK. A user with proposals.create but not proposals.edit
--    cannot update even their own proposal (raises insufficient_privilege), exactly as
--    the Supabase client path would be blocked by RLS.
--
-- 4. proposal_items has no organization_id column — delete-all scoped by proposal_id only.
