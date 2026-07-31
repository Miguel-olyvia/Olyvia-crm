-- Resolve pending form_submissions rows (admin review flow)
-- 2026-07-30 | Module: Leads / Form submissions
-- Forward-only migration. Do not fold into the baseline. Do not edit an already-applied migration.
--
-- Problem
-- -------
-- form_submissions (20260823010000) accumulates multi-step public-form field
-- values whenever create-lead / update-lead classify the submitting entity as
-- an already-active contact/client in the receiving org. The table has no
-- authenticated-writable RLS policy (by design — only the Edge Functions,
-- via service_role, write to it) and there is no UI anywhere in src/ that
-- lets an org user review or act on these rows. They accumulate silently.
--
-- Fix
-- ---
-- 1. Add resolution tracking columns (resolved_at / resolved_by / resolution)
--    so a resolved row stops showing in the pending list. `status` already
--    tracks multi-step progress (in_progress/complete/abandoned) and is NOT
--    reused for this — resolution is an orthogonal, one-time reviewer
--    decision that can apply to a submission regardless of its step status.
-- 2. A single SECURITY DEFINER RPC, rpc_resolve_form_submission, is the ONLY
--    write path available to authenticated users (mirrors the table's
--    existing access model: no direct INSERT/UPDATE policy for authenticated,
--    matching the "only a narrow RPC may write" pattern used elsewhere in
--    this module, e.g. rpc_create_lead_manual in 20260728010000).
--    Two actions:
--      'merge'    — acknowledge the match was correct. Logs the submitted
--                   field_values as an entity_interactions note on the
--                   existing target (contact/client), rather than building a
--                   full field-merge editor (YAGNI — the org already has this
--                   "log what happened" pattern for exactly this purpose, see
--                   ClientNotesTab.tsx / RegisterCallDialog.tsx).
--      'new_lead' — the match was wrong; creates a normal anew_leads row
--                   (status='new') for the SAME shared entity_id (the entity
--                   already exists — it's the contact/client's own identity
--                   anchor), plus the standard 'lead' anew_entity_roles
--                   upsert, mirroring create-lead's normal (non-dedup) path
--                   so the resulting lead is indistinguishable from a
--                   normally-created one.
--    Both actions mark the row resolved so it drops out of the pending list.
--
-- Authorization
-- -------------
-- SECURITY DEFINER, so RLS does not self-enforce inside the RPC. The caller's
-- visibility is re-checked explicitly against get_user_visible_org_ids(),
-- exactly like the form_submissions_select RLS policy — the client-supplied
-- submission id is NEVER trusted for org scoping on its own. Granted to
-- authenticated only (not anon), matching every other RPC in this module.

-- ============================================================
-- 1. Resolution-tracking columns
-- ============================================================

ALTER TABLE "public"."form_submissions"
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "resolved_by" "uuid",
  ADD COLUMN IF NOT EXISTS "resolution" "text";
ALTER TABLE "public"."form_submissions"
  ADD CONSTRAINT "form_submissions_resolution_check"
    CHECK (("resolution" IS NULL) OR ("resolution" = ANY (ARRAY['merged'::"text", 'new_lead'::"text"])));
ALTER TABLE "public"."form_submissions"
  ADD CONSTRAINT "form_submissions_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "public"."anew_users"("id");
COMMENT ON COLUMN "public"."form_submissions"."resolved_at" IS
  'Set once a reviewer acts on this submission via rpc_resolve_form_submission. NULL = still pending review.';
COMMENT ON COLUMN "public"."form_submissions"."resolution" IS
  'merged: acknowledged as the existing contact/client, logged as an entity_interactions note. new_lead: the match was wrong, a fresh anew_leads row was created instead.';
-- Primary access pattern for the pending-review list: org-scoped, unresolved,
-- most recent first.
CREATE INDEX IF NOT EXISTS "idx_form_submissions_pending"
  ON "public"."form_submissions" USING "btree" ("organization_id", "created_at" DESC)
  WHERE ("resolved_at" IS NULL);
