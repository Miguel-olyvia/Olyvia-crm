-- ============================================================================
-- Fix: 20261004010000_allow_proposal_owner_update_without_edit_permission.sql
-- turned "created_by = owner" into an unconditional bypass on Gate 2 (WITH
-- CHECK) of rpc_update_proposal AND on the WITH CHECK of the live RLS policy
-- "Users with permission can update proposals". That undid the deliberate
-- protection documented in 20260626110000 / 20260815010000: proposals.edit is
-- required even for the proposal's own creator, specifically to stop a user
-- who only has proposals.create (and NOT proposals.edit) from editing their
-- own proposal after creating it — a privilege escalation.
--
-- Fix (forward-only, does not edit 20260626110000, 20260815010000,
-- 20260927010000 or 20261004010000): replace the plain boolean bypass with a
-- scope-aware predicate, following the existing pattern used for contacts/
-- leads (resolve_contact_access_context / can_access_contact_row in
-- 20260619090000_contacts_security_scope_integrity.sql). The real scope_level
-- of the caller's proposals.edit grant (via anew_membership_permission_scopes
-- on their active anew_memberships) now governs Gate 2 / WITH CHECK:
--
--   - proposals.edit with scope ORG   -> may update any proposal in a visible
--     organization (org-visibility is enforced separately, unchanged).
--   - proposals.edit with scope TEAM  -> may update only if the proposal's
--     created_by is the caller themself, or a member of a team the caller
--     leads.
--   - proposals.edit with scope OWNED, or proposals.edit granted with no
--     scope configured at all -> may update only their own proposals
--     (created_by = caller).
--   - proposals.edit NOT granted at all -> can never update, even their own
--     proposal. This restores the protection 20261004010000 broke.
--
-- Gate 1 (USING, in both the RPC and the live policy) is intentionally left
-- untouched: it only gates row *visibility* for the UPDATE statement, not the
-- actual write, and its existing owner bypass was already present before the
-- regression and is not the vulnerability reported. Only Gate 2 / WITH CHECK
-- changes, in both places, per this fix.
-- ============================================================================

-- ── 1. Scope-resolution helpers (mirrors contacts/leads scope pattern) ──────

CREATE OR REPLACE FUNCTION public.get_proposal_edit_scope(_auth_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- No active membership grants proposals.edit at all -> NULL (no access).
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
      JOIN public.anew_role_permissions arp
        ON arp.role_id = am.role_id
       AND arp.permission_code = 'proposals.edit'
      WHERE au.auth_user_id = _auth_uid
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'ORG'
      WHERE au.auth_user_id = _auth_uid
    ) THEN 'ORG'
    WHEN EXISTS (
      SELECT 1
      FROM public.anew_users au
      JOIN public.anew_memberships am
        ON am.user_id = au.id
       AND am.status = 'active'
      JOIN public.anew_membership_permission_scopes s
        ON s.membership_id = am.id
       AND s.permission_code = 'proposals.edit'
       AND s.scope_level = 'TEAM'
      WHERE au.auth_user_id = _auth_uid
    ) THEN 'TEAM'
    -- Has proposals.edit but no ORG/TEAM scope row configured -> OWNED.
    ELSE 'OWNED'
  END
$$;

REVOKE ALL ON FUNCTION public.get_proposal_edit_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_edit_scope(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.can_write_proposal_row(
  p_created_by uuid,
  p_org_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_auth_uid     uuid := auth.uid();
  v_anew_user_id uuid;
  v_scope        text;
  v_team_ids     uuid[];
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT au.id INTO v_anew_user_id
  FROM public.anew_users au
  WHERE au.auth_user_id = v_auth_uid;

  IF v_anew_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_scope := public.get_proposal_edit_scope(v_auth_uid);

  -- No proposals.edit at all: never allowed, even for the row's own creator.
  IF v_scope IS NULL THEN
    RETURN false;
  END IF;

  IF v_scope = 'ORG' THEN
    -- Org-visibility is enforced by the separate org-scope check that already
    -- runs alongside this predicate (RPC Gate 2 org check / RLS AND clause).
    RETURN true;
  END IF;

  IF v_scope = 'TEAM' THEN
    SELECT COALESCE(ARRAY_AGG(DISTINCT tm.user_id), ARRAY[]::uuid[])
    INTO v_team_ids
    FROM public.organization_teams t
    JOIN public.organization_team_members tm
      ON tm.team_id = t.id
    WHERE t.leader_id = v_anew_user_id
      AND p_org_id IS NOT NULL
      AND t.organization_id = p_org_id;

    RETURN p_created_by = v_anew_user_id
        OR p_created_by = ANY(COALESCE(v_team_ids, ARRAY[]::uuid[]));
  END IF;

  -- v_scope = 'OWNED'
  RETURN p_created_by = v_anew_user_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_write_proposal_row(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_proposal_row(uuid, uuid) TO authenticated, service_role;


-- ── 2. rpc_update_proposal: scope-aware Gate 2 (WITH CHECK) ─────────────────
-- Identical to the current function except for the Gate 2 permission check
-- (Gate 1 / USING and everything else — relations, diff, audit — unchanged).
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
  --   USING (row must be visible to update, unchanged from before this fix):
  --       created_by = current_business_user_id()
  --       OR (has proposals.edit AND organization_id IN visible orgs)
  --
  --   WITH CHECK (write is only allowed at all) — scope-aware as of this fix,
  --   mirroring can_write_proposal_row() used in the live RLS policy:
  --       proposals.edit scope ORG   -> any visible-org proposal
  --       proposals.edit scope TEAM  -> created_by is self or a team member
  --                                     of a team the caller leads
  --       proposals.edit scope OWNED
  --         (or no scope row at all) -> created_by = self only
  --       proposals.edit not granted -> never, even for the row's own creator

  -- Gate 1 — USING: evaluated against the EXISTING row (v_before). Unchanged.
  IF NOT (
       v_before.created_by = v_actor
       OR (
         public.has_anew_permission(auth.uid(), 'proposals.edit')
         AND v_before.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
       )
     ) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta proposta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Gate 2 — WITH CHECK: scope-aware. No proposals.edit at all is always
  -- denied, even for the proposal's own creator — this is the escalation
  -- 20261004010000 introduced and this fix closes.
  IF NOT public.can_write_proposal_row(v_before.created_by, v_before.organization_id) THEN
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

-- ── 3. Live RLS policy: scope-aware WITH CHECK, USING unchanged ────────────
-- Was (20261004010000):
--   WITH CHECK (
--     created_by = current_business_user_id()
--     OR (
--       has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
--       AND (organization_id IS NULL OR organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
--     )
--   )
-- Now: the ownership/permission half is delegated to can_write_proposal_row(),
-- which resolves the caller's real proposals.edit scope level (ORG/TEAM/OWNED/
-- none) instead of treating created_by as an unconditional bypass. The org-
-- visibility half is unchanged.
ALTER POLICY "Users with permission can update proposals" ON public.proposals
  USING (
    created_by = current_business_user_id()
    OR (
      has_anew_permission((SELECT auth.uid()), 'proposals.edit'::text)
      AND organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    public.can_write_proposal_row(created_by, organization_id)
    AND (organization_id IS NULL OR organization_id IN (SELECT get_user_crm_org_ids((SELECT auth.uid()))))
  );
