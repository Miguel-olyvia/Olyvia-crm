-- Orçamentos (Quotes) — audit-bypass guard fix for child/link/proposal triggers + RPC hardening
-- 2026-08-13 | Module: Orçamentos
-- Forward-only migration. Do not fold into the baseline. Never edit an already-applied migration
-- (this is why the fix lands here and NOT inside 20260626/20260627/20260628/20260812).
--
-- Why this migration exists
-- -------------------------
-- 20260812010000_quotes_audit_bypass_and_rpcs.sql introduced rpc_save_quote(), which sets
-- app.audit_bypass='on' (SET LOCAL) so every write it performs is collapsed into ONE
-- consolidated audit row via fn_manual_audit_log(). That flag, however, is only honoured by
-- AFTER-audit trigger functions that explicitly check it at the top. Only fn_generic_entity_audit()
-- (guarded in 20260719010000) had the guard — so the trigger on `quotes` was bypassed correctly,
-- but the triggers on the OTHER tables rpc_save_quote touches were NOT:
--
--   · fn_audit_quote_child()     — trg_audit_quote_lines / trg_audit_quote_fees
--       (defined once in 20260627100000_quotes_audit_triggers.sql, never redefined; NO guard)
--   · fn_audit_pipeline_link()   — trg_audit_pipeline_links
--       (defined once in 20260626200000_deals_audit_triggers.sql, never redefined; NO guard)
--   · fn_audit_proposals_safe()  — trg_audit_proposals
--       (defined once in 20260628100000_proposals_audit_triggers.sql, never redefined; NO guard)
--
-- Consequence without this fix: a single rpc_save_quote() in EDIT mode produced, on top of the
-- one intended consolidated row, a flood of extra rows — one per quote_lines DELETE and one per
-- INSERT (N+M rows each way), one per quote_fees DELETE/INSERT, one per pipeline_links UPDATE/INSERT,
-- and one for the proposals.value UPDATE whenever proposal_id was set. That is exactly the
-- "audit-row explosion" the Quotes RPC set out to eliminate (see the problem statement in
-- 20260812010000, lines 5-19). The requirement "exactly ONE new audit row per rpc_save_quote call
-- (+1 per inline quote)" fails until all four trigger functions honour the bypass flag.
--
-- NOTE on fn_audit_proposals_safe(): the prior review only flagged fn_audit_quote_child() and
-- fn_audit_pipeline_link(). fn_audit_proposals_safe() has the SAME defect and rpc_save_quote()
-- DOES issue `UPDATE public.proposals SET value=…` whenever proposal_id is set, so it is guarded
-- here for the same reason — otherwise a save with a linked proposal would still emit a stray row.
--
-- What this migration does
-- ------------------------
--   1. CREATE OR REPLACE the three trigger functions, each with the guard
--        IF current_setting('app.audit_bypass', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
--      as the FIRST statement, bodies otherwise byte-identical to their original definitions.
--      Triggers themselves are NOT touched (same function OIDs, same wiring).
--   2. CREATE OR REPLACE rpc_save_quote() to resolve two behaviour-parity discrepancies raised
--      in review (see "RPC hardening" below). Signature is unchanged, so the existing
--      REVOKE/GRANT still apply; they are re-asserted at the end for clarity.
--
-- Foundation reused, NOT recreated: fn_generic_entity_audit() (already guarded) and
-- fn_manual_audit_log() are untouched here.
--
-- Prerequisites:
--   20260626200000_deals_audit_triggers.sql        — fn_audit_pipeline_link()
--   20260627100000_quotes_audit_triggers.sql        — fn_audit_quote_child()
--   20260628100000_proposals_audit_triggers.sql     — fn_audit_proposals_safe()
--   20260719010000_roles_audit_bypass_and_rpcs.sql  — app.audit_bypass guard + fn_manual_audit_log()
--   20260730010000_deals_audit_bypass_and_rpcs.sql  — fn_deal_org_in_scope()
--   20260812010000_quotes_audit_bypass_and_rpcs.sql — rpc_save_quote() (superseded by this file)


-- ============================================================
-- 1. fn_audit_quote_child() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260627100000_quotes_audit_triggers.sql §1 except for the new guard
-- as the first statement. Handles quote_lines and quote_fees.

CREATE OR REPLACE FUNCTION public.fn_audit_quote_child()
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
  v_quote_id       uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
  -- When a business RPC (rpc_save_quote) has already written a single consolidated
  -- audit row via fn_manual_audit_log(), it sets app.audit_bypass='on' (SET LOCAL)
  -- so this trigger writes nothing and the save produces exactly one log row.
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

  -- ── Resolve quote_id from whichever side is available ───────────────────
  v_quote_id := COALESCE(
    (to_jsonb(NEW) ->> 'quote_id')::uuid,
    (to_jsonb(OLD) ->> 'quote_id')::uuid
  );

  -- ── Resolve organization_id and entity_id via parent quote ───────────────
  IF v_quote_id IS NOT NULL THEN
    SELECT q.organization_id, q.entity_id
    INTO   v_org_id, v_entity_id
    FROM   public.quotes q
    WHERE  q.id = v_quote_id
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

REVOKE ALL ON FUNCTION public.fn_audit_quote_child() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_quote_child() TO service_role;


-- ============================================================
-- 2. fn_audit_pipeline_link() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260626200000_deals_audit_triggers.sql §2 except for the new guard
-- as the first statement. Handles pipeline_links.

CREATE OR REPLACE FUNCTION public.fn_audit_pipeline_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id        uuid;
  v_entity_id     uuid;
  v_record        jsonb;
  v_changed_fields jsonb;
  v_user_id       uuid;
  v_source        text;
  v_noise_cols    text[] := ARRAY['updated_at', 'created_at', 'search_text', 'contact_attempts', 'last_activity_at'];
  v_key           text;
  v_old_json      jsonb;
  v_new_json      jsonb;
  v_deal_id       uuid;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
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

  -- ── organization_id — carried directly on the row ────────────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- ── entity_id — look up via the linked deal ───────────────────────────────
  v_deal_id := COALESCE(
    (to_jsonb(NEW) ->> 'deal_id')::uuid,
    (to_jsonb(OLD) ->> 'deal_id')::uuid
  );

  IF v_deal_id IS NOT NULL THEN
    SELECT d.entity_id
    INTO   v_entity_id
    FROM   public.deals d
    WHERE  d.id = v_deal_id
    LIMIT 1;
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
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_audit_pipeline_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_pipeline_link() TO service_role;


-- ============================================================
-- 3. fn_audit_proposals_safe() — add audit-bypass guard at the top
-- ============================================================
-- Body identical to 20260628100000_proposals_audit_triggers.sql §0 except for the new
-- guard as the first statement. Handles proposals (security tokens stripped). Guarded here
-- because rpc_save_quote() issues `UPDATE public.proposals SET value=…` inside the bypassed
-- transaction whenever proposal_id is set.

CREATE OR REPLACE FUNCTION public.fn_audit_proposals_safe()
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
  v_noise_cols     text[] := ARRAY['updated_at', 'last_viewed_at', 'view_count'];
  v_token_cols     text[] := ARRAY['public_token', 'tracking_token'];
  v_key            text;
  v_old_json       jsonb;
  v_new_json       jsonb;
BEGIN

  -- ── Audit bypass ──────────────────────────────────────────────────────────
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

  -- ── organization_id and entity_id are direct on the row ─────────────────
  v_org_id := COALESCE(
    (to_jsonb(NEW) ->> 'organization_id')::uuid,
    (to_jsonb(OLD) ->> 'organization_id')::uuid
  );

  -- Cannot determine org — skip silently.
  IF v_org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_entity_id := COALESCE(
    (to_jsonb(NEW) ->> 'entity_id')::uuid,
    (to_jsonb(OLD) ->> 'entity_id')::uuid
  );

  -- ── Build payload ────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Strip security token columns entirely from the full_record snapshot.
    v_record := to_jsonb(NEW);
    FOR v_key IN SELECT unnest(v_token_cols)
    LOOP
      v_record := v_record - v_key;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'DELETE' THEN
    -- Strip security token columns entirely from the full_record snapshot.
    v_record := to_jsonb(OLD);
    FOR v_key IN SELECT unnest(v_token_cols)
    LOOP
      v_record := v_record - v_key;
    END LOOP;
    v_changed_fields := NULL;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old_json       := to_jsonb(OLD);
    v_new_json       := to_jsonb(NEW);
    v_record         := NULL;
    v_changed_fields := '{}'::jsonb;

    FOR v_key IN SELECT key FROM jsonb_object_keys(v_new_json) AS t(key)
    LOOP
      -- Skip noise columns and security token columns entirely.
      CONTINUE WHEN v_key = ANY(v_noise_cols);
      CONTINUE WHEN v_key = ANY(v_token_cols);
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

REVOKE ALL ON FUNCTION public.fn_audit_proposals_safe() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_audit_proposals_safe() TO service_role;


-- ============================================================
-- 4. rpc_save_quote(...) — re-asserted with two behaviour-parity fixes
-- ============================================================
-- Supersedes the definition in 20260812010000. Same signature, same authorization,
-- same single-audit-row design. Two review discrepancies resolved so the RPC no longer
-- depends on an implicit caller contract that could silently diverge from handleSave():
--
--   FIX 1 (inline quote lines — qt > 0 filter): the previous version inserted every
--     element of v_iq -> 'lines' verbatim, trusting the FE to have filtered qt=0 rows
--     (handleSave does `iq.lines.filter(l => l.qt > 0)` at QuoteBuilder.tsx:2066-2068).
--     A future FE that forgot the filter would persist qt=0 lines the current code never
--     writes. The RPC now filters `qt > 0` itself, mirroring handleSave exactly and not
--     trusting the caller — consistent with how it already re-derives org scope rather
--     than trusting the payload.
--
--   FIX 2 (inline quote lines — categoria): handleSave hardcodes `categoria: ""` for inline
--     quote lines (QuoteBuilder.tsx:2087) and NEVER forwards l.categoria for them. The
--     previous RPC used COALESCE(v_iq_line ->> 'categoria', '') which would persist a
--     non-empty categoria if the payload carried one — a silent behaviour drift. The RPC
--     now writes a literal '' for inline quote lines, exactly matching current behaviour.
--
-- The PRIMARY quote lines (p_lines) keep using v_line ->> 'categoria': handleSave DOES send
-- line.categoria for the main quote (QuoteBuilder.tsx:1914 / :1577), so parity there is to
-- forward it — unchanged from the prior version.
--
-- Point 3 from review (pipeline_links INSERT org uses v_org_id, whereas handleSave uses
-- `dealOrgId || activeCompany?.id`) is retained as an INTENTIONAL correction: v_org_id is
-- the same organization the quote row itself is written under, so the pipeline_links row can
-- never land under a different org than its quote. The FE edge case where deal_id is absent
-- but selectedSource carries a different org is not reachable through this branch anyway
-- (the branch only runs when v_deal_id IS NOT NULL). Documented, not silenced.

CREATE OR REPLACE FUNCTION public.rpc_save_quote(
  p_quote_id      uuid,
  p_quote_data    jsonb,
  p_lines         jsonb,
  p_fees          jsonb,
  p_totals        jsonb,
  p_inline_quotes jsonb DEFAULT '[]'::jsonb
)
RETURNS public.quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid;
  v_saved_id     uuid;
  v_org_id       uuid;
  v_before       public.quotes;
  v_after        public.quotes;
  v_quote        public.quotes;
  v_entity_id    uuid;
  v_proposal_id  uuid;
  v_deal_id      uuid;
  v_root_org_id  uuid;
  v_line         jsonb;
  v_fee          jsonb;
  v_existing_link uuid;
  v_link_op      text;           -- 'update' | 'insert' | NULL
  v_link_id      uuid;
  v_proposal_val numeric;
  v_proposal_old numeric;

  -- inline-quote locals
  v_iq           jsonb;
  v_iq_data      jsonb;
  v_iq_line      jsonb;
  v_iq_id        uuid;
  v_iq_ids       uuid[] := ARRAY[]::uuid[];

  -- diff accumulators
  v_diff         jsonb := '{}'::jsonb;
  v_quote_diff   jsonb := '{}'::jsonb;
  v_key          text;
  v_new_json     jsonb;
  v_old_json     jsonb;
  v_editable_cols text[] := ARRAY[
    'deal_id','cliente_id','organization_id','root_organization_id','entity_id',
    'title','obra_notas','modelo_base','desconto_global_percent','estado',
    'validade_dias','iva_rate','client_notes','conditions','proposal_id',
    'assigned_to','template_id'
  ];
BEGIN
  -- Consolidate every write below into a single audit row.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- ── Resolve business actor (== businessUserId / created_by in the FE) ─────
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  -- ── Resolve target org from the incoming payload ──────────────────────────
  v_org_id      := nullif(p_quote_data ->> 'organization_id', '')::uuid;
  v_root_org_id := nullif(p_quote_data ->> 'root_organization_id', '')::uuid;
  v_entity_id   := nullif(p_quote_data ->> 'entity_id', '')::uuid;
  v_proposal_id := nullif(p_quote_data ->> 'proposal_id', '')::uuid;
  v_deal_id     := nullif(p_quote_data ->> 'deal_id', '')::uuid;

  -- ── Authorization parity with quotes RLS: org must be in caller's scope ───
  IF NOT public.fn_deal_org_in_scope(v_org_id) THEN
    RAISE EXCEPTION 'Organização fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 1. quotes: INSERT (new) or UPDATE metadata (edit)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    INSERT INTO public.quotes (
      deal_id, cliente_id, organization_id, root_organization_id, entity_id,
      title, obra_notas, modelo_base, desconto_global_percent, estado,
      validade_dias, iva_rate, client_notes, conditions, proposal_id,
      assigned_to, template_id, created_by
    )
    VALUES (
      v_deal_id,
      nullif(p_quote_data ->> 'cliente_id', '')::uuid,
      v_org_id,
      v_root_org_id,
      v_entity_id,
      nullif(p_quote_data ->> 'title', ''),
      p_quote_data ->> 'obra_notas',
      p_quote_data ->> 'modelo_base',
      COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
      COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
      (p_quote_data ->> 'validade_dias')::integer,
      (p_quote_data ->> 'iva_rate')::numeric,
      nullif(p_quote_data ->> 'client_notes', ''),
      nullif(p_quote_data ->> 'conditions', ''),
      v_proposal_id,
      nullif(p_quote_data ->> 'assigned_to', '')::uuid,
      nullif(p_quote_data ->> 'template_id', '')::uuid,
      v_actor
    )
    RETURNING * INTO v_after;

    v_saved_id := v_after.id;

  ELSE
    -- Load the before-image and enforce org scope on the existing row too.
    SELECT * INTO v_before FROM public.quotes WHERE id = p_quote_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT public.fn_deal_org_in_scope(v_before.organization_id) THEN
      RAISE EXCEPTION 'Orçamento fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE public.quotes
    SET deal_id                 = v_deal_id,
        cliente_id              = nullif(p_quote_data ->> 'cliente_id', '')::uuid,
        organization_id         = v_org_id,
        root_organization_id    = v_root_org_id,
        entity_id               = v_entity_id,
        title                   = nullif(p_quote_data ->> 'title', ''),
        obra_notas              = p_quote_data ->> 'obra_notas',
        modelo_base             = p_quote_data ->> 'modelo_base',
        desconto_global_percent = COALESCE((p_quote_data ->> 'desconto_global_percent')::numeric, 0),
        estado                  = COALESCE(nullif(p_quote_data ->> 'estado', ''), 'rascunho'),
        validade_dias           = (p_quote_data ->> 'validade_dias')::integer,
        iva_rate                = (p_quote_data ->> 'iva_rate')::numeric,
        client_notes            = nullif(p_quote_data ->> 'client_notes', ''),
        conditions              = nullif(p_quote_data ->> 'conditions', ''),
        proposal_id             = v_proposal_id,
        assigned_to             = nullif(p_quote_data ->> 'assigned_to', '')::uuid,
        template_id             = nullif(p_quote_data ->> 'template_id', '')::uuid
    WHERE id = p_quote_id
    RETURNING * INTO v_after;

    v_saved_id := p_quote_id;

    -- delete-all children (mirrors handleSave: delete quote_lines on edit; fees below)
    DELETE FROM public.quote_lines WHERE quote_id = p_quote_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 2. quote_lines: insert the full computed set (both new and edit paths)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO public.quote_lines (
        quote_id, catalog_item_id, product_id, service_id, bundle_id,
        selected_attributes, categoria, descricao_snapshot, qt,
        custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
        int_percent, discount_percent, total_sem_iva, total_com_iva,
        total_com_desconto, ordem, section_name, unidade, item_description, cost_price
      )
      VALUES (
        v_saved_id,
        nullif(v_line ->> 'catalog_item_id', '')::uuid,
        nullif(v_line ->> 'product_id', '')::uuid,
        nullif(v_line ->> 'service_id', '')::uuid,
        nullif(v_line ->> 'bundle_id', '')::uuid,
        COALESCE(v_line -> 'selected_attributes', '{}'::jsonb),
        v_line ->> 'categoria',
        v_line ->> 'descricao_snapshot',
        (v_line ->> 'qt')::numeric,
        (v_line ->> 'custo_material_unit')::numeric,
        (v_line ->> 'custo_mao_obra_unit')::numeric,
        (v_line ->> 'margem_percent')::numeric,
        (v_line ->> 'iva_percent')::numeric,
        (v_line ->> 'int_percent')::numeric,
        (v_line ->> 'discount_percent')::numeric,
        (v_line ->> 'total_sem_iva')::numeric,
        (v_line ->> 'total_com_iva')::numeric,
        (v_line ->> 'total_com_desconto')::numeric,
        (v_line ->> 'ordem')::integer,
        COALESCE(nullif(v_line ->> 'section_name', ''), 'Geral'),
        nullif(v_line ->> 'unidade', ''),
        nullif(v_line ->> 'item_description', ''),
        COALESCE((v_line ->> 'cost_price')::numeric, 0)
      );
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 3. quote_fees: delete-all (edit) then insert full set
  -- ══════════════════════════════════════════════════════════════════════════
  -- handleSave() only deletes existing fees in edit mode (a fresh quote has none).
  IF p_quote_id IS NOT NULL THEN
    DELETE FROM public.quote_fees WHERE quote_id = v_saved_id;
  END IF;

  IF p_fees IS NOT NULL AND jsonb_typeof(p_fees) = 'array' THEN
    FOR v_fee IN SELECT * FROM jsonb_array_elements(p_fees)
    LOOP
      INSERT INTO public.quote_fees (
        quote_id, fee_type_id, base_amount, calculated_value, vat_rate, vat_amount
      )
      VALUES (
        v_saved_id,
        nullif(v_fee ->> 'fee_type_id', '')::uuid,
        (v_fee ->> 'base_amount')::numeric,
        (v_fee ->> 'calculated_value')::numeric,
        (v_fee ->> 'vat_rate')::numeric,
        (v_fee ->> 'vat_amount')::numeric
      );
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. quotes totals UPDATE (folded into the same tx — was a separate call in FE)
  -- ══════════════════════════════════════════════════════════════════════════
  UPDATE public.quotes
  SET subtotal   = (p_totals ->> 'subtotal')::numeric,
      total_fees = (p_totals ->> 'total_fees')::numeric,
      total      = (p_totals ->> 'total')::numeric
  WHERE id = v_saved_id
  RETURNING * INTO v_quote;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 5. proposals value sync (conditional) — sum of ALL quotes on the proposal
  -- ══════════════════════════════════════════════════════════════════════════
  -- Written in THIS transaction together with quotes.proposal_id + pipeline_links
  -- so the FK linkage and the aggregate can never desynchronize.
  IF v_saved_id IS NOT NULL AND v_proposal_id IS NOT NULL THEN
    SELECT COALESCE(sum(COALESCE(q.total, 0)), 0)
    INTO   v_proposal_val
    FROM   public.quotes q
    WHERE  q.proposal_id = v_proposal_id
      AND  q.deleted_at IS NULL;

    SELECT value INTO v_proposal_old FROM public.proposals WHERE id = v_proposal_id;

    UPDATE public.proposals
    SET value = v_proposal_val
    WHERE id = v_proposal_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 6. pipeline_links UPDATE/INSERT (conditional on deal_id)
  -- ══════════════════════════════════════════════════════════════════════════
  IF v_saved_id IS NOT NULL AND v_deal_id IS NOT NULL THEN
    SELECT id INTO v_existing_link
    FROM   public.pipeline_links
    WHERE  deal_id = v_deal_id
      AND  status  = 'active'
    LIMIT  1;

    IF v_existing_link IS NOT NULL THEN
      UPDATE public.pipeline_links
      SET quote_id   = v_saved_id,
          updated_at = now()
      WHERE id = v_existing_link;
      v_link_op := 'update';
      v_link_id := v_existing_link;
    ELSE
      INSERT INTO public.pipeline_links
        (deal_id, quote_id, organization_id, root_organization_id, status)
      VALUES
        (v_deal_id, v_saved_id, v_org_id, COALESCE(v_root_org_id, v_org_id), 'active')
      RETURNING id INTO v_link_id;
      v_link_op := 'insert';
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 7. inline quotes: each is a full standalone quote (INSERT + lines + totals)
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_inline_quotes IS NOT NULL AND jsonb_typeof(p_inline_quotes) = 'array' THEN
    FOR v_iq IN SELECT * FROM jsonb_array_elements(p_inline_quotes)
    LOOP
      v_iq_data := v_iq -> 'data';
      -- FE skips inline quotes with no qt>0 lines.
      IF v_iq_data IS NULL
         OR jsonb_typeof(v_iq -> 'lines') <> 'array'
         OR jsonb_array_length(v_iq -> 'lines') = 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.quotes (
        deal_id, organization_id, root_organization_id, title, obra_notas,
        modelo_base, desconto_global_percent, estado, validade_dias, iva_rate,
        client_notes, conditions, created_by
      )
      VALUES (
        nullif(v_iq_data ->> 'deal_id', '')::uuid,
        v_org_id,
        COALESCE(v_root_org_id, v_org_id),
        nullif(v_iq_data ->> 'title', ''),
        nullif(v_iq_data ->> 'obra_notas', ''),
        COALESCE(nullif(v_iq_data ->> 'modelo_base', ''), 'default'),
        COALESCE((v_iq_data ->> 'desconto_global_percent')::numeric, 0),
        COALESCE(nullif(v_iq_data ->> 'estado', ''), 'rascunho'),
        (v_iq_data ->> 'validade_dias')::integer,
        (v_iq_data ->> 'iva_rate')::numeric,
        nullif(v_iq_data ->> 'client_notes', ''),
        nullif(v_iq_data ->> 'conditions', ''),
        v_actor
      )
      RETURNING id INTO v_iq_id;

      -- FIX 1: filter qt > 0 here (mirrors handleSave iq.lines.filter(l => l.qt > 0)),
      -- rather than trusting the caller to pre-filter. Lines with qt <= 0 (or null) are
      -- skipped exactly as the current FE code does.
      FOR v_iq_line IN SELECT * FROM jsonb_array_elements(v_iq -> 'lines')
      LOOP
        CONTINUE WHEN COALESCE((v_iq_line ->> 'qt')::numeric, 0) <= 0;

        INSERT INTO public.quote_lines (
          quote_id, catalog_item_id, product_id, service_id, bundle_id,
          selected_attributes, categoria, descricao_snapshot, qt,
          custo_material_unit, custo_mao_obra_unit, margem_percent, iva_percent,
          int_percent, discount_percent, total_sem_iva, total_com_iva,
          total_com_desconto, ordem, section_name, unidade, item_description, cost_price
        )
        VALUES (
          v_iq_id,
          nullif(v_iq_line ->> 'catalog_item_id', '')::uuid,
          nullif(v_iq_line ->> 'product_id', '')::uuid,
          nullif(v_iq_line ->> 'service_id', '')::uuid,
          nullif(v_iq_line ->> 'bundle_id', '')::uuid,
          COALESCE(v_iq_line -> 'selected_attributes', '{}'::jsonb),
          -- FIX 2: inline quote lines always persist categoria = '' to match handleSave
          -- (QuoteBuilder.tsx:2087), which never forwards l.categoria for inline lines.
          '',
          v_iq_line ->> 'descricao_snapshot',
          (v_iq_line ->> 'qt')::numeric,
          (v_iq_line ->> 'custo_material_unit')::numeric,
          (v_iq_line ->> 'custo_mao_obra_unit')::numeric,
          (v_iq_line ->> 'margem_percent')::numeric,
          (v_iq_line ->> 'iva_percent')::numeric,
          (v_iq_line ->> 'int_percent')::numeric,
          (v_iq_line ->> 'discount_percent')::numeric,
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

      UPDATE public.quotes
      SET subtotal = (v_iq -> 'totals' ->> 'subtotal')::numeric,
          total    = (v_iq -> 'totals' ->> 'total')::numeric
      WHERE id = v_iq_id;

      v_iq_ids := v_iq_ids || v_iq_id;
    END LOOP;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 8. Build ONE combined diff and write ONE audit row
  -- ══════════════════════════════════════════════════════════════════════════
  IF p_quote_id IS NULL THEN
    -- INSERT: snapshot the editable columns of the created quote.
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY v_editable_cols LOOP
      v_quote_diff := v_quote_diff || jsonb_build_object(
        v_key, jsonb_build_object('old', NULL, 'new', v_new_json -> v_key)
      );
    END LOOP;
  ELSE
    -- UPDATE: diff before-image vs. metadata after-image (v_after captured the
    -- metadata UPDATE; totals were applied afterwards into v_quote — include those too).
    v_old_json := to_jsonb(v_before);
    v_new_json := to_jsonb(v_quote);
    FOREACH v_key IN ARRAY (v_editable_cols || ARRAY['subtotal','total_fees','total']) LOOP
      IF (v_old_json ->> v_key) IS DISTINCT FROM (v_new_json ->> v_key) THEN
        v_quote_diff := v_quote_diff || jsonb_build_object(
          v_key, jsonb_build_object('old', v_old_json -> v_key, 'new', v_new_json -> v_key)
        );
      END IF;
    END LOOP;
  END IF;

  IF v_quote_diff <> '{}'::jsonb THEN
    v_diff := v_diff || jsonb_build_object('quotes', v_quote_diff);
  END IF;

  -- quote_lines / quote_fees are rewritten wholesale (delete-all + reinsert). Record
  -- the resulting sets so the single log row still reflects what the save produced.
  v_diff := v_diff || jsonb_build_object(
    'quote_lines', jsonb_build_object('new', COALESCE(p_lines, '[]'::jsonb)),
    'quote_fees',  jsonb_build_object('new', COALESCE(p_fees,  '[]'::jsonb))
  );

  IF v_proposal_id IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'proposals', jsonb_build_object(
        'value', jsonb_build_object('old', to_jsonb(v_proposal_old), 'new', to_jsonb(v_proposal_val))
      )
    );
  END IF;

  IF v_link_op IS NOT NULL THEN
    v_diff := v_diff || jsonb_build_object(
      'pipeline_links', jsonb_build_object(
        'op',       to_jsonb(v_link_op),
        'id',       to_jsonb(v_link_id),
        'deal_id',  to_jsonb(v_deal_id),
        'quote_id', to_jsonb(v_saved_id)
      )
    );
  END IF;

  IF array_length(v_iq_ids, 1) > 0 THEN
    v_diff := v_diff || jsonb_build_object(
      'inline_quotes', jsonb_build_object('created', to_jsonb(v_iq_ids))
    );
  END IF;

  -- Single consolidated audit row for the primary quote.
  PERFORM public.fn_manual_audit_log(
    'quotes',
    v_saved_id,
    v_org_id,
    CASE WHEN p_quote_id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
    v_diff,
    'web_app'
  );

  -- Each inline quote is an independent creation — one INSERT row apiece so the log
  -- does not hide the fact that extra quotes were created.
  IF array_length(v_iq_ids, 1) > 0 THEN
    FOR v_iq_id IN SELECT unnest(v_iq_ids) LOOP
      PERFORM public.fn_manual_audit_log(
        'quotes', v_iq_id, v_org_id, 'INSERT',
        jsonb_build_object('inline_of', to_jsonb(v_saved_id)),
        'web_app'
      );
    END LOOP;
  END IF;

  RETURN v_quote;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_quote(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;


-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. Bypass guard now present at the top of EVERY trigger function that fires on a table
--    rpc_save_quote writes to:
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('fn_generic_entity_audit',   -- quotes
--                        'fn_audit_quote_child',       -- quote_lines, quote_fees
--                        'fn_audit_pipeline_link',     -- pipeline_links
--                        'fn_audit_proposals_safe')    -- proposals
--        AND prosrc LIKE '%app.audit_bypass%';
--      -- Expected: all four rows.
--
-- 2. A save in EDIT mode touching quotes + N lines + M fees + proposal.value + pipeline_links
--    now yields EXACTLY ONE entity_audit_log row (table_name='quotes'), and ZERO rows for
--    quote_lines / quote_fees / pipeline_links / proposals in that transaction window:
--      SELECT table_name, count(*)
--      FROM public.entity_audit_log
--      WHERE created_at > now() - interval '1 minute'
--      GROUP BY table_name;
--      -- Expected: quotes = 1 (+1 per inline quote created); no quote_lines / quote_fees /
--      --           pipeline_links / proposals rows from the RPC transaction.
--
-- 3. Inline quote lines with qt <= 0 are never persisted (FIX 1), and inline quote lines
--    always store categoria = '' (FIX 2), matching handleSave() exactly.
--
-- 4. proposal_id + pipeline_links written in the same tx: any cast/constraint failure rolls
--    the whole RPC back — they never desync (unchanged guarantee).
--
-- 5. Calling with an org outside get_user_visible_org_ids(auth.uid()) raises
--    insufficient_privilege, matching the quotes RLS policies (unchanged).