-- ============================================================
-- 2. rpc_resolve_form_submission(p_submission_id, p_action, p_field_overrides)
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."rpc_resolve_form_submission"(
  "p_submission_id" "uuid",
  "p_action" "text",
  "p_field_overrides" "jsonb" DEFAULT NULL
)
RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor         uuid;
  v_sub           public.form_submissions;
  v_field_values  jsonb;
  v_lead_id       uuid;
  v_interaction_id uuid;
  v_result        jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action NOT IN ('merge', 'new_lead') THEN
    RAISE EXCEPTION 'Ação inválida: %', p_action USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_sub
  FROM public.form_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Submissão não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_sub.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Submissão já foi resolvida' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- SECURITY: never trust client-supplied org scoping. Re-check the caller's
  -- visible orgs directly, matching form_submissions_select RLS exactly
  -- (system_admin OR member of organization_id OR member of root_organization_id).
  IF NOT (
    public.is_system_admin(auth.uid())
    OR v_sub.organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
    OR v_sub.root_organization_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'Submissão fora do âmbito do utilizador' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_field_values := COALESCE(p_field_overrides, v_sub.field_values);

  IF p_action = 'merge' THEN
    -- Log what was submitted as a note on the existing target entity —
    -- same "log what happened" pattern as ClientNotesTab.tsx / RegisterCallDialog.tsx.
    INSERT INTO public.entity_interactions (
      entity_id, organization_id, root_organization_id, interaction_type,
      subject, notes, interaction_at, created_by
    ) VALUES (
      v_sub.entity_id, v_sub.organization_id, v_sub.root_organization_id, 'note',
      'Reenvio de formulário associado ao registo existente',
      'Valores submetidos: ' || v_field_values::text,
      now(), v_actor::text
    )
    RETURNING id INTO v_interaction_id;

    UPDATE public.form_submissions
    SET resolved_at = now(),
        resolved_by = v_actor,
        resolution  = 'merged'
    WHERE id = p_submission_id;

    v_result := jsonb_build_object('action', 'merged', 'interaction_id', v_interaction_id);

  ELSIF p_action = 'new_lead' THEN
    -- Mirrors create-lead's normal (non-dedup) anew_leads insert: same shared
    -- entity_id (the entity already exists as the contact/client's identity
    -- anchor), same field_values, same starting status.
    INSERT INTO public.anew_leads (
      campaign_id, organization_id, root_organization_id, entity_id,
      field_values, status, source, created_by
    ) VALUES (
      v_sub.campaign_id, v_sub.organization_id, v_sub.root_organization_id, v_sub.entity_id,
      v_field_values, 'new', 'form_submission_reclassified', v_actor
    )
    RETURNING id INTO v_lead_id;

    -- Standard 'lead' role upsert, exactly like the entity-roles step in the
    -- normal create-lead path / rpc_create_lead_manual.
    INSERT INTO public.anew_entity_roles (
      organization_id, entity_id, role, status, source_type, source_id, created_by
    ) VALUES (
      v_sub.organization_id, v_sub.entity_id, 'lead', 'active', 'lead', v_lead_id, v_actor
    )
    ON CONFLICT (organization_id, entity_id, role)
    DO UPDATE SET
      status      = 'active',
      source_type = 'lead',
      source_id   = EXCLUDED.source_id;

    UPDATE public.form_submissions
    SET resolved_at = now(),
        resolved_by = v_actor,
        resolution  = 'new_lead'
    WHERE id = p_submission_id;

    v_result := jsonb_build_object('action', 'new_lead', 'lead_id', v_lead_id);
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."rpc_resolve_form_submission"("uuid", "text", "jsonb") TO "authenticated";
-- ============================================================
-- Verification notes (not executed)
-- ============================================================
--
-- 1. A pending row for an org the caller cannot see raises insufficient_privilege,
--    regardless of what organization_id the client believes it is scoping by.
-- 2. 'merge' inserts exactly one entity_interactions row (interaction_type='note')
--    on the submission's entity_id and sets resolved_at/resolved_by/resolution='merged'.
-- 3. 'new_lead' inserts exactly one anew_leads row (status='new') sharing the
--    submission's entity_id, upserts the 'lead' anew_entity_roles row, and sets
--    resolved_at/resolved_by/resolution='new_lead'.
-- 4. Calling the RPC twice on the same submission id raises
--    object_not_in_prerequisite_state on the second call.
-- 5. idx_form_submissions_pending keeps the "pending" list query
--    (organization_id = ? AND resolved_at IS NULL ORDER BY created_at DESC) index-backed.;
